"""Integrity checks tying the manifest, the image inventory, and the files on disk together.

Metadata checks need no images, so they run anywhere. File checks run only where images are present.
"""
import hashlib
from pathlib import Path

from .crops import MARGIN_METHOD, MIN_RING_PAPER_SHARE, Box, CropError, validate_box
from .manifest import SAMPLE_EXCERPT, STAGE_C_ACCEPTED, STAGE_C_EXCLUDED, STAGE_C_HELD, ManifestRow

INVENTORY_FIELDS = ("image_id", "source_record", "image_file_url", "file_name", "format", "mode", "width", "height",
                    "bytes", "sha256", "content_type", "retrieved_at")
ACQUIRED_STATUSES = {STAGE_C_ACCEPTED, STAGE_C_HELD, STAGE_C_EXCLUDED}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def check_licences(rows: list[ManifestRow]) -> list[str]:
    """Every counted row needs usable licence metadata, and attribution where the licence requires it."""
    problems = []
    for row in rows:
        if row.raw.get("stage_c_status") != STAGE_C_ACCEPTED:
            continue
        raw = row.raw
        if raw["redistribution"] not in {"allowed", "allowed_with_attribution"}:
            problems.append(f"{row.image_id}: acquired with redistribution {raw['redistribution']!r}")
        if not raw["licence_url"]:
            problems.append(f"{row.image_id}: licence_url is required")
        if "BY" in raw["licence"] and (raw["redistribution"] != "allowed_with_attribution" or not raw["attribution"]):
            problems.append(f"{row.image_id}: an attribution licence needs attribution text")
    return problems


def check_decisions(rows: list[ManifestRow]) -> list[str]:
    """Stage C decisions must be complete, justified, and unable to reach the metrics by accident."""
    problems = []
    for row in rows:
        status, raw = row.raw.get("stage_c_status"), row.raw
        if status in {STAGE_C_EXCLUDED, STAGE_C_HELD} and not raw.get("stage_c_reason"):
            problems.append(f"{row.image_id}: status {status!r} needs a reason")
        if status in {STAGE_C_EXCLUDED, STAGE_C_HELD} and row.eligible_for_metrics:
            problems.append(f"{row.image_id}: status {status!r} must not count in metrics")
        if status == STAGE_C_ACCEPTED:
            if raw["image_seen"] != "yes":
                problems.append(f"{row.image_id}: accepted without being seen")
            if raw["image_quality"] == "unassessed":
                problems.append(f"{row.image_id}: accepted with unassessed quality")
            if not row.eligible_for_metrics:
                problems.append(f"{row.image_id}: accepted but not eligible; label or split is wrong")
            if not raw.get("sample_type"):
                problems.append(f"{row.image_id}: accepted without a sample_type")
    return problems


def check_inventory(rows: list[ManifestRow], inventory: list[dict]) -> list[str]:
    """Compare the inventory with the manifest. Needs no image files."""
    problems = []
    by_id = {row.image_id: row for row in rows}
    seen_ids, seen_hashes = set(), {}
    for entry in inventory:
        image_id = entry["image_id"]
        if image_id in seen_ids:
            problems.append(f"{image_id}: duplicate inventory entry")
        seen_ids.add(image_id)
        row = by_id.get(image_id)
        if row is None:
            problems.append(f"{image_id}: in the inventory but not the manifest")
            continue
        if row.raw.get("stage_c_status") not in ACQUIRED_STATUSES:
            problems.append(f"{image_id}: file held for a row that should not be acquired")
        if entry["image_file_url"] != row.raw["image_file_url"]:
            problems.append(f"{image_id}: inventory URL does not match the manifest")
        if entry["source_record"] != row.raw["source_url"]:
            problems.append(f"{image_id}: inventory source record does not match the manifest")
        if entry["sha256"] != row.raw["sha256"]:
            problems.append(f"{image_id}: inventory hash does not match the manifest")
        if not entry["file_name"].startswith(image_id + "."):
            problems.append(f"{image_id}: file name {entry['file_name']!r} is mapped to another image")
        if entry["sha256"] in seen_hashes:
            problems.append(f"{image_id}: same image as {seen_hashes[entry['sha256']]}")
        seen_hashes[entry["sha256"]] = image_id
    for row in rows:
        if row.raw.get("stage_c_status") in ACQUIRED_STATUSES and row.image_id not in seen_ids:
            problems.append(f"{row.image_id}: marked acquired but missing from the inventory")
    return problems


def check_files(inventory: list[dict], image_dir: Path, replacements: list[dict] | None = None) -> list[str]:
    """Compare the inventory with the files on disk. A changed original fails here."""
    problems = []
    replacements = replacements or []
    expected = {entry["file_name"] for entry in inventory} | {r["replacement_file"] for r in replacements}
    for replacement in replacements:
        path = image_dir / replacement["replacement_file"]
        if not path.exists():
            problems.append(f"{replacement['image_id']}: replacement file is missing")
        elif sha256_file(path) != replacement["replacement_sha256"]:
            problems.append(f"{replacement['image_id']}: replacement hash differs from its record")
    for entry in inventory:
        path = image_dir / entry["file_name"]
        if not path.exists():
            problems.append(f"{entry['image_id']}: image file is missing")
            continue
        if path.stat().st_size != int(entry["bytes"]):
            problems.append(f"{entry['image_id']}: size differs from the inventory")
        if sha256_file(path) != entry["sha256"]:
            problems.append(f"{entry['image_id']}: hash differs from the inventory")
    for path in sorted(image_dir.iterdir()) if image_dir.exists() else []:
        if path.name not in expected and not path.name.startswith("."):
            problems.append(f"{path.name}: file on disk has no inventory entry")
    return problems


def check_replacements(rows: list[ManifestRow], inventory: list[dict], replacements: list[dict]) -> list[str]:
    """A replacement must be the same object under the same licence, and must keep the original's record."""
    problems = []
    by_id = {row.image_id: row for row in rows}
    originals = {entry["image_id"]: entry for entry in inventory}
    for item in replacements:
        image_id = item["image_id"]
        row = by_id.get(image_id)
        if row is None:
            problems.append(f"{image_id}: replacement has no manifest row")
            continue
        if item["record_accession"] != row.object_id or item["manifest_accession"] != row.object_id:
            problems.append(f"{image_id}: replacement accession does not match the manifest")
        if item["source_record"] != row.raw["source_url"]:
            problems.append(f"{image_id}: replacement source record does not match the manifest")
        if item["licence"] != "CC0":
            problems.append(f"{image_id}: replacement licence is {item['licence']!r}")
        if item["same_object"] != "yes":
            problems.append(f"{image_id}: replacement is not confirmed as the same object")
        if (item["width"], item["height"]) != (item["record_width"], item["record_height"]):
            problems.append(f"{image_id}: replacement dimensions differ from the record")
        original = originals.get(image_id)
        if original is None:
            problems.append(f"{image_id}: the original acquisition record is missing")
        elif item["replaces_sha256"] != original["sha256"]:
            problems.append(f"{image_id}: replacement does not point at the original acquisition")
    return problems


def check_crops(rows: list[ManifestRow], inventory: list[dict], replacements: list[dict], crops: list[dict],
                reviews: list[dict], processed_dir: Path | None = None) -> list[str]:
    """Tie each crop to its source, box, review, and manifest row. Accepted crops need a passed review."""
    problems = []
    by_id = {row.image_id: row for row in rows}
    sources = {entry["sha256"] for entry in inventory} | {r["replacement_sha256"] for r in replacements}
    review_by_id = {review["image_id"]: review for review in reviews}
    seen: dict[str, str] = {}
    for crop in crops:
        image_id = crop["image_id"]
        row = by_id.get(image_id)
        if row is None:
            problems.append(f"{image_id}: crop has no manifest row")
            continue
        box = Box(int(crop["left"]), int(crop["top"]), int(crop["right"]), int(crop["bottom"]))
        try:
            validate_box(box, int(crop["source_width"]), int(crop["source_height"]))
        except CropError as error:
            problems.append(f"{image_id}: {error}")
        if (int(crop["crop_width"]), int(crop["crop_height"])) != (box.width, box.height):
            problems.append(f"{image_id}: cropped dimensions do not match the box")
        if crop["source_sha256"] not in sources:
            problems.append(f"{image_id}: crop source is not a recorded image")
        if crop["processed_sha256"] != row.raw.get("processed_sha256"):
            problems.append(f"{image_id}: manifest processed hash does not match the crop record")
        if crop["processed_sha256"] in seen:
            problems.append(f"{image_id}: same processed image as {seen[crop['processed_sha256']]}")
        seen[crop["processed_sha256"]] = image_id
        if crop["processed_sha256"] in sources:
            problems.append(f"{image_id}: processed hash equals an original, so nothing was cropped")
        review = review_by_id.get(image_id)
        if review is None:
            problems.append(f"{image_id}: crop has no inspection record")
        elif row.raw.get("stage_c_status") == STAGE_C_ACCEPTED:
            # An excerpt may drop text, by approval, but it may not cut characters or keep answer clues.
            excerpt = row.raw.get("sample_type") == SAMPLE_EXCERPT
            if excerpt and (review.get("boundary_clipping") != "no" or review.get("answer_clues_absent") != "yes"):
                problems.append(f"{image_id}: accepted excerpt fails the boundary or clue check")
            for field in ("inscription_visible", "captions_removed", "characters_intact", "quality_sufficient",
                          *(() if excerpt else ("inscription_complete",))):
                allowed = {"yes", "not_applicable"} if field == "captions_removed" else {"yes"}
                if review[field] not in allowed:
                    problems.append(f"{image_id}: accepted with {field}={review[field]!r}")
        if processed_dir is not None:
            path = processed_dir / crop["processed_file"]
            if not path.exists():
                problems.append(f"{image_id}: processed file is missing")
            elif sha256_file(path) != crop["processed_sha256"]:
                problems.append(f"{image_id}: processed hash differs from its record")
    cropped = {crop["image_id"] for crop in crops}
    for row in rows:
        if row.raw.get("processed_sha256") and row.image_id not in cropped:
            problems.append(f"{row.image_id}: processed hash without a crop record")
    return problems


def check_hard_negatives(images: list[dict], reviews: list[dict], rows: list[ManifestRow],
                         directory: Path | None = None) -> list[str]:
    """Hard negatives stay outside the manifest until a reviewed decision and an approval move them in."""
    problems = []
    accessions = {row.object_id for row in rows}
    counted_hashes = {row.raw.get("sha256") for row in rows} | {row.raw.get("processed_sha256") for row in rows}
    reviewed = {review["met_object_id"]: review for review in reviews}
    for image in images:
        object_id = image["met_object_id"]
        if object_id not in reviewed:
            problems.append(f"{object_id}: downloaded without an inspection record")
        if image["sha256"] in counted_hashes:
            problems.append(f"{object_id}: image is also in the dataset")
        if directory is not None:
            path = directory / image["file_name"]
            if not path.exists():
                problems.append(f"{object_id}: hard-negative file {image['file_name']} is missing")
            elif sha256_file(path) != image["sha256"]:
                problems.append(f"{object_id}: hard-negative hash differs from its record")
    for review in reviews:
        if review["status"] not in {"candidate", "held", "excluded", "accepted"}:
            problems.append(f"{review['met_object_id']}: invalid status {review['status']!r}")
        if not review["decision_reason"]:
            problems.append(f"{review['met_object_id']}: status needs a reason")
        if review["status"] == "accepted" and review["accession"] not in accessions:
            problems.append(f"{review['met_object_id']}: accepted but not in the manifest")
        if review["status"] != "accepted" and review["accession"] in accessions:
            row = next(r for r in rows if r.object_id == review["accession"])
            if row.eligible_for_metrics:
                problems.append(f"{review['met_object_id']}: uncounted candidate reaches the metrics")
    return problems


def check_margin_regions(crops: list[dict], regions: list[dict]) -> list[str]:
    """Margin-cleared crops and their recorded regions must match, and each region must have passed the paper check."""
    problems = []
    cleared = {crop["image_id"]: crop for crop in crops if crop["method"] == MARGIN_METHOD}
    by_image: dict[str, list[dict]] = {}
    for region in regions:
        by_image.setdefault(region["image_id"], []).append(region)
    for image_id in sorted(set(by_image) - set(cleared)):
        problems.append(f"{image_id}: margin regions without a margin-cleared crop")
    for image_id, crop in cleared.items():
        if image_id not in by_image:
            problems.append(f"{image_id}: margin-cleared crop has no recorded regions")
            continue
        for region in by_image[image_id]:
            box = Box(int(region["left"]), int(region["top"]), int(region["right"]), int(region["bottom"]))
            try:
                validate_box(box, int(crop["source_width"]), int(crop["source_height"]))
            except CropError as exc:
                problems.append(f"{image_id}: {exc}")
            if float(region["ring_paper_share"]) < MIN_RING_PAPER_SHARE:
                problems.append(f"{image_id}: region {region['region_id']} failed the paper check")
            if len(region["fill_rgb"]) != 6:
                problems.append(f"{image_id}: region {region['region_id']} has no recorded fill")
    return problems


def validate_dataset(rows: list[ManifestRow], inventory: list[dict], image_dir: Path | None = None,
                     replacements: list[dict] | None = None, crops: list[dict] | None = None,
                     reviews: list[dict] | None = None, processed_dir: Path | None = None,
                     hard_negative_images: list[dict] | None = None, hard_negative_reviews: list[dict] | None = None,
                     hard_negative_dir: Path | None = None, margin_regions: list[dict] | None = None) -> list[str]:
    replacements, crops, reviews = replacements or [], crops or [], reviews or []
    problems = check_licences(rows) + check_decisions(rows) + check_inventory(rows, inventory)
    problems += check_replacements(rows, inventory, replacements)
    problems += check_crops(rows, inventory, replacements, crops, reviews, processed_dir)
    problems += check_margin_regions(crops, margin_regions or [])
    problems += check_hard_negatives(hard_negative_images or [], hard_negative_reviews or [], rows, hard_negative_dir)
    if image_dir is not None:
        problems += check_files(inventory, image_dir, replacements)
    return problems
