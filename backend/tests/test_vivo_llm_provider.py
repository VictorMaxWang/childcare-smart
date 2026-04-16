from __future__ import annotations

import base64
import hashlib
import hmac

import pytest
import requests
from pydantic import SecretStr

from app.core.config import Settings
from app.providers.base import (
    ProviderAuthenticationError,
    ProviderConfigurationError,
    ProviderResponseError,
)
from app.providers.mock import MockTextProvider
from app.providers.resolver import resolve_text_provider
from app.providers.vivo_llm import (
    APP_ID_HEADER_NAME,
    AUTH_SHAPE,
    DEFAULT_APP_ID_CARRIER,
    REQUEST_ID_QUERY_KEY,
    SIGNATURE_MODE,
    SIGNED_HEADERS,
    VivoLlmProvider,
)


class FakeResponse:
    def __init__(self, status_code: int, payload):
        self.status_code = status_code
        self._payload = payload
        self.text = payload if isinstance(payload, str) else ""

    def json(self):
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


def build_settings(**overrides) -> Settings:
    defaults = {
        "brain_provider": "vivo",
        "enable_mock_provider": False,
        "request_timeout_seconds": 15,
        "vivo_app_id": "app-id",
        "vivo_app_key": SecretStr("app-key"),
        "vivo_llm_model": "Volc-DeepSeek-V3.2",
    }
    defaults.update(overrides)
    return Settings(**defaults)


def build_success_payload(content: str = "Real vivo response.") -> dict[str, object]:
    return {
        "id": "chatcmpl-vivo-123",
        "created": 1712300000,
        "model": "Volc-DeepSeek-V3.2",
        "usage": {"prompt_tokens": 12, "completion_tokens": 18, "total_tokens": 30},
        "choices": [
            {
                "finish_reason": "stop",
                "message": {"content": content},
            }
        ],
    }


def test_vivo_llm_success(monkeypatch):
    def fake_post(url, **kwargs):
        assert url == "https://api-ai.vivo.com.cn/v1/chat/completions"
        assert kwargs["params"][REQUEST_ID_QUERY_KEY]
        assert kwargs["params"]["app_id"] == "app-id"
        assert kwargs["headers"]["Authorization"] == "Bearer app-key"
        assert kwargs["headers"]["X-AI-GATEWAY-APP-ID"] == "app-id"
        assert kwargs["headers"]["X-AI-GATEWAY-SIGNED-HEADERS"] == SIGNED_HEADERS
        assert kwargs["headers"]["X-AI-GATEWAY-TIMESTAMP"].isdigit()
        assert len(kwargs["headers"]["X-AI-GATEWAY-NONCE"]) == 8
        assert APP_ID_HEADER_NAME not in kwargs["headers"]
        assert kwargs["json"]["model"] == "Volc-DeepSeek-V3.2"
        assert kwargs["json"]["stream"] is False
        assert "app_id" not in kwargs["json"]
        signing_string = "\n".join(
            [
                "POST",
                "/v1/chat/completions",
                VivoLlmProvider._canonical_query_string(kwargs["params"]),
                "app-id",
                kwargs["headers"]["X-AI-GATEWAY-TIMESTAMP"],
                (
                    f"x-ai-gateway-app-id:app-id\n"
                    f"x-ai-gateway-timestamp:{kwargs['headers']['X-AI-GATEWAY-TIMESTAMP']}\n"
                    f"x-ai-gateway-nonce:{kwargs['headers']['X-AI-GATEWAY-NONCE']}"
                ),
            ]
        ).encode("utf-8")
        expected_signature = base64.b64encode(
            hmac.new(b"app-key", signing_string, hashlib.sha256).digest()
        ).decode("utf-8")
        assert kwargs["headers"]["X-AI-GATEWAY-SIGNATURE"] == expected_signature
        return FakeResponse(200, build_success_payload())

    monkeypatch.setattr(requests, "post", fake_post)

    result = VivoLlmProvider(build_settings()).summarize(prompt="test", fallback="fallback")

    assert result.provider == "vivo-llm"
    assert result.source == "vivo"
    assert result.fallback is False
    assert result.text == "Real vivo response."
    assert result.content == result.text
    assert result.usage == {"prompt_tokens": 12, "completion_tokens": 18, "total_tokens": 30}
    assert result.meta["finish_reason"] == "stop"
    assert result.meta["upstream_id"] == "chatcmpl-vivo-123"
    assert result.meta["created"] == 1712300000
    assert result.meta["auth_shape"] == AUTH_SHAPE
    assert result.meta["app_id_carrier"] == DEFAULT_APP_ID_CARRIER
    assert result.meta["request_id_key"] == REQUEST_ID_QUERY_KEY
    assert result.meta["signature_mode"] == SIGNATURE_MODE
    assert result.meta["diagnosis"] == "auth_ok"
    assert result.raw["id"] == "chatcmpl-vivo-123"
    assert result.request_id


def test_vivo_llm_default_request_shape_sends_app_id_in_query_only(monkeypatch):
    captured: dict[str, object] = {}

    def fake_post(url, **kwargs):
        captured["params"] = kwargs["params"]
        captured["json"] = kwargs["json"]
        captured["headers"] = kwargs["headers"]
        return FakeResponse(200, build_success_payload("query shape"))

    monkeypatch.setattr(requests, "post", fake_post)

    result = VivoLlmProvider(build_settings()).summarize(prompt="test", fallback="fallback")

    assert captured["params"]["app_id"] == "app-id"
    assert "app_id" not in captured["json"]
    assert APP_ID_HEADER_NAME not in captured["headers"]
    assert result.meta["app_id_carrier"] == "query"


def test_vivo_llm_body_app_id_carrier_moves_app_id_into_body(monkeypatch):
    captured: dict[str, object] = {}

    def fake_post(url, **kwargs):
        captured["params"] = kwargs["params"]
        captured["json"] = kwargs["json"]
        captured["headers"] = kwargs["headers"]
        return FakeResponse(200, build_success_payload("body shape"))

    monkeypatch.setattr(requests, "post", fake_post)

    result = VivoLlmProvider(build_settings(), app_id_carrier="body").summarize(prompt="test", fallback="fallback")

    assert "app_id" not in captured["params"]
    assert captured["json"]["app_id"] == "app-id"
    assert APP_ID_HEADER_NAME not in captured["headers"]
    assert result.meta["app_id_carrier"] == "body"
    assert result.meta["auth_shape"].endswith("body_app_id")


def test_vivo_llm_header_app_id_carrier_adds_plain_app_id_header(monkeypatch):
    captured: dict[str, object] = {}

    def fake_post(url, **kwargs):
        captured["params"] = kwargs["params"]
        captured["json"] = kwargs["json"]
        captured["headers"] = kwargs["headers"]
        return FakeResponse(200, build_success_payload("header shape"))

    monkeypatch.setattr(requests, "post", fake_post)

    result = VivoLlmProvider(build_settings(), app_id_carrier="header").summarize(prompt="test", fallback="fallback")

    assert "app_id" not in captured["params"]
    assert "app_id" not in captured["json"]
    assert captured["headers"][APP_ID_HEADER_NAME] == "app-id"
    assert result.meta["app_id_carrier"] == "header"
    assert result.meta["auth_shape"].endswith("header_app_id")


def test_vivo_llm_authentication_failure_does_not_fallback(monkeypatch):
    monkeypatch.setattr(
        requests,
        "post",
        lambda *args, **kwargs: FakeResponse(
            401,
            {"error_code": 40100, "error_msg": "missing required app_id in the request header", "trace_id": "trace-app-id"},
        ),
    )

    with pytest.raises(ProviderAuthenticationError) as exc_info:
        VivoLlmProvider(build_settings(enable_mock_provider=True)).summarize(prompt="test", fallback="fallback")

    assert exc_info.value.diagnosis == "app_id_missing"
    assert exc_info.value.kind == "auth"
    assert exc_info.value.error_code == 40100
    assert exc_info.value.trace_id == "trace-app-id"
    assert exc_info.value.auth_shape == AUTH_SHAPE
    assert exc_info.value.app_id_carrier == DEFAULT_APP_ID_CARRIER


def test_vivo_llm_server_error_falls_back_when_enabled(monkeypatch):
    monkeypatch.setattr(requests, "post", lambda *args, **kwargs: FakeResponse(503, {"error": "unavailable"}))

    result = VivoLlmProvider(build_settings(enable_mock_provider=True)).summarize(prompt="test", fallback="fallback")

    assert result.provider == "vivo-llm"
    assert result.source == "mock"
    assert result.fallback is True
    assert result.text == "fallback"
    assert result.meta["reason"] == "upstream-server-error"
    assert result.meta["status_code"] == 503
    assert result.meta["attempted_provider"] == "vivo-llm"
    assert result.meta["auth_shape"] == AUTH_SHAPE
    assert result.meta["app_id_carrier"] == DEFAULT_APP_ID_CARRIER
    assert result.request_id


def test_vivo_llm_rate_limit_falls_back_when_enabled(monkeypatch):
    monkeypatch.setattr(requests, "post", lambda *args, **kwargs: FakeResponse(429, {"error": "limited"}))

    result = VivoLlmProvider(build_settings(enable_mock_provider=True)).summarize(prompt="test", fallback="fallback")

    assert result.source == "mock"
    assert result.fallback is True
    assert result.meta["reason"] == "rate-limited"
    assert result.meta["status_code"] == 429
    assert result.meta["diagnosis"] == "rate_limited"


def test_vivo_llm_timeout_falls_back_when_enabled(monkeypatch):
    def fake_post(*args, **kwargs):
        raise requests.Timeout("request timed out")

    monkeypatch.setattr(requests, "post", fake_post)

    result = VivoLlmProvider(build_settings(enable_mock_provider=True)).summarize(prompt="test", fallback="fallback")

    assert result.provider == "vivo-llm"
    assert result.source == "mock"
    assert result.fallback is True
    assert result.meta["reason"] == "timeout"
    assert result.meta["diagnosis"] == "network_or_timeout"


def test_vivo_llm_missing_configuration_raises():
    provider = VivoLlmProvider(build_settings(vivo_app_id=None))

    with pytest.raises(ProviderConfigurationError):
        provider.summarize(prompt="test", fallback="fallback")


def test_resolve_text_provider_prefers_vivo_only_with_full_config():
    provider = resolve_text_provider(build_settings())
    assert isinstance(provider, VivoLlmProvider)

    fallback_provider = resolve_text_provider(build_settings(vivo_app_key=None))
    assert isinstance(fallback_provider, MockTextProvider)


def test_resolve_text_provider_prefer_vivo_overrides_default_brain_provider():
    provider = resolve_text_provider(build_settings(brain_provider="mock"), prefer_vivo=True)
    assert isinstance(provider, VivoLlmProvider)


def test_vivo_llm_empty_content_falls_back_with_raw_payload(monkeypatch):
    monkeypatch.setattr(
        requests,
        "post",
        lambda *args, **kwargs: FakeResponse(
            200,
            {
                "id": "chatcmpl-vivo-empty",
                "created": 1712301111,
                "choices": [{"message": {"content": ""}, "finish_reason": "stop"}],
            },
        ),
    )

    result = VivoLlmProvider(build_settings(enable_mock_provider=True)).summarize(prompt="test", fallback="fallback")

    assert result.source == "mock"
    assert result.fallback is True
    assert result.meta["reason"] == "empty-content"
    assert result.raw["id"] == "chatcmpl-vivo-empty"


def test_vivo_llm_server_error_raises_when_mock_disabled(monkeypatch):
    monkeypatch.setattr(requests, "post", lambda *args, **kwargs: FakeResponse(503, {"error": "unavailable"}))

    with pytest.raises(ProviderResponseError) as exc_info:
        VivoLlmProvider(build_settings(enable_mock_provider=False)).summarize(prompt="test", fallback="fallback")

    assert exc_info.value.diagnosis == "unknown_upstream_error"
    assert exc_info.value.kind == "response"


def test_vivo_llm_invalid_app_id_maps_to_specific_auth_diagnosis(monkeypatch):
    monkeypatch.setattr(
        requests,
        "post",
        lambda *args, **kwargs: FakeResponse(
            401,
            {"error_code": 40102, "error_msg": "invalid app_id", "trace_id": "trace-invalid-app-id"},
        ),
    )

    with pytest.raises(ProviderAuthenticationError) as exc_info:
        VivoLlmProvider(build_settings()).summarize(prompt="test", fallback="fallback")

    assert exc_info.value.diagnosis == "app_id_invalid_or_mismatched"
    assert exc_info.value.error_code == 40102
    assert exc_info.value.error_msg == "invalid app_id"
    assert exc_info.value.trace_id == "trace-invalid-app-id"
    assert exc_info.value.request_id
    assert exc_info.value.auth_shape == AUTH_SHAPE
    assert exc_info.value.app_id_carrier == DEFAULT_APP_ID_CARRIER
    assert exc_info.value.request_id_key == REQUEST_ID_QUERY_KEY
    assert exc_info.value.signature_mode == SIGNATURE_MODE
    assert exc_info.value.raw == {
        "error_code": 40102,
        "error_msg": "invalid app_id",
        "trace_id": "trace-invalid-app-id",
    }


def test_vivo_llm_invalid_api_key_maps_to_specific_auth_diagnosis(monkeypatch):
    monkeypatch.setattr(
        requests,
        "post",
        lambda *args, **kwargs: FakeResponse(
            401,
            {"message": "invalid api-key", "trace_id": "trace-api-key"},
        ),
    )

    with pytest.raises(ProviderAuthenticationError) as exc_info:
        VivoLlmProvider(build_settings()).summarize(prompt="test", fallback="fallback")

    assert exc_info.value.diagnosis == "app_key_invalid"
    assert exc_info.value.kind == "auth"
    assert exc_info.value.trace_id == "trace-api-key"


def test_vivo_llm_permission_code_30001_maps_to_permission_diagnosis(monkeypatch):
    monkeypatch.setattr(
        requests,
        "post",
        lambda *args, **kwargs: FakeResponse(
            403,
            {
                "error_code": 30001,
                "error_msg": "no model access permission permission expires",
                "trace_id": "trace-permission",
            },
        ),
    )

    with pytest.raises(ProviderResponseError) as exc_info:
        VivoLlmProvider(build_settings()).summarize(prompt="test", fallback="fallback")

    assert exc_info.value.diagnosis == "model_permission_missing"
    assert exc_info.value.kind == "permission"
    assert exc_info.value.error_code == 30001
    assert exc_info.value.trace_id == "trace-permission"


def test_vivo_llm_signature_error_maps_to_specific_auth_diagnosis(monkeypatch):
    monkeypatch.setattr(
        requests,
        "post",
        lambda *args, **kwargs: FakeResponse(
            401,
            {"error_code": 40101, "error_msg": "missing required signature in the request header", "trace_id": "trace-signature"},
        ),
    )

    with pytest.raises(ProviderAuthenticationError) as exc_info:
        VivoLlmProvider(build_settings()).summarize(prompt="test", fallback="fallback")

    assert exc_info.value.diagnosis == "signature_invalid_or_missing"
    assert exc_info.value.kind == "auth"
    assert exc_info.value.trace_id == "trace-signature"
    assert exc_info.value.app_id_carrier == DEFAULT_APP_ID_CARRIER
