"""Experiment metrics. Standard library only; the definitions are documented in METHODOLOGY.md."""
from collections import Counter, defaultdict
from dataclasses import dataclass
from fractions import Fraction
from math import ceil, comb, sqrt
from statistics import median

from .records import (KIND_PROVIDER_RETRY, KIND_REPAIR_RETRY, STATUS_INVALID, STATUS_PROVIDER, STATUS_VALID,
                      SUPPORTED_SCRIPTS, AttemptRecord)

FAILED = "failed"
NO_CONSENSUS = "no_consensus"
ABSTAIN_LABELS = {
    "insufficient_evidence": "abstain_insufficient",
    "outside_supported_set": "abstain_outside",
    "no_writing": "abstain_no_writing",
}
PREDICTED_COLUMNS = (*SUPPORTED_SCRIPTS, *ABSTAIN_LABELS.values(), NO_CONSENSUS, FAILED)
# Exact fractions, so the required count follows the actual denominator without rounding error.
GATES = {
    "top1": Fraction(1, 2),
    "top3": Fraction(4, 5),
    "rejection": Fraction(7, 10),
    "valid_after_retry": Fraction(9, 10),
    "reproducibility": Fraction(4, 5),
}
CHANCE = {"top1": 1 / 6, "top3": 1 / 2}


@dataclass(frozen=True)
class GoldItem:
    image_id: str
    gold_class: str     # in_scope | out_of_scope | no_writing
    label: str
    famous: bool = False
    printed_plate: bool = False
    sample_type: str = ""


def wilson_interval(k: int, n: int, z: float = 1.959964) -> tuple[float, float] | None:
    if n == 0:
        return None
    p = k / n
    d = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / d
    half = z * sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return max(0.0, centre - half), min(1.0, centre + half)


def binomial_tail(k: int, n: int, p: float) -> float:
    """P(X >= k) under a chance baseline."""
    return sum(comb(n, i) * p ** i * (1 - p) ** (n - i) for i in range(k, n + 1))


def percentile(values: list[float], q: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    rank = (len(ordered) - 1) * q
    low, high = int(rank), min(int(rank) + 1, len(ordered) - 1)
    return ordered[low] + (ordered[high] - ordered[low]) * (rank - low)


def proportion(k: int, n: int) -> dict:
    return {"k": k, "n": n, "rate": k / n if n else None, "ci95": wilson_interval(k, n)}


def label_of(record: AttemptRecord | None) -> str:
    if record is None or record.status != STATUS_VALID or record.prediction is None:
        return FAILED
    prediction = record.prediction
    if prediction.disposition == "identified":
        return prediction.candidates[0]
    return ABSTAIN_LABELS[prediction.disposition]


def select_outcomes(records: list[AttemptRecord], view: str) -> dict[tuple[str, int], AttemptRecord]:
    """Reduce attempts to one per (image, repetition): the first, or the last after retries."""
    if view not in ("first_attempt", "after_retry"):
        raise ValueError(f"unknown view {view!r}")
    outcomes: dict[tuple[str, int], AttemptRecord] = {}
    for record in sorted(records, key=lambda r: r.attempt):
        key = (record.image_id, record.repetition)
        if view == "after_retry" or key not in outcomes:
            outcomes[key] = record
    return outcomes


def consensus(labels: list[str]) -> str:
    """Strict majority label. A failed repetition still occupies a vote."""
    label, votes = Counter(labels).most_common(1)[0]
    return label if votes * 2 > len(labels) else NO_CONSENSUS


def score_view(records: list[AttemptRecord], gold: list[GoldItem], repetitions: int, view: str) -> dict:
    outcomes = select_outcomes(records, view)
    confusion: dict[str, Counter] = defaultdict(Counter)
    top1_hits = top3_hits = rejected = strict_rejected = answered = 0
    agree_in_scope = agree_rejection = always_rejected = 0
    rejection_by_class: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    in_scope = [g for g in gold if g.gold_class == "in_scope"]
    rejection_items = [g for g in gold if g.gold_class != "in_scope"]

    for item in gold:
        reps = [outcomes.get((item.image_id, r)) for r in range(1, repetitions + 1)]
        labels = [label_of(r) for r in reps]
        final = consensus(labels)
        confusion[item.label][final] += 1

        identical = len(set(labels)) == 1 and labels[0] != FAILED
        if item.gold_class == "in_scope":
            agree_in_scope += identical
            top1_hits += final == item.label
            answered += final in SUPPORTED_SCRIPTS
            in_top3 = sum(
                1 for r in reps
                if r is not None and r.prediction is not None and item.label in r.prediction.candidates
            )
            top3_hits += in_top3 * 2 > repetitions
        else:
            # Any abstention avoids a forced match. The strict count requires the exact reason.
            expected = "abstain_outside" if item.gold_class == "out_of_scope" else "abstain_no_writing"
            agree_rejection += identical
            always_rejected += all(label in ABSTAIN_LABELS.values() for label in labels)
            rejected += final in ABSTAIN_LABELS.values()
            rejection_by_class[item.label][0] += final in ABSTAIN_LABELS.values()
            rejection_by_class[item.label][1] += 1
            strict_rejected += final == expected

    per_script = {}
    for script in SUPPORTED_SCRIPTS:
        tp = confusion[script][script]
        predicted = sum(row[script] for row in confusion.values())
        actual = sum(confusion[script].values())
        per_script[script] = {
            "precision": proportion(tp, predicted),
            "recall": proportion(tp, actual),
        }

    n_in = len(in_scope)
    return {
        "top1": {**proportion(top1_hits, n_in), "chance": CHANCE["top1"],
                 "p_vs_chance": binomial_tail(top1_hits, n_in, CHANCE["top1"]) if n_in else None},
        "top3": {**proportion(top3_hits, n_in), "chance": CHANCE["top3"],
                 "p_vs_chance": binomial_tail(top3_hits, n_in, CHANCE["top3"]) if n_in else None},
        "coverage": proportion(answered, n_in),
        "rejection": proportion(rejected, len(rejection_items)),
        "strict_rejection": proportion(strict_rejected, len(rejection_items)),
        "rejection_consistency": proportion(always_rejected, len(rejection_items)),
        "reproducibility_in_scope": proportion(agree_in_scope, n_in),
        "reproducibility_rejection": proportion(agree_rejection, len(rejection_items)),
        "rejection_by_class": {label: proportion(k, n) for label, (k, n) in sorted(rejection_by_class.items())},
        "per_script": per_script,
        "confusion": {gold_label: dict(row) for gold_label, row in confusion.items()},
    }


def attempt_stats(records: list[AttemptRecord], input_price: float | None, output_price: float | None) -> dict:
    latencies = [r.latency_ms for r in records if r.latency_ms is not None and r.status != STATUS_PROVIDER]
    provider_failures = Counter(r.error_kind for r in records if r.status == STATUS_PROVIDER)
    first = select_outcomes(records, "first_attempt")
    final = select_outcomes(records, "after_retry")

    def answered(outcomes: dict) -> list[AttemptRecord]:
        return [r for r in outcomes.values() if r.status != STATUS_PROVIDER]

    def valid(outcomes: dict) -> int:
        return sum(1 for r in outcomes.values() if r.status == STATUS_VALID)

    # Usage is summed only where a provider reported it. Unknown usage is never treated as zero.
    with_usage = [r for r in records if r.input_tokens is not None and r.output_tokens is not None]
    tokens_in = sum(r.input_tokens for r in with_usage)
    tokens_out = sum(r.output_tokens for r in with_usage)
    images = len({r.image_id for r in records})
    cost = None
    if with_usage and input_price is not None and output_price is not None:
        cost = (tokens_in * input_price + tokens_out * output_price) / 1e6

    return {
        "attempts": len(records),
        "repetitions_scored": len(final),
        "api_failure": proportion(sum(provider_failures.values()), len(records)),
        "api_failure_kinds": dict(provider_failures),
        "repetitions_lost_to_provider": sum(1 for r in final.values() if r.status == STATUS_PROVIDER),
        "repetitions_lost_to_model": sum(1 for r in final.values() if r.status == STATUS_INVALID),
        "valid_first_pass": proportion(valid(first), len(answered(first))),
        "valid_after_retry": proportion(valid(final), len(answered(final))),
        "retries": dict(Counter(r.kind for r in records if r.attempt > 1)),
        "malformed_attempts": sum(1 for r in records if r.status == STATUS_INVALID),
        "provider_failed_attempts": sum(provider_failures.values()),
        "successful_provider_retries": sum(
            1 for r in records if r.kind == KIND_PROVIDER_RETRY and r.status == STATUS_VALID),
        "successful_repair_retries": sum(
            1 for r in records if r.kind == KIND_REPAIR_RETRY and r.status == STATUS_VALID),
        "provider_retries_exhausted": sum(
            1 for r in final.values() if r.status == STATUS_PROVIDER and r.kind == KIND_PROVIDER_RETRY),
        "repair_retries_exhausted": sum(
            1 for r in final.values() if r.status == STATUS_INVALID and r.kind == KIND_REPAIR_RETRY),
        "history_flag_responses": sum(1 for r in records if r.history_flags),
        "latency_ms": {
            "median": median(latencies) if latencies else None,
            "p95": percentile(latencies, 0.95),
            "max": max(latencies) if latencies else None,
        },
        "tokens": {"input": tokens_in, "output": tokens_out},
        "finish_reasons": dict(Counter(r.finish_reason for r in records if r.finish_reason)),
        "response_hosts": dict(Counter(r.response_host for r in records if r.response_host)),
        "attempts_with_cached_input": sum(1 for r in records if r.cached_input_tokens),
        "attempts_with_usage": proportion(len(with_usage), len(records)),
        # Estimate: reported usage multiplied by configured list prices, not a billed amount.
        "estimated_cost_usd": cost,
        "estimated_cost_per_image_usd": cost / images if cost is not None and images else None,
    }


def required_count(name: str, n: int) -> int:
    """Smallest numerator that meets a gate for this denominator."""
    return ceil(GATES[name] * n)


def evaluate_gates(after_retry: dict, stats: dict) -> dict:
    """Thresholds are fixed fractions. A gate with no data fails rather than passing silently."""
    def check(name: str, block: dict) -> dict:
        k, n = block["k"], block["n"]
        required = required_count(name, n)
        return {"rate": block["rate"], "k": k, "n": n, "required": required, "threshold": float(GATES[name]),
                "ci95": block.get("ci95"), "passed": n > 0 and k >= required}

    gates = {
        "top1": check("top1", after_retry["top1"]),
        "top3": check("top3", after_retry["top3"]),
        "rejection": check("rejection", after_retry["rejection"]),
        "valid_after_retry": check("valid_after_retry", stats["valid_after_retry"]),
        "reproducibility": check("reproducibility", after_retry["reproducibility_in_scope"]),
    }
    return {"gates": gates, "all_passed": all(g["passed"] for g in gates.values())}


def failure_analysis(records: list[AttemptRecord], gold: list[GoldItem], repetitions: int) -> dict:
    """Name why each image missed. Provider failures stay apart from model errors."""
    outcomes = select_outcomes(records, "after_retry")
    items = []
    for item in gold:
        reps = [outcomes.get((item.image_id, r)) for r in range(1, repetitions + 1)]
        final = consensus([label_of(r) for r in reps])
        in_scope = item.gold_class == "in_scope"
        if (in_scope and final == item.label) or (not in_scope and final in ABSTAIN_LABELS.values()):
            continue
        if final == FAILED:
            statuses = [r.status for r in reps if r is not None]
            reason = "provider_failure" if statuses.count(STATUS_PROVIDER) >= statuses.count(STATUS_INVALID) \
                else "malformed_output"
        elif final == NO_CONSENSUS:
            reason = "no_consensus"
        elif in_scope and final in ABSTAIN_LABELS.values():
            reason = "abstained_on_in_scope"
        elif not in_scope:
            reason = "forced_match"
        else:
            listed = any(r is not None and r.prediction is not None and item.label in r.prediction.candidates
                         for r in reps)
            reason = "wrong_top1_gold_in_top3" if listed else "wrong_script"
        items.append({"image_id": item.image_id, "gold": item.label, "predicted": final, "reason": reason})
    return {"counts": dict(Counter(i["reason"] for i in items)), "items": items}


def subgroup_results(records: list[AttemptRecord], gold: list[GoldItem], repetitions: int) -> dict:
    """In-scope results split by the two confounds the quality report identified."""
    in_scope = [g for g in gold if g.gold_class == "in_scope"]
    groups = {
        "famous": [g for g in in_scope if g.famous],
        "not_famous": [g for g in in_scope if not g.famous],
        "printed_plate": [g for g in in_scope if g.printed_plate],
        "photograph_or_other": [g for g in in_scope if not g.printed_plate],
        "complete": [g for g in in_scope if g.sample_type == "complete"],
        "excerpt": [g for g in in_scope if g.sample_type == "excerpt"],
    }
    results = {}
    for name, items in groups.items():
        view = score_view(records, items, repetitions, "after_retry") if items else None
        results[name] = {"top1": proportion(view["top1"]["k"], len(items)) if view else proportion(0, 0),
                         "top3": proportion(view["top3"]["k"], len(items)) if view else proportion(0, 0)}
    return results


def compute_all(records: list[AttemptRecord], gold: list[GoldItem], repetitions: int,
                input_price: float | None, output_price: float | None) -> dict:
    first = score_view(records, gold, repetitions, "first_attempt")
    after = score_view(records, gold, repetitions, "after_retry")
    stats = attempt_stats(records, input_price, output_price)
    return {"first_attempt": first, "after_retry": after, "attempts": stats, "decision": evaluate_gates(after, stats),
            "failure_analysis": failure_analysis(records, gold, repetitions),
            "subgroups": subgroup_results(records, gold, repetitions)}
