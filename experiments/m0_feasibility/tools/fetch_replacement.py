"""Fetch the approved larger file for SE001, after checking its record. Stage C.1 only.

The original web image and its inventory entry are left untouched.
"""
import csv
import hashlib
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

from src.crops import similarity
from tools.fetch_images import IMAGE_DIR, USER_AGENT, fetch, host_allowed

ROOT = Path(__file__).resolve().parents[1]
RECORD_API = "https://openaccess-api.clevelandart.org/api/artworks/1982.44.a"
EXPECTED_ACCESSION = "1982.44.a"
OUTPUT = ROOT / "dataset" / "replacement_images.csv"
FIELDS = ("image_id", "replaces_file", "replaces_sha256", "replacement_file", "replacement_sha256", "replacement_url",
          "source_record", "record_accession", "manifest_accession", "record_title", "licence", "width", "height",
          "record_width", "record_height", "bytes", "similarity_to_original", "same_object", "retrieved_at")


def main() -> int:
    request = urllib.request.Request(RECORD_API, headers={"User-Agent": USER_AGENT})
    record = json.load(urllib.request.urlopen(request, timeout=60))["data"]
    url = record["images"]["print"]["url"]
    if record["accession_number"] != EXPECTED_ACCESSION or record["share_license_status"] != "CC0":
        print("record check failed", file=sys.stderr)
        return 1
    if not host_allowed(url):
        print(f"host not allowed: {url}", file=sys.stderr)
        return 1
    destination = IMAGE_DIR / "SE001_print.jpg"
    if destination.exists():
        print(f"{destination} already exists", file=sys.stderr)
        return 1
    data, _ = fetch(url)
    destination.write_bytes(data)
    original = IMAGE_DIR / "SE001.jpg"
    with Image.open(destination) as image:
        width, height = image.size
    score = similarity(original, destination)
    row = {
        "image_id": "SE001", "replaces_file": original.name,
        "replaces_sha256": hashlib.sha256(original.read_bytes()).hexdigest(),
        "replacement_file": destination.name, "replacement_sha256": hashlib.sha256(data).hexdigest(),
        "replacement_url": url, "source_record": record["url"], "record_accession": record["accession_number"],
        "manifest_accession": EXPECTED_ACCESSION, "record_title": record["title"],
        "licence": record["share_license_status"], "width": width, "height": height,
        "record_width": record["images"]["print"]["width"], "record_height": record["images"]["print"]["height"],
        "bytes": len(data), "similarity_to_original": round(score, 5), "same_object": "yes" if score > 0.98 else "no",
        "retrieved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    with OUTPUT.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerow(row)
    print(row)
    return 0


if __name__ == "__main__":
    sys.exit(main())
