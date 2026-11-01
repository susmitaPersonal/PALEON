"""Image sources. Metrics and the runner see the same interface for real and synthetic images."""
import hashlib
from pathlib import Path
from typing import Protocol

from .manifest import ManifestRow
from .preprocess import normalize_image

IMAGE_SUFFIXES = (".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp")


class ImageError(ValueError):
    pass


class ImageSource(Protocol):
    def __call__(self, row: ManifestRow) -> tuple[bytes, str]: ...


class SyntheticImageSource:
    """Placeholder bytes for fixture runs. They are not an image and carry no label."""

    def __call__(self, row: ManifestRow) -> tuple[bytes, str]:
        return f"SYNTHETIC-PLACEHOLDER:{row.image_id}".encode(), "application/octet-stream"


class LocalImageSource:
    """Reads an approved local image, checks its recorded hash, and applies fixed preprocessing."""

    def __init__(self, directory: Path, longest_edge: int, jpeg_quality: int, processed_directory: Path | None = None):
        self.directory = directory
        self.processed_directory = processed_directory
        self.longest_edge = longest_edge
        self.jpeg_quality = jpeg_quality

    def __call__(self, row: ManifestRow) -> tuple[bytes, str]:
        processed_hash = row.raw.get("processed_sha256", "")
        if processed_hash:
            return self._load_processed(row, processed_hash)
        matches = [self.directory / f"{row.image_id}{suffix}" for suffix in IMAGE_SUFFIXES]
        path = next((p for p in matches if p.exists()), None)
        if path is None:
            raise ImageError(f"no local image for {row.image_id} in {self.directory}")
        data = path.read_bytes()
        expected = row.raw.get("sha256", "")
        if not expected:
            raise ImageError(f"{row.image_id} has no recorded sha256")
        if hashlib.sha256(data).hexdigest() != expected:
            raise ImageError(f"{row.image_id} does not match its recorded sha256")
        return normalize_image(data, self.longest_edge, self.jpeg_quality)

    def _load_processed(self, row: ManifestRow, expected: str) -> tuple[bytes, str]:
        """A cropped row must use its crop. It never falls back to the original, which shows a caption."""
        path = (self.processed_directory or Path()) / f"{row.image_id}.png"
        if self.processed_directory is None or not path.exists():
            raise ImageError(f"no processed image for {row.image_id}")
        data = path.read_bytes()
        if hashlib.sha256(data).hexdigest() != expected:
            raise ImageError(f"{row.image_id} does not match its recorded processed sha256")
        return normalize_image(data, self.longest_edge, self.jpeg_quality)
