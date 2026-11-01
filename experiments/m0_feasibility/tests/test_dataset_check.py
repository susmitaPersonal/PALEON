"""Stage C integrity tests. They build small temporary files and need no real images."""
import hashlib
from pathlib import Path

import pytest

from src.crops import read_rows as read_inventory
from src.dataset_check import (check_decisions, check_files, check_inventory, check_licences, sha256_file,
                               validate_dataset)
from src.manifest import (STAGE_C_ACCEPTED, STAGE_C_EXCLUDED, STAGE_C_HELD, STAGE_C_NOT_ACQUIRED, ManifestError,
                          check_rows, eligible_rows, gold_items, load_manifest, to_rows)
from tests.test_preprocess_and_manifest import base_row

ROOT = Path(__file__).resolve().parents[1]
DATA = b"synthetic image bytes"
SHA = hashlib.sha256(DATA).hexdigest()


def row(image_id="a1", object_id="1", **overrides):
    values = dict(image_id=image_id, object_id=object_id, sha256=SHA, image_seen="yes", image_quality="good",
                  licence_url="https://example.org/licence", stage_c_status=STAGE_C_ACCEPTED,
                  source_url=f"https://example.org/{image_id}", image_file_url=f"https://example.org/{image_id}.jpg",
                  sample_type="complete")
    values.update(overrides)
    return base_row(**values)


def entry(image_id="a1", **overrides):
    values = dict(image_id=image_id, source_record=f"https://example.org/{image_id}",
                  image_file_url=f"https://example.org/{image_id}.jpg", file_name=f"{image_id}.jpg", format="JPEG",
                  mode="RGB", width="10", height="10", bytes=str(len(DATA)), sha256=SHA, content_type="image/jpeg",
                  retrieved_at="2026-11-01T00:00:00+00:00")
    values.update(overrides)
    return values


def test_valid_dataset_has_no_problems(tmp_path):
    (tmp_path / "a1.jpg").write_bytes(DATA)
    assert validate_dataset(to_rows([row()]), [entry()], tmp_path) == []


def test_hash_helper_matches_hashlib(tmp_path):
    path = tmp_path / "f"
    path.write_bytes(DATA)
    assert sha256_file(path) == SHA


def test_changed_image_fails_hash_verification(tmp_path):
    (tmp_path / "a1.jpg").write_bytes(b"synthetic image byteZ")
    assert any("hash differs" in p for p in check_files([entry()], tmp_path))


def test_changed_size_is_reported(tmp_path):
    (tmp_path / "a1.jpg").write_bytes(DATA + b"!")
    assert any("size differs" in p for p in check_files([entry()], tmp_path))


def test_missing_image_is_reported(tmp_path):
    assert check_files([entry()], tmp_path) == ["a1: image file is missing"]


def test_unexpected_file_on_disk_is_reported(tmp_path):
    (tmp_path / "a1.jpg").write_bytes(DATA)
    (tmp_path / "stray.jpg").write_bytes(DATA)
    assert check_files([entry()], tmp_path) == ["stray.jpg: file on disk has no inventory entry"]


def test_row_marked_acquired_but_missing_from_inventory():
    assert check_inventory(to_rows([row()]), []) == ["a1: marked acquired but missing from the inventory"]


def test_duplicate_hash_across_images_is_reported():
    rows = to_rows([row(), row(image_id="a2", object_id="2")])
    assert any("same image as a1" in p for p in check_inventory(rows, [entry(), entry("a2")]))


def test_duplicate_inventory_entry_is_reported():
    assert any("duplicate inventory entry" in p for p in check_inventory(to_rows([row()]), [entry(), entry()]))


def test_inventory_entry_without_manifest_row_is_reported():
    assert any("not the manifest" in p for p in check_inventory(to_rows([row()]), [entry(), entry("ghost")]))


@pytest.mark.parametrize("override,fragment", [
    ({"image_file_url": "https://example.org/other.jpg"}, "URL does not match"),
    ({"source_record": "https://example.org/other"}, "source record does not match"),
    ({"sha256": "0" * 64}, "hash does not match"),
    ({"file_name": "a2.jpg"}, "mapped to another image"),
])
def test_incorrect_image_mappings_are_reported(override, fragment):
    assert any(fragment in p for p in check_inventory(to_rows([row()]), [entry(**override)]))


def test_file_for_a_row_that_should_not_be_acquired_is_reported():
    rows = to_rows([row(stage_c_status=STAGE_C_NOT_ACQUIRED, stage_c_reason="reserve")])
    assert any("should not be acquired" in p for p in check_inventory(rows, [entry()]))


@pytest.mark.parametrize("override,fragment", [
    ({"redistribution": "unknown"}, "acquired with redistribution"),
    ({"redistribution": "link_only"}, "acquired with redistribution"),
    ({"licence_url": ""}, "licence_url is required"),
    ({"licence": "CC BY 4.0", "redistribution": "allowed"}, "needs attribution text"),
    ({"licence": "CC BY 4.0", "redistribution": "allowed_with_attribution", "attribution": ""}, "needs attribution text"),
])
def test_licence_metadata_problems_are_reported(override, fragment):
    assert any(fragment in p for p in check_licences(to_rows([row(**override)])))


def test_complete_attribution_licence_passes():
    rows = to_rows([row(licence="CC BY 4.0", redistribution="allowed_with_attribution", attribution="A, museum")])
    assert check_licences(rows) == []


def test_licences_of_uncounted_rows_are_not_checked():
    assert check_licences(to_rows([row(stage_c_status=STAGE_C_NOT_ACQUIRED, redistribution="unknown")])) == []


@pytest.mark.parametrize("status", [STAGE_C_EXCLUDED, STAGE_C_HELD])
def test_excluded_and_held_rows_never_count(status):
    rows = to_rows([row(stage_c_status=status, stage_c_reason="reason")])
    assert not rows[0].eligible_for_metrics
    assert gold_items(rows) == [] and eligible_rows(rows) == []
    assert check_decisions(rows) == []


@pytest.mark.parametrize("status", [STAGE_C_EXCLUDED, STAGE_C_HELD])
def test_exclusion_needs_a_reason(status):
    assert any("needs a reason" in p for p in check_decisions(to_rows([row(stage_c_status=status)])))


def test_blank_status_does_not_count():
    assert not to_rows([row(stage_c_status="")])[0].eligible_for_metrics


def test_unknown_status_is_rejected_by_the_manifest_check():
    assert any("stage_c_status" in p for p in check_rows([row(stage_c_status="maybe")]))


def test_accepted_row_must_have_been_seen():
    assert any("without being seen" in p for p in check_decisions(to_rows([row(image_seen="no")])))


def test_accepted_row_must_have_a_quality_assessment():
    assert any("unassessed" in p for p in check_decisions(to_rows([row(image_quality="unassessed")])))


def test_accepted_row_with_an_unverified_label_is_reported():
    assert any("not eligible" in p for p in check_decisions(to_rows([row(label_status="implied_record")])))


# The tests below check the committed Stage C records themselves.

def real_rows():
    return load_manifest(ROOT / "dataset" / "manifest.csv")


def real_inventory():
    return read_inventory(ROOT / "dataset" / "image_inventory.csv")


def real_records():
    dataset = ROOT / "dataset"
    return {name: read_inventory(dataset / f"{file}.csv") for name, file in (
        ("replacements", "replacement_images"), ("crops", "crop_metadata"), ("reviews", "crop_review"),
        ("margin_regions", "margin_regions"))}


def test_real_manifest_and_inventory_are_consistent():
    assert validate_dataset(real_rows(), real_inventory(), **real_records()) == []


def test_real_files_match_the_inventory_where_images_are_present():
    image_dir = ROOT / "data" / "images"
    if not image_dir.exists() or not any(image_dir.iterdir()):
        pytest.skip("images are gitignored and not present on this machine")
    assert check_files(real_inventory(), image_dir, real_records()["replacements"]) == []


def test_real_reserve_rows_stay_separate():
    rows = real_rows()
    reserves = [r for r in rows if r.raw["split"] == "reserve"]
    assert len(reserves) == 3
    assert all(r.raw["stage_c_status"] == STAGE_C_NOT_ACQUIRED and not r.eligible_for_metrics for r in reserves)
    assert not {r.image_id for r in reserves} & {e["image_id"] for e in real_inventory()}


def test_real_implied_label_row_was_not_acquired():
    row_ = next(r for r in real_rows() if r.label_status == "implied_record" and r.raw["split"] == "dev")
    assert row_.image_id == "SE019" and not row_.eligible_for_metrics
    assert row_.image_id not in {e["image_id"] for e in real_inventory()}


def test_script_labels_are_unchanged_from_the_baseline_order():
    labels = [r.script_label for r in real_rows()]
    assert labels[:5] == ["brahmi"] * 5 and labels[5:10] == ["kharosthi"] * 5 and labels[10:15] == ["phoenician"] * 5


def test_load_manifest_rejects_an_invalid_status(tmp_path):
    import csv
    path = tmp_path / "m.csv"
    bad = row(stage_c_status="maybe")
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(bad))
        writer.writeheader()
        writer.writerow(bad)
    with pytest.raises(ManifestError, match="stage_c_status"):
        load_manifest(path)
