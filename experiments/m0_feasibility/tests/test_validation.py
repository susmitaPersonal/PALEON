import json

import pytest

from src.schema import MAX_CANDIDATES, response_json_schema
from src.validation import scan_for_history, validate_output
from tests.helpers import valid_json, valid_payload


def test_valid_output_becomes_a_prediction():
    result = validate_output(valid_json("greek"))
    assert result.valid
    assert result.prediction().candidates == ["greek"]


@pytest.mark.parametrize("disposition", ["insufficient_evidence", "outside_supported_set", "no_writing"])
def test_abstentions_are_valid(disposition):
    assert validate_output(valid_json(disposition=disposition)).valid


@pytest.mark.parametrize("raw", ["", "not json", "```json\n{}\n```", "[]", "null", "<think>x</think>{}"])
def test_malformed_output_is_invalid(raw):
    assert not validate_output(raw).valid


def test_fenced_valid_json_is_not_silently_accepted():
    assert not validate_output(f"```json\n{valid_json()}\n```").valid


def test_extra_field_is_rejected():
    payload = valid_payload()
    payload["date"] = "unknown"
    assert not validate_output(json.dumps(payload)).valid


def test_unsupported_script_cannot_be_a_candidate():
    assert not validate_output(valid_json("cuneiform")).valid


def test_too_many_candidates_is_rejected():
    payload = valid_payload()
    base = payload["candidates"][0]
    payload["candidates"] = [{**base, "rank": i + 1, "script": s}
                             for i, s in enumerate(["brahmi", "greek", "latin", "runic"][:MAX_CANDIDATES + 1])]
    assert not validate_output(json.dumps(payload)).valid


def test_duplicate_scripts_are_rejected():
    payload = valid_payload()
    payload["candidates"] = [payload["candidates"][0], {**payload["candidates"][0], "rank": 2}]
    assert not validate_output(json.dumps(payload)).valid


def test_ranks_must_be_contiguous():
    payload = valid_payload()
    payload["candidates"][0]["rank"] = 2
    assert not validate_output(json.dumps(payload)).valid


def test_candidate_needs_supporting_evidence():
    payload = valid_payload()
    payload["candidates"][0]["supporting_evidence"] = []
    assert not validate_output(json.dumps(payload)).valid


def test_identified_without_candidates_is_rejected():
    assert not validate_output(json.dumps(valid_payload(candidates=[]))).valid


def test_abstaining_with_a_candidate_is_rejected():
    payload = valid_payload(disposition="outside_supported_set")
    payload["candidates"] = valid_payload()["candidates"]
    assert not validate_output(json.dumps(payload)).valid


def test_abstaining_needs_a_reason():
    payload = valid_payload(disposition="insufficient_evidence", abstention_reason=None)
    assert not validate_output(json.dumps(payload)).valid


def test_no_writing_contradiction_is_rejected():
    payload = valid_payload(disposition="no_writing")
    payload["observations"]["writing_present"] = True
    assert not validate_output(json.dumps(payload)).valid


@pytest.mark.parametrize("text,flag", [
    ("Dates to 250 BCE", "year"),
    ("from the third century", "century"),
    ("see https://example.org", "url"),
    ("according to Smith", "citation"),
])
def test_history_scan_finds_content(text, flag):
    assert flag in scan_for_history([text])


def test_history_scan_ignores_plain_description():
    assert scan_for_history(["three parallel vertical strokes"]) == []


def test_history_in_free_text_is_flagged_but_still_valid():
    payload = valid_payload()
    payload["candidates"][0]["supporting_evidence"] = ["typical of 300 BC"]
    result = validate_output(json.dumps(payload))
    assert result.valid and result.history_flags == ["year"]


def test_schema_offers_no_history_or_url_fields():
    dumped = json.dumps(response_json_schema()).lower()
    for forbidden in ("url", "citation", "source", "century", "period", "date"):
        assert f'"{forbidden}"' not in dumped
