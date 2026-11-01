"""Response contract for the evaluation prompt.

The schema has no field for dates, periods, sources, or URLs. The model cannot
return history here without placing it in free text, where validation.py flags it.
"""
from enum import Enum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=400)]
MAX_CANDIDATES = 3


class SupportedScript(str, Enum):
    brahmi = "brahmi"
    kharosthi = "kharosthi"
    phoenician = "phoenician"
    greek = "greek"
    latin = "latin"
    runic = "runic"


class Disposition(str, Enum):
    identified = "identified"
    insufficient_evidence = "insufficient_evidence"
    outside_supported_set = "outside_supported_set"
    no_writing = "no_writing"


class ImageQuality(str, Enum):
    good = "good"
    fair = "fair"
    poor = "poor"


class Direction(str, Enum):
    left_to_right = "left_to_right"
    right_to_left = "right_to_left"
    boustrophedon = "boustrophedon"
    vertical = "vertical"
    unclear = "unclear"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Observations(StrictModel):
    writing_present: bool
    image_quality: ImageQuality
    apparent_direction: Direction
    visual_features: list[ShortText] = Field(max_length=12)
    damage_or_limitations: list[ShortText] = Field(max_length=8)


class Candidate(StrictModel):
    rank: int = Field(ge=1, le=MAX_CANDIDATES)
    script: SupportedScript
    supporting_evidence: list[ShortText] = Field(min_length=1, max_length=6)
    contradicting_evidence: list[ShortText] = Field(max_length=6)


class EvaluationResponse(StrictModel):
    disposition: Disposition
    observations: Observations
    candidates: list[Candidate] = Field(max_length=MAX_CANDIDATES)
    alternative_interpretations: list[ShortText] = Field(max_length=6)
    abstention_reason: ShortText | None

    @model_validator(mode="after")
    def check_consistency(self) -> "EvaluationResponse":
        if self.disposition is Disposition.identified:
            if not self.candidates:
                raise ValueError("disposition 'identified' requires at least one candidate")
            if self.abstention_reason is not None:
                raise ValueError("disposition 'identified' must have a null abstention_reason")
        else:
            # Abstaining with a candidate attached would make rejection impossible to score.
            if self.candidates:
                raise ValueError("an abstaining disposition must have no candidates")
            if self.abstention_reason is None:
                raise ValueError("an abstaining disposition requires abstention_reason")

        if self.disposition is Disposition.no_writing and self.observations.writing_present:
            raise ValueError("disposition 'no_writing' contradicts writing_present=true")

        ranks = [c.rank for c in self.candidates]
        if ranks != list(range(1, len(ranks) + 1)):
            raise ValueError("candidate ranks must be contiguous and start at 1")
        scripts = [c.script for c in self.candidates]
        if len(set(scripts)) != len(scripts):
            raise ValueError("candidate scripts must be unique")
        return self


def response_json_schema() -> dict:
    return EvaluationResponse.model_json_schema()
