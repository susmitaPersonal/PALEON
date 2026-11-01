"""Stage C.2 regression tests for excerpts, separated metrics, and hard negatives."""
import inspect
from pathlib import Path

import pytest

from src import images, run
from src.crops import read_rows
from src.dataset_check import check_crops, check_decisions, check_hard_negatives, validate_dataset
from src.manifest import check_rows, eligible_rows, gold_items, load_manifest, to_rows
from src.metrics import GoldItem, score_view, subgroup_results
from tests.helpers import gold, record
from tests.test_crops import PROCESSED, crop_record, review_record
from tests.test_dataset_check import SHA, entry, row

ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "dataset"
SCOPE = {"sample_type": "excerpt", "evaluation_scope": "script_identification_only"}


def excerpt_row(**overrides):
    return row(processed_sha256=PROCESSED, **SCOPE, **overrides)


def excerpt_problems(**review):
    values = dict(boundary_clipping="no", answer_clues_absent="yes", inscription_complete="no")
    values.update(review)
    return check_crops(to_rows([excerpt_row()]), [entry()], [], [crop_record()], [review_record(**values)])


def image_record(**overrides):
    values = dict(met_object_id="1", file_name="1_0.jpg", sha256="f" * 64)
    values.update(overrides)
    return values


def review(**overrides):
    values = dict(met_object_id="1", accession="H.1", status="held", decision_reason="uncertain")
    values.update(overrides)
    return values


def real_rows():
    return {r.image_id: r for r in load_manifest(DATASET / "manifest.csv")}


def real_reviews():
    return {r["met_object_id"]: r for r in read_rows(DATASET / "hard_negative_review.csv")}


def test_clean_excerpt_may_be_accepted_though_incomplete():
    assert excerpt_problems() == []


@pytest.mark.parametrize("field,value", [("boundary_clipping", "yes"), ("boundary_clipping", ""),
                                         ("answer_clues_absent", "no")])
def test_excerpt_with_clipping_or_clues_cannot_be_accepted(field, value):
    assert any("fails the boundary or clue check" in p for p in excerpt_problems(**{field: value}))


def test_excerpt_still_needs_legible_intact_characters():
    assert any("characters_intact" in p for p in excerpt_problems(characters_intact="partial"))


def test_complete_sample_cannot_skip_the_completeness_check():
    rows = to_rows([row(processed_sha256=PROCESSED)])
    problems = check_crops(rows, [entry()], [], [crop_record()], [review_record(inscription_complete="no")])
    assert any("inscription_complete" in p for p in problems)


def test_excerpt_must_be_limited_to_script_identification():
    bad = excerpt_row()
    bad["evaluation_scope"] = ""
    assert any("must be limited" in p for p in check_rows([bad]))


def test_invalid_sample_type_is_rejected():
    assert any("invalid sample_type" in p for p in check_rows([row(sample_type="partial")]))


def test_accepted_row_needs_a_sample_type():
    assert any("without a sample_type" in p for p in check_decisions(to_rows([row(sample_type="")])))


def test_gold_items_carry_the_sample_type():
    assert gold_items(to_rows([excerpt_row()]))[0].sample_type == "excerpt"


def test_complete_and_excerpt_results_are_separate():
    records = [record("a", r, ["brahmi"]) for r in (1, 2, 3)] + [record("b", r, ["latin"]) for r in (1, 2, 3)]
    items = [GoldItem("a", "in_scope", "brahmi", sample_type="complete"),
             GoldItem("b", "in_scope", "greek", sample_type="excerpt")]
    groups = subgroup_results(records, items, 3)
    assert (groups["complete"]["top1"]["k"], groups["complete"]["top1"]["n"]) == (1, 1)
    assert (groups["excerpt"]["top1"]["k"], groups["excerpt"]["top1"]["n"]) == (0, 1)


def test_rejection_is_reported_for_each_class():
    records = [record("a", r, disposition="outside_supported_set") for r in (1, 2, 3)]
    records += [record("b", r, ["latin"]) for r in (1, 2, 3)]
    records += [record("c", r, disposition="no_writing") for r in (1, 2, 3)]
    items = [gold("a", "cuneiform", "out_of_scope"), gold("b", "egyptian_hieroglyphs", "out_of_scope"),
             gold("c", "no_writing", "no_writing")]
    view = score_view(records, items, 3, "after_retry")
    assert {k: (v["k"], v["n"]) for k, v in view["rejection_by_class"].items()} == {
        "cuneiform": (1, 1), "egyptian_hieroglyphs": (0, 1), "no_writing": (1, 1)}


def test_valid_hard_negative_records_pass():
    assert check_hard_negatives([image_record()], [review()], []) == []


def test_downloaded_candidate_needs_an_inspection_record():
    assert any("without an inspection record" in p for p in check_hard_negatives([image_record()], [], []))


def test_candidate_status_must_be_known():
    assert any("invalid status" in p for p in check_hard_negatives([], [review(status="maybe")], []))


def test_candidate_status_needs_a_reason():
    assert any("needs a reason" in p for p in check_hard_negatives([], [review(decision_reason="")], []))


def test_accepted_candidate_must_be_in_the_manifest():
    assert any("not in the manifest" in p for p in check_hard_negatives([], [review(status="accepted")], []))


def test_uncounted_candidate_cannot_reach_the_metrics():
    rows = to_rows([row(object_id="H.1")])
    assert any("reaches the metrics" in p for p in check_hard_negatives([], [review()], rows))


def test_candidate_image_cannot_also_be_in_the_dataset():
    assert any("also in the dataset" in p
               for p in check_hard_negatives([image_record(sha256=SHA)], [review()], to_rows([row()])))


def test_changed_hard_negative_file_is_reported(tmp_path):
    (tmp_path / "1_0.jpg").write_bytes(b"changed")
    assert any("hash differs" in p for p in check_hard_negatives([image_record()], [review()], [], tmp_path))


def test_missing_hard_negative_file_is_reported(tmp_path):
    assert any("is missing" in p for p in check_hard_negatives([image_record()], [review()], [], tmp_path))


def test_validate_dataset_includes_hard_negatives():
    problems = validate_dataset(to_rows([row()]), [entry()], hard_negative_images=[image_record()])
    assert any("without an inspection record" in p for p in problems)


# The tests below check the committed Stage C.2 records themselves.

def test_failed_excerpts_stay_held_and_marked():
    # SE003 and SE004 left this group under Q-10. See test_margin_clearing.py.
    item = real_rows()["SE010"]
    assert item.raw["sample_type"] == "excerpt"
    assert item.raw["evaluation_scope"] == "script_identification_only"
    assert item.raw["stage_c_status"] == "held" and not item.eligible_for_metrics


def test_recorded_clipping_matches_the_held_decisions():
    review_by_id = {r["image_id"]: r for r in read_rows(DATASET / "crop_review.csv")}
    assert review_by_id["SE010"]["boundary_clipping"] == "yes"
    assert [i for i in ("SE001", "SE003", "SE004", "SE005") if review_by_id[i]["boundary_clipping"] != "no"] == []


def test_user_held_rows_stay_held():
    rows = real_rows()
    assert rows["SE002"].raw["stage_c_status"] == "held" and rows["SE008"].raw["stage_c_status"] == "held"
    assert rows["SE008"].raw["redistribution"] == "unknown"


def test_held_and_excluded_rows_cannot_enter_the_evaluation_dataset():
    rows = list(real_rows().values())
    counted = {r.image_id for r in eligible_rows(rows)}
    assert not counted & {"SE002", "SE008", "SE009", "SE010", "SE019", "SE028", "RS001", "RS002", "RS003"}
    assert len(counted) == 34 and {g.image_id for g in gold_items(rows)} == counted


def test_every_counted_row_has_a_sample_type():
    assert {r.raw["sample_type"] for r in eligible_rows(list(real_rows().values()))} == {"complete"}


def test_counted_crops_cannot_fall_back_to_captioned_originals():
    rows = real_rows()
    assert rows["SE001"].raw["processed_sha256"] and rows["SE005"].raw["processed_sha256"]
    assert "_load_processed" in inspect.getsource(images.LocalImageSource.__call__)


def test_no_hard_negative_counts_or_enters_the_manifest():
    accessions = {r.object_id for r in real_rows().values() if r.raw["split"] == "dev"}
    reviews = real_reviews()
    assert len(reviews) == 5 and all(r["counted"] == "no" and r["status"] != "accepted" for r in reviews.values())
    assert not {r["accession"] for r in reviews.values()} & accessions


def test_hard_negative_decisions_are_recorded():
    statuses = {key: review_["status"] for key, review_ in real_reviews().items()}
    assert statuses == {"308335": "held", "244044": "held", "327236": "held", "321478": "excluded", "549748": "excluded"}


def test_every_hard_negative_image_is_recorded_with_a_hash():
    files = read_rows(DATASET / "hard_negative_images.csv")
    assert len(files) == 10 and all(len(f["sha256"]) == 64 for f in files)
    assert {f["met_object_id"] for f in files} == set(real_reviews())


def test_hard_negatives_are_kept_out_of_the_evaluation_image_folder():
    assert run.HARD_NEGATIVE_DIR.name == "hard_negatives" and run.HARD_NEGATIVE_DIR != run.IMAGE_DIR
    assert run.HARD_NEGATIVE_DIR != run.PROCESSED_DIR


def test_se001_keeps_its_label_with_the_parallel_noted_honestly():
    item = real_rows()["SE001"]
    assert item.script_label == "brahmi" and item.label_status == "verified_institution"
    assert "parallel, not independent evidence" in item.raw["notes"]


def test_no_stage_changed_a_label():
    changes = read_rows(DATASET / "manifest_changes.csv")
    assert {c["stage"] for c in changes} == {"C", "C.1", "C.2", "Q-10"}
    assert not [c for c in changes if c["field"] in {"script_label", "gold_class", "label_status"}]
