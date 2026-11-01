"""Experiment metrics. Standard library only; the definitions are documented in METHODOLOGY.md."""
from collections import Counter, defaultdict
from dataclasses import dataclass
from fractions import Fraction
from math import ceil, comb, sqrt
from statistics import median

from .records import STATUS_INVALID, STATUS_PROVIDER, STATUS_VALID, SUPPORTED_SCRIPTS, AttemptRecord

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
    top1_hits = top3_hits = rejected = strict_rejected = answered = agree = 0
    in_scope = [g for g in gold if g.gold_class == "in_scope"]
    rejection_items = [g for g in gold if g.gold_class != "in_scope"]

    for item in gold:
        reps = [outcomes.get((item.image_id, r)) for r in range(1, repetitions + 1)]
        labels = [label_of(r) for r in reps]
        final = consensus(labels)
        confusion[item.label][final] += 1

        if len(set(labels)) == 1 and labels[0] != FAILED:
            agree += 1
        if item.gold_class == "in_scope":
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
            rejected += final in ABSTAIN_LABELS.values()
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
        "reproducibility": proportion(agree, len(gold)),
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

    tokens_in = sum(r.input_tokens or 0 for r in records)
    tokens_out = sum(r.output_tokens or 0 for r in records)
    images = len({r.image_id for r in records})
    cost = None
    if input_price is not None and output_price is not None:
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
        "history_flag_responses": sum(1 for r in records if r.history_flags),
        "latency_ms": {
            "median": median(latencies) if latencies else None,
            "p95": percentile(latencies, 0.95),
            "max": max(latencies) if latencies else None,
        },
        "tokens": {"input": tokens_in, "output": tokens_out},
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
        "reproducibility": check("reproducibility", after_retry["reproducibility"]),
    }
    return {"gates": gates, "all_passed": all(g["passed"] for g in gates.values())}


def compute_all(records: list[AttemptRecord], gold: list[GoldItem], repetitions: int,
                input_price: float | None, output_price: float | None) -> dict:
    first = score_view(records, gold, repetitions, "first_attempt")
    after = score_view(records, gold, repetitions, "after_retry")
    stats = attempt_stats(records, input_price, output_price)
    return {"first_attempt": first, "after_retry": after, "attempts": stats, "decision": evaluate_gates(after, stats)}
