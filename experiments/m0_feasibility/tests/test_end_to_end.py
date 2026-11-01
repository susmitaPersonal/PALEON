"""Whole-pipeline tests. Expected numbers were worked out by hand from the scenario lists in src/synthetic.py."""
import json
import socket
from pathlib import Path

import pytest

from src import run, synthetic
from src.manifest import eligible_rows, load_manifest
from src.synthetic import FIXTURE_DIR, STRONG_IN_SCOPE, STRONG_REJECTION, WEAK_IN_SCOPE, WEAK_REJECTION


@pytest.fixture(scope="module")
def session(tmp_path_factory):
    return run.synthetic(tmp_path_factory.mktemp("results"))


def run_dir(session: Path, key: str) -> Path:
    return next(session.glob(f"m0-{key}-*"))


def metrics(session: Path, key: str) -> dict:
    return json.loads((run_dir(session, key) / "metrics.json").read_text())


def lines(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines()]


def test_synthetic_dataset_has_the_verified_shape():
    rows = load_manifest(FIXTURE_DIR / "manifest.csv")
    counted = eligible_rows(rows)
    assert sum(r.gold_class == "in_scope" for r in counted) == 29
    assert sum(r.gold_class != "in_scope" for r in counted) == 10
    assert len(rows) - len(counted) == 2


def test_fixtures_match_the_generator():
    for name, text in synthetic.fixture_files().items():
        assert (FIXTURE_DIR / name).read_text() == text, name


def test_fixtures_are_marked_synthetic_and_name_no_real_model():
    for name in ("synthetic_strong.json", "synthetic_weak.json"):
        assert json.loads((FIXTURE_DIR / name).read_text())["synthetic"] is True
    text = (FIXTURE_DIR / "models.yaml").read_text()
    assert "qwen" not in text.lower() and "gemma" not in text.lower() and "invalid" in text


def test_every_required_scenario_is_present():
    used = set(STRONG_IN_SCOPE + STRONG_REJECTION + WEAK_IN_SCOPE + WEAK_REJECTION)
    assert {"correct", "wrong", "top3_only", "outside", "repair_ok", "repair_exhausted", "provider_retry_ok",
            "provider_exhausted", "missing_evidence_repaired", "missing_evidence_exhausted_all"} <= used


@pytest.mark.parametrize("key,expected", [
    ("synthetic_strong", {"top1": (22, 29), "top3": (25, 29), "rejection": (9, 10), "valid_after_retry": (114, 115),
                          "reproducibility": (24, 29)}),
    ("synthetic_weak", {"top1": (8, 29), "top3": (13, 29), "rejection": (4, 10), "valid_after_retry": (108, 114),
                        "reproducibility": (23, 29)}),
])
def test_gate_counts_match_hand_calculation(session, key, expected):
    gates = metrics(session, key)["decision"]["gates"]
    assert {name: (g["k"], g["n"]) for name, g in gates.items()} == expected


def test_gate_requirements_use_the_verified_denominators(session):
    gates = metrics(session, "synthetic_strong")["decision"]["gates"]
    assert (gates["top1"]["required"], gates["top3"]["required"]) == (15, 24)
    assert gates["rejection"]["required"] == 7
    assert (gates["reproducibility"]["required"], gates["reproducibility"]["n"]) == (24, 29)


def test_strong_fixture_passes_at_the_reproducibility_boundary(session):
    assert metrics(session, "synthetic_strong")["decision"]["all_passed"]


def test_weak_fixture_fails_gates_it_should_fail(session):
    decision = metrics(session, "synthetic_weak")["decision"]
    assert not decision["all_passed"]
    assert {n for n, g in decision["gates"].items() if not g["passed"]} == {"top1", "top3", "rejection", "reproducibility"}


def test_rejection_measures_are_separate(session):
    after = metrics(session, "synthetic_strong")["after_retry"]
    assert after["rejection"]["k"] == 9
    assert after["strict_rejection"]["k"] == 7
    assert after["rejection_consistency"]["k"] == 8
    assert (after["reproducibility_rejection"]["k"], after["reproducibility_rejection"]["n"]) == (9, 10)
    assert after["coverage"]["k"] == 27


def test_failures_malformed_and_retries_are_counted_separately(session):
    stats = metrics(session, "synthetic_strong")["attempts"]
    assert stats["attempts"] == 122
    assert stats["provider_failed_attempts"] == 4
    assert stats["malformed_attempts"] == 4
    assert stats["successful_provider_retries"] == 1
    assert stats["successful_repair_retries"] == 2
    assert stats["provider_retries_exhausted"] == 1
    assert stats["repair_retries_exhausted"] == 1
    assert stats["repetitions_lost_to_provider"] == 2
    assert stats["repetitions_lost_to_model"] == 1


def test_first_attempt_and_after_retry_differ(session):
    data = metrics(session, "synthetic_strong")
    assert data["attempts"]["valid_first_pass"]["k"] < data["attempts"]["valid_after_retry"]["k"]
    assert data["first_attempt"]["top1"]["k"] <= data["after_retry"]["top1"]["k"]


def test_failure_analysis_names_each_miss(session):
    assert metrics(session, "synthetic_strong")["failure_analysis"]["counts"] == {
        "wrong_top1_gold_in_top3": 3, "wrong_script": 2, "no_consensus": 1, "abstained_on_in_scope": 1, "forced_match": 1}
    assert metrics(session, "synthetic_weak")["failure_analysis"]["counts"] == {
        "wrong_script": 8, "wrong_top1_gold_in_top3": 5, "no_consensus": 3, "abstained_on_in_scope": 2,
        "malformed_output": 2, "provider_failure": 1, "forced_match": 6}


def test_confusion_matrix_covers_every_counted_image(session):
    confusion = metrics(session, "synthetic_strong")["after_retry"]["confusion"]
    assert sum(sum(row.values()) for row in confusion.values()) == 39
    assert (run_dir(session, "synthetic_strong") / "confusion_matrix.csv").exists()
    assert (run_dir(session, "synthetic_strong") / "confusion_matrix.png").stat().st_size > 0


def test_every_required_field_is_recorded_per_repetition(session):
    rows = lines(run_dir(session, "synthetic_strong") / "repetition_results.jsonl")
    assert len(rows) == 117
    for field in ("image_id", "gold_label", "top_three", "top_one", "valid_output", "retry_count", "provider_error",
                  "latency_ms", "input_tokens", "estimated_cost_usd", "run_id", "prompt_version", "prompt_sha256"):
        assert field in rows[0]


def test_usage_absent_from_a_recording_stays_absent(session):
    rows = lines(run_dir(session, "synthetic_strong") / "repetition_results.jsonl")
    scenarios = json.loads((FIXTURE_DIR / "synthetic_strong.json").read_text())["scenarios"]
    image = next(i for i, s in scenarios.items() if s == "correct_no_usage")
    chosen = [r for r in rows if r["image_id"] == image]
    assert all(r["input_tokens"] is None and r["estimated_cost_usd"] is None and not r["usage_complete"] for r in chosen)


def test_excluded_and_reserve_rows_never_run(session):
    rows = lines(run_dir(session, "synthetic_strong") / "image_results.jsonl")
    assert len(rows) == 39 and not {"SYN040", "SYN041"} & {r["image_id"] for r in rows}


def test_raw_responses_stay_separate_from_metrics(session):
    directory = run_dir(session, "synthetic_strong")
    raw = list((directory / "raw").glob("*.json"))
    assert len(raw) == 122
    assert "synthetic evidence" not in (directory / "metrics.json").read_text()
    assert all((directory / name).exists() for name in ("attempts.jsonl", "failures.jsonl", "retries.jsonl"))


def test_failure_and_retry_records_are_complete(session):
    directory = run_dir(session, "synthetic_strong")
    assert len(lines(directory / "failures.jsonl")) == 8
    assert len(lines(directory / "retries.jsonl")) == 5


def test_report_carries_counts_intervals_and_limitations(session):
    report = (run_dir(session, "synthetic_strong") / "report.md").read_text()
    for text in ("SYNTHETIC FIXTURE DATA", "22/29", "95% CI", "About the confidence intervals", "Dataset limitations",
                 "No 88% accuracy claim", "Reproducibility, rejection images", "Rejection consistency",
                 "Failure analysis", "Not a billed amount", "Synthetic fixtures cannot support a go or no-go"):
        assert text in report


def test_comparison_names_both_fixtures(session):
    text = (session / "comparison.md").read_text()
    assert "SYNTHETIC" in text and "synthetic_strong" in text and "synthetic_weak" in text


def test_run_manifest_records_provenance(session):
    data = json.loads((run_dir(session, "synthetic_weak") / "run_manifest.json").read_text())
    assert data["data_origin"] == "synthetic" and len(data["prompt_sha256"]) == 64 and data["images"] == 39


def comparable(directory: Path) -> list[dict]:
    rows = lines(directory / "repetition_results.jsonl")
    for row in rows:
        row.pop("latency_ms")
    return rows


def test_runs_reproduce_except_for_measured_latency(tmp_path):
    first = run.synthetic(tmp_path / "a", sequence=1)
    second = run.synthetic(tmp_path / "b", sequence=1)
    assert sorted(p.name for p in first.glob("m0-*")) == sorted(p.name for p in second.glob("m0-*"))
    for key in ("synthetic_strong", "synthetic_weak"):
        assert comparable(run_dir(first, key)) == comparable(run_dir(second, key))
        assert metrics(first, key)["decision"]["gates"] == metrics(second, key)["decision"]["gates"]


def test_rerun_takes_a_new_sequence_and_never_overwrites(tmp_path):
    assert run.synthetic(tmp_path).name == "s01"
    assert run.synthetic(tmp_path).name == "s02"


def test_offline_with_no_network_and_no_credentials(tmp_path, monkeypatch):
    def blocked(*args, **kwargs):
        raise AssertionError("network access attempted")

    monkeypatch.setattr(socket, "socket", blocked)
    monkeypatch.setattr(socket, "create_connection", blocked)
    for name in ("OPENROUTER_API_KEY", "HF_TOKEN", "SYNTHETIC_NOT_USED"):
        monkeypatch.delenv(name, raising=False)
    assert run.main(["--synthetic", "--out", str(tmp_path)]) == 0
    assert list(tmp_path.glob("s01/m0-synthetic_strong-*/metrics.json"))


def test_live_mode_is_refused(capsys):
    assert run.main(["--live"]) == 2
    assert "Stage D has not been approved" in capsys.readouterr().err


def test_a_mode_is_required():
    with pytest.raises(SystemExit):
        run.main([])


def test_check_reports_the_real_verified_counts():
    summary = run.check()
    assert (summary["counted_in_scope"], summary["counted_rejection"]) == (24, 10)
    assert (summary["excluded_dev_rows"], summary["reserve_rows"]) == (6, 3)
    assert summary["stage_c"] == {"accepted": 34, "excluded": 2, "held": 3, "not_acquired": 4}
    assert summary["required"] == {"top1": "12/24", "top3": "20/24", "rejection": "7/10", "reproducibility": "20/24"}
    assert summary["dataset_problems"] == []


def test_bad_configuration_returns_an_error_code(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(run, "RUN_CONFIG", tmp_path / "missing.yaml")
    assert run.main(["--check"]) == 1
    assert "Configuration error" in capsys.readouterr().err
