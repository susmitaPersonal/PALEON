"""Hard limits for a live run. Standard library only.

An attempt with no reported usage counts at the full ceiling, because a failed call may still be
billed. Spending figures are estimates from list prices, never billed amounts.
"""
import json
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from .adapter import ProviderConfig
from .records import STATUS_PROVIDER, AttemptRecord

FATAL_KINDS = {"auth", "credit_exhausted", "bad_request"}


class RunStopped(Exception):
    def __init__(self, reason: str, records: list[AttemptRecord]):
        super().__init__(reason)
        self.reason = reason
        self.records = records


@dataclass(frozen=True)
class RunLimits:
    max_attempts: int
    run_timeout_s: float
    max_consecutive_provider_failures: int
    assumed_input_tokens: int
    stop_limit_usd: float


def attempt_cost(input_tokens: int, output_tokens: int, config: ProviderConfig) -> float:
    return (input_tokens * config.input_usd_per_mtok + output_tokens * config.output_usd_per_mtok) / 1e6


class RunGuard:
    """Checked before every attempt, so a limit stops the next call rather than noticing after it."""

    def __init__(self, limits: RunLimits, config: ProviderConfig, prior_attempts: int = 0, prior_spend_usd: float = 0.0,
                 clock: Callable[[], float] = time.monotonic):
        if config.input_usd_per_mtok is None or config.output_usd_per_mtok is None:
            raise ValueError(f"{config.key}: the spending guard needs prices")
        self.limits = limits
        self.config = config
        self.ceiling_usd = attempt_cost(limits.assumed_input_tokens, config.max_output_tokens, config)
        self.attempts = prior_attempts
        self.spent_usd = prior_spend_usd
        self.consecutive_provider_failures = 0
        self.fatal: str | None = None
        self.stopped: str | None = None
        self._clock = clock
        self._started = clock()

    def stop_reason(self) -> str | None:
        limits = self.limits
        if self.fatal:
            self.stopped = f"fatal provider error: {self.fatal}"
        elif self.consecutive_provider_failures >= limits.max_consecutive_provider_failures:
            self.stopped = f"{self.consecutive_provider_failures} provider failures in a row"
        elif self.attempts >= limits.max_attempts:
            self.stopped = f"attempt limit of {limits.max_attempts} reached"
        elif self._clock() - self._started >= limits.run_timeout_s:
            self.stopped = f"run time limit of {limits.run_timeout_s:g} s reached"
        elif self.spent_usd + self.ceiling_usd > limits.stop_limit_usd:
            self.stopped = f"spending stop limit of ${limits.stop_limit_usd:.2f} reached"
        return self.stopped

    def observe(self, record: AttemptRecord) -> None:
        self.attempts += 1
        self.spent_usd += self._cost(record)
        if record.status == STATUS_PROVIDER:
            self.consecutive_provider_failures += 1
            if record.error_kind in FATAL_KINDS:
                self.fatal = record.error_kind
        else:
            self.consecutive_provider_failures = 0

    def _cost(self, record: AttemptRecord) -> float:
        if record.input_tokens is None or record.output_tokens is None:
            return self.ceiling_usd
        return attempt_cost(record.input_tokens, record.output_tokens, self.config)


def prior_usage(results_root: Path, limits: RunLimits, config: ProviderConfig) -> tuple[int, float]:
    """Attempts and estimated spending by this model in earlier runs, so limits hold across runs."""
    guard = RunGuard(limits, config)
    for path in sorted(results_root.rglob("attempts.jsonl")) if results_root.exists() else []:
        for line in path.read_text(encoding="utf-8").splitlines():
            fields = json.loads(line)
            if fields["model_key"] == config.key:
                guard.attempts += 1
                guard.spent_usd += guard._cost(AttemptRecord(**{**fields, "prediction": None}))
    return guard.attempts, guard.spent_usd
