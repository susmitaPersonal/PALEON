"""The Stage D command, with fake catalogs and transports. Nothing here reaches a network."""
import argparse
import ast
import dataclasses
import hashlib
import json
import subprocess
from pathlib import Path

import pytest

from live import preflight, stage_d
from live.stage_d import Dependencies, Listing, RepoState
from src import run
from src.adapter import OpenAICompatibleAdapter, TransportResponse
from src.config import load_models, load_run_config
from src.guard import RunGuard, attempt_cost
from tests.helpers import valid_json

ROOT = Path(__file__).resolve().parents[1]
HEAD = "a" * 40
KEY = "test-key-not-real-0123456789"
ENV = {"OPENROUTER_API_KEY": KEY, "HF_TOKEN": KEY}
CANARIES = {hashlib.sha256(data).hexdigest() for data in preflight.make_canaries().values()}
RUN = load_run_config(stage_d.RUN_CONFIG)
MODELS = load_models(stage_d.MODELS_FILE, RUN)
OPENROUTER = {"data": {"endpoints": [{
    "tag": "deepinfra", "provider_name": "DeepInfra", "pricing": {"prompt": "0.00000015", "completion": "0.0000006"},
    "supported_parameters": ["response_format", "structured_outputs", "seed", "max_tokens"], "quantization": "fp8",
    "max_completion_tokens": 16384, "context_length": 262144, "status": 0, "uptime_last_1d": 99.9}]}}
HUGGINGFACE = {"data": [{"id": "google/gemma-4-31B-it", "providers": [{
    "provider": "deepinfra", "status": "live", "supports_structured_output": True, "context_length": 262144,
    "pricing": {"input": 0.20, "output": 0.40}}]}]}


class Canaries:
    """Answers by canary, and counts every paid call."""

    def __init__(self, status=200, usage=None):
        self.calls = 0
        self.images = []
        self.status = status
        self.usage = usage or {"prompt_tokens": 4500, "completion_tokens": 120}

    def post(self, url, headers, body, timeout_s):
        self.calls += 1
        self.images.append(body["messages"][1]["content"][1]["image_url"]["url"])
        if self.status != 200:
            return TransportResponse(self.status, {}, json.dumps({"error": {"message": "no"}}))
        white = self.images[-1] == self.white()
        content = valid_json()
        return TransportResponse(200, {}, json.dumps({
            "model": "m", "provider": "DeepInfra", "usage": self.usage,
            "choices": [{"message": {"content": self.no_writing() if white else content}, "finish_reason": "stop"}]}))

    @staticmethod
    def white():
        import base64
        return "data:image/jpeg;base64," + base64.b64encode(preflight.make_canaries()["canary_white"]).decode()

    @staticmethod
    def no_writing():
        return valid_json(disposition="no_writing", candidates=[], abstention_reason="Blank.")


def args(command="preflight", model="qwen3_vl_30b", host="deepinfra", commit=HEAD):
    return argparse.Namespace(command=command, model=model, host=host, approved_commit=commit)


def deps(tmp_path, transport=None, repo=RepoState(HEAD, True), env=ENV, catalog=None, lines=None):
    transport = transport or Canaries()

    def get_json(url, headers):
        if catalog is not None:
            return catalog
        return OPENROUTER if "openrouter" in url else HUGGINGFACE

    return Dependencies(lambda: repo, get_json, lambda config, key: OpenAICompatibleAdapter(config, transport, key),
                        env, tmp_path / "preflight", lambda _: None, (lines if lines is not None else []).append)


def test_a_full_preflight_passes_on_a_clean_approved_tree(tmp_path):
    transport, lines = Canaries(), []
    assert stage_d.execute(args(), deps(tmp_path, transport, lines=lines)) == 0
    assert transport.calls == 6
    assert "Stage D passed" in lines[-1]
    result = json.loads((tmp_path / "preflight/qwen3_vl_30b/preflight-qwen3_vl_30b-s01.result.json").read_text())
    assert result["passed"] and result["attempts"] == 6


@pytest.mark.parametrize("change, expected", [
    (dict(commit="b" * 40), "not the current HEAD"),
    (dict(host=None), "needs --host"),
    (dict(host="../evil"), "needs --host"),
    (dict(host="deepinfra; rm"), "needs --host"),
    (dict(model="gemma4_31b", host="novita"), "--host is not allowed"),
])
def test_bad_arguments_refuse_before_any_network_use(tmp_path, change, expected):
    transport, lines = Canaries(), []
    dependencies = deps(tmp_path, transport, lines=lines)
    dependencies.get_json = lambda *_: pytest.fail("network used")
    assert stage_d.execute(args(**change), dependencies) == 2
    assert expected in lines[0] and transport.calls == 0


def test_a_dirty_tree_is_refused(tmp_path):
    lines = []
    assert stage_d.execute(args(), deps(tmp_path, repo=RepoState(HEAD, False), lines=lines)) == 2
    assert "not clean" in lines[0]


def test_a_missing_key_is_named_and_refused(tmp_path):
    lines = []
    assert stage_d.execute(args(), deps(tmp_path, env={}, lines=lines)) == 2
    assert "OPENROUTER_API_KEY is not set" in lines[0]


def test_changed_frozen_files_are_refused(tmp_path):
    for name in stage_d.FROZEN_SHA256:
        (tmp_path / name).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / name).write_text("changed")
    assert len(stage_d.frozen_problems(tmp_path)) == 4
    assert stage_d.frozen_problems() == []


def test_changed_frozen_files_stop_the_command_before_any_network_use(tmp_path):
    root = tmp_path / "copy"
    for name in stage_d.FROZEN_SHA256:
        (root / name).parent.mkdir(parents=True, exist_ok=True)
        (root / name).write_bytes((ROOT / name).read_bytes())
    (root / "config/models.yaml").write_text("models: {}")
    transport, lines = Canaries(), []
    dependencies = deps(tmp_path, transport, lines=lines)
    dependencies.get_json = lambda *_: pytest.fail("network used")
    assert stage_d.execute(args(), dependencies, root) == 2
    assert "config/models.yaml differs" in lines[0] and transport.calls == 0


def test_a_key_cannot_be_sent_to_an_unexpected_gateway(tmp_path):
    moved = dataclasses.replace(MODELS["qwen3_vl_30b"], base_url="https://attacker.invalid/v1")
    problems = stage_d.gate_problems(args(), moved, deps(tmp_path))
    assert any("unexpected gateway" in problem for problem in problems)


@pytest.mark.parametrize("catalog, expected", [
    ({"data": {"endpoints": []}}, "not listed"),
    ({"unexpected": True}, "unexpected OpenRouter"),
    ({"data": {"endpoints": [{**OPENROUTER["data"]["endpoints"][0], "tag": "other"}]}}, "not listed"),
    ({"data": {"endpoints": [{**OPENROUTER["data"]["endpoints"][0], "pricing": {"prompt": "0.0000002", "completion": "0.0000007"}}]}}, "costs more"),
    ({"data": {"endpoints": [{**OPENROUTER["data"]["endpoints"][0], "supported_parameters": ["max_tokens"]}]}}, "structured output"),
    ({"data": {"endpoints": [{**OPENROUTER["data"]["endpoints"][0], "max_completion_tokens": 512}]}}, "fewer output tokens"),
])
def test_the_catalog_can_refuse_before_any_paid_call(tmp_path, catalog, expected):
    transport, lines = Canaries(), []
    assert stage_d.execute(args(), deps(tmp_path, transport, catalog=catalog, lines=lines)) == 2
    assert expected in lines[0] and transport.calls == 0


def test_catalog_makes_no_paid_call_and_prints_hosts(tmp_path):
    transport, lines = Canaries(), []
    assert stage_d.execute(args("catalog", host=None), deps(tmp_path, transport, lines=lines)) == 0
    assert transport.calls == 0 and json.loads(lines[0])["host"] == "deepinfra"


def test_model_b_is_pinned_by_id_and_reads_the_hugging_face_catalog(tmp_path):
    transport = Canaries()
    assert stage_d.execute(args(model="gemma4_31b", host=None), deps(tmp_path, transport)) == 0
    assert transport.calls == 6


def test_the_host_reaches_the_request_without_changing_the_file():
    pinned = stage_d.pin_host(MODELS["qwen3_vl_30b"], "deepinfra")
    assert pinned.extra_body["provider"]["order"] == ["deepinfra"]
    assert pinned.extra_body["provider"]["allow_fallbacks"] is False
    assert pinned.extra_body["provider"]["data_collection"] == "deny"
    assert MODELS["qwen3_vl_30b"].extra_body["provider"]["order"] == []


def test_a_fatal_error_stops_after_one_paid_call(tmp_path):
    transport, lines = Canaries(status=402), []
    assert stage_d.execute(args(), deps(tmp_path, transport, lines=lines)) == 1
    assert transport.calls == 1 and "FAILED" in lines[-1]


def test_an_outage_stops_within_the_limit(tmp_path):
    transport = Canaries(status=503)
    assert stage_d.execute(args(), deps(tmp_path, transport)) == 1
    assert transport.calls == 5


def test_the_spending_stop_holds_when_usage_is_far_above_the_assumption(tmp_path):
    # Each call costs about $0.031, so the guard allows a second and stops before a third.
    transport = Canaries(usage={"prompt_tokens": 200_000, "completion_tokens": 1500})
    assert stage_d.execute(args(), deps(tmp_path, transport)) == 1
    assert transport.calls == 2


def test_attempts_are_limited_across_runs(tmp_path):
    dependencies = deps(tmp_path, Canaries(status=400))
    calls = 0
    for _ in range(19):
        transport = Canaries(status=400)
        dependencies.make_adapter = lambda config, key, t=transport: OpenAICompatibleAdapter(config, t, key)
        code = stage_d.execute(args(), dependencies)
        calls += transport.calls
    assert calls == preflight.MAX_ATTEMPTS and code == 2


@pytest.mark.parametrize("model", ["qwen3_vl_30b", "gemma4_31b"])
def test_the_worst_case_fits_the_proposed_budget(model):
    config = stage_d.pin_host(MODELS[model], "deepinfra")
    limits = stage_d.limits_for(RUN)
    guard = RunGuard(limits, config)
    assert guard.ceiling_usd == pytest.approx(attempt_cost(8000, 1500, config))
    assert guard.ceiling_usd * preflight.MAX_ATTEMPTS <= stage_d.MAX_USD_PER_MODEL
    assert guard.ceiling_usd * preflight.MAX_ATTEMPTS == pytest.approx({"qwen3_vl_30b": 0.0378, "gemma4_31b": 0.0396}[model])


def test_only_generated_canaries_are_ever_sent(tmp_path):
    assert stage_d.execute(args(), deps(tmp_path)) == 0
    attempts = (tmp_path / "preflight/qwen3_vl_30b/preflight-qwen3_vl_30b-s01/attempts.jsonl").read_text().splitlines()
    assert {json.loads(line)["sent_sha256"] for line in attempts} == CANARIES


def test_the_command_cannot_reach_stage_e():
    source = (ROOT / "live" / "stage_d.py").read_text()
    names = {node.name for tree in [ast.parse(source)] for item in ast.walk(tree) if isinstance(item, ast.ImportFrom)
             for node in item.names}
    assert not names & {"LocalImageSource", "load_manifest", "eligible_rows", "gold_items", "run_model", "run_experiment"}
    for text in ("data/images", "data/processed", "manifest.csv\"]", "--live"):
        assert text not in source.replace('"dataset/manifest.csv": ', "")
    assert stage_d.parser().parse_args(["catalog", "--model", "gemma4_31b", "--approved-commit", HEAD]).model == "gemma4_31b"


def test_src_does_not_reach_the_stage_d_command_and_live_stays_refused(capsys):
    for path in (ROOT / "src").glob("*.py"):
        assert "live." not in "".join(line for line in path.read_text().splitlines() if line.startswith(("import", "from")))
    assert run.main(["--live"]) == 2
    assert "Stage D has not been approved" in capsys.readouterr().err


def test_approval_is_required_by_the_parser():
    with pytest.raises(SystemExit):
        stage_d.parser().parse_args(["preflight", "--model", "qwen3_vl_30b", "--host", "deepinfra"])
    with pytest.raises(SystemExit):
        stage_d.parser().parse_args(["preflight", "--model", "all", "--approved-commit", HEAD])


def test_no_key_reaches_any_output_or_record(tmp_path):
    lines = []
    assert stage_d.execute(args(), deps(tmp_path, lines=lines)) == 0
    assert KEY not in "\n".join(lines)
    for path in (tmp_path / "preflight").rglob("*"):
        if path.is_file():
            assert KEY not in path.read_text()


def test_results_are_gitignored():
    for path in ("results/preflight/x", "results/live/x"):
        assert subprocess.run(["git", "check-ignore", "-q", path], cwd=ROOT).returncode == 0


def test_catalog_failures_become_refusals(tmp_path):
    lines = []
    dependencies = deps(tmp_path, lines=lines)

    def fail(*_):
        raise stage_d.CatalogError("catalog returned HTTP 401")

    dependencies.get_json = fail
    assert stage_d.execute(args(), dependencies) == 2
    assert "HTTP 401" in lines[0]


def test_listing_at_the_configured_price_is_allowed():
    listing = Listing("deepinfra", 0.15, 0.60, True, 1500)
    assert stage_d.listing_problems(listing, MODELS["qwen3_vl_30b"]) == []
