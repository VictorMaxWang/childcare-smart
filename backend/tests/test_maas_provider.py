from __future__ import annotations

import asyncio
import json
import logging

import httpx
import pytest

from app.core.config import Settings
from app.core.health import resolve_provider_status
from app.providers.base import AsrProviderInput, ProviderAuthenticationError, ProviderResponseError
from app.providers.maas import MaasAsrProvider, MaasTextProvider, summarize_async
from app.providers.resolver import resolve_asr_provider, resolve_text_provider


def configured() -> Settings:
    return Settings(ai_provider="maas", ai_api_key="test-only-secret", ai_base_url="https://gateway.example/v1", vivo_app_id="legacy-configured", vivo_app_key="legacy-unused")


def test_maas_selection_takes_precedence_over_old_vivo():
    assert isinstance(resolve_text_provider(configured(), prefer_vivo=True), MaasTextProvider)
    assert isinstance(resolve_asr_provider(configured(), prefer_vivo=True), MaasAsrProvider)
    statuses = resolve_provider_status(configured())
    assert all(status.configured and not status.live and status.state == "configured" for status in statuses.values())


def test_verified_qwen_direct_answer_parameters_do_not_leak_into_glm():
    selected = MaasTextProvider(configured())
    messages = [{"role": "user", "content": "JSON"}]
    qwen = selected._request_shape(messages, "qwen3.8-flash", json_output=True)[2]
    assert qwen["enable_thinking"] is False and "reasoning_effort" not in qwen
    for model in ("ZHIPU/GLM-5.3-Flash", "unverified-model"):
        body = selected._request_shape(messages, model)[2]
        assert "enable_thinking" not in body


def test_json_output_is_explicit_and_does_not_change_plain_text_or_asr():
    selected = MaasTextProvider(configured())
    messages = [{"role": "user", "content": "synthetic"}]
    assert selected._request_shape(messages, json_output=True)[2]["response_format"] == {"type": "json_object"}
    assert "response_format" not in selected._request_shape(messages)[2]
    assert "response_format" not in selected._request_shape(messages, configured().ai_asr_model)[2]


def test_maas_chat_uses_content_and_compatible_parameters(monkeypatch):
    captured = {}

    def post(_client, endpoint, **kwargs):
        captured.update(kwargs["json"])
        assert endpoint == "https://gateway.example/v1/chat/completions"
        return httpx.Response(200, json={"id": "request-1", "choices": [{"finish_reason": "stop", "message": {"content": "真实返回", "reasoning_content": "不展示的思考"}}]})

    monkeypatch.setattr(httpx.Client, "post", post)
    result = MaasTextProvider(configured()).summarize("synthetic input", "must not be used")
    assert result.text == "真实返回" and result.source == "ai" and not result.fallback
    assert result.provider == "maas-llm" and result.request_id == "request-1"
    assert captured["reasoning_effort"] == "low" and "enable_thinking" not in captured


def test_maas_errors_are_sanitized(monkeypatch):
    for status in (401, 403, 429, 500):
        monkeypatch.setattr(httpx.Client, "post", lambda *_args, **_kwargs: httpx.Response(status, text="test-only-secret private input"))
        with pytest.raises(ProviderAuthenticationError if status in {401, 403} else ProviderResponseError) as error:
            MaasTextProvider(configured()).summarize("private input", "fallback")
        assert "test-only-secret" not in str(error.value) and "private input" not in str(error.value)


@pytest.mark.parametrize(("payload", "code", "category"), [
    ({"error": {"code": "InvalidParameter", "message": "private-child-input"}}, "InvalidParameter", "upstream-invalid-request"),
    ({"code": "DataInspectionFailed", "message": "private-child-input"}, "DataInspectionFailed", "upstream-content-rejected"),
    ({"error": {"code": "private-child-input", "message": "private-child-input"}}, None, "upstream-invalid-request"),
    ({"error": "private-child-input"}, None, "upstream-invalid-request"),
    ({"error": {"code": "invalid_parameter_error", "message": "The product is not activated, private-child-input"}}, "invalid_parameter_error", "upstream-model-not-activated"),
])
def test_upstream_failure_has_safe_status_and_allowlisted_diagnosis(monkeypatch, caplog, payload, code, category):
    caplog.set_level(logging.WARNING, logger="app.providers.maas")
    calls = []

    def post(*_args, **_kwargs):
        calls.append(1)
        return httpx.Response(400, json=payload)

    monkeypatch.setattr(httpx.Client, "post", post)
    with pytest.raises(ProviderResponseError) as raised:
        MaasTextProvider(configured()).summarize("private-prompt", "", json_output=True)
    assert len(calls) == 1
    assert raised.value.http_status == 400 and raised.value.diagnosis == category
    assert raised.value.error_code == code
    entries = [record.getMessage() for record in caplog.records if record.getMessage().startswith("ai.provider_error ")]
    assert len(entries) == 1
    assert json.loads(entries[0].removeprefix("ai.provider_error ")) == {
        "provider": "maas", "httpStatus": 400, "category": category, "code": code,
    }
    assert "private-" not in entries[0] and "private-" not in str(raised.value)
    assert "test-only-secret" not in entries[0] and "gateway.example" not in entries[0]


def test_http400_upstream_token_rejection_is_authentication_error_not_json_failure(monkeypatch, caplog):
    monkeypatch.setattr(httpx.Client, "post", lambda *_args, **_kwargs: httpx.Response(400, json={
        "error": {"code": "1004", "message": "private-upstream-authentication-body"},
    }))
    with pytest.raises(ProviderAuthenticationError) as raised:
        MaasTextProvider(configured()).summarize("synthetic input", "", json_output=True)
    assert raised.value.http_status == 400 and raised.value.error_code == "1004"
    assert raised.value.diagnosis == "upstream-authentication"
    assert "private-upstream-authentication-body" not in caplog.text


def test_sync_and_async_structured_requests_have_identical_model_and_shape(monkeypatch):
    bodies = []

    def post(_client, endpoint, **kwargs):
        bodies.append((endpoint, kwargs["json"]))
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"title":"synthetic"}'}}]})

    async def async_post(client, endpoint, **kwargs):
        return post(client, endpoint, **kwargs)

    monkeypatch.setattr(httpx.Client, "post", post)
    monkeypatch.setattr(httpx.AsyncClient, "post", async_post)
    provider = MaasTextProvider(configured())
    provider.summarize("synthetic JSON prompt", "", json_output=True)
    asyncio.run(provider.asummarize("synthetic JSON prompt", "", json_output=True))
    assert len(bodies) == 2 and bodies[0] == bodies[1]
    assert bodies[0][1]["model"] == "ZHIPU/GLM-5.3-Flash"
    assert bodies[0][1]["response_format"] == {"type": "json_object"}


def test_maas_rejects_reasoning_only_and_truncated_content(monkeypatch):
    for message in ({"message": {"reasoning_content": "thought"}}, {"finish_reason": "length", "message": {"content": "partial"}}):
        monkeypatch.setattr(httpx.Client, "post", lambda *_args, **_kwargs: httpx.Response(200, json={"choices": [message]}))
        with pytest.raises(ProviderResponseError):
            MaasTextProvider(configured()).summarize("synthetic input", "fallback")


def test_provider_validation_failure_classifies_without_logging_content(monkeypatch, caplog):
    caplog.set_level(logging.WARNING, logger="app.providers.maas")
    monkeypatch.setattr(httpx.Client, "post", lambda *_args, **_kwargs: httpx.Response(200, json={"choices": [{"finish_reason": "length", "message": {"content": "private-child-output"}}]}))
    with pytest.raises(ProviderResponseError):
        MaasTextProvider(configured()).summarize("private-prompt", "")
    messages = [record.getMessage() for record in caplog.records if record.getMessage().startswith("ai.structured_validation ")]
    assert len(messages) == 1
    assert json.loads(messages[0].removeprefix("ai.structured_validation ")) == {"category": "incomplete-provider-content", "fields": ["choices[0].finish_reason"]}
    assert "private" not in messages[0] and "test-only-secret" not in messages[0]


def test_async_maas_uses_async_http(monkeypatch):
    async def post(*_args, **_kwargs):
        await asyncio.sleep(0)
        return httpx.Response(200, json={"choices": [{"message": {"content": "异步答案"}}]})

    monkeypatch.setattr(httpx.AsyncClient, "post", post)
    result = asyncio.run(summarize_async(MaasTextProvider(configured()), prompt="合成提示", fallback=""))
    assert result.text == "异步答案"


def test_manual_transcript_is_never_claimed_as_live_asr():
    result = MaasAsrProvider(configured()).transcribe(AsrProviderInput(transcript="人工提供"))
    assert result.mode == "fallback" and result.source == "provided-transcript" and result.output.fallback


def test_maas_binary_asr_uses_selected_audio_model(monkeypatch):
    captured = {}

    def post(_client, _endpoint, **kwargs):
        captured.update(kwargs["json"])
        assert _endpoint == "https://gateway.example/api/v1/services/aigc/multimodal-generation/generation"
        return httpx.Response(200, json={"output": {"text": "合成录音"}})

    monkeypatch.setattr(httpx.Client, "post", post)
    result = MaasAsrProvider(configured()).transcribe(AsrProviderInput(audio_bytes=b"synthetic", mime_type="audio/wav"))
    assert result.mode == "live" and not result.output.fallback
    assert captured["model"] == configured().ai_asr_model
    assert captured["parameters"]["format"] == "wav" and "max_tokens" not in captured


def test_usage_audit_preserves_billed_invalid_content_without_private_text(monkeypatch, caplog):
    settings = configured().model_copy(update={"ai_usage_audit": True})
    caplog.set_level(logging.INFO, logger="app.providers.maas")
    monkeypatch.setattr(httpx.Client, "post", lambda *_args, **_kwargs: httpx.Response(200, json={
        "id": "synthetic-request", "usage": {"prompt_tokens": 10, "completion_tokens": 20,
            "completion_tokens_details": {"reasoning_tokens": 5, "text": "private-child-text"}, "privateField": "private-child-name"},
        "choices": [{"finish_reason": "length", "message": {"content": "private-answer"}}],
    }))
    with pytest.raises(ProviderResponseError):
        MaasTextProvider(settings).summarize("private-prompt", "")
    entries = [record.getMessage() for record in caplog.records if record.getMessage().startswith("ai.usage ")]
    assert len(entries) == 1
    entry = json.loads(entries[0].removeprefix("ai.usage "))
    assert entry["requestId"] == "synthetic-request" and entry["httpStatus"] == 200
    assert entry["usage"] == {"prompt_tokens": 10, "completion_tokens": 20, "completion_tokens_details": {"reasoning_tokens": 5}}
    assert "private-" not in entries[0] and "test-only-secret" not in entries[0] and "gateway.example" not in entries[0]


def test_usage_audit_defaults_off_and_native_asr_logs_duration(monkeypatch, caplog):
    caplog.set_level(logging.INFO, logger="app.providers.maas")
    monkeypatch.setattr(httpx.Client, "post", lambda *_args, **_kwargs: httpx.Response(200, json={"usage": {"total_tokens": 7}, "choices": [{"message": {"content": "answer"}}]}))
    assert MaasTextProvider(configured()).summarize("synthetic", "").usage == {"total_tokens": 7}
    assert not [record for record in caplog.records if record.getMessage().startswith("ai.usage ")]
    monkeypatch.setattr(httpx.Client, "post", lambda *_args, **_kwargs: httpx.Response(200, json={"request_id": "asr-test", "usage": {"duration": 2}, "output": {"text": "private-transcript"}}))
    MaasAsrProvider(configured().model_copy(update={"ai_usage_audit": True})).transcribe(AsrProviderInput(audio_bytes=b"synthetic-audio", mime_type="audio/wav"))
    entries = [record.getMessage() for record in caplog.records if record.getMessage().startswith("ai.usage ")]
    assert len(entries) == 1
    entry = json.loads(entries[0].removeprefix("ai.usage "))
    assert entry["requestId"] == "asr-test" and entry["usage"] == {"duration": 2}
    assert "private-transcript" not in entries[0] and "synthetic-audio" not in entries[0]
