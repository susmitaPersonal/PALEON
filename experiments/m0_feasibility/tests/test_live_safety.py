"""Live-path behaviour, using fake and mock transports. Nothing here reaches a network."""
import ast
import json
import math
from pathlib import Path

import httpx
import pytest

from live import preflight
from live.transport import MAX_RESPONSE_BYTES, HttpxTransport, live_adapter
from src import run
from src.adapter import OpenAICompatibleAdapter, ProviderConfig, ProviderError, TransportResponse
from src.config import live_blockers, load_models, load_run_config
from src.guard import RunGuard, RunLimits, prior_usage
from src.manifest import ManifestRow, gold_items
from src.records import STATUS_PROVIDER, STATUS_VALID, AttemptRecord, Prediction
from src.runner import Prompt, protocol_sha256, run_experiment
from tests.helpers import valid_json

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ProviderConfig(key="m", base_url="https://gateway.invalid/v1", model="org/model:host", api_key_env="K",
                        input_usd_per_mtok=0.15, output_usd_per_mtok=0.60, max_output_tokens=1500)
PROMPT = Prompt("test", "system", "user")
LIMITS = RunLimits(max_attempts=288, run_timeout_s=14400, max_consecutive_provider_failures=5,
                   assumed_input_tokens=8000, stop_limit_usd=1.00)


def row(image_id):
    return ManifestRow(image_id, "in_scope", "brahmi", image_id, "verified_institution", "allowed",
                       {"split": "dev", "stage_c_status": "accepted", "famous_object": "no", "leakage_risks": "",
                        "sample_type": "complete"})


ROWS = [row(f"img{i}") for i in range(32)]


def reply(content=None, **extra):
    return TransportResponse(200, {}, json.dumps({
        "choices": [{"message": {"content": content or valid_json()}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 5000, "completion_tokens": 800}, **extra}))


class Fake:
    def __init__(self, *responses):
        self.responses = responses
        self.calls = 0

    def post(self, url, headers, body, timeout_s):
        response = self.responses[min(self.calls, len(self.responses) - 1)]
        self.calls += 1
        if isinstance(response, Exception):
            raise response
        return response


def execute(tmp_path, transport, limits=LIMITS, rows=ROWS, guard=None, repetitions=3, **options):
    guard = guard or RunGuard(limits, CONFIG)
    adapter = OpenAICompatibleAdapter(CONFIG, transport, "key")
    sleeps = []
    records = run_experiment(adapter, PROMPT, rows, repetitions, lambda _: (b"pixels", "image/jpeg"), "run",
                             tmp_path / "r", sleep=sleeps.append, guard=guard, **options)
    return records, guard, sleeps


def stop_record(tmp_path):
    return json.loads((tmp_path / "r" / "stopped.json").read_text())


# H-01: spending and request guard
def test_attempt_limit_stops_the_run(tmp_path):
    transport = Fake(reply())
    records, guard, _ = execute(tmp_path, transport, RunLimits(10, 14400, 5, 8000, 1.00))
    assert transport.calls == 10 and len(records) == 10
    assert "attempt limit" in guard.stopped and "attempt limit" in stop_record(tmp_path)["reason"]


def test_spending_limit_stops_before_the_call_that_could_cross_it(tmp_path):
    ceiling = (8000 * 0.15 + 1500 * 0.60) / 1e6
    transport = Fake(TransportResponse(503, {}, ""))
    limits = RunLimits(288, 14400, 1000, 8000, ceiling * 2.5)
    _, guard, _ = execute(tmp_path, transport, limits)
    assert transport.calls == 2 and guard.spent_usd == pytest.approx(ceiling * 2)
    assert "spending stop limit" in guard.stopped


def test_unknown_usage_counts_at_the_ceiling_and_known_usage_at_its_price():
    guard = RunGuard(LIMITS, CONFIG)
    base = dict(run_id="r", model_key="m", image_id="i", repetition=1, attempt=1, kind="initial", status=STATUS_VALID)
    guard.observe(AttemptRecord(**base))
    assert guard.spent_usd == pytest.approx(guard.ceiling_usd)
    guard.observe(AttemptRecord(**base, input_tokens=1000, output_tokens=100))
    assert guard.spent_usd == pytest.approx(guard.ceiling_usd + (1000 * 0.15 + 100 * 0.60) / 1e6)


def test_run_time_limit_stops_the_run(tmp_path):
    now = [0.0]

    def clock():
        now[0] += 10
        return now[0]

    transport = Fake(reply())
    guard = RunGuard(RunLimits(288, 35, 5, 8000, 1.00), CONFIG, clock=clock)
    execute(tmp_path, transport, guard=guard)
    assert "run time limit" in guard.stopped and transport.calls < 96


def test_limits_hold_across_runs(tmp_path):
    execute(tmp_path, Fake(reply()), RunLimits(10, 14400, 5, 8000, 1.00))
    attempts, spend = prior_usage(tmp_path, LIMITS, CONFIG)
    assert attempts == 10 and spend == pytest.approx(10 * (5000 * 0.15 + 800 * 0.60) / 1e6)
    (tmp_path / "second").mkdir()
    transport = Fake(reply())
    execute(tmp_path / "second", transport, guard=RunGuard(RunLimits(12, 14400, 5, 8000, 1.00), CONFIG, attempts, spend))
    assert transport.calls == 2


def test_guard_needs_prices():
    with pytest.raises(ValueError, match="needs prices"):
        RunGuard(LIMITS, ProviderConfig(key="m", base_url="u", model="x", api_key_env="K"))


def test_a_non_synthetic_run_cannot_skip_the_guard(tmp_path):
    with pytest.raises(ValueError, match="needs a RunGuard"):
        run.run_model(CONFIG, None, None, PROMPT, ROWS, 3, (1, 1), "r", tmp_path / "r", {}, data_origin="live")


# H-02: fatal failures stop the run
@pytest.mark.parametrize("status,kind", [(402, "credit_exhausted"), (401, "auth"), (403, "auth"), (400, "bad_request")])
def test_fatal_error_makes_one_call_and_stops(tmp_path, status, kind):
    transport = Fake(TransportResponse(status, {}, "{}"))
    records, guard, _ = execute(tmp_path, transport)
    assert transport.calls == 1 and len(records) == 1
    assert kind in guard.stopped and (tmp_path / "r" / "raw" / "img0_r1_a1.json").exists()


def test_a_run_of_outages_stops_after_five_failures(tmp_path):
    transport = Fake(TransportResponse(503, {}, ""))
    _, guard, _ = execute(tmp_path, transport)
    assert transport.calls == 5 and "5 provider failures" in guard.stopped


def test_a_good_reply_resets_the_failure_count(tmp_path):
    down = TransportResponse(503, {}, "")
    transport = Fake(*[down, reply()] * 6)
    records, guard, _ = execute(tmp_path, transport, rows=ROWS[:2])
    assert guard.stopped is None and len(records) == 12


def test_stopped_run_keeps_records_and_reports_no_metrics(tmp_path):
    adapter = OpenAICompatibleAdapter(CONFIG, Fake(TransportResponse(402, {}, "{}")), "key")
    guard = RunGuard(LIMITS, CONFIG)
    result = run.run_model(CONFIG, adapter, lambda _: (b"x", "image/jpeg"), PROMPT, ROWS, 3, (1, 1), "r", tmp_path / "r",
                           {"run_id": "r"}, data_origin="live", guard=guard)
    assert result is None
    assert len((tmp_path / "r" / "attempts.jsonl").read_text().splitlines()) == 1
    assert (tmp_path / "r" / "run_manifest.json").exists() and not (tmp_path / "r" / "metrics.json").exists()


def test_complete_guarded_run_reports_without_a_synthetic_banner(tmp_path):
    adapter = OpenAICompatibleAdapter(CONFIG, Fake(reply()), "key")
    rows = ROWS[:2]
    metrics = run.run_model(CONFIG, adapter, lambda _: (b"x", "image/jpeg"), PROMPT, rows, 3, (1, 1), "r", tmp_path / "r",
                            {"run_id": "r"}, data_origin="live", guard=RunGuard(LIMITS, CONFIG))
    assert metrics["after_retry"]["top1"]["k"] == 2 and gold_items(rows)
    assert "SYNTHETIC" not in (tmp_path / "r" / "report.md").read_text()


# H-03: transport
def client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def post(transport, timeout_s=90.0):
    return transport.post("https://gateway.invalid/v1/chat/completions", {"Authorization": "Bearer k"}, {"a": 1}, timeout_s)


def test_transport_returns_status_headers_and_body():
    response = post(HttpxTransport(client(lambda _: httpx.Response(429, headers={"Retry-After": "7"}, text="busy"))))
    assert (response.status, response.body) == (429, "busy") and response.headers["retry-after"] == "7"


def test_transport_sends_json_and_headers():
    seen = {}

    def handler(request):
        seen.update(body=json.loads(request.content), auth=request.headers["authorization"])
        return httpx.Response(200, text="{}")

    post(HttpxTransport(client(handler)))
    assert seen == {"body": {"a": 1}, "auth": "Bearer k"}


@pytest.mark.parametrize("error,expected", [
    (httpx.ReadTimeout("t"), TimeoutError), (httpx.ConnectTimeout("t"), TimeoutError),
    (httpx.ConnectError("c"), ConnectionError), (httpx.RemoteProtocolError("p"), ConnectionError),
])
def test_httpx_failures_become_typed_exceptions(error, expected):
    def handler(_):
        raise error

    with pytest.raises(expected):
        post(HttpxTransport(client(handler)))


def test_httpx_timeout_is_a_recorded_failure_and_not_a_crash(tmp_path):
    def handler(_):
        raise httpx.ReadTimeout("t")

    records, _, _ = execute(tmp_path, HttpxTransport(client(handler)), rows=ROWS[:1], repetitions=1)
    assert [(r.status, r.error_kind) for r in records] == [(STATUS_PROVIDER, "timeout")] * 2


def test_slow_steady_reply_cannot_outlast_the_deadline():
    class Drip(httpx.SyncByteStream):
        def __iter__(self):
            yield from [b"x"] * 100

    now = [0.0]

    def clock():
        now[0] += 10
        return now[0]

    with pytest.raises(TimeoutError):
        post(HttpxTransport(client(lambda _: httpx.Response(200, stream=Drip())), clock=clock))


def test_oversized_reply_is_refused():
    body = b"x" * (MAX_RESPONSE_BYTES + 1)
    with pytest.raises(ConnectionError, match="size limit"):
        post(HttpxTransport(client(lambda _: httpx.Response(200, content=body))))


def test_live_adapter_needs_a_key():
    with pytest.raises(ProviderError) as caught:
        live_adapter(CONFIG, env={})
    assert caught.value.kind == "auth"


def test_entry_point_and_src_cannot_reach_the_live_package():
    for path in (ROOT / "src").glob("*.py"):
        for node in ast.walk(ast.parse(path.read_text())):
            names = [a.name for a in node.names] if isinstance(node, ast.Import) else []
            if isinstance(node, ast.ImportFrom) and node.level == 0:
                names = [node.module or ""]
            assert "live" not in {n.split(".")[0] for n in names}, path.name


def test_preflight_uses_only_generated_images(tmp_path):
    source = (ROOT / "live" / "preflight.py").read_text()
    assert "LocalImageSource" not in source and "data/" not in source and "manifest.csv" not in source


# H-04: pinned routing
def test_real_config_reports_model_a_as_not_pinned_yet():
    models = load_models(ROOT / "config" / "models.yaml", load_run_config(ROOT / "config" / "run.yaml"))
    assert live_blockers(models) == ["qwen3_vl_30b: no pinned host"]
    assert models["qwen3_vl_30b"].extra_body["provider"]["allow_fallbacks"] is False


@pytest.mark.parametrize("provider,blocked", [
    ({"order": ["host"], "allow_fallbacks": False}, False), ({"order": ["host"]}, True),
    ({"order": [], "allow_fallbacks": False}, True), ({}, True),
])
def test_a_host_counts_as_pinned_only_with_fallbacks_off(provider, blocked):
    model = ProviderConfig(key="m", base_url="u", model="x", api_key_env="K", extra_body={"provider": provider},
                           input_usd_per_mtok=1, output_usd_per_mtok=1)
    assert bool(live_blockers({"m": model})) is blocked


def test_check_reports_blockers(capsys):
    assert run.main(["--check"]) == 0
    assert json.loads(capsys.readouterr().out)["live_blockers"] == ["qwen3_vl_30b: no pinned host"]


# H-05: Retry-After
def test_long_retry_after_counts_as_a_failure_with_no_retry(tmp_path):
    transport = Fake(TransportResponse(429, {"Retry-After": "86400"}, "{}"), reply())
    records, _, sleeps = execute(tmp_path, transport, rows=ROWS[:1], repetitions=1)
    assert sleeps == [] and transport.calls == 1 and records[0].error_kind == "rate_limited"


def test_retry_after_at_the_cap_is_honoured(tmp_path):
    _, _, sleeps = execute(tmp_path, Fake(TransportResponse(429, {"Retry-After": "30"}, "{}"), reply()),
                           rows=ROWS[:1], repetitions=1)
    assert sleeps == [30.0]


@pytest.mark.parametrize("value", ["inf", "-inf", "-5", "nan", "soon", "Wed, 21 Oct 2026 07:28:00 GMT"])
def test_unusable_retry_after_uses_the_default_wait(tmp_path, value):
    records, _, sleeps = execute(tmp_path, Fake(TransportResponse(429, {"Retry-After": value}, "{}"), reply()),
                                 rows=ROWS[:1], repetitions=1)
    assert sleeps == [2.0] and records[-1].status == STATUS_VALID and math.isfinite(sleeps[0])


# H-06: malformed replies
@pytest.mark.parametrize("body", ['{"choices": [null]}', '{"choices": ["x"]}', '{"choices": [{"message": "x"}]}',
                                  '{"choices": {"a": 1}}', '{"choices": [{"message": [1]}]}'])
def test_malformed_choice_is_a_recorded_failure(tmp_path, body):
    records, _, _ = execute(tmp_path, Fake(TransportResponse(200, {}, body)), rows=ROWS[:1], repetitions=1)
    assert [(r.status, r.error_kind) for r in records] == [(STATUS_PROVIDER, "bad_response")]
    assert (tmp_path / "r" / records[0].raw_path).exists()


@pytest.mark.parametrize("usage", ["[1]", '"x"', '{"prompt_tokens": "many", "completion_tokens": true}', "null"])
def test_malformed_usage_stays_unknown(tmp_path, usage):
    body = '{"choices": [{"message": {"content": %s}}], "usage": %s}' % (json.dumps(valid_json()), usage)
    records, guard, _ = execute(tmp_path, Fake(TransportResponse(200, {}, body)), rows=ROWS[:1], repetitions=1)
    assert records[0].status == STATUS_VALID and records[0].input_tokens is None
    assert guard.spent_usd == pytest.approx(guard.ceiling_usd)


def test_lone_surrogate_is_stored_unchanged(tmp_path):
    body = '{"choices": [{"message": {"content": "\\ud800 bad"}, "finish_reason": "stop"}], "usage": {}}'
    records, _, _ = execute(tmp_path, Fake(TransportResponse(200, {}, body)), rows=ROWS[:1], repetitions=1)
    saved = json.loads((tmp_path / "r" / records[0].raw_path).read_text(encoding="utf-8"))
    assert saved["choices"][0]["message"]["content"] == "\ud800 bad"
    for line in (tmp_path / "r" / "attempts.jsonl").read_text(encoding="utf-8").splitlines():
        json.loads(line)


# H-08: inputs that must be frozen
def test_limits_come_from_the_hashed_configuration():
    config = load_run_config(ROOT / "config" / "run.yaml")
    model = load_models(ROOT / "config" / "models.yaml", config)["gemma4_31b"]
    assert (model.max_output_tokens, model.timeout_s) == (1500, 90)


def test_protocol_hash_covers_schema_and_repair_note(monkeypatch):
    first = protocol_sha256()
    monkeypatch.setattr("src.runner.REPAIR_NOTE", "changed")
    assert protocol_sha256() != first


def test_exact_sent_bytes_are_recorded(tmp_path):
    records, _, _ = execute(tmp_path, Fake(reply()), rows=ROWS[:1], repetitions=1)
    import hashlib
    assert records[0].sent_sha256 == hashlib.sha256(b"pixels").hexdigest()


def test_run_manifest_records_versions_and_protocol(tmp_path):
    metadata = run.json.loads((run.synthetic(tmp_path) / next(p.name for p in (tmp_path / "s01").iterdir() if p.is_dir())
                               / "run_manifest.json").read_text())
    assert metadata["environment"]["protocol_sha256"] == protocol_sha256()
    assert {"python", "pillow", "pydantic", "httpx"} <= set(metadata["environment"])


# H-10: fields the analysis needs
def test_records_carry_finish_model_host_and_token_details(tmp_path):
    response = reply(model="org/model-resolved", provider="SomeHost")
    payload = json.loads(response.body)
    payload["usage"].update(prompt_tokens_details={"cached_tokens": 40}, completion_tokens_details={"reasoning_tokens": 9})
    records, _, _ = execute(tmp_path, Fake(TransportResponse(200, {}, json.dumps(payload))), rows=ROWS[:1], repetitions=1)
    record = records[0]
    assert (record.finish_reason, record.response_model, record.response_host) == ("stop", "org/model-resolved", "SomeHost")
    assert (record.cached_input_tokens, record.reasoning_tokens) == (40, 9)


def test_truncated_reply_is_invalid_with_its_reason_recorded(tmp_path):
    body = json.dumps({"choices": [{"message": {"content": '{"disposition": "iden'}, "finish_reason": "length"}]})
    records, _, _ = execute(tmp_path, Fake(TransportResponse(200, {}, body)), rows=ROWS[:1], repetitions=1)
    assert records[0].status == "invalid_output" and records[0].finish_reason == "length"


# Preflight
def test_canaries_are_deterministic_and_cover_the_largest_image():
    first = preflight.make_canaries()
    assert first == preflight.make_canaries()
    assert len(first["canary_noise"]) >= preflight.LARGEST_DATASET_JPEG_BYTES
    assert first["canary_white"] != first["canary_text"]


def preflight_transport():
    class ByImage:
        calls = 0

        def post(self, url, headers, body, timeout_s):
            ByImage.calls += 1
            data_url = body["messages"][1]["content"][1]["image_url"]["url"]
            white = data_url == WHITE
            content = valid_json("x", disposition="no_writing") if white else valid_json("latin")
            return reply(content, provider="Host", model="org/model")

    return ByImage


WHITE = "data:image/jpeg;base64," + __import__("base64").b64encode(preflight.make_canaries()["canary_white"]).decode()


def run_check(tmp_path, transport):
    guard = RunGuard(RunLimits(preflight.MAX_ATTEMPTS, preflight.RUN_TIMEOUT_S, 5, 8000, 1.00), CONFIG)
    adapter = OpenAICompatibleAdapter(CONFIG, transport, "key")
    return preflight.run_preflight(adapter, PROMPT, guard, "p", tmp_path / "p", lambda _: None)


def test_preflight_passes_when_the_model_sees_the_image(tmp_path):
    transport = preflight_transport()
    result = run_check(tmp_path, transport())
    assert result["passed"] and transport.calls == 6 and result["hosts"] == ["Host"]
    assert result["labels"]["canary_white"] == ["abstain_no_writing"] and result["labels"]["canary_text"] == ["latin"]


def test_preflight_fails_when_answers_ignore_the_image(tmp_path):
    result = run_check(tmp_path, Fake(reply()))
    assert not result["passed"] and not result["checks"]["image_received"]


def test_preflight_stops_at_a_fatal_error(tmp_path):
    transport = Fake(TransportResponse(401, {}, "{}"))
    result = run_check(tmp_path, transport)
    assert transport.calls == 1 and not result["passed"] and "auth" in result["stopped"]


def test_preflight_never_exceeds_its_attempt_limit(tmp_path):
    transport = Fake(reply("not json"))
    result = run_check(tmp_path, transport)
    assert transport.calls == 12 <= preflight.MAX_ATTEMPTS and not result["checks"]["structured_output_valid"]
