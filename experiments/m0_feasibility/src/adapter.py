"""Provider adapters.

Stage A ships no live transport, so nothing in this package can reach a network.
OpenAICompatibleAdapter talks only to an injected Transport. Stage D, once approved,
adds an httpx-backed Transport without changing this module.
"""
import base64
import json
import os
from dataclasses import dataclass, field
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
        return float(value) if value is not None else None
    except ValueError:
        return None


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
        if not choices:
            raise ProviderError("bad_response", "response has no choices", 200, raw_body=payload)

        message = choices[0].get("message") or {}
        usage = payload.get("usage") or {}
        return ChatResult(
            content=message.get("content") or "",
            raw_body=payload,
            http_status=200,
            input_tokens=usage.get("prompt_tokens"),
            output_tokens=usage.get("completion_tokens"),
            finish_reason=choices[0].get("finish_reason"),
        )


class FixtureAdapter:
    """Replays scripted outcomes, keyed by image then consumed in order."""

    def __init__(self, config: ProviderConfig, script: dict[str, list[Any]]):
        self.config = config
        self._script = {image_id: list(items) for image_id, items in script.items()}
        self.current_image: str | None = None

    def complete(self, request: ChatRequest) -> ChatResult:
        queue = self._script.get(self.current_image or "")
        if not queue:
            raise ProviderError("bad_response", f"no scripted outcome left for {self.current_image}")
        item = queue.pop(0)
        if isinstance(item, ProviderError):
            raise item
        return ChatResult(content=item, raw_body={"fixture": True, "content": item}, http_status=200,
                          input_tokens=5000, output_tokens=800, finish_reason="stop")
