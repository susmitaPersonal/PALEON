import ast
import json
from pathlib import Path

import pytest
import yaml

from src.adapter import FixtureAdapter, ProviderConfig, ProviderError
from src.manifest import ManifestRow
from src.metrics import compute_all
from src.records import KIND_PROVIDER_RETRY, KIND_REPAIR_RETRY, STATUS_INVALID, STATUS_PROVIDER, STATUS_VALID
from src.report import write_outputs
from src.runner import Prompt, load_prompt, make_run_id, run_experiment
from tests.helpers import gold, valid_json

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ProviderConfig(key="fixture", base_url="https://gateway.invalid", model="fixture", api_key_env="NONE")
PROMPT = Prompt("test", "system", "user")
ROW = ManifestRow("img1", "in_scope", "brahmi", "o1", "verified_institution", "allowed", {"split": "dev"})


def run(tmp_path, outcomes, repetitions=1, sleeps=None):
    adapter = FixtureAdapter(CONFIG, {"img1": outcomes})
    sleep = (sleeps.append if sleeps is not None else lambda _: None)
    return run_experiment(adapter, PROMPT, [ROW], repetitions, lambda _: (b"x", "image/jpeg"), "run", tmp_path / "r",
                          sleep=sleep)


def test_valid_first_attempt(tmp_path):
    records = run(tmp_path, [valid_json()])
    assert [r.status for r in records] == [STATUS_VALID]


def test_invalid_output_gets_exactly_one_repair_retry(tmp_path):
    records = run(tmp_path, ["bad", "still bad", valid_json()])
    assert [r.status for r in records] == [STATUS_INVALID, STATUS_INVALID]
    assert records[1].kind == KIND_REPAIR_RETRY


def test_repair_retry_can_recover(tmp_path):
    assert [r.status for r in run(tmp_path, ["bad", valid_json()])] == [STATUS_INVALID, STATUS_VALID]


def test_retryable_provider_error_gets_one_retry_and_honours_retry_after(tmp_path):
    sleeps = []
    records = run(tmp_path, [ProviderError("rate_limited", retry_after_s=9), valid_json()], sleeps=sleeps)
    assert records[1].kind == KIND_PROVIDER_RETRY and records[1].status == STATUS_VALID
    assert sleeps == [9]


def test_second_provider_failure_stops(tmp_path):
    records = run(tmp_path, [ProviderError("unavailable"), ProviderError("unavailable"), valid_json()])
    assert [r.status for r in records] == [STATUS_PROVIDER, STATUS_PROVIDER]


def test_non_retryable_error_stops_immediately(tmp_path):
    records = run(tmp_path, [ProviderError("credit_exhausted", http_status=402), valid_json()])
    assert len(records) == 1 and records[0].error_kind == "credit_exhausted"


def test_failures_and_retries_have_separate_files(tmp_path):
    run(tmp_path, ["bad", valid_json()])
    run_dir = tmp_path / "r"
    assert len((run_dir / "attempts.jsonl").read_text().splitlines()) == 2
    assert len((run_dir / "failures.jsonl").read_text().splitlines()) == 1
    assert len((run_dir / "retries.jsonl").read_text().splitlines()) == 1
    assert len(list((run_dir / "raw").glob("*.json"))) == 2


def test_raw_response_is_preserved(tmp_path):
    run(tmp_path, ["not json at all", valid_json()])
    saved = json.loads((tmp_path / "r" / "raw" / "img1_r1_a1.json").read_text())
    assert saved["content"] == "not json at all"


def test_existing_results_are_never_overwritten(tmp_path):
    run(tmp_path, [valid_json()])
    with pytest.raises(FileExistsError):
        run(tmp_path, [valid_json()])


def test_run_id_is_deterministic_and_sensitive_to_inputs():
    first = make_run_id("m", PROMPT, "manifest", "config", 1)
    assert first == make_run_id("m", PROMPT, "manifest", "config", 1)
    assert first != make_run_id("m", Prompt("test", "changed", "user"), "manifest", "config", 1)
    assert first != make_run_id("m", PROMPT, "changed", "config", 1)
    assert first != make_run_id("m", PROMPT, "manifest", "config", 2)


def test_full_offline_flow_labels_output_as_synthetic(tmp_path):
    records = run(tmp_path, [valid_json(), valid_json(), valid_json("greek")], repetitions=3)
    metrics = compute_all(records, [gold("img1", "brahmi")], 3, 0.15, 0.60)
    write_outputs(metrics, "run", tmp_path / "r", synthetic=True)
    report = (tmp_path / "r" / "report.md").read_text()
    assert "SYNTHETIC FIXTURE DATA" in report
    assert "95% CI" in report and "Dataset limitations" in report and "No 88% accuracy claim" in report
    assert (tmp_path / "r" / "confusion_matrix.png").stat().st_size > 0
    assert json.loads((tmp_path / "r" / "metrics.json").read_text())["after_retry"]["top1"]["k"] == 1


def test_prompt_hash_matches_frozen_config():
    config = yaml.safe_load((ROOT / "config" / "run.yaml").read_text())
    prompt = load_prompt(ROOT / config["prompt"]["path"], config["prompt"]["version"])
    assert prompt.sha256 == config["prompt"]["sha256"]


def test_prompt_contains_all_scripts_and_abstention_routes():
    text = (ROOT / "prompts" / "eval_v1.md").read_text()
    for term in ("brahmi", "kharosthi", "phoenician", "greek", "latin", "runic", "insufficient_evidence",
                 "outside_supported_set", "no_writing"):
        assert term in text


def test_no_network_client_is_imported_by_the_harness():
    banned = {"httpx", "requests", "urllib", "aiohttp", "socket", "http"}
    for path in (ROOT / "src").glob("*.py"):
        for node in ast.walk(ast.parse(path.read_text())):
            names = []
            if isinstance(node, ast.Import):
                names = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom) and node.level == 0:
                names = [node.module or ""]
            assert not {n.split(".")[0] for n in names} & banned, path.name


def test_no_key_like_values_in_tracked_config():
    for path in [ROOT / ".env.example", ROOT / "config" / "models.yaml", ROOT / "config" / "run.yaml"]:
        text = path.read_text()
        assert "sk-or-" not in text and "hf_" not in text.replace("HF_TOKEN", "")
