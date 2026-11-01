"""Q-10 tests. Temporary files for the code, and the committed records and local images where they exist."""
from pathlib import Path

import pytest
from PIL import Image, ImageChops

from src.crops import (MARGIN_METHOD, MIN_RING_PAPER_SHARE, Box, CropError, clear_regions, paper_ring, read_rows)
from src.dataset_check import check_margin_regions
from src.manifest import load_manifest
from src.metrics import required_count

ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "dataset"
ORIGINALS = ROOT / "data" / "images"
PROCESSED = ROOT / "data" / "processed"
PAPER = (240, 238, 236)


def plate(path: Path) -> Path:
    """Paper with a dark impression on the left and a printed mark on the right."""
    image = Image.new("RGB", (200, 100), PAPER)
    image.paste((30, 30, 30), (0, 0, 100, 100))
    image.paste((10, 10, 10), (150, 40, 160, 60))
    image.save(path, format="PNG")
    return path


def margin_crop(**overrides):
    values = dict(image_id="a1", method=MARGIN_METHOD, source_width="200", source_height="100")
    values.update(overrides)
    return values


def region(**overrides):
    values = dict(image_id="a1", region_id="a1-1", left="140", top="30", right="170", bottom="70",
                  ring_paper_share="0.950", fill_rgb="f0eeec")
    values.update(overrides)
    return values


def test_only_the_recorded_region_changes(tmp_path):
    source = plate(tmp_path / "plate.png")
    target = tmp_path / "out" / "plate.png"
    area = Box(140, 30, 170, 70)
    size, fills = clear_regions(source, Box(0, 0, 200, 100), [area], target)
    assert size == (200, 100) and fills[0]["fill_rgb"] == "f0eeec" and fills[0]["ring_paper_share"] == 1.0
    with Image.open(source) as before, Image.open(target) as after:
        assert ImageChops.difference(before.convert("RGB"), after.convert("RGB")).getbbox() == (150, 40, 160, 60)
        assert after.convert("RGB").getpixel((155, 50)) == PAPER


def test_fill_comes_from_the_surrounding_paper_not_white(tmp_path):
    source = plate(tmp_path / "plate.png")
    with Image.open(source) as image:
        assert paper_ring(image.convert("RGB"), Box(140, 30, 170, 70))[1] == PAPER


def test_a_region_on_the_inked_impression_is_refused(tmp_path):
    source = plate(tmp_path / "plate.png")
    target = tmp_path / "out" / "plate.png"
    with pytest.raises(CropError, match="not surrounded by blank paper"):
        clear_regions(source, Box(0, 0, 200, 100), [Box(40, 30, 70, 70)], target)
    assert not target.exists()


def test_a_region_straddling_the_impression_edge_is_refused(tmp_path):
    source = plate(tmp_path / "plate.png")
    with pytest.raises(CropError, match="not surrounded by blank paper"):
        clear_regions(source, Box(0, 0, 200, 100), [Box(85, 30, 115, 70)], tmp_path / "out" / "plate.png")


def test_one_fill_cannot_colour_the_next_ring(tmp_path):
    source = plate(tmp_path / "plate.png")
    _, fills = clear_regions(source, Box(0, 0, 200, 100), [Box(140, 30, 170, 70), Box(140, 71, 170, 90)],
                             tmp_path / "out" / "plate.png")
    assert [fill["fill_rgb"] for fill in fills] == ["f0eeec", "f0eeec"]


def test_clearing_never_overwrites_or_writes_beside_the_source(tmp_path):
    source = plate(tmp_path / "plate.png")
    with pytest.raises(CropError, match="apart from originals"):
        clear_regions(source, Box(0, 0, 200, 100), [], tmp_path / "other.png")
    (tmp_path / "out").mkdir()
    taken = plate(tmp_path / "out" / "taken.png")
    with pytest.raises(CropError, match="already exists"):
        clear_regions(source, Box(0, 0, 200, 100), [], taken)


def test_clearing_is_deterministic(tmp_path):
    source = plate(tmp_path / "plate.png")
    first, second = tmp_path / "a" / "x.png", tmp_path / "b" / "x.png"
    clear_regions(source, Box(0, 0, 200, 100), [Box(140, 30, 170, 70)], first)
    clear_regions(source, Box(0, 0, 200, 100), [Box(140, 30, 170, 70)], second)
    assert first.read_bytes() == second.read_bytes()


def test_matching_crop_and_regions_pass():
    assert check_margin_regions([margin_crop()], [region()]) == []


@pytest.mark.parametrize("crops, regions, expected", [
    ([margin_crop()], [], "has no recorded regions"),
    ([], [region()], "without a margin-cleared crop"),
    ([margin_crop()], [region(right="900")], "ends outside"),
    ([margin_crop()], [region(ring_paper_share="0.500")], "failed the paper check"),
    ([margin_crop()], [region(fill_rgb="")], "has no recorded fill"),
])
def test_bad_margin_records_are_reported(crops, regions, expected):
    assert any(expected in problem for problem in check_margin_regions(crops, regions))


# The tests below check the committed Q-10 records themselves.

def test_q10_accepts_two_plates_as_complete_samples():
    rows = {row.image_id: row for row in load_manifest(DATASET / "manifest.csv")}
    for image_id in ("SE003", "SE004"):
        raw = rows[image_id].raw
        assert raw["stage_c_status"] == "accepted" and rows[image_id].eligible_for_metrics
        assert raw["sample_type"] == "complete" and raw["evaluation_scope"] == ""
        assert raw["script_label"] == "brahmi"


def test_se010_stays_held_because_its_numbers_sit_on_the_impression():
    row = next(r for r in load_manifest(DATASET / "manifest.csv") if r.image_id == "SE010")
    assert row.raw["stage_c_status"] == "held" and not row.eligible_for_metrics
    assert "on or at the inked impression" in row.raw["stage_c_reason"]
    assert not [r for r in read_rows(DATASET / "margin_regions.csv") if r["image_id"] == "SE010"]


def test_every_recorded_region_passed_the_paper_check():
    regions = read_rows(DATASET / "margin_regions.csv")
    assert {r["image_id"] for r in regions} == {"SE003", "SE004"}
    assert all(float(r["ring_paper_share"]) >= MIN_RING_PAPER_SHARE for r in regions)
    assert {r["kind"] for r in regions} == {"caption", "line_number"}


def test_superseded_crops_are_not_rebuilt():
    status = {r["image_id"]: r["status"] for r in read_rows(DATASET / "proposed_crops.csv")}
    assert {r["image_id"] for r in read_rows(DATASET / "margin_boxes.csv")} == \
        {image_id for image_id, value in status.items() if "superseded" in value}


def test_gates_follow_the_new_denominator():
    assert required_count("top1", 24) == 12 and required_count("top3", 24) == 20
    assert required_count("reproducibility", 24) == 20


@pytest.mark.parametrize("image_id", ["SE003", "SE004"])
def test_only_recorded_blank_paper_pixels_differ_from_the_original(image_id):
    source, cleared = ORIGINALS / f"{image_id}.jpg", PROCESSED / f"{image_id}.png"
    if not source.exists() or not cleared.exists():
        pytest.skip("images are gitignored and absent here")
    crop = next(r for r in read_rows(DATASET / "crop_metadata.csv") if r["image_id"] == image_id)
    left, top, right, bottom = (int(crop[key]) for key in ("left", "top", "right", "bottom"))
    with Image.open(source) as image, Image.open(cleared) as after:
        original = image.convert("RGB").crop((left, top, right, bottom))
        result = after.convert("RGB")
    # Blanking the recorded regions in both images must leave them identical.
    for image in (original, result):
        for row in read_rows(DATASET / "margin_regions.csv"):
            if row["image_id"] == image_id:
                image.paste((0, 0, 0), (int(row["left"]) - left, int(row["top"]) - top,
                                        int(row["right"]) - left, int(row["bottom"]) - top))
    assert ImageChops.difference(original, result).getbbox() is None
