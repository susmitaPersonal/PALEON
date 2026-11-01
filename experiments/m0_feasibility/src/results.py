"""Per-image result tables. These are derived from attempts, and raw responses stay in raw/."""
import csv
import json
from pathlib import Path

from .adapter import ProviderConfig
from .metrics import GoldItem, consensus, label_of, select_outcomes
from .records import KIND_PROVIDER_RETRY, KIND_REPAIR_RETRY, STATUS_PROVIDER, STATUS_VALID, AttemptRecord
from .runner import Prompt

REPETITION_FIELDS = (
    "run_id", "model_key", "prompt_version", "prompt_sha256", "image_id", "gold_class", "gold_label", "repetition",
    "top_one", "top_three", "disposition", "valid_output", "outcome", "retry_count", "provider_retries",
    "repair_retries", "provider_error", "http_status", "latency_ms", "input_tokens", "output_tokens",
    "estimated_cost_usd", "usage_complete", "raw_paths",
)
IMAGE_FIELDS = (
    "run_id", "model_key", "image_id", "gold_class", "gold_label", "image_prediction", "correct",
    "gold_in_top_three_repetitions", "repetition_labels", "identical_across_repetitions",
)


def attempt_cost(record: AttemptRecord, config: ProviderConfig) -> float | None:
    """Estimate only, and None unless both the usage and the prices are known."""
    if None in (record.input_tokens, record.output_tokens, config.input_usd_per_mtok, config.output_usd_per_mtok):
        return None
    return (record.input_tokens * config.input_usd_per_mtok + record.output_tokens * config.output_usd_per_mtok) / 1e6


def _sum_known(values: list) -> float | int | None:
    known = [v for v in values if v is not None]
    return sum(known) if known else None


def repetition_rows(records: list[AttemptRecord], gold: list[GoldItem], repetitions: int, config: ProviderConfig,
                    prompt: Prompt) -> list[dict]:
    rows = []
    for item in gold:
        for repetition in range(1, repetitions + 1):
            attempts = sorted((r for r in records if r.image_id == item.image_id and r.repetition == repetition),
                              key=lambda r: r.attempt)
            if not attempts:
                raise ValueError(f"no attempts recorded for {item.image_id} repetition {repetition}")
            final = attempts[-1]
            prediction = final.prediction
            provider_errors = [r.error_kind for r in attempts if r.status == STATUS_PROVIDER]
            rows.append({
                "run_id": final.run_id,
                "model_key": final.model_key,
                "prompt_version": prompt.version,
                "prompt_sha256": prompt.sha256,
                "image_id": item.image_id,
                "gold_class": item.gold_class,
                "gold_label": item.label,
                "repetition": repetition,
                "top_one": prediction.candidates[0] if prediction and prediction.candidates else None,
                "top_three": list(prediction.candidates) if prediction else [],
                "disposition": prediction.disposition if prediction else None,
                "valid_output": final.status == STATUS_VALID,
                "outcome": final.status,
                "retry_count": len(attempts) - 1,
                "provider_retries": sum(r.kind == KIND_PROVIDER_RETRY for r in attempts),
                "repair_retries": sum(r.kind == KIND_REPAIR_RETRY for r in attempts),
                "provider_error": ",".join(provider_errors) or None,
                "http_status": final.http_status,
                "latency_ms": _sum_known([r.latency_ms for r in attempts]),
                "input_tokens": _sum_known([r.input_tokens for r in attempts]),
                "output_tokens": _sum_known([r.output_tokens for r in attempts]),
                "estimated_cost_usd": _sum_known([attempt_cost(r, config) for r in attempts]),
                "usage_complete": all(r.input_tokens is not None and r.output_tokens is not None for r in attempts),
                "raw_paths": [r.raw_path for r in attempts],
            })
    return rows


def image_rows(records: list[AttemptRecord], gold: list[GoldItem], repetitions: int) -> list[dict]:
    outcomes = select_outcomes(records, "after_retry")
    rows = []
    for item in gold:
        reps = [outcomes.get((item.image_id, r)) for r in range(1, repetitions + 1)]
        labels = [label_of(r) for r in reps]
        final = consensus(labels)
        correct = final == item.label if item.gold_class == "in_scope" else final.startswith("abstain_")
        rows.append({
            "run_id": reps[0].run_id if reps[0] else None,
            "model_key": reps[0].model_key if reps[0] else None,
            "image_id": item.image_id,
            "gold_class": item.gold_class,
            "gold_label": item.label,
            "image_prediction": final,
            "correct": correct,
            "gold_in_top_three_repetitions": sum(
                1 for r in reps if r is not None and r.prediction is not None and item.label in r.prediction.candidates),
            "repetition_labels": labels,
            "identical_across_repetitions": len(set(labels)) == 1 and labels[0] != "failed",
        })
    return rows


def _write_table(rows: list[dict], fields: tuple[str, ...], stem: Path) -> None:
    with stem.with_suffix(".jsonl").open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    with stem.with_suffix(".csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows({k: "" if v is None else (json.dumps(v) if isinstance(v, list) else v)
                          for k, v in row.items()} for row in rows)


def write_results(run_dir: Path, repetition_table: list[dict], image_table: list[dict], metadata: dict) -> None:
    _write_table(repetition_table, REPETITION_FIELDS, run_dir / "repetition_results")
    _write_table(image_table, IMAGE_FIELDS, run_dir / "image_results")
    (run_dir / "run_manifest.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
