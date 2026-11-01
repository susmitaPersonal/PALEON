"""Dataset manifest loading and checks. Standard library only."""
import csv
import hashlib
from dataclasses import dataclass
from pathlib import Path

from .metrics import GoldItem
from .records import SUPPORTED_SCRIPTS

COLUMNS = (
    "image_id", "split", "gold_class", "script_label", "institution", "object_id", "source_url",
    "image_file_url", "period", "origin", "publication_ref", "image_available", "licence",
    "licence_url", "attribution", "redistribution", "image_quality", "label_status",
    "label_evidence_url", "famous_object", "leakage_risks", "sha256", "image_seen", "notes",
    "stage_c_status", "stage_c_reason", "processed_sha256", "sample_type", "evaluation_scope",
)

GOLD_CLASSES = {"in_scope", "out_of_scope", "no_writing"}
OUT_OF_SCOPE_SCRIPTS = {"cuneiform", "egyptian_hieroglyphs"}
# implied_record: the source fits the label but does not name the script, so it stays out of the metrics.
LABEL_STATUSES = {"verified_institution", "verified_publication", "implied_record", "secondary_source", "unverified"}
VERIFIED_STATUSES = {"verified_institution", "verified_publication"}
REDISTRIBUTION = {"allowed", "allowed_with_attribution", "link_only", "unknown"}
QUALITIES = {"good", "fair", "poor", "unassessed"}
STAGE_C_ACCEPTED = "accepted"           # Downloaded, seen, and suitable. Counts in metrics.
STAGE_C_HELD = "held"                   # Downloaded, but needs an approved change first. Does not count.
STAGE_C_EXCLUDED = "excluded"           # Downloaded and unsuitable. Does not count.
STAGE_C_NOT_ACQUIRED = "not_acquired"   # Deliberately not downloaded. Does not count.
# "complete" means no visible inscription in the source image was cropped away. It says nothing about the
# whole object: text can wrap out of view, and fragments are incomplete by nature.
SAMPLE_COMPLETE = "complete"
SAMPLE_EXCERPT = "excerpt"
SAMPLE_TYPES = {SAMPLE_COMPLETE, SAMPLE_EXCERPT, ""}
SCOPE_SCRIPT_ID_ONLY = "script_identification_only"
STAGE_C_STATUSES = {STAGE_C_ACCEPTED, STAGE_C_HELD, STAGE_C_EXCLUDED, STAGE_C_NOT_ACQUIRED}
TARGET_COUNTS = {
    **{script: 5 for script in SUPPORTED_SCRIPTS},
    "cuneiform": 4, "egyptian_hieroglyphs": 4, "no_writing": 2,
}


@dataclass(frozen=True)
class ManifestRow:
    image_id: str
    gold_class: str
    script_label: str
    object_id: str
    label_status: str
    redistribution: str
    raw: dict

    @property
    def eligible_for_metrics(self) -> bool:
        return (self.label_status in VERIFIED_STATUSES and self.raw.get("split") == "dev"
                and self.raw.get("stage_c_status") == STAGE_C_ACCEPTED)


def check_rows(rows: list[dict]) -> list[str]:
    problems: list[str] = []
    ids: set[str] = set()
    objects: set[str] = set()
    for index, row in enumerate(rows, start=1):
        image_id = (row.get("image_id") or "").strip()
        if not image_id:
            problems.append(f"row {index}: missing image_id")
            continue
        missing = [c for c in COLUMNS if c not in row]
        if missing:
            problems.append(f"{image_id}: missing columns {missing}")
            continue
        if image_id in ids:
            problems.append(f"{image_id}: duplicate image_id")
        ids.add(image_id)
        # One image per physical object, so that near-duplicates cannot inflate results.
        object_key = f"{row['institution']}|{row['object_id']}"
        if object_key in objects:
            problems.append(f"{image_id}: duplicate object {object_key}")
        objects.add(object_key)

        gold, label = row["gold_class"], row["script_label"]
        if gold not in GOLD_CLASSES:
            problems.append(f"{image_id}: invalid gold_class {gold!r}")
        elif gold == "in_scope" and label not in SUPPORTED_SCRIPTS:
            problems.append(f"{image_id}: in-scope label {label!r} is not a supported script")
        elif gold == "out_of_scope" and label not in OUT_OF_SCOPE_SCRIPTS:
            problems.append(f"{image_id}: out-of-scope label {label!r} is not recognized")
        elif gold == "no_writing" and label != "no_writing":
            problems.append(f"{image_id}: no-writing row must use script_label no_writing")
        if row["label_status"] not in LABEL_STATUSES:
            problems.append(f"{image_id}: invalid label_status {row['label_status']!r}")
        elif row["label_status"] in VERIFIED_STATUSES and not row["label_evidence_url"]:
            problems.append(f"{image_id}: a verified label needs label_evidence_url")
        if row["redistribution"] not in REDISTRIBUTION:
            problems.append(f"{image_id}: invalid redistribution {row['redistribution']!r}")
        if row["image_quality"] not in QUALITIES:
            problems.append(f"{image_id}: invalid image_quality {row['image_quality']!r}")
        if row["sample_type"] not in SAMPLE_TYPES:
            problems.append(f"{image_id}: invalid sample_type {row['sample_type']!r}")
        if row["sample_type"] == SAMPLE_EXCERPT and row["evaluation_scope"] != SCOPE_SCRIPT_ID_ONLY:
            problems.append(f"{image_id}: an excerpt must be limited to {SCOPE_SCRIPT_ID_ONLY}")
        if row["stage_c_status"] and row["stage_c_status"] not in STAGE_C_STATUSES:
            problems.append(f"{image_id}: invalid stage_c_status {row['stage_c_status']!r}")
        if not row["licence"]:
            problems.append(f"{image_id}: licence is required")
    return problems


class ManifestError(ValueError):
    pass


def read_csv(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def to_rows(raw_rows: list[dict]) -> list[ManifestRow]:
    return [
        ManifestRow(r["image_id"], r["gold_class"], r["script_label"], r["object_id"],
                    r["label_status"], r["redistribution"], r)
        for r in raw_rows
    ]


def coverage(rows: list[ManifestRow]) -> dict[str, dict[str, int]]:
    """Target, verified, and shortfall per class. Only verified rows count toward the target."""
    report = {}
    for label, target in TARGET_COUNTS.items():
        verified = sum(1 for r in rows if r.script_label == label and r.eligible_for_metrics)
        report[label] = {"target": target, "verified": verified, "shortfall": max(target - verified, 0)}
    return report


def load_manifest(path: Path) -> list[ManifestRow]:
    """Read and validate a manifest. Any problem stops the run before a call could be made."""
    if not path.exists():
        raise ManifestError(f"manifest not found: {path}")
    raw_rows = read_csv(path)
    if not raw_rows:
        raise ManifestError(f"manifest has no rows: {path}")
    problems = check_rows(raw_rows)
    if problems:
        raise ManifestError("; ".join(problems))
    return to_rows(raw_rows)


def manifest_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def eligible_rows(rows: list[ManifestRow]) -> list[ManifestRow]:
    return [row for row in rows if row.eligible_for_metrics]


def gold_items(rows: list[ManifestRow]) -> list[GoldItem]:
    """Gold labels for counted rows only. Excluded and reserve rows cannot reach the metrics."""
    return [
        GoldItem(row.image_id, row.gold_class, row.script_label,
                 famous=row.raw.get("famous_object") == "yes",
                 printed_plate="Printed plate" in row.raw.get("leakage_risks", ""),
                 sample_type=row.raw.get("sample_type", ""))
        for row in eligible_rows(rows)
    ]
