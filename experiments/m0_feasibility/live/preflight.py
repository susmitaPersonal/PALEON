"""Stage D checks, using generated images only. No dataset image can reach a provider from here.

Only live/stage_d.py calls this, and it refuses to run without the owner's approved commit.
"""
import io
import random
from collections.abc import Callable
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from src.adapter import ProviderAdapter
from src.guard import RunGuard
from src.manifest import ManifestRow
from src.metrics import label_of, select_outcomes
from src.records import STATUS_PROVIDER, STATUS_VALID, AttemptRecord
from src.runner import Prompt, run_experiment

SIZE = 2048
REPETITIONS = 2
MAX_ATTEMPTS = 18       # 3 canaries, 2 repetitions, up to 3 attempts each.
RUN_TIMEOUT_S = 900.0
TEXT_LINES = ("THE QUICK BROWN", "FOX JUMPS OVER", "THE LAZY DOG")
LARGEST_DATASET_JPEG_BYTES = 1_576 * 1024


def _jpeg(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=92)
    return buffer.getvalue()


def make_canaries() -> dict[str, bytes]:
    white = Image.new("RGB", (SIZE, SIZE), "white")
    text = white.copy()
    draw = ImageDraw.Draw(text)
    font = ImageFont.load_default(size=180)
    for index, line in enumerate(TEXT_LINES):
        draw.text((120, 500 + index * 320), line, fill="black", font=font)
    noise = Image.frombytes("RGB", (SIZE, SIZE), random.Random(20261102).randbytes(SIZE * SIZE * 3))
    return {"canary_white": _jpeg(white), "canary_text": _jpeg(text), "canary_noise": _jpeg(noise)}


def run_preflight(adapter: ProviderAdapter, prompt: Prompt, guard: RunGuard, run_id: str, run_dir: Path,
                  sleep: Callable[[float], None]) -> dict:
    canaries = make_canaries()
    rows = [ManifestRow(name, "preflight", name, name, "preflight", "unknown", {}) for name in canaries]
    records = run_experiment(adapter, prompt, rows, REPETITIONS, lambda row: (canaries[row.image_id], "image/jpeg"),
                             run_id, run_dir, sleep=sleep, guard=guard)
    return evaluate(records, guard.stopped)


def evaluate(records: list[AttemptRecord], stopped: str | None = None) -> dict:
    """Facts for the Stage D report. Nothing here is scored, and pass means the plumbing works."""
    outcomes = select_outcomes(records, "after_retry")
    labels = {image: {label_of(r) for (i, _), r in outcomes.items() if i == image} for image in
              ("canary_white", "canary_text", "canary_noise")}
    finals = list(outcomes.values())
    complete = len(finals) == len(labels) * REPETITIONS
    checks = {
        "completed": complete and stopped is None,
        "image_received": bool(labels["canary_white"]) and labels["canary_white"].isdisjoint(labels["canary_text"]),
        "largest_payload_accepted": bool(labels["canary_noise"]) and all(
            r.status != STATUS_PROVIDER for (i, _), r in outcomes.items() if i == "canary_noise"),
        "structured_output_valid": complete and all(r.status == STATUS_VALID for r in finals),
        "usage_reported": bool(records) and all(r.input_tokens is not None and r.output_tokens is not None for r in records),
        "finished_normally": bool(records) and all(r.finish_reason == "stop" for r in records if r.status != STATUS_PROVIDER),
    }
    tokens = [r.input_tokens for r in records if r.input_tokens is not None]
    return {
        "passed": all(checks.values()),
        "checks": checks,
        "stopped": stopped,
        "attempts": len(records),
        "labels": {image: sorted(found) for image, found in labels.items()},
        "input_tokens": {"min": min(tokens, default=None), "max": max(tokens, default=None)},
        "reasoning_tokens_max": max((r.reasoning_tokens or 0 for r in records), default=0),
        "cached_attempts": sum(1 for r in records if r.cached_input_tokens),
        "models": sorted({r.response_model for r in records if r.response_model}),
        "hosts": sorted({r.response_host for r in records if r.response_host}),
    }
