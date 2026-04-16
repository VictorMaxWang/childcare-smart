from __future__ import annotations

import requests
import pytest
from pydantic import SecretStr

import app.providers.vivo_asr as vivo_asr
from app.core.config import Settings
from app.providers.base import AsrProviderInput, ProviderAuthenticationError, ProviderConfigurationError, ProviderResponseError
from app.providers.resolver import resolve_asr_provider
from app.providers.vivo_asr import MockAsrProvider, VivoAsrProvider


class FakeResponse:
    def __init__(self, status_code: int, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


def build_settings(**overrides) -> Settings:
    defaults = {
        "brain_provider": "vivo",
        "enable_mock_provider": True,
        "request_timeout_seconds": 15,
        "vivo_app_id": "app-id",
        "vivo_app_key": SecretStr("app-key"),
    }
    defaults.update(overrides)
    return Settings(**defaults)


def test_resolve_asr_provider_without_vivo_credentials_uses_mock():
    provider = resolve_asr_provider(build_settings(vivo_app_id=None, vivo_app_key=None), prefer_vivo=True)
    assert isinstance(provider, MockAsrProvider)

    result = provider.transcribe(
        AsrProviderInput(
            attachment_name="voice.webm",
            mime_type="audio/webm",
            duration_ms=12000,
            scene="teacher-global-fab",
        )
    )

    assert result.provider == "mock-asr"
    assert result.mode == "mock"
    assert result.source == "mock"
    assert result.output.transcript
    assert result.output.fallback is True


def test_vivo_asr_provided_transcript_short_circuits_network(monkeypatch):
    def fail_post(*args, **kwargs):
        raise AssertionError("network should not be used for provided transcript")

    monkeypatch.setattr(requests, "post", fail_post)

    provider = VivoAsrProvider(build_settings())
    result = provider.transcribe(AsrProviderInput(transcript="小明今天体温37.6度，需要继续观察。"))

    assert result.provider == "vivo-asr"
    assert result.mode == "mock"
    assert result.source == "provided_transcript"
    assert result.model == vivo_asr.ASR_MODEL_NAME
    assert result.output.transcript == "小明今天体温37.6度，需要继续观察。"
    assert result.output.fallback is False


def test_vivo_asr_success_path_uses_lasr_transport(monkeypatch):
    monkeypatch.setattr(vivo_asr, "ASR_UPLOAD_SLICE_BYTES", 4)
    calls: list[dict] = []

    def fake_post(url, **kwargs):
        calls.append({"url": url, **kwargs})
        if url.endswith("/lasr/create"):
            return FakeResponse(200, {"sid": "sid-create", "code": 0, "desc": "success", "data": {"audio_id": "audio-1"}})
        if url.endswith("/lasr/upload"):
            upload_index = sum(1 for call in calls if call["url"].endswith("/lasr/upload"))
            return FakeResponse(
                200,
                {
                    "sid": f"sid-upload-{upload_index}",
                    "code": 0,
                    "desc": "success",
                    "data": {"audio_id": "audio-1", "total": 2, "slices": upload_index},
                },
            )
        if url.endswith("/lasr/run"):
            return FakeResponse(200, {"sid": "sid-run", "code": 0, "desc": "success", "data": {"task_id": "task-1"}})
        if url.endswith("/lasr/progress"):
            return FakeResponse(200, {"sid": "sid-progress", "code": 0, "desc": "success", "data": {"progress": 100}})
        if url.endswith("/lasr/result"):
            return FakeResponse(
                200,
                {
                    "sid": "sid-result",
                    "code": 0,
                    "desc": "success",
                    "type": "asr",
                    "data": {
                        "result": [
                            {"onebest": "小明今天", "bg": 0, "ed": 800, "speaker": 1},
                            {"onebest": "有点咳嗽。", "bg": 801, "ed": 1600, "speaker": 1},
                        ]
                    },
                },
            )
        raise AssertionError(f"unexpected url: {url}")

    monkeypatch.setattr(requests, "post", fake_post)

    provider = VivoAsrProvider(build_settings())
    result = provider.transcribe(
        AsrProviderInput(
            audio_bytes=b"abcdefgh",
            attachment_name="voice.wav",
            mime_type="audio/wav",
            duration_ms=1600,
            scene="teacher-global-fab",
        )
    )

    assert len(calls) == 6
    create_call, upload_call_1, upload_call_2, run_call, progress_call, result_call = calls
    assert create_call["url"] == "https://api-ai.vivo.com.cn/lasr/create"
    assert upload_call_1["url"] == "https://api-ai.vivo.com.cn/lasr/upload"
    assert run_call["url"] == "https://api-ai.vivo.com.cn/lasr/run"
    assert progress_call["url"] == "https://api-ai.vivo.com.cn/lasr/progress"
    assert result_call["url"] == "https://api-ai.vivo.com.cn/lasr/result"

    request_id = create_call["params"]["requestId"]
    user_id = create_call["params"]["user_id"]
    session_id = create_call["json"]["x-sessionId"]
    assert len(user_id) == 32
    assert create_call["params"]["engineid"] == vivo_asr.ASR_ENGINE_ID
    assert create_call["json"]["audio_type"] == "auto"
    assert create_call["json"]["slice_num"] == 2
    assert create_call["headers"]["Authorization"] == "Bearer app-key"

    for call in (create_call, upload_call_1, upload_call_2, run_call, progress_call, result_call):
        assert call["params"]["requestId"] == request_id
        assert call["params"]["user_id"] == user_id
        assert call["headers"]["Authorization"] == "Bearer app-key"

    assert upload_call_1["params"]["audio_id"] == "audio-1"
    assert upload_call_1["params"]["slice_index"] == 0
    assert upload_call_1["params"]["x-sessionId"] == session_id
    assert upload_call_1["files"]["file"][0] == "voice.wav"
    assert upload_call_1["files"]["file"][1] == b"abcd"
    assert upload_call_2["params"]["slice_index"] == 1
    assert upload_call_2["files"]["file"][1] == b"efgh"

    assert run_call["json"] == {"audio_id": "audio-1", "x-sessionId": session_id}
    assert progress_call["json"] == {"task_id": "task-1", "x-sessionId": session_id}
    assert result_call["json"] == {"task_id": "task-1", "x-sessionId": session_id}

    assert result.provider == "vivo-asr"
    assert result.mode == "real"
    assert result.source == "vivo"
    assert result.model == vivo_asr.ASR_MODEL_NAME
    assert result.request_id == request_id
    assert result.output.transcript == "小明今天有点咳嗽。"
    assert result.output.confidence is None
    assert result.output.fallback is False
    assert len(result.output.segments or []) == 2
    assert result.output.segments[0].text == "小明今天"
    assert result.output.segments[0].start_ms == 0
    assert result.output.segments[0].end_ms == 800
    assert result.output.meta["audio_id"] == "audio-1"
    assert result.output.meta["task_id"] == "task-1"
    assert result.output.meta["transport"] == vivo_asr.ASR_TRANSPORT_NAME
    assert result.output.raw["stages"]["result"]["sid"] == "sid-result"


def test_vivo_asr_authentication_failure_does_not_fallback(monkeypatch):
    monkeypatch.setattr(requests, "post", lambda *args, **kwargs: FakeResponse(401, {"message": "invalid api-key"}))

    with pytest.raises(ProviderAuthenticationError):
        VivoAsrProvider(build_settings(enable_mock_provider=True)).transcribe(
            AsrProviderInput(audio_bytes=b"audio", attachment_name="voice.wav", mime_type="audio/wav")
        )


def test_vivo_asr_timeout_falls_back_when_enabled(monkeypatch):
    def fake_post(*args, **kwargs):
        raise requests.Timeout("request timed out")

    monkeypatch.setattr(requests, "post", fake_post)
    result = VivoAsrProvider(build_settings(enable_mock_provider=True)).transcribe(
        AsrProviderInput(
            audio_bytes=b"audio",
            attachment_name="voice.wav",
            mime_type="audio/wav",
            fallback_text="备用转写",
        )
    )

    assert result.provider == "vivo-asr"
    assert result.mode == "mock"
    assert result.source == "mock"
    assert result.output.transcript == "备用转写"
    assert result.output.fallback is True
    assert result.output.meta["reason"] == "timeout"
    assert result.output.meta["stage"] == "create"
    assert result.output.raw["stage"] == "create"


def test_vivo_asr_business_error_falls_back_when_enabled(monkeypatch):
    monkeypatch.setattr(
        requests,
        "post",
        lambda *args, **kwargs: FakeResponse(200, {"code": 10001, "desc": "invalid", "data": {}}),
    )

    result = VivoAsrProvider(build_settings(enable_mock_provider=True)).transcribe(
        AsrProviderInput(audio_bytes=b"audio", attachment_name="voice.wav", mime_type="audio/wav")
    )

    assert result.source == "mock"
    assert result.output.fallback is True
    assert result.output.meta["reason"] == "business-error"
    assert result.output.meta["business_code"] == 10001
    assert result.output.raw["business_code"] == 10001


def test_vivo_asr_missing_configuration_falls_back_when_enabled():
    result = VivoAsrProvider(build_settings(vivo_app_id=None, vivo_app_key=None, enable_mock_provider=True)).transcribe(
        AsrProviderInput(audio_bytes=b"audio", attachment_name="voice.wav", mime_type="audio/wav")
    )

    assert result.provider == "vivo-asr"
    assert result.source == "mock"
    assert result.output.fallback is True
    assert result.output.meta["reason"] == "missing-configuration"


def test_vivo_asr_missing_configuration_raises_when_mock_disabled():
    provider = VivoAsrProvider(build_settings(vivo_app_id=None, vivo_app_key=None, enable_mock_provider=False))

    with pytest.raises(ProviderConfigurationError):
        provider.transcribe(AsrProviderInput(audio_bytes=b"audio", attachment_name="voice.wav", mime_type="audio/wav"))


def test_vivo_asr_server_error_raises_when_mock_disabled(monkeypatch):
    monkeypatch.setattr(requests, "post", lambda *args, **kwargs: FakeResponse(503, {"error": "unavailable"}))

    with pytest.raises(ProviderResponseError):
        VivoAsrProvider(build_settings(enable_mock_provider=False)).transcribe(
            AsrProviderInput(audio_bytes=b"audio", attachment_name="voice.wav", mime_type="audio/wav")
        )


def test_vivo_asr_invalid_result_falls_back_when_enabled(monkeypatch):
    responses = [
        FakeResponse(200, {"code": 0, "data": {"audio_id": "audio-1"}}),
        FakeResponse(200, {"code": 0, "data": {"audio_id": "audio-1", "total": 1, "slices": 1}}),
        FakeResponse(200, {"code": 0, "data": {"task_id": "task-1"}}),
        FakeResponse(200, {"code": 0, "data": {"progress": 100}}),
        FakeResponse(200, {"code": 0, "data": {"result": [{"bg": 0, "ed": 100}]}}),
    ]

    def fake_post(*args, **kwargs):
        return responses.pop(0)

    monkeypatch.setattr(requests, "post", fake_post)

    result = VivoAsrProvider(build_settings(enable_mock_provider=True)).transcribe(
        AsrProviderInput(audio_bytes=b"audio", attachment_name="voice.wav", mime_type="audio/wav")
    )

    assert result.source == "mock"
    assert result.output.fallback is True
    assert result.output.meta["reason"] == "empty-transcript"
    assert result.output.raw["stage"] == "result"


def test_vivo_asr_fallback_never_leaks_secret_values(monkeypatch):
    def fake_post(*args, **kwargs):
        raise requests.Timeout("request timed out")

    monkeypatch.setattr(requests, "post", fake_post)
    provider = VivoAsrProvider(build_settings(vivo_app_id="real-id", vivo_app_key=SecretStr("real-key")))
    result = provider.transcribe(
        AsrProviderInput(
            audio_bytes=b"audio",
            attachment_name="voice.wav",
            mime_type="audio/wav",
        )
    )

    serialized_meta = str(result.output.meta)
    serialized_raw = str(result.output.raw)
    assert "real-key" not in serialized_meta
    assert "real-key" not in serialized_raw
