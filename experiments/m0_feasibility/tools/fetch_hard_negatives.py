"""Fetch images of researched hard-negative candidates, after rechecking each live record.

Files go to data/hard_negatives/, which no evaluation path reads. Nothing here adds a manifest row,
so downloading a candidate cannot make it count.
"""
import csv
import hashlib
import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from tools.fetch_images import PAUSE_SECONDS, USER_AGENT, fetch, host_allowed, inspect

ROOT = Path(__file__).resolve().parents[1]
CANDIDATES = ROOT / "dataset" / "hard_negative_candidates.csv"
OUTPUT = ROOT / "dataset" / "hard_negative_images.csv"
DIRECTORY = ROOT / "data" / "hard_negatives"
OBJECT_API = "https://collectionapi.metmuseum.org/public/collection/v1/objects/"
SUFFIXES = {"JPEG": ".jpg", "PNG": ".png", "TIFF": ".tif", "WEBP": ".webp"}
FIELDS = ("met_object_id", "accession", "view", "image_url", "file_name", "format", "width", "height", "bytes", "sha256",
          "is_public_domain", "rights_note", "retrieved_at")


def record(object_id: str) -> dict:
    request = urllib.request.Request(OBJECT_API + object_id, headers={"User-Agent": USER_AGENT})
    return json.load(urllib.request.urlopen(request, timeout=60))


def main() -> int:
    DIRECTORY.mkdir(parents=True, exist_ok=True)
    with CANDIDATES.open(newline="", encoding="utf-8") as handle:
        candidates = list(csv.DictReader(handle))
    rows = []
    for candidate in candidates:
        object_id = candidate["met_object_id"]
        data = record(object_id)
        if not data.get("isPublicDomain") or data.get("accessionNumber") != candidate["accession"]:
            print(f"{object_id}: record check failed, skipped", file=sys.stderr)
            continue
        urls = [data["primaryImage"], *(data.get("additionalImages") or [])]
        for view, url in enumerate(urls):
            clean = urllib.parse.quote(url, safe=":/")
            if not host_allowed(clean):
                print(f"{object_id}: host not allowed: {url}", file=sys.stderr)
                continue
            payload, _ = fetch(clean)
            image_format, _, width, height = inspect(payload)
            path = DIRECTORY / f"{object_id}_{view}{SUFFIXES[image_format]}"
            if path.exists():
                raise FileExistsError(path)
            path.write_bytes(payload)
            rows.append({
                "met_object_id": object_id, "accession": candidate["accession"], "view": view, "image_url": url,
                "file_name": path.name, "format": image_format, "width": width, "height": height,
                "bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest(),
                "is_public_domain": data["isPublicDomain"], "rights_note": data.get("rightsAndReproduction", ""),
                "retrieved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            })
            print(f"{path.name}: {image_format} {width}x{height}")
            time.sleep(PAUSE_SECONDS)
    with OUTPUT.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    return 0


if __name__ == "__main__":
    sys.exit(main())
