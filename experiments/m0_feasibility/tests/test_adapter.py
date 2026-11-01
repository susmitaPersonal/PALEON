import base64
import json

import pytest

from src.adapter import (ChatRequest, OpenAICompatibleAdapter, ProviderConfig, ProviderError, TransportResponse,
                         load_api_key)

SECRET = "test-secret-not-a-real-key"
CONFIG = ProviderConfig(key="m", base_url="https://gateway.invalid/v1/", model="org/model", api_key_env="TEST_KEY",
                        extra_body={"provider": {"require_parameters": True}})
REQUEST = ChatRequest("sys", "user", b"\xff\xd8bytes", "image/jpeg", {"type": "object"})


class FakeTransport:
    def __init__(self, status=200, body="{}", headers=None, raises=None):
        self.response = TransportResponse(status, headers or {}, body)
        self.raises = raises
        self.calls = []

    def post(self, url, headers, body, timeout_s):
        self.calls.append((url, headers, body, timeout_s))
        if self.raises:
            raise self.raises
        return self.response


def adapter(transport, config=CONFIG):
    return OpenAICompatibleAdapter(config, transport, SECRET)


def success_body(content="{}"):
    return json.dumps({"choices": [{"message": {"content": content}, "finish_reason": "stop"}],
                       "usage": {"prompt_tokens": 10, "completion_tokens": 5}})


def test_request_uses_base64_data_url_and_schema():
    body = adapter(FakeTransport()).build_body(REQUEST)
    parts = body["messages"][1]["content"]
    assert parts[1]["image_url"]["url"] == "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8bytes").decode()
    assert body["response_format"]["json_schema"]["strict"] is True
    assert body["provider"] == {"require_parameters": True}
    assert body["temperature"] == 0.0


def test_json_object_mode_is_configurable():
    config = ProviderConfig(key="m", base_url="u", model="x", api_key_env="K", response_format="json_object")
    assert adapter(FakeTransport(), config).build_body(REQUEST)["response_format"] == {"type": "json_object"}


def test_repair_note_is_appended():
    request = ChatRequest("s", "u", b"x", "image/jpeg", {}, repair_note="fix it")
    assert adapter(FakeTransport()).build_body(request)["messages"][1]["content"][0]["text"].endswith("fix it")


def test_url_is_joined_once():
    transport = FakeTransport(body=success_body())
    adapter(transport).complete(REQUEST)
    assert transport.calls[0][0] == "https://gateway.invalid/v1/chat/completions"


def test_success_returns_content_and_usage():
    result = adapter(FakeTransport(body=success_body("hello"))).complete(REQUEST)
    assert (result.content, result.input_tokens, result.output_tokens) == ("hello", 10, 5)


@pytest.mark.parametrize("status,kind,retryable", [
    (401, "auth", False), (403, "auth", False), (402, "credit_exhausted", False), (400, "bad_request", False),
    (404, "bad_request", False), (408, "timeout", True), (429, "rate_limited", True), (500, "unavailable", True),
    (503, "unavailable", True), (504, "timeout", True),
])
def test_status_mapping(status, kind, retryable):
    with pytest.raises(ProviderError) as caught:
        adapter(FakeTransport(status=status, body="oops")).complete(REQUEST)
    assert caught.value.kind == kind and caught.value.retryable is retryable


def test_retry_after_is_read():
    with pytest.raises(ProviderError) as caught:
        adapter(FakeTransport(status=429, body="{}", headers={"Retry-After": "7"})).complete(REQUEST)
    assert caught.value.retry_after_s == 7.0


@pytest.mark.parametrize("raises,kind", [(TimeoutError("t"), "timeout"), (ConnectionError("c"), "unavailable")])
def test_transport_errors_are_typed(raises, kind):
    with pytest.raises(ProviderError) as caught:
        adapter(FakeTransport(raises=raises)).complete(REQUEST)
    assert caught.value.kind == kind


def test_error_inside_http_200_is_a_provider_failure():
    body = json.dumps({"error": {"code": 502, "message": "upstream"}})
    with pytest.raises(ProviderError) as caught:
        adapter(FakeTransport(body=body)).complete(REQUEST)
    assert caught.value.kind == "unavailable"


def test_non_json_200_is_a_bad_response():
    with pytest.raises(ProviderError) as caught:
        adapter(FakeTransport(body="<html>")).complete(REQUEST)
    assert caught.value.kind == "bad_response"


def test_missing_choices_is_a_bad_response():
    with pytest.raises(ProviderError) as caught:
        adapter(FakeTransport(body='{"choices": []}')).complete(REQUEST)
    assert caught.value.kind == "bad_response"


def test_empty_content_reaches_validation_as_empty_text():
    body = json.dumps({"choices": [{"message": {"content": None, "reasoning": "thinking"}}]})
    assert adapter(FakeTransport(body=body)).complete(REQUEST).content == ""


def test_secret_is_absent_from_repr_body_and_errors():
    transport = FakeTransport(status=500, body="fail")
    subject = adapter(transport)
    with pytest.raises(ProviderError) as caught:
        subject.complete(REQUEST)
    assert SECRET not in repr(subject)
    assert SECRET not in str(caught.value)
    assert SECRET not in json.dumps(transport.calls[0][2])
    assert transport.calls[0][1]["Authorization"] == f"Bearer {SECRET}"


def test_missing_key_fails_clearly_without_a_call():
    with pytest.raises(ProviderError) as caught:
        load_api_key(CONFIG, env={})
    assert caught.value.kind == "auth"
    assert load_api_key(CONFIG, env={"TEST_KEY": " abc "}) == "abc"
