"""Apply the approved crops to new files, and build before-and-after previews. No network.

    python -m tools.process_images
"""
import csv
import hashlib
import sys
from pathlib import Path

from PIL import Image, ImageOps

from src.crops import CROP_METHOD, CROP_METHOD_VERSION, Box, apply_crop

ROOT = Path(__file__).resolve().parents[1]
ORIGINALS = ROOT / "data" / "images"
PROCESSED = ROOT / "data" / "processed"
PREVIEWS = ROOT / "data" / "previews"
CROPS = ROOT / "dataset" / "proposed_crops.csv"
OUTPUT = ROOT / "dataset" / "crop_metadata.csv"
SOURCE_OVERRIDE = {"SE001": "SE001_print.jpg"}
FIELDS = ("image_id", "source_file", "source_sha256", "source_width", "source_height", "left", "top", "right", "bottom",
          "crop_width", "crop_height", "processed_file", "processed_sha256", "method", "method_version",
          "inscription_retained_share")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def retained_share(source: Path, box: Box) -> float:
    """Share of dark impression pixels inside the box. A proxy for plates, where dark marks the inscribed surface."""
    with Image.open(source) as image:
        mask = image.convert("L").point(lambda value: 255 if value < 128 else 0)

    def count(region: Image.Image) -> int:
        return sum(1 for value in region.resize((region.width // 4, region.height // 4)).getdata() if value > 127)

    return count(mask.crop(box.tuple())) / count(mask)


def preview(source: Path, processed: Path, destination: Path) -> None:
    with Image.open(source) as before, Image.open(processed) as after:
        left = ImageOps.contain(before.convert("RGB"), (900, 900))
        right = ImageOps.contain(after.convert("RGB"), (900, 900))
    canvas = Image.new("RGB", (left.width + right.width + 30, max(left.height, right.height)), "white")
    canvas.paste(left, (0, 0))
    canvas.paste(right, (left.width + 30, 0))
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination, quality=88)


def main() -> int:
    with CROPS.open(newline="", encoding="utf-8") as handle:
        specs = list(csv.DictReader(handle))
    rows = []
    for spec in specs:
        image_id = spec["image_id"]
        # tools/clear_margins.py builds these rows from the whole plate.
        if "superseded" in spec["status"]:
            continue
        source = ORIGINALS / SOURCE_OVERRIDE.get(image_id, f"{image_id}.jpg")
        box = Box(*(int(spec[key]) for key in ("left", "top", "right", "bottom")))
        target = PROCESSED / f"{image_id}.png"
        before = sha256(source)
        width, height = apply_crop(source, box, target)
        if sha256(source) != before:
            raise RuntimeError(f"{source} changed during cropping")
        with Image.open(source) as image:
            source_width, source_height = image.size
        share = "" if image_id == "SE001" else f"{retained_share(source, box):.2f}"
        rows.append({
            "image_id": image_id, "source_file": source.name, "source_sha256": before, "source_width": source_width,
            "source_height": source_height, "left": box.left, "top": box.top, "right": box.right, "bottom": box.bottom,
            "crop_width": width, "crop_height": height, "processed_file": target.name, "processed_sha256": sha256(target),
            "method": CROP_METHOD, "method_version": CROP_METHOD_VERSION, "inscription_retained_share": share,
        })
        preview(source, target, PREVIEWS / f"{image_id}_before_after.jpg")
        print(f"{image_id}: {width}x{height} retained {share or 'see review'}")
    rows.sort(key=lambda row: row["image_id"])
    with OUTPUT.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    return 0


if __name__ == "__main__":
    sys.exit(main())
