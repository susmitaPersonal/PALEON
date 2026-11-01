"""Single entry point for the M0 experiment.

    python -m src.run --synthetic    replay recorded fixtures through the whole pipeline
    python -m src.run --check        validate the real configuration and manifest
    python -m src.run --live         refused: Stage D has not been approved
"""
import argparse
import json
import platform
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from importlib import metadata as package_metadata
from pathlib import Path

from .adapter import ProviderAdapter, ProviderConfig, fixture_adapter_from_file
from .config import (ConfigError, files_sha256, live_blockers, load_frozen_prompt, load_models, load_run_config)
from .crops import read_rows
from .dataset_check import validate_dataset
from .guard import RunGuard
from .images import ImageSource, SyntheticImageSource
from .manifest import ManifestError, coverage, eligible_rows, gold_items, load_manifest, manifest_sha256
from .metrics import compute_all, required_count
from .report import write_outputs
from .results import image_rows, repetition_rows, write_results
from .runner import RETRY_AFTER_CAP_S, Prompt, make_run_id, protocol_sha256, run_experiment
from .synthetic import FIXTURE_DIR

ROOT = Path(__file__).resolve().parents[1]
RUN_CONFIG = ROOT / "config" / "run.yaml"
REAL_MODELS = ROOT / "config" / "models.yaml"
REAL_MANIFEST = ROOT / "dataset" / "manifest.csv"
INVENTORY = ROOT / "dataset" / "image_inventory.csv"
IMAGE_DIR = ROOT / "data" / "images"
PROCESSED_DIR = ROOT / "data" / "processed"
REPLACEMENTS = ROOT / "dataset" / "replacement_images.csv"
CROPS = ROOT / "dataset" / "crop_metadata.csv"
CROP_REVIEW = ROOT / "dataset" / "crop_review.csv"
MARGIN_REGIONS = ROOT / "dataset" / "margin_regions.csv"
HARD_NEGATIVE_IMAGES = ROOT / "dataset" / "hard_negative_images.csv"
HARD_NEGATIVE_REVIEW = ROOT / "dataset" / "hard_negative_review.csv"
HARD_NEGATIVE_DIR = ROOT / "data" / "hard_negatives"
DEFAULT_OUT = ROOT / "results" / "synthetic"
LIVE_REFUSAL = "Live mode is disabled: Stage D has not been approved."


def _git_state() -> dict:
    def git(*args: str) -> str:
        return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, timeout=10).stdout.strip()
    try:
        return {"commit": git("rev-parse", "HEAD") or None, "dirty": bool(git("status", "--porcelain"))}
    except (OSError, subprocess.SubprocessError):
        return {"commit": None, "dirty": None}


def _environment() -> dict:
    """Byte-exact JPEG output depends on these versions, so each run records them."""
    packages = {name: package_metadata.version(name) for name in ("pillow", "pydantic", "httpx")}
    return {"python": platform.python_version(), **packages, "protocol_sha256": protocol_sha256()}


def _next_sequence(out_dir: Path) -> int:
    existing = [int(p.name[1:]) for p in out_dir.glob("s[0-9][0-9]") if p.is_dir()] if out_dir.exists() else []
    return max(existing, default=0) + 1


def run_model(config: ProviderConfig, adapter: ProviderAdapter, image_source: ImageSource, prompt: Prompt, rows: list,
              repetitions: int, retries: tuple[int, int], run_id: str, run_dir: Path, metadata: dict,
              data_origin: str = "synthetic", guard: RunGuard | None = None, sleep=lambda _: None,
              retry_after_cap_s: float = RETRY_AFTER_CAP_S) -> dict | None:
    """Run one model and report it. A stopped run keeps its records and has no metrics, so it returns None."""
    if data_origin != "synthetic" and guard is None:
        raise ValueError("a run that is not synthetic needs a RunGuard")
    gold = gold_items(rows)
    records = run_experiment(adapter, prompt, eligible_rows(rows), repetitions, image_source, run_id, run_dir,
                             sleep=sleep, max_provider_retries=retries[0], max_repair_retries=retries[1], guard=guard,
                             retry_after_cap_s=retry_after_cap_s)
    if guard and guard.stopped:
        (run_dir / "run_manifest.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        return None
    metrics = compute_all(records, gold, repetitions, config.input_usd_per_mtok, config.output_usd_per_mtok)
    write_results(run_dir, repetition_rows(records, gold, repetitions, config, prompt),
                  image_rows(records, gold, repetitions), metadata)
    context = {"data_origin": data_origin, "model_key": config.key, "prompt_version": prompt.version,
               "prompt_sha256": prompt.sha256}
    write_outputs(metrics, run_id, run_dir, synthetic=data_origin == "synthetic", context=context)
    return metrics


def write_comparison(path: Path, results: dict[str, dict]) -> None:
    lines = ["# Synthetic comparison\n", "> **SYNTHETIC FIXTURE DATA. Says nothing about any model.**\n",
             "| Gate | " + " | ".join(results) + " |", "|---" * (len(results) + 1) + "|"]
    gates = next(iter(results.values()))["decision"]["gates"]
    for name in gates:
        cells = []
        for metrics in results.values():
            gate = metrics["decision"]["gates"][name]
            cells.append(f"{gate['k']}/{gate['n']} (needs {gate['required']}): {'pass' if gate['passed'] else 'FAIL'}")
        lines.append(f"| {name} | " + " | ".join(cells) + " |")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def synthetic(out_dir: Path, sequence: int | None = None) -> Path:
    config = load_run_config(RUN_CONFIG)
    prompt = load_frozen_prompt(ROOT, config)
    models_path = FIXTURE_DIR / "models.yaml"
    models = load_models(models_path, config)
    manifest_path = FIXTURE_DIR / "manifest.csv"
    rows = load_manifest(manifest_path)
    manifest_hash = manifest_sha256(manifest_path)
    config_hash = files_sha256(RUN_CONFIG, models_path)
    sequence = sequence or _next_sequence(out_dir)
    session = out_dir / f"s{sequence:02d}"
    results = {}
    for key, model in models.items():
        run_id = make_run_id(key, prompt, manifest_hash, config_hash, sequence)
        metadata = {"run_id": run_id, "data_origin": "synthetic", "model_key": key, "prompt_version": prompt.version,
                    "prompt_sha256": prompt.sha256, "manifest_sha256": manifest_hash, "config_sha256": config_hash,
                    "repetitions": config.repetitions, "images": len(eligible_rows(rows)), "harness": _git_state(),
                    "environment": _environment(),
                    "created_at": datetime.now(timezone.utc).isoformat()}
        adapter = fixture_adapter_from_file(model, FIXTURE_DIR / f"{key}.json")
        results[key] = run_model(model, adapter, SyntheticImageSource(), prompt, rows, config.repetitions,
                                 (config.retries.provider, config.retries.repair), run_id, session / run_id, metadata)
    write_comparison(session / "comparison.md", results)
    for key, metrics in results.items():
        gates = metrics["decision"]["gates"]
        summary = ", ".join(f"{n} {g['k']}/{g['n']} {'pass' if g['passed'] else 'FAIL'}" for n, g in gates.items())
        print(f"{key}: {summary}")
    print(f"Synthetic results (not evidence about any model): {session}")
    return session


def check() -> dict:
    config = load_run_config(RUN_CONFIG)
    load_frozen_prompt(ROOT, config)
    models = load_models(REAL_MODELS, config)
    rows = load_manifest(REAL_MANIFEST)
    gold = gold_items(rows)
    image_dir = IMAGE_DIR if IMAGE_DIR.exists() and any(IMAGE_DIR.iterdir()) else None
    n_in = sum(g.gold_class == "in_scope" for g in gold)
    n_reject = len(gold) - n_in
    summary = {
        "models": list(models),
        "live_blockers": live_blockers(models),
        "rows": len(rows),
        "counted_in_scope": n_in,
        "counted_rejection": n_reject,
        "excluded_dev_rows": sum(r.raw["split"] == "dev" and not r.eligible_for_metrics for r in rows),
        "reserve_rows": sum(r.raw["split"] == "reserve" for r in rows),
        "required": {"top1": f"{required_count('top1', n_in)}/{n_in}", "top3": f"{required_count('top3', n_in)}/{n_in}",
                     "rejection": f"{required_count('rejection', n_reject)}/{n_reject}",
                     "reproducibility": f"{required_count('reproducibility', n_in)}/{n_in}"},
        "stage_c": dict(sorted(Counter(r.raw["stage_c_status"] for r in rows).items())),
        "counted_by_sample_type": dict(sorted(Counter(g.sample_type for g in gold if g.gold_class == "in_scope").items())),
        "counted_by_class": dict(sorted(Counter(g.label for g in gold).items())),
        "shortfalls": {k: v["shortfall"] for k, v in coverage(rows).items() if v["shortfall"]},
        # File hashes are verified only where the gitignored images exist.
        "images_verified_on_disk": image_dir is not None,
        "dataset_problems": validate_dataset(rows, read_rows(INVENTORY), image_dir, read_rows(REPLACEMENTS), read_rows(CROPS),
                                             read_rows(CROP_REVIEW), PROCESSED_DIR if image_dir else None,
                                             read_rows(HARD_NEGATIVE_IMAGES), read_rows(HARD_NEGATIVE_REVIEW),
                                             HARD_NEGATIVE_DIR if image_dir else None, read_rows(MARGIN_REGIONS)),
    }
    print(json.dumps(summary, indent=2))
    return summary


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="ScriptEcho M0 feasibility experiment")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--synthetic", action="store_true", help="replay recorded synthetic fixtures")
    mode.add_argument("--check", action="store_true", help="validate the real configuration and manifest")
    mode.add_argument("--live", action="store_true", help="refused until Stage D is approved")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="output directory for synthetic runs")
    args = parser.parse_args(argv)
    if args.live:
        print(LIVE_REFUSAL, file=sys.stderr)
        return 2
    try:
        if args.check:
            check()
        else:
            synthetic(args.out)
    except (ConfigError, ManifestError) as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
