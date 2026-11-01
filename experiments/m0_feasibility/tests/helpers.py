"""Synthetic builders. Nothing here is a real model response."""
import json

from src.metrics import GoldItem
from src.records import KIND_INITIAL, STATUS_VALID, AttemptRecord, Prediction


def valid_payload(script="brahmi", disposition="identified", **overrides) -> dict:
    identified = disposition == "identified"
    payload = {
        "disposition": disposition,
        "observations": {
            "writing_present": disposition != "no_writing",
            "image_quality": "fair",
            "apparent_direction": "left_to_right",
            "visual_features": ["angular strokes"],
            "damage_or_limitations": [],
        },
        "candidates": [{
            "rank": 1,
            "script": script,
            "supporting_evidence": ["regular vertical strokes"],
            "contradicting_evidence": [],
        }] if identified else [],
        "alternative_interpretations": [],
        "abstention_reason": None if identified else "too worn to assess",
    }
    payload.update(overrides)
    return payload


def valid_json(*args, **kwargs) -> str:
    return json.dumps(valid_payload(*args, **kwargs))


def record(image_id, repetition, candidates=None, disposition="identified", attempt=1,
           status=STATUS_VALID, kind=KIND_INITIAL, **fields) -> AttemptRecord:
    prediction = None
    if status == STATUS_VALID:
        prediction = Prediction(disposition, candidates or [])
    return AttemptRecord(run_id="test", model_key="m", image_id=image_id, repetition=repetition, attempt=attempt,
                         kind=kind, status=status, prediction=prediction, **fields)


def gold(image_id, label, gold_class="in_scope") -> GoldItem:
    return GoldItem(image_id, gold_class, label)
