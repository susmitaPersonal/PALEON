"""Q-10: build whole-plate images with printed marks cleared from blank paper. No network.

Regions and crop boxes are data in dataset/margin_regions.csv and dataset/margin_boxes.csv. Run after
tools/process_images.py. Earlier crops move to data/processed/superseded/, and originals are only read.

    python -m tools.clear_margins
"""
import csv
import hashlib
import shutil
import sys
from pathlib import Path

from src.crops import MARGIN_METHOD, MARGIN_METHOD_VERSION, Box, clear_regions, read_rows
from tools.process_images import FIELDS, OUTPUT, ORIGINALS, PREVIEWS, PROCESSED, preview, retained_share, sha256

ROOT = Path(__file__).resolve().parents[1]
BOXES = ROOT / "dataset" / "margin_boxes.csv"
REGIONS = ROOT / "dataset" / "margin_regions.csv"
SUMS = ROOT / "dataset" / "sha256sums_processed.txt"
SUPERSEDED = PROCESSED / "superseded"
REGION_FIELDS = ("image_id", "region_id", "kind", "left", "top", "right", "bottom", "ring_paper_share", "fill_rgb")


def write_csv(path: Path, fields: tuple[str, ...], rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    regions = read_rows(REGIONS)
    records = {row["image_id"]: row for row in read_rows(OUTPUT)}
    for spec in read_rows(BOXES):
        image_id = spec["image_id"]
        source = ORIGINALS / f"{image_id}.jpg"
        target = PROCESSED / f"{image_id}.png"
        box = Box(*(int(spec[key]) for key in ("left", "top", "right", "bottom")))
        chosen = [region for region in regions if region["image_id"] == image_id]
        boxes = [Box(*(int(region[key]) for key in ("left", "top", "right", "bottom"))) for region in chosen]
        before = sha256(source)
        scratch = PROCESSED / f".{image_id}.new.png"
        (width, height), fills = clear_regions(source, box, boxes, scratch)
        if sha256(source) != before:
            raise RuntimeError(f"{source} changed during clearing")
        if target.exists():
            SUPERSEDED.mkdir(parents=True, exist_ok=True)
            shutil.move(target, SUPERSEDED / f"{image_id}_v1.png")
        scratch.rename(target)
        for region, fill in zip(chosen, fills):
            region.update(ring_paper_share=f"{fill['ring_paper_share']:.3f}", fill_rgb=fill["fill_rgb"])
        records[image_id] = {
            **records[image_id], "left": box.left, "top": box.top, "right": box.right, "bottom": box.bottom,
            "crop_width": width, "crop_height": height, "processed_sha256": sha256(target), "method": MARGIN_METHOD,
            "method_version": MARGIN_METHOD_VERSION, "inscription_retained_share": f"{retained_share(source, box):.2f}",
        }
        preview(source, target, PREVIEWS / f"{image_id}_before_after.jpg")
        print(f"{image_id}: {width}x{height}, {len(chosen)} regions cleared")
    write_csv(REGIONS, REGION_FIELDS, regions)
    write_csv(OUTPUT, FIELDS, [records[key] for key in sorted(records)])
    SUMS.write_text("".join(f"{row['processed_sha256']}  {row['processed_file']}\n" for row in
                            sorted(records.values(), key=lambda row: row["image_id"])), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
