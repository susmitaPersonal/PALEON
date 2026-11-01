import io

import pytest
from PIL import Image

from src.manifest import COLUMNS, check_rows, coverage, to_rows
from src.preprocess import normalize_image


def jpeg_with_exif(size=(3000, 1000)) -> bytes:
    image = Image.new("RGB", size, "gray")
    exif = Image.Exif()
    exif[0x010F] = "SecretCameraMaker"
    exif[0x0112] = 6        # Rotate 90 degrees to display correctly.
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", exif=exif)
    return buffer.getvalue()


def test_resizes_to_longest_edge_and_applies_orientation():
    data, mime = normalize_image(jpeg_with_exif(), longest_edge=1024)
    assert mime == "image/jpeg"
    assert Image.open(io.BytesIO(data)).size == (341, 1024)


def test_strips_metadata():
    data, _ = normalize_image(jpeg_with_exif())
    assert b"SecretCameraMaker" not in data
    assert not dict(Image.open(io.BytesIO(data)).getexif())


def test_small_image_is_not_upscaled():
    buffer = io.BytesIO()
    Image.new("RGB", (100, 80)).save(buffer, format="PNG")
    assert Image.open(io.BytesIO(normalize_image(buffer.getvalue())[0])).size == (100, 80)


def test_corrupt_image_is_rejected():
    with pytest.raises(Exception):
        normalize_image(b"not an image")


def base_row(**overrides) -> dict:
    row = {column: "" for column in COLUMNS}
    row.update(image_id="a1", split="dev", gold_class="in_scope", script_label="brahmi", institution="Museum",
               object_id="1", source_url="https://example.org/1", licence="CC0", redistribution="allowed",
               image_quality="unassessed", label_status="verified_institution",
               label_evidence_url="https://example.org/1")
    row.update(overrides)
    return row


def test_valid_row_has_no_problems():
    assert check_rows([base_row()]) == []


@pytest.mark.parametrize("override,fragment", [
    ({"gold_class": "maybe"}, "gold_class"),
    ({"script_label": "ogham"}, "in-scope label"),
    ({"gold_class": "out_of_scope", "script_label": "latin"}, "out-of-scope label"),
    ({"gold_class": "no_writing", "script_label": "latin"}, "no-writing"),
    ({"label_status": "likely"}, "label_status"),
    ({"label_evidence_url": ""}, "label_evidence_url"),
    ({"redistribution": "probably"}, "redistribution"),
    ({"image_quality": "great"}, "image_quality"),
    ({"licence": ""}, "licence"),
])
def test_bad_rows_are_reported(override, fragment):
    assert any(fragment in problem for problem in check_rows([base_row(**override)]))


def test_duplicate_id_and_duplicate_object_are_reported():
    problems = check_rows([base_row(), base_row(), base_row(image_id="a2")])
    assert any("duplicate image_id" in p for p in problems)
    assert any("duplicate object" in p for p in problems)


def test_unverified_labels_never_count():
    rows = to_rows([base_row(), base_row(image_id="a2", object_id="2", label_status="secondary_source"),
                    base_row(image_id="a3", object_id="3", label_status="unverified"),
                    base_row(image_id="a4", object_id="4", label_status="implied_record")])
    assert [r.eligible_for_metrics for r in rows] == [True, False, False, False]
    assert coverage(rows)["brahmi"] == {"target": 5, "verified": 1, "shortfall": 4}


def test_reserve_rows_never_count():
    assert not to_rows([base_row(split="reserve")])[0].eligible_for_metrics


def test_real_manifest_passes_all_checks():
    from pathlib import Path

    from src.manifest import read_csv
    path = Path(__file__).resolve().parents[1] / "dataset" / "manifest.csv"
    assert check_rows(read_csv(path)) == []


def test_manifest_counts_match_the_documented_state():
    from pathlib import Path

    from src.manifest import read_csv
    rows = to_rows(read_csv(Path(__file__).resolve().parents[1] / "dataset" / "manifest.csv"))
    assert sum(r.eligible_for_metrics for r in rows if r.gold_class == "in_scope") == 29
    assert sum(r.eligible_for_metrics for r in rows if r.gold_class != "in_scope") == 10
    assert coverage(rows)["greek"]["shortfall"] == 1
