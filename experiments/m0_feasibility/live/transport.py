"""Provider transport. Only live/stage_d.py uses it, and that refuses to run without Stage D approval."""
import time
from collections.abc import Callable

import httpx

from src.adapter import OpenAICompatibleAdapter, ProviderConfig, TransportResponse, load_api_key

CONNECT_TIMEOUT_S = 10.0
MAX_RESPONSE_BYTES = 5_000_000


class HttpxTransport:
    """Turns httpx failures into the exceptions the adapter types, and enforces a whole-request deadline."""

    def __init__(self, client: httpx.Client | None = None, clock: Callable[[], float] = time.monotonic):
        self._client = client or httpx.Client(follow_redirects=False)
        self._clock = clock

    def post(self, url: str, headers: dict[str, str], body: dict, timeout_s: float) -> TransportResponse:
        deadline = self._clock() + timeout_s
        timeout = httpx.Timeout(timeout_s, connect=min(CONNECT_TIMEOUT_S, timeout_s))
        chunks: list[bytes] = []
        size = 0
        try:
            with self._client.stream("POST", url, headers=headers, json=body, timeout=timeout) as response:
                # httpx timeouts apply per read, so a slow steady reply needs this separate check.
                for chunk in response.iter_bytes():
                    if self._clock() > deadline:
                        raise TimeoutError(f"no complete response within {timeout_s:g} s")
                    size += len(chunk)
                    if size > MAX_RESPONSE_BYTES:
                        raise ConnectionError("response exceeded the size limit")
                    chunks.append(chunk)
                return TransportResponse(response.status_code, dict(response.headers),
                                         b"".join(chunks).decode("utf-8", errors="replace"))
        except httpx.TimeoutException as exc:
            raise TimeoutError(str(exc)) from exc
        except httpx.HTTPError as exc:
            raise ConnectionError(str(exc)) from exc


def live_adapter(config: ProviderConfig, env: dict[str, str] | None = None) -> OpenAICompatibleAdapter:
    return OpenAICompatibleAdapter(config, HttpxTransport(), load_api_key(config, env))
