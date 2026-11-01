"""Provider adapters.

Nothing in this package can reach a network. OpenAICompatibleAdapter talks only to an
injected Transport. The httpx-backed Transport lives in live/, outside src/, and no entry
point reaches it until Stage D is approved.
"""
import base64
import json
import math
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

RETRYABLE_KINDS = {"timeout", "rate_limited", "unavailable"}


@dataclass(frozen=True)
class ProviderConfig:
    key: str
    base_url: str
    model: str
    api_key_env: str
    response_format: str = "json_schema"        # or "json_object"
    extra_body: dict[str, Any] = field(default_factory=dict)
    max_output_tokens: int = 1500
    temperature: float = 0.0
    seed: int | None = 20261102
    timeout_s: float = 90.0
    input_usd_per_mtok: float | None = None
    output_usd_per_mtok: float | None = None


@dataclass(frozen=True)
class ChatRequest:
    system: str
    user_text: str
    image_bytes: bytes
    image_mime: str
    json_schema: dict
    schema_name: str = "script_evaluation"
    repair_note: str | None = None


@dataclass(frozen=True)
class ChatResult:
    content: str
    raw_body: dict
    http_status: int
    input_tokens: int | None
    output_tokens: int | None
    finish_reason: str | None
    response_model: str | None = None
    response_host: str | None = None
    cached_input_tokens: int | None = None
    reasoning_tokens: int | None = None


@dataclass(frozen=True)
class TransportResponse:
    status: int
    headers: dict[str, str]
    body: str


class ProviderError(Exception):
    def __init__(self, kind: str, detail: str = "", http_status: int | None = None,
                 retry_after_s: float | None = None, raw_body: Any = None):
        super().__init__(f"{kind}: {detail}")
        self.kind = kind
        self.detail = detail
        self.http_status = http_status
        self.retry_after_s = retry_after_s
        self.raw_body = raw_body

    @property
    def retryable(self) -> bool:
        return self.kind in RETRYABLE_KINDS


class Transport(Protocol):
    def post(self, url: str, headers: dict[str, str], body: dict, timeout_s: float) -> TransportResponse: ...


class ProviderAdapter(Protocol):
    config: ProviderConfig

    def complete(self, request: ChatRequest) -> ChatResult: ...


def load_api_key(config: ProviderConfig, env: dict[str, str] | None = None) -> str:
    source = os.environ if env is None else env
    value = source.get(config.api_key_env, "").strip()
    if not value:
        raise ProviderError("auth", f"environment variable {config.api_key_env} is not set")
    return value


def _classify_status(status: int) -> str:
    if status in (401, 403):
        return "auth"
    if status == 402:
        return "credit_exhausted"
    if status in (408, 504):
        return "timeout"
    if status == 429:
        return "rate_limited"
    if status >= 500:
        return "unavailable"
    return "bad_request"


def _retry_after(headers: dict[str, str]) -> float | None:
    value = next((v for k, v in headers.items() if k.lower() == "retry-after"), None)
    try:
        seconds = float(value) if value is not None else None
    except ValueError:
        return None
    return seconds if seconds is not None and math.isfinite(seconds) and seconds >= 0 else None


def _count(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None


def _detail(usage: dict, section: str, name: str) -> int | None:
    block = usage.get(section)
    return _count(block.get(name)) if isinstance(block, dict) else None


def _text(value: Any) -> str | None:
    return value if isinstance(value, str) else None


class OpenAICompatibleAdapter:
    """One adapter for both gateways; they differ only in configuration."""

    def __init__(self, config: ProviderConfig, transport: Transport, api_key: str):
        self.config = config
        self._transport = transport
        self._api_key = api_key

    def __repr__(self) -> str:
        return f"OpenAICompatibleAdapter(key={self.config.key!r}, model={self.config.model!r})"

    def build_body(self, request: ChatRequest) -> dict:
        cfg = self.config
        data_url = f"data:{request.image_mime};base64,{base64.b64encode(request.image_bytes).decode()}"
        user_text = request.user_text
        if request.repair_note:
            user_text = f"{user_text}\n\n{request.repair_note}"
        body: dict[str, Any] = {
            "model": cfg.model,
            "temperature": cfg.temperature,
            "max_tokens": cfg.max_output_tokens,
            "messages": [
                {"role": "system", "content": request.system},
                {"role": "user", "content": [
                    {"type": "text", "text": user_text},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ]},
            ],
        }
        if cfg.seed is not None:
            body["seed"] = cfg.seed
        if cfg.response_format == "json_schema":
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": request.schema_name, "strict": True, "schema": request.json_schema},
            }
        else:
            body["response_format"] = {"type": "json_object"}
        body.update(cfg.extra_body)
        return body

    def complete(self, request: ChatRequest) -> ChatResult:
        cfg = self.config
        headers = {"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"}
        url = f"{cfg.base_url.rstrip('/')}/chat/completions"
        try:
            response = self._transport.post(url, headers, self.build_body(request), cfg.timeout_s)
        except TimeoutError as exc:
            raise ProviderError("timeout", str(exc)) from exc
        except ConnectionError as exc:
            raise ProviderError("unavailable", str(exc)) from exc

        try:
            payload = json.loads(response.body)
        except json.JSONDecodeError:
            payload = None

        if response.status != 200:
            raise ProviderError(_classify_status(response.status), response.body[:300], response.status,
                                _retry_after(response.headers), payload or response.body)
        if not isinstance(payload, dict):
            raise ProviderError("bad_response", "HTTP 200 with a non-JSON body", 200, raw_body=response.body)
        # Gateways can report an upstream failure inside a 200 response.
        if payload.get("error"):
            error = payload["error"]
            code = error.get("code") if isinstance(error, dict) else None
            kind = _classify_status(code) if isinstance(code, int) else "unavailable"
            raise ProviderError(kind, str(error)[:300], 200, raw_body=payload)
        choices = payload.get("choices") or []
        if not isinstance(choices, list) or not choices:
            raise ProviderError("bad_response", "response has no choices", 200, raw_body=payload)
        choice = choices[0]
        message = choice.get("message") or {} if isinstance(choice, dict) else None
        if not isinstance(message, dict):
            raise ProviderError("bad_response", "response has a malformed choice", 200, raw_body=payload)

        usage = payload.get("usage")
        usage = usage if isinstance(usage, dict) else {}
        return ChatResult(
            content=message.get("content") or "",
            raw_body=payload,
            http_status=200,
            input_tokens=_count(usage.get("prompt_tokens")),
            output_tokens=_count(usage.get("completion_tokens")),
            finish_reason=_text(choice.get("finish_reason")),
            response_model=_text(payload.get("model")),
            response_host=_text(payload.get("provider")),
            cached_input_tokens=_detail(usage, "prompt_tokens_details", "cached_tokens"),
            reasoning_tokens=_detail(usage, "completion_tokens_details", "reasoning_tokens"),
        )


class LiveModeDisabled(RuntimeError):
    """Raised for any attempt to reach a real provider. Stage D has not been approved."""


class FixtureAdapter:
    """Replays recorded outcomes, keyed by image then consumed in order.

    An outcome is response text, a ProviderError, or a recorded dict. Token usage comes only from the
    recording. When a recording has none it stays None, and is never estimated or filled in.
    """

    def __init__(self, config: ProviderConfig, script: dict[str, list[Any]]):
        self.config = config
        self._script = {image_id: list(items) for image_id, items in script.items()}
        self.current_image: str | None = None

    def complete(self, request: ChatRequest) -> ChatResult:
        queue = self._script.get(self.current_image or "")
        if not queue:
            raise ProviderError("bad_response", f"no recorded outcome left for {self.current_image}")
        item = queue.pop(0)
        if isinstance(item, ProviderError):
            raise item
        if isinstance(item, str):
            item = {"content": item}
        if "error" in item:
            error = item["error"]
            raise ProviderError(error["kind"], error.get("detail", ""), error.get("http_status"),
                                error.get("retry_after_s"), raw_body=item)
        return ChatResult(content=item["content"], raw_body={"fixture": True, **item}, http_status=200,
                          input_tokens=item.get("input_tokens"), output_tokens=item.get("output_tokens"),
                          finish_reason=item.get("finish_reason"))


def fixture_adapter_from_file(config: ProviderConfig, path: Path) -> FixtureAdapter:
    recording = json.loads(path.read_text(encoding="utf-8"))
    return FixtureAdapter(config, recording["outcomes"])


def require_credentials(configs: list[ProviderConfig], env: dict[str, str] | None = None) -> list[str]:
    """Return the names of missing variables. Only names are reported, never values."""
    missing = []
    for config in configs:
        try:
            load_api_key(config, env)
        except ProviderError:
            missing.append(config.api_key_env)
    return missing
