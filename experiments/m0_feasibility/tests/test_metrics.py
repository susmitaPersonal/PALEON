from fractions import Fraction
from pathlib import Path

import pytest
import yaml

from src.metrics import (FAILED, GATES, NO_CONSENSUS, attempt_stats, binomial_tail, compute_all, consensus, evaluate_gates,
                         percentile, required_count, score_view, select_outcomes, wilson_interval)
from src.records import KIND_REPAIR_RETRY, STATUS_INVALID, STATUS_PROVIDER
from tests.helpers import gold, record


def identified(image_id, script, reps=(1, 2, 3)):
    return [record(image_id, r, [script]) for r in reps]


def test_wilson_matches_values_published_in_the_architecture_document():
    low, high = wilson_interval(53, 60)
    assert (round(low, 3), round(high, 3)) == (0.778, 0.942)
    low, high = wilson_interval(9, 10)
    assert (round(low, 3), round(high, 3)) == (0.596, 0.982)


def test_wilson_handles_edges():
    assert wilson_interval(0, 0) is None
    assert wilson_interval(0, 10)[0] == 0.0
    assert wilson_interval(10, 10)[1] == pytest.approx(1.0)


def test_binomial_tail():
    assert binomial_tail(0, 10, 0.5) == pytest.approx(1.0)
    assert binomial_tail(21, 30, 0.5) == pytest.approx(0.0214, abs=0.001)


def test_percentile_interpolates():
    assert percentile([1, 2, 3, 4, 5], 0.5) == 3
    assert percentile([], 0.5) is None


def test_consensus_requires_strict_majority():
    assert consensus(["a", "a", "b"]) == "a"
    assert consensus(["a", "b", "c"]) == NO_CONSENSUS
    assert consensus([FAILED, FAILED, "a"]) == FAILED


def test_top1_and_top3_use_consensus():
    records = identified("i1", "brahmi")
    records += [record("i2", r, ["greek", "kharosthi"]) for r in (1, 2, 3)]
    view = score_view(records, [gold("i1", "brahmi"), gold("i2", "kharosthi")], 3, "after_retry")
    assert view["top1"]["k"] == 1
    assert view["top3"]["k"] == 2
    assert view["confusion"]["kharosthi"]["greek"] == 1


def test_top3_requires_a_majority_of_repetitions():
    records = [record("i", 1, ["greek", "brahmi"]), record("i", 2, ["greek"]), record("i", 3, ["greek"])]
    assert score_view(records, [gold("i", "brahmi")], 3, "after_retry")["top3"]["k"] == 0


def test_abstention_on_in_scope_image_counts_against_accuracy_and_coverage():
    records = [record("i", r, disposition="insufficient_evidence") for r in (1, 2, 3)]
    view = score_view(records, [gold("i", "brahmi")], 3, "after_retry")
    assert view["top1"]["k"] == 0 and view["coverage"]["k"] == 0
    assert view["confusion"]["brahmi"]["abstain_insufficient"] == 1


def test_missing_repetitions_count_as_failed():
    view = score_view(identified("i", "brahmi", reps=(1,)), [gold("i", "brahmi")], 3, "after_retry")
    assert view["top1"]["k"] == 0
    assert view["confusion"]["brahmi"][FAILED] == 1


def test_rejection_and_strict_rejection_differ():
    records = [record("a", r, disposition="outside_supported_set") for r in (1, 2, 3)]
    records += [record("b", r, disposition="insufficient_evidence") for r in (1, 2, 3)]
    records += identified("c", "latin")
    items = [gold("a", "cuneiform", "out_of_scope"), gold("b", "cuneiform", "out_of_scope"),
             gold("c", "no_writing", "no_writing")]
    view = score_view(records, items, 3, "after_retry")
    assert view["rejection"]["k"] == 2 and view["strict_rejection"]["k"] == 1


def test_precision_counts_out_of_scope_false_positives():
    records = identified("a", "greek") + identified("b", "greek")
    items = [gold("a", "greek"), gold("b", "cuneiform", "out_of_scope")]
    assert score_view(records, items, 3, "after_retry")["per_script"]["greek"]["precision"]["k"] == 1
    assert score_view(records, items, 3, "after_retry")["per_script"]["greek"]["precision"]["n"] == 2


def test_reproducibility_needs_identical_answers():
    records = identified("a", "greek")
    records += [record("b", 1, ["greek"]), record("b", 2, ["greek"]), record("b", 3, ["latin"])]
    view = score_view(records, [gold("a", "greek"), gold("b", "greek")], 3, "after_retry")
    assert (view["reproducibility_in_scope"]["k"], view["reproducibility_in_scope"]["n"]) == (1, 2)


def test_views_separate_first_attempt_from_final():
    records = [
        record("i", 1, status=STATUS_INVALID),
        record("i", 1, ["brahmi"], attempt=2, kind=KIND_REPAIR_RETRY),
        *identified("i", "brahmi", reps=(2, 3)),
    ]
    assert select_outcomes(records, "first_attempt")[("i", 1)].status == STATUS_INVALID
    assert select_outcomes(records, "after_retry")[("i", 1)].attempt == 2
    stats = attempt_stats(records, None, None)
    assert stats["valid_first_pass"]["k"] == 2
    assert stats["valid_after_retry"]["k"] == 3


def test_provider_failures_are_not_counted_as_invalid_output():
    records = [
        record("i", 1, status=STATUS_PROVIDER, error_kind="rate_limited"),
        record("i", 2, status=STATUS_INVALID),
        *identified("i", "brahmi", reps=(3,)),
    ]
    stats = attempt_stats(records, None, None)
    assert stats["api_failure"]["k"] == 1
    assert stats["api_failure_kinds"] == {"rate_limited": 1}
    assert stats["repetitions_lost_to_provider"] == 1
    assert stats["repetitions_lost_to_model"] == 1
    assert stats["valid_after_retry"]["n"] == 2


def test_cost_is_an_estimate_from_usage():
    records = [record("i", 1, ["brahmi"], input_tokens=1_000_000, output_tokens=1_000_000)]
    stats = attempt_stats(records, 0.15, 0.60)
    assert stats["estimated_cost_usd"] == pytest.approx(0.75)
    assert attempt_stats(records, None, None)["estimated_cost_usd"] is None


def _perfect_set(n_in=30, n_out=10):
    items, records = [], []
    for i in range(n_in):
        items.append(gold(f"a{i}", "brahmi"))
        records += identified(f"a{i}", "brahmi")
    for i in range(n_out):
        items.append(gold(f"b{i}", "cuneiform", "out_of_scope"))
        records += [record(f"b{i}", r, disposition="outside_supported_set") for r in (1, 2, 3)]
    return records, items


def test_all_gates_pass_on_perfect_synthetic_data():
    records, items = _perfect_set()
    assert compute_all(records, items, 3, None, None)["decision"]["all_passed"]


def test_gate_boundary_is_inclusive():
    block = {"k": 15, "n": 30, "rate": 0.5}
    after = {"top1": block, "top3": {"k": 24, "n": 30, "rate": 0.8}, "rejection": {"k": 7, "n": 10, "rate": 0.7},
             "reproducibility_in_scope": {"k": 24, "n": 30, "rate": 0.8}}
    stats = {"valid_after_retry": {"k": 9, "n": 10, "rate": 0.9}}
    assert evaluate_gates(after, stats)["all_passed"]
    after["top1"] = {"k": 14, "n": 30, "rate": 14 / 30}
    assert not evaluate_gates(after, stats)["all_passed"]


def test_a_gate_with_no_data_fails():
    records, items = _perfect_set(n_out=0)
    decision = compute_all(records, items, 3, None, None)["decision"]
    assert not decision["gates"]["rejection"]["passed"]
    assert not decision["all_passed"]


def test_gates_in_code_match_the_frozen_config():
    config = yaml.safe_load((Path(__file__).resolve().parents[1] / "config" / "run.yaml").read_text())["gates"]
    for name in ("top1", "top3", "rejection"):
        assert GATES[name] == Fraction(config[name]["numerator"], config[name]["denominator"])
    assert float(GATES["valid_after_retry"]) == config["valid_after_retry"]
    assert float(GATES["reproducibility"]) == config["reproducibility"]


@pytest.mark.parametrize("name,n,required", [
    ("top1", 22, 11), ("top3", 22, 18), ("top1", 29, 15), ("top3", 29, 24),
    ("top1", 30, 15), ("top3", 30, 24), ("rejection", 10, 7),
])
def test_required_count_follows_the_denominator(name, n, required):
    assert required_count(name, n) == required


def test_gate_at_actual_denominator_rounds_up():
    after = {"top1": {"k": 14, "n": 29, "rate": 14 / 29}, "top3": {"k": 23, "n": 29, "rate": 23 / 29},
             "rejection": {"k": 7, "n": 10, "rate": 0.7}, "reproducibility_in_scope": {"k": 24, "n": 29, "rate": 24 / 29}}
    stats = {"valid_after_retry": {"k": 9, "n": 10, "rate": 0.9}}
    gates = evaluate_gates(after, stats)["gates"]
    assert not gates["top1"]["passed"] and gates["top1"]["required"] == 15
    assert not gates["top3"]["passed"] and gates["top3"]["required"] == 24
    assert gates["rejection"]["passed"]
