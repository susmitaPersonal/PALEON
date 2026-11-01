"""Experiment loop with explicit retry and failure records.

The loop runs any ProviderAdapter. A live run must also pass a RunGuard, which enforces its
limits. Fixture replays pass none, so their recorded failures play out in full.
"""
import hashlib
import json
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from .adapter import ChatRequest, ChatResult, ProviderAdapter, ProviderError
from .guard import RunGuard, RunStopped
from .manifest import ManifestRow
from .records import (KIND_INITIAL, KIND_PROVIDER_RETRY, KIND_REPAIR_RETRY, STATUS_INVALID, STATUS_PROVIDER,
                      STATUS_VALID, AttemptRecord)
from .schema import response_json_schema
from .validation import validate_output

MAX_PROVIDER_RETRIES = 1
MAX_REPAIR_RETRIES = 1
DEFAULT_RETRY_WAIT_S = 2.0
RETRY_AFTER_CAP_S = 30.0
REPAIR_NOTE = ("Your previous reply failed validation. Return only one JSON object that matches the schema. "
               "Do not change your assessment of the image.")


@dataclass(frozen=True)
class Prompt:
    version: str
    system: str
    user: str

    @property
    def sha256(self) -> str:
        return hashlib.sha256(f"{self.system}\0{self.user}".encode()).hexdigest()


def protocol_sha256() -> str:
    """Covers what the request carries beyond the prompt: the output schema and the repair note."""
    schema = json.dumps(response_json_schema(), sort_keys=True)
    return hashlib.sha256(f"{schema}\0{REPAIR_NOTE}".encode()).hexdigest()


def load_prompt(path: Path, version: str) -> Prompt:
    text = path.read_text(encoding="utf-8")
    system, separator, user = text.partition("\n---USER---\n")
    if not separator:
        raise ValueError(f"{path} has no ---USER--- separator")
    return Prompt(version, system.strip(), user.strip())


def make_run_id(model_key: str, prompt: Prompt, manifest_sha256: str, config_sha256: str, sequence: int) -> str:
    """Same inputs produce the same digest. `sequence` separates a true re-run from the original."""
    digest = hashlib.sha256(f"{model_key}|{prompt.sha256}|{manifest_sha256}|{config_sha256}".encode()).hexdigest()
    return f"m0-{model_key}-{digest[:12]}-s{sequence:02d}"


class RunWriter:
    def __init__(self, run_dir: Path):
        self.run_dir = run_dir
        (run_dir / "raw").mkdir(parents=True, exist_ok=True)
        self._handles = {name: (run_dir / f"{name}.jsonl").open("a", encoding="utf-8")
                         for name in ("attempts", "failures", "retries")}

    def raw(self, record: AttemptRecord, body: object) -> str:
        name = f"{record.image_id}_r{record.repetition}_a{record.attempt}.json"
        # ASCII escapes keep any reply storable, including lone surrogates, without altering it.
        (self.run_dir / "raw" / name).write_text(json.dumps(body, indent=2), encoding="utf-8")
        return f"raw/{name}"

    def write(self, record: AttemptRecord) -> None:
        line = json.dumps(record.to_dict()) + "\n"
        self._handles["attempts"].write(line)
        if record.status != STATUS_VALID:
            self._handles["failures"].write(line)
        if record.attempt > 1:
            self._handles["retries"].write(line)
        for handle in self._handles.values():
            handle.flush()

    def stopped(self, stop: RunStopped, guard: RunGuard) -> None:
        details = {"reason": stop.reason, "attempts": guard.attempts, "estimated_spend_usd": guard.spent_usd}
        (self.run_dir / "stopped.json").write_text(json.dumps(details, indent=2), encoding="utf-8")

    def close(self) -> None:
        for handle in self._handles.values():
            handle.close()


def _run_repetition(adapter: ProviderAdapter, request: ChatRequest, make_record: Callable[..., AttemptRecord],
                    writer: RunWriter, sleep: Callable[[float], None], max_provider_retries: int,
                    max_repair_retries: int, guard: RunGuard | None = None,
                    retry_after_cap_s: float = RETRY_AFTER_CAP_S) -> list[AttemptRecord]:
    records: list[AttemptRecord] = []
    provider_retries = repair_retries = 0
    kind = KIND_INITIAL
    current = request

    while True:
        reason = guard.stop_reason() if guard else None
        if reason:
            raise RunStopped(reason, records)
        attempt = len(records) + 1
        started = time.perf_counter()
        try:
            result: ChatResult = adapter.complete(current)
        except ProviderError as error:
            record = make_record(attempt=attempt, kind=kind, status=STATUS_PROVIDER, http_status=error.http_status,
                                 error_kind=error.kind, error_detail=error.detail[:300],
                                 latency_ms=(time.perf_counter() - started) * 1000)
            record.raw_path = writer.raw(record, {"error": error.kind, "body": error.raw_body})
            writer.write(record)
            records.append(record)
            if guard:
                guard.observe(record)
            wait = error.retry_after_s or DEFAULT_RETRY_WAIT_S
            if error.retryable and provider_retries < max_provider_retries and wait <= retry_after_cap_s:
                provider_retries += 1
                kind = KIND_PROVIDER_RETRY
                sleep(wait)
                continue
            return records

        latency = (time.perf_counter() - started) * 1000
        checked = validate_output(result.content)
        status = STATUS_VALID if checked.valid else STATUS_INVALID
        record = make_record(attempt=attempt, kind=kind, status=status, http_status=result.http_status,
                             latency_ms=latency, input_tokens=result.input_tokens, output_tokens=result.output_tokens,
                             prediction=checked.prediction(), history_flags=checked.history_flags,
                             error_detail="; ".join(checked.errors)[:300] or None,
                             error_kind=None if checked.valid else "validation", finish_reason=result.finish_reason,
                             response_model=result.response_model, response_host=result.response_host,
                             cached_input_tokens=result.cached_input_tokens, reasoning_tokens=result.reasoning_tokens)
        record.raw_path = writer.raw(record, result.raw_body)
        writer.write(record)
        records.append(record)
        if guard:
            guard.observe(record)
        if checked.valid or repair_retries >= max_repair_retries:
            return records
        repair_retries += 1
        kind = KIND_REPAIR_RETRY
        current = ChatRequest(request.system, request.user_text, request.image_bytes, request.image_mime,
                              request.json_schema, request.schema_name, repair_note=REPAIR_NOTE)


def run_experiment(adapter: ProviderAdapter, prompt: Prompt, rows: list[ManifestRow], repetitions: int,
                   image_loader: Callable[[ManifestRow], tuple[bytes, str]], run_id: str, run_dir: Path,
                   sleep: Callable[[float], None] = time.sleep, max_provider_retries: int = MAX_PROVIDER_RETRIES,
                   max_repair_retries: int = MAX_REPAIR_RETRIES, guard: RunGuard | None = None,
                   retry_after_cap_s: float = RETRY_AFTER_CAP_S) -> list[AttemptRecord]:
    if run_dir.exists() and any(run_dir.iterdir()):
        raise FileExistsError(f"{run_dir} already holds a run; results are never overwritten")
    writer = RunWriter(run_dir)
    records: list[AttemptRecord] = []
    try:
        for row in rows:
            image_bytes, mime = image_loader(row)
            sent_sha256 = hashlib.sha256(image_bytes).hexdigest()
            for repetition in range(1, repetitions + 1):
                if hasattr(adapter, "current_image"):
                    adapter.current_image = row.image_id

                def make_record(**fields) -> AttemptRecord:
                    return AttemptRecord(run_id=run_id, model_key=adapter.config.key, image_id=row.image_id,
                                         repetition=repetition, sent_sha256=sent_sha256, **fields)

                request = ChatRequest(prompt.system, prompt.user, image_bytes, mime, response_json_schema())
                records += _run_repetition(adapter, request, make_record, writer, sleep, max_provider_retries,
                                           max_repair_retries, guard, retry_after_cap_s)
    except RunStopped as stop:
        records += stop.records
        writer.stopped(stop, guard)
    finally:
        writer.close()
    return records
