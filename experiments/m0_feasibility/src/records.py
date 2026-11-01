"""Plain records shared by the runner and metrics. Standard library only."""
from dataclasses import asdict, dataclass, field

SUPPORTED_SCRIPTS = ("brahmi", "kharosthi", "phoenician", "greek", "latin", "runic")

STATUS_VALID = "valid"
STATUS_INVALID = "invalid_output"       # The model answered, but failed validation: a model error.
STATUS_PROVIDER = "provider_error"      # No usable answer from the host: a provider failure.

KIND_INITIAL = "initial"
KIND_PROVIDER_RETRY = "provider_retry"
KIND_REPAIR_RETRY = "repair_retry"


@dataclass(frozen=True)
class Prediction:
    disposition: str
    candidates: list[str] = field(default_factory=list)


@dataclass
class AttemptRecord:
    run_id: str
    model_key: str
    image_id: str
    repetition: int
    attempt: int
    kind: str
    status: str
    latency_ms: float | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    http_status: int | None = None
    error_kind: str | None = None
    error_detail: str | None = None
    prediction: Prediction | None = None
    history_flags: list[str] = field(default_factory=list)
    raw_path: str | None = None
    finish_reason: str | None = None
    response_model: str | None = None
    response_host: str | None = None
    cached_input_tokens: int | None = None
    reasoning_tokens: int | None = None
    sent_sha256: str | None = None      # SHA-256 of the exact image bytes in the request.

    def to_dict(self) -> dict:
        return asdict(self)
