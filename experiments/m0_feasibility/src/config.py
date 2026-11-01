"""Validated experiment configuration. A bad file stops the run before anything else happens."""
import hashlib
from fractions import Fraction
from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .adapter import ProviderConfig
from .metrics import GATES
from .runner import Prompt, load_prompt


class ConfigError(ValueError):
    pass


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PreprocessConfig(Strict):
    version: str
    longest_edge: int = Field(gt=0)
    jpeg_quality: int = Field(ge=1, le=100)


class PromptConfig(Strict):
    version: str
    path: str
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class RetryConfig(Strict):
    provider: int = Field(ge=0, le=3)
    repair: int = Field(ge=0, le=3)


class LimitsConfig(Strict):
    max_output_tokens: int = Field(gt=0)
    attempt_timeout_s: float = Field(gt=0)
    retry_after_cap_s: float = Field(ge=0)
    max_consecutive_provider_failures: int = Field(gt=0)
    max_attempts_per_model: int = Field(gt=0)
    run_timeout_s: float = Field(gt=0)
    assumed_input_tokens: int = Field(gt=0)
    stop_limit_usd_per_gateway: float = Field(gt=0)


class FractionGate(Strict):
    numerator: int = Field(gt=0)
    denominator: int = Field(gt=0)

    @property
    def value(self) -> Fraction:
        return Fraction(self.numerator, self.denominator)


class GateConfig(Strict):
    top1: FractionGate
    top3: FractionGate
    rejection: FractionGate
    valid_after_retry: float = Field(gt=0, le=1)
    reproducibility: float = Field(gt=0, le=1)


class RunConfig(Strict):
    experiment: str
    split: str
    repetitions: int = Field(ge=1)
    temperature: float = Field(ge=0)
    seed: int
    preprocess: PreprocessConfig
    prompt: PromptConfig
    retries: RetryConfig
    limits: LimitsConfig
    gates: GateConfig


class ModelEntry(Strict):
    base_url: str
    model: str
    api_key_env: str
    response_format: str = Field(pattern=r"^(json_schema|json_object)$")
    extra_body: dict = Field(default_factory=dict)
    input_usd_per_mtok: float | None = Field(default=None, ge=0)
    output_usd_per_mtok: float | None = Field(default=None, ge=0)


class ModelsFile(Strict):
    models: dict[str, ModelEntry] = Field(min_length=1)


def _read_yaml(path: Path) -> dict:
    if not path.exists():
        raise ConfigError(f"configuration file not found: {path}")
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise ConfigError(f"{path} is not valid YAML: {exc}") from exc
    if not isinstance(data, dict):
        raise ConfigError(f"{path} must contain a mapping")
    return data


def load_run_config(path: Path) -> RunConfig:
    try:
        config = RunConfig.model_validate(_read_yaml(path))
    except ValidationError as exc:
        raise ConfigError(f"{path}: {exc}") from exc
    gates = config.gates
    configured = {"top1": gates.top1.value, "top3": gates.top3.value, "rejection": gates.rejection.value,
                  "valid_after_retry": Fraction(str(gates.valid_after_retry)),
                  "reproducibility": Fraction(str(gates.reproducibility))}
    if configured != GATES:
        raise ConfigError(f"gates in {path} differ from the approved gates in metrics.py")
    return config


def load_models(path: Path, config: RunConfig) -> dict[str, ProviderConfig]:
    try:
        models = ModelsFile.model_validate(_read_yaml(path))
    except ValidationError as exc:
        raise ConfigError(f"{path}: {exc}") from exc
    return {
        key: ProviderConfig(key=key, base_url=e.base_url, model=e.model, api_key_env=e.api_key_env,
                            response_format=e.response_format, extra_body=e.extra_body,
                            temperature=config.temperature, seed=config.seed,
                            max_output_tokens=config.limits.max_output_tokens,
                            timeout_s=config.limits.attempt_timeout_s,
                            input_usd_per_mtok=e.input_usd_per_mtok, output_usd_per_mtok=e.output_usd_per_mtok)
        for key, e in models.models.items()
    }


def live_blockers(models: dict[str, ProviderConfig]) -> list[str]:
    """Why each model cannot run live yet. A repetition must reach the same host every time."""
    blockers = []
    for key, model in models.items():
        routing = model.extra_body.get("provider", {})
        pinned = ":" in model.model or (routing.get("order") and routing.get("allow_fallbacks") is False)
        if not pinned:
            blockers.append(f"{key}: no pinned host")
        if model.input_usd_per_mtok is None or model.output_usd_per_mtok is None:
            blockers.append(f"{key}: no prices for the spending guard")
    return blockers


def load_frozen_prompt(root: Path, config: RunConfig) -> Prompt:
    path = root / config.prompt.path
    if not path.exists():
        raise ConfigError(f"prompt not found: {path}")
    prompt = load_prompt(path, config.prompt.version)
    if prompt.sha256 != config.prompt.sha256:
        raise ConfigError(f"prompt hash mismatch: {prompt.sha256} is not the frozen {config.prompt.sha256}")
    return prompt


def files_sha256(*paths: Path) -> str:
    digest = hashlib.sha256()
    for path in paths:
        digest.update(path.read_bytes())
    return digest.hexdigest()
