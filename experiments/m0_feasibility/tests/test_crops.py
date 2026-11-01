"""Stage C.1 tests. Temporary files only, apart from the checks of committed records at the end."""
import hashlib
import io
from pathlib import Path

import pytest
from PIL import Image

from src.crops import Box, CropError, apply_crop, read_rows, similarity, validate_box
from src.dataset_check import check_crops, check_files, check_licences, check_replacements, sha256_file
from src.images import ImageError, LocalImageSource
from src.manifest import ManifestRow, load_manifest, to_rows
from tests.test_dataset_check import SHA, entry, row

ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "dataset"
PROCESSED = "b" * 64


def picture(path: Path, size=(40, 30), colour="white") -> Path:
    image = Image.new("RGB", size, colour)
    image.putpixel((5, 5), (255, 0, 0))
    image.save(path, format="PNG")
    return path


def crop_record(**overrides):
    values = dict(image_id="a1", source_file="a1.jpg", source_sha256=SHA, source_width="40", source_height="30",
                  left="1", top="2", right="11", bottom="22", crop_width="10", crop_height="20",
                  processed_file="a1.png", processed_sha256=PROCESSED, method="m", method_version="v1")
    values.update(overrides)
    return values


def review_record(**overrides):
    values = dict(image_id="a1", inscription_visible="yes", captions_removed="yes", characters_intact="yes",
                  quality_sufficient="yes", inscription_complete="yes")
    values.update(overrides)
    return values


def replacement_record(**overrides):
    values = dict(image_id="a1", replaces_sha256=SHA, replacement_file="a1_print.jpg", replacement_sha256="c" * 64,
                  source_record="https://example.org/a1", record_accession="1", manifest_accession="1", licence="CC0",
                  width="100", height="80", record_width="100", record_height="80", same_object="yes")
    values.update(overrides)
    return values


def crop_problems(rows=None, crops=None, reviews=None):
    rows = to_rows([row(processed_sha256=PROCESSED)]) if rows is None else rows
    return check_crops(rows, [entry()], [], crops or [crop_record()], reviews or [review_record()])


@pytest.mark.parametrize("box", [Box(-1, 0, 5, 5), Box(0, -1, 5, 5), Box(0, 0, 41, 5), Box(0, 0, 5, 31), Box(5, 5, 5, 9),
                                 Box(5, 5, 9, 5), Box(9, 5, 5, 9)])
def test_invalid_crop_coordinates_are_rejected(box):
    with pytest.raises(CropError):
        validate_box(box, 40, 30)


def test_full_image_box_is_valid():
    validate_box(Box(0, 0, 40, 30), 40, 30)


def test_crop_has_exact_dimensions_and_pixels(tmp_path):
    source = picture(tmp_path / "s.png")
    target = tmp_path / "out" / "p.png"
    assert apply_crop(source, Box(5, 5, 15, 25), target) == (10, 20)
    with Image.open(target) as image:
        assert image.size == (10, 20)
        assert image.getpixel((0, 0)) == (255, 0, 0)


def test_crop_does_not_change_the_original(tmp_path):
    source = picture(tmp_path / "s.png")
    before = sha256_file(source)
    apply_crop(source, Box(0, 0, 10, 10), tmp_path / "out" / "p.png")
    assert sha256_file(source) == before


def test_crop_cannot_be_written_beside_originals(tmp_path):
    with pytest.raises(CropError, match="apart from originals"):
        apply_crop(picture(tmp_path / "s.png"), Box(0, 0, 10, 10), tmp_path / "p.png")


def test_crop_never_overwrites(tmp_path):
    target = tmp_path / "out" / "p.png"
    source = picture(tmp_path / "s.png")
    apply_crop(source, Box(0, 0, 10, 10), target)
    with pytest.raises(CropError, match="already exists"):
        apply_crop(source, Box(0, 0, 10, 10), target)


def test_valid_crop_record_passes():
    assert crop_problems() == []


def test_box_outside_the_source_is_reported():
    assert any("outside" in p for p in crop_problems(crops=[crop_record(right="99", crop_width="98")]))


def test_recorded_dimensions_must_match_the_box():
    assert any("dimensions do not match" in p for p in crop_problems(crops=[crop_record(crop_width="9")]))


def test_crop_source_must_be_a_recorded_image():
    assert any("not a recorded image" in p for p in crop_problems(crops=[crop_record(source_sha256="f" * 64)]))


def test_manifest_hash_must_match_the_crop_record():
    rows = to_rows([row(processed_sha256="d" * 64)])
    assert any("does not match the crop record" in p for p in crop_problems(rows=rows))


def test_processed_hash_without_a_crop_record_is_reported():
    rows = to_rows([row(), row(image_id="a2", object_id="2", processed_sha256="e" * 64)])
    assert any("a2: processed hash without a crop record" in p
               for p in check_crops(rows, [entry()], [], [], []))


def test_duplicate_processed_image_is_reported():
    rows = to_rows([row(processed_sha256=PROCESSED), row(image_id="a2", object_id="2", processed_sha256=PROCESSED)])
    crops = [crop_record(), crop_record(image_id="a2")]
    reviews = [review_record(), review_record(image_id="a2")]
    assert any("same processed image" in p for p in check_crops(rows, [entry()], [], crops, reviews))


def test_unchanged_image_cannot_pass_as_processed():
    rows = to_rows([row(processed_sha256=SHA)])
    assert any("nothing was cropped" in p for p in crop_problems(rows=rows, crops=[crop_record(processed_sha256=SHA)]))


def test_crop_needs_an_inspection_record():
    assert any("no inspection record" in p for p in check_crops(
        to_rows([row(processed_sha256=PROCESSED)]), [entry()], [], [crop_record()], []))


@pytest.mark.parametrize("field,value", [
    ("captions_removed", "no"), ("inscription_visible", "no"), ("characters_intact", "partial"),
    ("quality_sufficient", "no"), ("inscription_complete", "no"),
])
def test_accepted_crop_needs_a_passed_review(field, value):
    assert any(f"accepted with {field}" in p for p in crop_problems(reviews=[review_record(**{field: value})]))


def test_caption_check_may_be_not_applicable_for_a_photograph():
    assert crop_problems(reviews=[review_record(captions_removed="not_applicable")]) == []


def test_held_crop_may_fail_its_review():
    rows = to_rows([row(processed_sha256=PROCESSED, stage_c_status="held", stage_c_reason="r")])
    assert crop_problems(rows=rows, reviews=[review_record(inscription_complete="no")]) == []


def test_processed_file_is_hash_checked(tmp_path):
    (tmp_path / "a1.png").write_bytes(b"changed")
    rows = to_rows([row(processed_sha256=PROCESSED)])
    assert any("processed hash differs" in p
               for p in check_crops(rows, [entry()], [], [crop_record()], [review_record()], tmp_path))


def test_missing_processed_file_is_reported(tmp_path):
    rows = to_rows([row(processed_sha256=PROCESSED)])
    assert any("processed file is missing" in p
               for p in check_crops(rows, [entry()], [], [crop_record()], [review_record()], tmp_path))


def test_changed_original_fails_verification(tmp_path):
    (tmp_path / "a1.jpg").write_bytes(b"tampered")
    assert any("hash differs" in p for p in check_files([entry()], tmp_path))


def test_valid_replacement_passes():
    assert check_replacements(to_rows([row()]), [entry()], [replacement_record()]) == []


@pytest.mark.parametrize("override,fragment", [
    ({"record_accession": "9"}, "accession does not match"),
    ({"manifest_accession": "9"}, "accession does not match"),
    ({"source_record": "https://example.org/other"}, "source record does not match"),
    ({"licence": "CC BY"}, "replacement licence"),
    ({"same_object": "no"}, "not confirmed as the same object"),
    ({"width": "99"}, "dimensions differ"),
    ({"replaces_sha256": "0" * 64}, "does not point at the original"),
    ({"image_id": "ghost"}, "no manifest row"),
])
def test_bad_replacements_are_reported(override, fragment):
    assert any(fragment in p for p in check_replacements(to_rows([row()]), [entry()], [replacement_record(**override)]))


def test_replacement_needs_the_original_acquisition_record():
    assert any("original acquisition record is missing" in p
               for p in check_replacements(to_rows([row()]), [], [replacement_record()]))


def test_replacement_file_is_hash_checked(tmp_path):
    (tmp_path / "a1_print.jpg").write_bytes(b"x")
    assert any("replacement hash differs" in p for p in check_files([], tmp_path, [replacement_record()]))


def test_similarity_separates_a_resize_from_a_different_picture(tmp_path):
    def scene(mirrored: bool) -> Image.Image:
        image = Image.linear_gradient("L").resize((200, 150)).convert("RGB")
        image.paste((255, 0, 0), (20, 20, 90, 70))
        return image.transpose(Image.Transpose.ROTATE_180) if mirrored else image

    scene(False).save(tmp_path / "a.png")
    scene(False).resize((100, 75)).save(tmp_path / "b.png")
    scene(True).save(tmp_path / "c.png")
    assert similarity(tmp_path / "a.png", tmp_path / "b.png") > 0.99
    assert similarity(tmp_path / "a.png", tmp_path / "c.png") < 0.5


def image_row(processed_sha256=""):
    return ManifestRow("a1", "in_scope", "brahmi", "1", "verified_institution", "allowed",
                       {"sha256": "", "processed_sha256": processed_sha256})


def png_bytes():
    buffer = io.BytesIO()
    Image.new("RGB", (20, 10), "white").save(buffer, format="PNG")
    return buffer.getvalue()


def test_cropped_row_loads_its_processed_file(tmp_path):
    data = png_bytes()
    (tmp_path / "a1.png").write_bytes(data)
    source = LocalImageSource(tmp_path / "originals", 100, 90, tmp_path)
    assert source(image_row(hashlib.sha256(data).hexdigest()))[1] == "image/jpeg"


def test_cropped_row_never_falls_back_to_the_original(tmp_path):
    originals = tmp_path / "originals"
    originals.mkdir()
    (originals / "a1.png").write_bytes(png_bytes())
    with pytest.raises(ImageError, match="no processed image"):
        LocalImageSource(originals, 100, 90, tmp_path / "processed")(image_row("a" * 64))


def test_cropped_row_needs_a_processed_directory(tmp_path):
    with pytest.raises(ImageError, match="no processed image"):
        LocalImageSource(tmp_path, 100, 90)(image_row("a" * 64))


def test_processed_hash_mismatch_is_refused(tmp_path):
    (tmp_path / "a1.png").write_bytes(png_bytes())
    with pytest.raises(ImageError, match="processed sha256"):
        LocalImageSource(tmp_path, 100, 90, tmp_path)(image_row("a" * 64))


# The tests below check the committed Stage C.1 records themselves.

def real_rows():
    return {r.image_id: r for r in load_manifest(DATASET / "manifest.csv")}


def test_se008_is_not_counted_or_redistributable():
    item = real_rows()["SE008"]
    assert item.raw["stage_c_status"] == "held" and item.raw["redistribution"] == "unknown"
    assert not item.eligible_for_metrics
    assert item.raw["licence_url"] and item.raw["attribution"]


def test_every_accepted_row_has_a_clear_licence():
    assert check_licences(list(real_rows().values())) == []


def test_se009_is_excluded_with_a_reason():
    item = real_rows()["SE009"]
    assert item.raw["stage_c_status"] == "excluded" and "speckle" in item.raw["stage_c_reason"]


def test_every_captioned_plate_is_cropped_or_uncounted():
    rows = real_rows()
    plates = [r["image_id"] for r in read_rows(DATASET / "visual_review.csv") if r["medium"] == "printed_plate"]
    assert len(plates) == 6
    for image_id in plates:
        assert rows[image_id].raw["processed_sha256"]
    assert [i for i in plates if rows[i].eligible_for_metrics] == ["SE003", "SE004", "SE005"]


def test_replacement_keeps_identity_and_label():
    item = real_rows()["SE001"]
    assert (item.script_label, item.object_id) == ("brahmi", "1982.44.a")
    assert read_rows(DATASET / "replacement_images.csv")[0]["replaces_file"] == "SE001.jpg"


def test_no_script_label_was_ever_changed():
    changes = read_rows(DATASET / "manifest_changes.csv")
    assert changes and not [c for c in changes if c["field"] in {"script_label", "gold_class", "label_status"}]


def test_hard_negatives_are_researched_but_not_used():
    candidates = read_rows(DATASET / "hard_negative_candidates.csv")
    assert len(candidates) == 5
    assert all(c["downloaded"] == "no" and c["counted"] == "no" and "CC0" in c["licence"] for c in candidates)
    assert all(c["image_url"].startswith("https://images.metmuseum.org/") for c in candidates)


def test_prompt_hash_is_still_the_frozen_value():
    from src.runner import load_prompt
    assert load_prompt(ROOT / "prompts" / "eval_v1.md", "eval_v1").sha256.startswith("7240f44be2fd870f")
