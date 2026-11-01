"""Stage C downloader. Lives outside src/ so that the harness itself still has no network client.

Fetches only counted manifest rows, only from their recorded URL, and only from allowlisted hosts.
Excluded and reserve rows are never fetched. Existing files are never overwritten.

    python -m tools.fetch_images
"""
import csv
import hashlib
import io
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

from src.manifest import eligible_rows, load_manifest

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "dataset" / "manifest.csv"
IMAGE_DIR = ROOT / "data" / "images"
INVENTORY = ROOT / "dataset" / "image_inventory.csv"
ALLOWED_HOSTS = {"images.metmuseum.org", "upload.wikimedia.org", "openaccess-cdn.clevelandart.org"}
USER_AGENT = "ScriptEcho-dataset-fetch/0.1 (open-source research project; low request rate)"
SUFFIXES = {"JPEG": ".jpg", "PNG": ".png", "TIFF": ".tif", "WEBP": ".webp"}
PAUSE_SECONDS = 2.0
MAX_BYTES = 80_000_000
MAX_WAIT_SECONDS = 60
FIELDS = ("image_id", "source_record", "image_file_url", "file_name", "format", "mode", "width", "height", "bytes",
          "sha256", "content_type", "retrieved_at")


def host_allowed(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    return parsed.scheme == "https" and parsed.hostname in ALLOWED_HOSTS


def fetch(url: str) -> tuple[bytes, str]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                if not host_allowed(response.geturl()):
                    raise ValueError(f"redirected to a host that is not allowed: {response.geturl()}")
                return response.read(MAX_BYTES + 1), response.headers.get("Content-Type", "")
        except urllib.error.HTTPError as error:
            wait = float(error.headers.get("Retry-After") or 30)
            if error.code != 429 or attempt == 3 or wait > MAX_WAIT_SECONDS:
                raise       # A long server wait defers this file; a later run picks it up.
            time.sleep(wait + 1)
    raise RuntimeError("unreachable")


def inspect(data: bytes) -> tuple[str, str, int, int]:
    Image.MAX_IMAGE_PIXELS = None       # Allowlisted museum sources; size is limited by MAX_BYTES.
    with Image.open(io.BytesIO(data)) as image:
        image.load()
        return image.format, image.mode, image.width, image.height


def read_inventory() -> dict[str, dict]:
    if not INVENTORY.exists():
        return {}
    with INVENTORY.open(newline="", encoding="utf-8") as handle:
        return {row["image_id"]: row for row in csv.DictReader(handle)}


def write_inventory(entries: dict[str, dict]) -> None:
    with INVENTORY.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(entries[key] for key in sorted(entries))


def main() -> int:
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    rows = eligible_rows(load_manifest(MANIFEST))
    entries = read_inventory()
    failures = []
    for row in rows:
        url = row.raw["image_file_url"]
        if row.image_id in entries:
            print(f"{row.image_id}: already recorded")
            continue
        if not host_allowed(url):
            failures.append((row.image_id, f"host not allowed: {url}"))
            continue
        try:
            data, content_type = fetch(url)
            if len(data) > MAX_BYTES:
                raise ValueError("file exceeds the size limit")
            image_format, mode, width, height = inspect(data)
            path = IMAGE_DIR / f"{row.image_id}{SUFFIXES[image_format]}"
            if path.exists():
                raise FileExistsError(path)
            path.write_bytes(data)
        except Exception as error:      # One bad file must not stop the rest; it is reported below.
            failures.append((row.image_id, repr(error)))
            print(f"{row.image_id}: FAILED {error!r}")
            continue
        entries[row.image_id] = {
            "image_id": row.image_id, "source_record": row.raw["source_url"], "image_file_url": url,
            "file_name": path.name, "format": image_format, "mode": mode, "width": width, "height": height,
            "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(), "content_type": content_type,
            "retrieved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        write_inventory(entries)
        print(f"{row.image_id}: {image_format} {width}x{height} {len(data)} bytes")
        time.sleep(PAUSE_SECONDS)
    print(f"{len(entries)} recorded, {len(failures)} failed")
    for image_id, reason in failures:
        print(f"  {image_id}: {reason}", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
