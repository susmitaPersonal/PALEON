"""Lossless crops, margin clearing, and image comparison. No network, and originals are only ever read."""
import csv
from dataclasses import dataclass
from pathlib import Path
from statistics import median

from PIL import Image, ImageDraw

CROP_METHOD = "pillow-crop-png-lossless"
CROP_METHOD_VERSION = "v1"
MARGIN_METHOD = "pillow-crop-clear-png-lossless"
MARGIN_METHOD_VERSION = "v2"
# A cleared region must sit on blank paper, which is what these three values test.
PAPER_MIN_BRIGHTNESS = 200
RING_WIDTH = 12
MIN_RING_PAPER_SHARE = 0.75
Image.MAX_IMAGE_PIXELS = 120_000_000


class CropError(ValueError):
    pass


@dataclass(frozen=True)
class Box:
    left: int
    top: int
    right: int
    bottom: int

    @property
    def width(self) -> int:
        return self.right - self.left

    @property
    def height(self) -> int:
        return self.bottom - self.top

    def tuple(self) -> tuple[int, int, int, int]:
        return self.left, self.top, self.right, self.bottom


def validate_box(box: Box, width: int, height: int) -> None:
    if box.left < 0 or box.top < 0:
        raise CropError(f"box {box} starts outside the image")
    if box.right > width or box.bottom > height:
        raise CropError(f"box {box} ends outside the {width}x{height} image")
    if box.width <= 0 or box.height <= 0:
        raise CropError(f"box {box} is empty")


def apply_crop(source: Path, box: Box, destination: Path) -> tuple[int, int]:
    """Write a lossless crop to a new file. Nothing is resampled, and the source is never written."""
    if destination.resolve().parent == source.resolve().parent:
        raise CropError("processed images must be stored apart from originals")
    if destination.exists():
        raise CropError(f"{destination} already exists")
    with Image.open(source) as image:
        validate_box(box, image.width, image.height)
        cropped = image.crop(box.tuple())
        cropped.load()
    destination.parent.mkdir(parents=True, exist_ok=True)
    cropped.save(destination, format="PNG")
    return cropped.width, cropped.height


def paper_ring(image: Image.Image, region: Box) -> tuple[float, tuple[int, int, int]]:
    """Share of paper-bright pixels in the ring around a region, and the median colour of those pixels."""
    left, top = max(region.left - RING_WIDTH, 0), max(region.top - RING_WIDTH, 0)
    right, bottom = min(region.right + RING_WIDTH, image.width), min(region.bottom + RING_WIDTH, image.height)
    patch = image.crop((left, top, right, bottom)).convert("RGB")
    ring = [pixel for index, pixel in enumerate(patch.getdata())
            if not (region.left <= left + index % patch.width < region.right
                    and region.top <= top + index // patch.width < region.bottom)]
    paper = [pixel for pixel in ring if min(pixel) >= PAPER_MIN_BRIGHTNESS]
    if not paper:
        return 0.0, (255, 255, 255)
    return len(paper) / len(ring), tuple(int(median(pixel[channel] for pixel in paper)) for channel in range(3))


def clear_regions(source: Path, box: Box, regions: list[Box], destination: Path) -> tuple[tuple[int, int], list[dict]]:
    """Fill blank-paper regions with the surrounding paper tone, then crop. Every other pixel is unchanged.

    The ring check refuses a region that is not surrounded by paper, so inked pixels cannot be cleared by mistake.
    """
    if destination.resolve().parent == source.resolve().parent:
        raise CropError("processed images must be stored apart from originals")
    if destination.exists():
        raise CropError(f"{destination} already exists")
    with Image.open(source) as image:
        validate_box(box, image.width, image.height)
        working = image.convert("RGB")
    fills = []
    for region in regions:
        validate_box(region, working.width, working.height)
        share, tone = paper_ring(working, region)
        if share < MIN_RING_PAPER_SHARE:
            raise CropError(f"region {region} is not surrounded by blank paper ({share:.2f})")
        fills.append({"ring_paper_share": share, "fill_rgb": "%02x%02x%02x" % tone, "tone": tone})
    # Tones are measured first, so one fill can never colour the ring of the next.
    canvas = ImageDraw.Draw(working)
    for region, fill in zip(regions, fills):
        canvas.rectangle((region.left, region.top, region.right - 1, region.bottom - 1), fill=fill.pop("tone"))
    cropped = working.crop(box.tuple())
    destination.parent.mkdir(parents=True, exist_ok=True)
    cropped.save(destination, format="PNG")
    return cropped.size, fills


def similarity(first: Path, second: Path, size: int = 128) -> float:
    """Pearson correlation of small greyscale copies. Near 1 means the same picture at another size."""
    def pixels(path: Path) -> list[int]:
        with Image.open(path) as image:
            return list(image.convert("L").resize((size, size), Image.Resampling.LANCZOS).getdata())

    a, b = pixels(first), pixels(second)
    mean_a, mean_b = sum(a) / len(a), sum(b) / len(b)
    covariance = sum((x - mean_a) * (y - mean_b) for x, y in zip(a, b))
    spread = (sum((x - mean_a) ** 2 for x in a) * sum((y - mean_b) ** 2 for y in b)) ** 0.5
    return covariance / spread if spread else 0.0


def read_rows(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))
