import csv
import hashlib
import io
import json

import pytest
from PIL import Image

from src.adapter import FixtureAdapter, ProviderConfig, ProviderError, require_credentials
from src.images import ImageError, LocalImageSource, SyntheticImageSource
from src.manifest import ManifestError, ManifestRow, gold_items, load_manifest, to_rows
from src.metrics import GoldItem, attempt_stats, compute_all, failure_analysis, score_view, subgroup_results
from src.records import KIND_PROVIDER_RETRY, KIND_REPAIR_RETRY, STATUS_INVALID, STATUS_PROVIDER
from src.report import confusion_csv
from src.results import attempt_cost, image_rows, repetition_rows, write_results
from src.runner import ChatRequest, Prompt
from tests.helpers import gold, record
from tests.test_preprocess_and_manifest import base_row

CONFIG = ProviderConfig(key="m", base_url="u", model="x", api_key_env="NEEDED_KEY",
                        input_usd_per_mtok=1.0, output_usd_per_mtok=2.0)
PROMPT = Prompt("v", "s", "u")
REQUEST = ChatRequest("s", "u", b"x", "image/jpeg", {})


def row(image_id="a1", sha256=""):
    return ManifestRow(image_id, "in_scope", "brahmi", "o", "verified_institution", "allowed", {"sha256": sha256})


def png_bytes():
    buffer = io.BytesIO()
    Image.new("RGB", (40, 30), "white").save(buffer, format="PNG")
    return buffer.getvalue()


def write_manifest(path, rows):
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    return path


def test_synthetic_image_source_needs_no_files_and_is_not_an_image():
    data, mime = SyntheticImageSource()(row())
    assert data.startswith(b"SYNTHETIC-PLACEHOLDER") and mime == "application/octet-stream"


def test_local_source_reports_a_missing_image(tmp_path):
    with pytest.raises(ImageError, match="no local image"):
        LocalImageSource(tmp_path, 100, 90)(row())


def test_local_source_requires_a_recorded_hash(tmp_path):
    (tmp_path / "a1.png").write_bytes(png_bytes())
    with pytest.raises(ImageError, match="no recorded sha256"):
        LocalImageSource(tmp_path, 100, 90)(row())


def test_local_source_rejects_a_changed_image(tmp_path):
    (tmp_path / "a1.png").write_bytes(png_bytes())
    with pytest.raises(ImageError, match="does not match"):
        LocalImageSource(tmp_path, 100, 90)(row(sha256="0" * 64))


def test_local_source_normalizes_a_verified_image(tmp_path):
    data = png_bytes()
    (tmp_path / "a1.png").write_bytes(data)
    output, mime = LocalImageSource(tmp_path, 20, 90)(row(sha256=hashlib.sha256(data).hexdigest()))
    assert mime == "image/jpeg" and Image.open(io.BytesIO(output)).size == (20, 15)


def test_load_manifest_rejects_a_missing_file(tmp_path):
    with pytest.raises(ManifestError, match="not found"):
        load_manifest(tmp_path / "none.csv")


def test_load_manifest_rejects_an_empty_file(tmp_path):
    path = tmp_path / "m.csv"
    path.write_text("image_id,split\n")
    with pytest.raises(ManifestError, match="no rows"):
        load_manifest(path)


def test_load_manifest_reports_a_missing_image_id(tmp_path):
    path = write_manifest(tmp_path / "m.csv", [base_row(image_id="")])
    with pytest.raises(ManifestError, match="missing image_id"):
        load_manifest(path)


def test_load_manifest_reports_a_duplicate_image_id(tmp_path):
    path = write_manifest(tmp_path / "m.csv", [base_row(), base_row(object_id="2")])
    with pytest.raises(ManifestError, match="duplicate image_id"):
        load_manifest(path)


def test_load_manifest_reports_an_invalid_label(tmp_path):
    path = write_manifest(tmp_path / "m.csv", [base_row(script_label="ogham")])
    with pytest.raises(ManifestError, match="in-scope label"):
        load_manifest(path)


def test_load_manifest_reports_missing_columns(tmp_path):
    row_without = base_row()
    del row_without["notes"]
    path = write_manifest(tmp_path / "m.csv", [row_without])
    with pytest.raises(ManifestError, match="missing columns"):
        load_manifest(path)


def test_gold_items_exclude_uncounted_rows_and_carry_confound_flags():
    rows = to_rows([
        base_row(famous_object="yes", leakage_risks="Printed plate of an impression"),
        base_row(image_id="a2", object_id="2", label_status="implied_record"),
        base_row(image_id="a3", object_id="3", split="reserve"),
    ])
    items = gold_items(rows)
    assert [i.image_id for i in items] == ["a1"]
    assert items[0].famous and items[0].printed_plate


def test_fixture_usage_is_never_invented():
    adapter = FixtureAdapter(CONFIG, {"a": ["plain text"]})
    adapter.current_image = "a"
    result = adapter.complete(REQUEST)
    assert result.input_tokens is None and result.output_tokens is None


def test_fixture_replays_recorded_usage_and_errors():
    adapter = FixtureAdapter(CONFIG, {"a": [{"content": "x", "input_tokens": 7, "output_tokens": 3},
                                            {"error": {"kind": "rate_limited", "http_status": 429, "retry_after_s": 2}}]})
    adapter.current_image = "a"
    assert adapter.complete(REQUEST).input_tokens == 7
    with pytest.raises(ProviderError) as caught:
        adapter.complete(REQUEST)
    assert caught.value.kind == "rate_limited" and caught.value.retryable and caught.value.retry_after_s == 2


def test_missing_credentials_are_named_without_values():
    assert require_credentials([CONFIG], env={}) == ["NEEDED_KEY"]
    assert require_credentials([CONFIG], env={"NEEDED_KEY": "secret"}) == []


def test_unknown_usage_stays_unknown_in_cost_and_totals():
    records = [record("i", 1, ["brahmi"])]
    assert attempt_cost(records[0], CONFIG) is None
    stats = attempt_stats(records, 1.0, 2.0)
    assert stats["estimated_cost_usd"] is None
    assert stats["attempts_with_usage"]["k"] == 0


def test_partial_usage_is_reported_as_partial():
    records = [record("i", 1, ["brahmi"], input_tokens=1_000_000, output_tokens=1_000_000), record("i", 2, ["brahmi"])]
    stats = attempt_stats(records, 1.0, 2.0)
    assert stats["estimated_cost_usd"] == pytest.approx(3.0)
    assert (stats["attempts_with_usage"]["k"], stats["attempts_with_usage"]["n"]) == (1, 2)


def test_cost_needs_prices():
    unpriced = ProviderConfig(key="m", base_url="u", model="x", api_key_env="K")
    assert attempt_cost(record("i", 1, ["brahmi"], input_tokens=1, output_tokens=1), unpriced) is None


def test_reproducibility_denominators_are_separate():
    records = []
    for image, script in [("a", "greek"), ("b", "latin")]:
        records += [record(image, r, [script]) for r in (1, 2, 3)]
    records += [record("c", r, disposition="outside_supported_set") for r in (1, 2, 3)]
    items = [gold("a", "greek"), gold("b", "latin"), gold("c", "cuneiform", "out_of_scope")]
    view = score_view(records, items, 3, "after_retry")
    assert view["reproducibility_in_scope"]["n"] == 2
    assert view["reproducibility_rejection"]["n"] == 1


def test_rejection_consistency_needs_every_repetition_to_abstain():
    records = [record("a", 1, disposition="outside_supported_set"), record("a", 2, ["greek"]),
               record("a", 3, disposition="outside_supported_set")]
    records += [record("b", 1, disposition="outside_supported_set"), record("b", 2, disposition="no_writing"),
                record("b", 3, disposition="outside_supported_set")]
    items = [gold("a", "cuneiform", "out_of_scope"), gold("b", "cuneiform", "out_of_scope")]
    view = score_view(records, items, 3, "after_retry")
    assert view["rejection"]["k"] == 2
    assert view["rejection_consistency"]["k"] == 1
    assert view["reproducibility_rejection"]["k"] == 0


def test_top_one_identical_counts_a_consistent_wrong_answer():
    records = [record("a", r, ["latin"]) for r in (1, 2, 3)]
    view = score_view(records, [gold("a", "greek")], 3, "after_retry")
    assert view["reproducibility_in_scope"]["k"] == 1 and view["top1"]["k"] == 0


def test_failure_analysis_separates_provider_failures_from_model_errors():
    records = [record("p", r, status=STATUS_PROVIDER, error_kind="unavailable") for r in (1, 2, 3)]
    records += [record("m", r, status=STATUS_INVALID) for r in (1, 2, 3)]
    records += [record("t", r, ["latin", "greek"]) for r in (1, 2, 3)]
    records += [record("w", r, ["latin"]) for r in (1, 2, 3)]
    records += [record("f", r, ["latin"]) for r in (1, 2, 3)]
    items = [gold("p", "greek"), gold("m", "greek"), gold("t", "greek"), gold("w", "greek"),
             gold("f", "cuneiform", "out_of_scope")]
    assert failure_analysis(records, items, 3)["counts"] == {
        "provider_failure": 1, "malformed_output": 1, "wrong_top1_gold_in_top3": 1, "wrong_script": 1, "forced_match": 1}


def test_subgroups_split_the_confounds():
    records = [record("a", r, ["brahmi"]) for r in (1, 2, 3)] + [record("b", r, ["latin"]) for r in (1, 2, 3)]
    items = [GoldItem("a", "in_scope", "brahmi", famous=True, printed_plate=True), GoldItem("b", "in_scope", "greek")]
    groups = subgroup_results(records, items, 3)
    assert (groups["printed_plate"]["top1"]["k"], groups["printed_plate"]["top1"]["n"]) == (1, 1)
    assert (groups["photograph_or_other"]["top1"]["k"], groups["photograph_or_other"]["top1"]["n"]) == (0, 1)


def test_empty_subgroup_is_reported_as_empty():
    records = [record("a", r, ["brahmi"]) for r in (1, 2, 3)]
    assert subgroup_results(records, [gold("a", "brahmi")], 3)["famous"]["top1"]["rate"] is None


def test_repetition_row_records_retries_and_errors():
    records = [
        record("a", 1, status=STATUS_PROVIDER, error_kind="rate_limited", http_status=429, latency_ms=5.0),
        record("a", 1, status=STATUS_INVALID, attempt=2, kind=KIND_PROVIDER_RETRY, latency_ms=6.0,
               input_tokens=10, output_tokens=2),
        record("a", 1, ["brahmi", "greek"], attempt=3, kind=KIND_REPAIR_RETRY, latency_ms=7.0,
               input_tokens=10, output_tokens=2),
    ]
    row_ = repetition_rows(records, [gold("a", "brahmi")], 1, CONFIG, PROMPT)[0]
    assert row_["top_one"] == "brahmi" and row_["top_three"] == ["brahmi", "greek"]
    assert (row_["retry_count"], row_["provider_retries"], row_["repair_retries"]) == (2, 1, 1)
    assert row_["provider_error"] == "rate_limited" and row_["valid_output"] is True
    assert row_["latency_ms"] == 18.0 and row_["input_tokens"] == 20
    assert row_["usage_complete"] is False and row_["prompt_sha256"] == PROMPT.sha256


def test_failed_repetition_has_no_prediction():
    records = [record("a", 1, status=STATUS_PROVIDER, error_kind="unavailable")]
    row_ = repetition_rows(records, [gold("a", "brahmi")], 1, CONFIG, PROMPT)[0]
    assert row_["top_one"] is None and row_["top_three"] == [] and row_["valid_output"] is False
    assert row_["input_tokens"] is None and row_["estimated_cost_usd"] is None and row_["latency_ms"] is None


def test_abstention_has_no_top_one():
    records = [record("a", 1, disposition="outside_supported_set")]
    row_ = repetition_rows(records, [gold("a", "cuneiform", "out_of_scope")], 1, CONFIG, PROMPT)[0]
    assert row_["top_one"] is None and row_["disposition"] == "outside_supported_set"


def test_repetition_rows_refuse_silent_gaps():
    with pytest.raises(ValueError, match="no attempts recorded"):
        repetition_rows([], [gold("a", "brahmi")], 1, CONFIG, PROMPT)


def test_results_serialize_to_jsonl_and_csv(tmp_path):
    records = [record("a", r, ["brahmi"], input_tokens=1, output_tokens=1) for r in (1, 2, 3)]
    items = [gold("a", "brahmi")]
    write_results(tmp_path, repetition_rows(records, items, 3, CONFIG, PROMPT), image_rows(records, items, 3), {"x": 1})
    lines = (tmp_path / "repetition_results.jsonl").read_text().splitlines()
    assert len(lines) == 3 and json.loads(lines[0])["top_three"] == ["brahmi"]
    with (tmp_path / "image_results.csv").open() as handle:
        row_ = next(csv.DictReader(handle))
    assert row_["image_prediction"] == "brahmi" and json.loads(row_["repetition_labels"]) == ["brahmi"] * 3
    assert json.loads((tmp_path / "run_manifest.json").read_text()) == {"x": 1}


def test_confusion_csv_uses_only_observed_columns():
    text = confusion_csv({"greek": {"latin": 2, "greek": 1}, "cuneiform": {"abstain_outside": 1}})
    assert text.splitlines()[0] == "gold,greek,latin,abstain_outside"
    assert "greek,1,2,0" in text


def test_metrics_are_json_serializable():
    records = [record("a", r, ["brahmi"]) for r in (1, 2, 3)]
    assert json.dumps(compute_all(records, [gold("a", "brahmi")], 3, None, None))


