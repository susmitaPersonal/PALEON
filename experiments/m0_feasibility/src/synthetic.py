"""Generate the recorded synthetic fixtures. Every value here is invented to exercise the harness.

Nothing in these fixtures is a model response, and no historical object is described. Run with
`python -m src.synthetic` to rewrite fixtures/synthetic/. A test confirms the files match this generator.
"""
import csv
import json
from pathlib import Path

from .manifest import COLUMNS
from .records import SUPPORTED_SCRIPTS

ROOT = Path(__file__).resolve().parents[1]
FIXTURE_DIR = ROOT / "fixtures" / "synthetic"
NOTICE = "SYNTHETIC. Invented to exercise the harness. Not a model response."
INPUT_TOKENS, OUTPUT_TOKENS = 4000, 500

SCRIPT_COUNTS = {"brahmi": 5, "kharosthi": 5, "phoenician": 5, "greek": 4, "latin": 5, "runic": 5}
STRONG_IN_SCOPE = (
    ["correct"] * 12 + ["correct_ranked"] * 2 + ["correct_no_usage"] + ["top3_only"] * 3 + ["wrong"] * 2
    + ["unstable", "no_consensus", "repair_ok", "repair_exhausted", "missing_evidence_repaired", "provider_retry_ok",
       "provider_exhausted", "provider_fatal", "abstained"]
)
WEAK_IN_SCOPE = (
    ["correct"] * 8 + ["top3_only"] * 5 + ["wrong"] * 8 + ["no_consensus"] * 3 + ["abstained"] * 2
    + ["repair_exhausted_all", "missing_evidence_exhausted_all", "provider_exhausted_all"]
)
STRONG_REJECTION = ["outside"] * 5 + ["insufficient", "forced", "inconsistent", "no_writing", "outside"]
WEAK_REJECTION = ["forced"] * 6 + ["outside"] * 2 + ["no_writing"] * 2


def payload(disposition: str, scripts: list[str], evidence: bool = True) -> str:
    identified = disposition == "identified"
    return json.dumps({
        "disposition": disposition,
        "observations": {
            "writing_present": disposition != "no_writing",
            "image_quality": "fair",
            "apparent_direction": "unclear",
            "visual_features": ["synthetic feature"],
            "damage_or_limitations": [],
        },
        "candidates": [
            {"rank": rank, "script": script,
             "supporting_evidence": ["synthetic evidence"] if evidence else [],
             "contradicting_evidence": []}
            for rank, script in enumerate(scripts, start=1)
        ],
        "alternative_interpretations": [],
        "abstention_reason": None if identified else "synthetic reason",
    })


def ok(*scripts: str, usage: bool = True) -> dict:
    return response(payload("identified", list(scripts)), usage)


def abstain(disposition: str) -> dict:
    return response(payload(disposition, []))


def response(content: str, usage: bool = True) -> dict:
    tokens = {"input_tokens": INPUT_TOKENS, "output_tokens": OUTPUT_TOKENS} if usage else {}
    return {"content": content, **tokens, "finish_reason": "stop"}


def error(kind: str, status: int, retry_after: float | None = None) -> dict:
    return {"error": {"kind": kind, "http_status": status, "detail": "synthetic failure", "retry_after_s": retry_after}}


BAD = response("this is not JSON")
NO_EVIDENCE = lambda g: response(payload("identified", [g], evidence=False))  # noqa: E731
RATE_LIMITED = error("rate_limited", 429, 0)
UNAVAILABLE = error("unavailable", 503, 0)
CREDIT = error("credit_exhausted", 402)


def in_scope_outcomes(scenario: str, gold: str) -> list[dict]:
    """Outcomes consumed in order across three repetitions, including any retries."""
    index = SUPPORTED_SCRIPTS.index(gold)
    other = SUPPORTED_SCRIPTS[(index + 1) % 6]
    third = SUPPORTED_SCRIPTS[(index + 2) % 6]
    right = ok(gold)
    return {
        "correct": [right] * 3,
        "correct_ranked": [ok(gold, other, third)] * 3,
        "correct_no_usage": [ok(gold, usage=False)] * 3,
        "top3_only": [ok(other, gold)] * 3,
        "wrong": [ok(other, third)] * 3,
        "unstable": [right, right, ok(other)],
        "no_consensus": [right, ok(other), ok(third)],
        "abstained": [abstain("insufficient_evidence")] * 3,
        "repair_ok": [BAD, right, right, right],
        "repair_exhausted": [BAD, BAD, right, right],
        "repair_exhausted_all": [BAD] * 6,
        "missing_evidence_repaired": [NO_EVIDENCE(gold), right, right, right],
        "missing_evidence_exhausted_all": [NO_EVIDENCE(gold)] * 6,
        "provider_retry_ok": [RATE_LIMITED, right, right, right],
        "provider_exhausted": [UNAVAILABLE, UNAVAILABLE, right, right],
        "provider_exhausted_all": [UNAVAILABLE] * 6,
        "provider_fatal": [CREDIT, right, right],
    }[scenario]


def rejection_outcomes(scenario: str) -> list[dict]:
    outside = abstain("outside_supported_set")
    return {
        "outside": [outside] * 3,
        "insufficient": [abstain("insufficient_evidence")] * 3,
        "no_writing": [abstain("no_writing")] * 3,
        "forced": [ok("latin")] * 3,
        "inconsistent": [outside, ok("greek"), outside],
    }[scenario]


def manifest_rows() -> list[dict]:
    def row(image_id: str, gold_class: str, label: str, **overrides) -> dict:
        base = {column: "" for column in COLUMNS}
        base.update(image_id=image_id, split="dev", gold_class=gold_class, script_label=label,
                    institution="Synthetic fixture", object_id=image_id, source_url="synthetic://fixture",
                    licence="Synthetic, no real image", redistribution="allowed", image_quality="unassessed",
                    label_status="verified_institution", label_evidence_url="synthetic://fixture",
                    famous_object="no", image_seen="no", notes=NOTICE, stage_c_status="accepted",
                    sample_type="complete")
        base.update(overrides)
        return base

    rows, number = [], 0
    for script, count in SCRIPT_COUNTS.items():
        for position in range(count):
            number += 1
            rows.append(row(f"SYN{number:03d}", "in_scope", script,
                            famous_object="yes" if position == 0 else "no",
                            leakage_risks="Printed plate" if script == "brahmi" and position < 4 else "",
                            **({"sample_type": "excerpt", "evaluation_scope": "script_identification_only"}
                               if script == "runic" and position == 0 else {})))
    for label, gold_class, count in [("cuneiform", "out_of_scope", 4), ("egyptian_hieroglyphs", "out_of_scope", 4),
                                     ("no_writing", "no_writing", 2)]:
        for _ in range(count):
            number += 1
            rows.append(row(f"SYN{number:03d}", gold_class, label))
    rows.append(row("SYN040", "in_scope", "greek", label_status="implied_record"))
    rows.append(row("SYN041", "in_scope", "runic", split="reserve", stage_c_status="not_acquired"))
    return rows


def recording(in_scope: list[str], rejection: list[str]) -> dict:
    rows = manifest_rows()
    counted = [r for r in rows if r["split"] == "dev" and r["label_status"] != "implied_record"]
    targets = [r for r in counted if r["gold_class"] == "in_scope"]
    negatives = [r for r in counted if r["gold_class"] != "in_scope"]
    assert len(targets) == len(in_scope) == 29 and len(negatives) == len(rejection) == 10
    outcomes = {r["image_id"]: in_scope_outcomes(s, r["script_label"]) for r, s in zip(targets, in_scope)}
    outcomes.update({r["image_id"]: rejection_outcomes(s) for r, s in zip(negatives, rejection)})
    scenarios = {r["image_id"]: s for r, s in zip(targets + negatives, in_scope + rejection)}
    return {"notice": NOTICE, "synthetic": True, "scenarios": scenarios, "outcomes": outcomes}


MODELS_YAML = """# SYNTHETIC models for fixture replay. They name no real model and reach no network.
models:
  synthetic_strong:
    base_url: https://synthetic.invalid/v1
    model: synthetic/strong
    api_key_env: SYNTHETIC_NOT_USED
    response_format: json_schema
    input_usd_per_mtok: 0.15
    output_usd_per_mtok: 0.60
  synthetic_weak:
    base_url: https://synthetic.invalid/v1
    model: synthetic/weak
    api_key_env: SYNTHETIC_NOT_USED
    response_format: json_schema
    input_usd_per_mtok: 0.20
    output_usd_per_mtok: 0.40
"""


def manifest_text() -> str:
    from io import StringIO
    buffer = StringIO()
    writer = csv.DictWriter(buffer, fieldnames=COLUMNS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(manifest_rows())
    return buffer.getvalue()


def fixture_files() -> dict[str, str]:
    return {
        "manifest.csv": manifest_text(),
        "models.yaml": MODELS_YAML,
        "synthetic_strong.json": json.dumps(recording(STRONG_IN_SCOPE, STRONG_REJECTION), indent=1) + "\n",
        "synthetic_weak.json": json.dumps(recording(WEAK_IN_SCOPE, WEAK_REJECTION), indent=1) + "\n",
    }


def main() -> None:
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    for name, text in fixture_files().items():
        (FIXTURE_DIR / name).write_text(text, encoding="utf-8")
    print(f"wrote {len(fixture_files())} files to {FIXTURE_DIR}")


if __name__ == "__main__":
    main()
