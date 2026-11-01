"""Strict offline validation of raw model output.

Parsing is deliberately unforgiving: Markdown fences or leading prose count as invalid,
so the reported structured-output rate reflects what the model actually returned.
"""
import json
import re
from dataclasses import dataclass, field

from pydantic import ValidationError

from .records import Prediction
from .schema import EvaluationResponse

# Heuristics. A hit is reported, never used to reject output, because a phrase such as
# "third century" may be a false positive and hand-review is needed to confirm it.
HISTORY_PATTERNS = {
    "url": re.compile(r"https?://|www\.", re.I),
    "year": re.compile(r"\b\d{1,4}\s*(?:BCE|BC|CE|AD)\b", re.I),
    "century": re.compile(r"\b(?:\d{1,2}(?:st|nd|rd|th)|[a-z]+)[- ]century\b", re.I),
    "citation": re.compile(r"\b(?:et al\.|doi:|ISBN|according to)\b", re.I),
}


@dataclass
class ValidationResult:
    valid: bool
    response: EvaluationResponse | None = None
    errors: list[str] = field(default_factory=list)
    history_flags: list[str] = field(default_factory=list)

    def prediction(self) -> Prediction | None:
        if self.response is None:
            return None
        return Prediction(
            disposition=self.response.disposition.value,
            candidates=[c.script.value for c in self.response.candidates],
        )


def _free_text(response: EvaluationResponse) -> list[str]:
    obs = response.observations
    texts = [*obs.visual_features, *obs.damage_or_limitations, *response.alternative_interpretations]
    if response.abstention_reason:
        texts.append(response.abstention_reason)
    for candidate in response.candidates:
        texts += [*candidate.supporting_evidence, *candidate.contradicting_evidence]
    return texts


def scan_for_history(texts: list[str]) -> list[str]:
    return sorted({name for text in texts for name, rx in HISTORY_PATTERNS.items() if rx.search(text)})


def validate_output(raw: str) -> ValidationResult:
    try:
        payload = json.loads(raw)
    except (json.JSONDecodeError, TypeError) as exc:
        return ValidationResult(valid=False, errors=[f"not_json: {exc}"])
    try:
        response = EvaluationResponse.model_validate(payload)
    except ValidationError as exc:
        errors = [f"{'.'.join(map(str, e['loc'])) or 'root'}: {e['msg']}" for e in exc.errors()]
        return ValidationResult(valid=False, errors=errors)
    return ValidationResult(valid=True, response=response, history_flags=scan_for_history(_free_text(response)))
