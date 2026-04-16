from __future__ import annotations

import base64
import json
import logging
from urllib.parse import parse_qs, urlparse

import pytest
from pydantic import SecretStr

from app.core.config import Settings
from app.providers.base import ProviderResponseError
from app.providers.vivo_tts import (
    TTS_AUDIO_FORMAT,
    TTS_AUTH_MODE,
    TTS_PATH,
    TTS_RUNTIME_METADATA_KEYS,
    VivoTtsProvider,
    _build_gateway_headers,
)


class _FakeWebSocket:
    def __init__(self, frames: list[dict[str, object]]):
        self.frames = [json.dumps(frame, ensure_ascii=False) for frame in frames]
        self.sent_messages: list[str] = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        del exc_type, exc, tb
        return False

    def send(self, message: str):
        self.sent_messages.append(message)

    def recv(self, timeout=None):
        del timeout
        if not self.frames:
            raise AssertionError("unexpected recv call")
        return self.frames.pop(0)


class _SendFirstWebSocket(_FakeWebSocket):
    def recv(self, timeout=None):
        assert self.sent_messages, "recv called before send"
        return super().recv(timeout=timeout)


class _FakeResponse:
    def __init__(self, *, status_code: int, headers: dict[str, str] | None = None, body: bytes | None = None):
        self.status_code = status_code
        self.headers = headers or {}
        self.body = body or b""


class _FakeInvalidStatus(Exception):
    def __init__(self, response: _FakeResponse):
        super().__init__(f"status={response.status_code}")
        self.response = response


def _settings(**overrides) -> Settings:
    base = {
        "vivo_app_id": "demo-app",
        "vivo_app_key": SecretStr("demo-key"),
        "storybook_audio_provider": "vivo",
        "storybook_tts_engineid": "short_audio_synthesis_jovi",
        "storybook_tts_voice": "yige",
        "storybook_tts_fallback_engineid": "short_audio_synthesis_jovi",
        "storybook_tts_fallback_voice": "vivoHelper",
        "storybook_tts_model": "storybook-runtime",
        "storybook_tts_product": "smartchildcare-agent",
        "storybook_tts_package": "cn.smartchildcare.agent",
        "storybook_tts_client_version": "6.2.1",
        "storybook_tts_system_version": "OriginOS 5",
        "storybook_tts_sdk_version": "31",
        "storybook_tts_android_version": "15",
        "request_timeout_seconds": 1.0,
    }
    base.update(overrides)
    return Settings(**base)


def _single_value_query(url: str) -> dict[str, str]:
    parsed = urlparse(url)
    return {key: values[0] for key, values in parse_qs(parsed.query, keep_blank_values=True).items()}


def test_vivo_tts_provider_returns_wav_data_url_with_signed_headers(monkeypatch: pytest.MonkeyPatch):
    captured: dict[str, object] = {}

    monkeypatch.setattr("app.providers.vivo_tts._generate_nonce", lambda length=8: "abc123xy")
    monkeypatch.setattr("app.providers.vivo_tts.time.time", lambda: 1_700_000_000)

    def fake_connect(url, **kwargs):
        websocket = _SendFirstWebSocket(
            [
                {
                    "error_code": 0,
                    "data": {
                        "audio": base64.b64encode(b"\x01\x02\x03\x04").decode("utf-8"),
                        "status": 1,
                        "progress": 1,
                        "slice": 0,
                    },
                },
                {
                    "error_code": 0,
                    "data": {
                        "audio": base64.b64encode(b"\x05\x06").decode("utf-8"),
                        "status": 2,
                        "progress": 2,
                        "slice": 1,
                    },
                },
            ]
        )
        captured["url"] = url
        captured["headers"] = kwargs["additional_headers"]
        captured["websocket"] = websocket
        return websocket

    monkeypatch.setattr("app.providers.vivo_tts.connect", fake_connect)

    result = VivoTtsProvider(_settings()).synthesize(
        text="hello story",
        child_id="child-1",
        story_id="storybook-1",
        scene_index=0,
        voice_style="warm-storytelling",
    )

    parsed = urlparse(captured["url"])
    query = _single_value_query(captured["url"])
    expected_headers = _build_gateway_headers(
        app_id="demo-app",
        app_key="demo-key",
        method="GET",
        uri=TTS_PATH,
        query=query,
        timestamp="1700000000",
        nonce="abc123xy",
    )
    sent_payload = json.loads(captured["websocket"].sent_messages[0])

    assert parsed.scheme == "wss"
    assert parsed.netloc == "api-ai.vivo.com.cn"
    assert parsed.path == TTS_PATH
    assert query["engineid"] == "short_audio_synthesis_jovi"
    assert query["system_time"] == "1700000000"
    assert len(query["user_id"]) == 32
    assert query["requestId"] == result["requestId"]
    assert query["model"] == "storybook-runtime"
    assert query["product"] == "smartchildcare-agent"
    assert query["package"] == "cn.smartchildcare.agent"
    assert query["client_version"] == "6.2.1"
    assert query["system_version"] == "OriginOS 5"
    assert query["sdk_version"] == "31"
    assert query["android_version"] == "15"
    assert set(query) == {"engineid", "system_time", "user_id", "requestId", *TTS_RUNTIME_METADATA_KEYS}
    assert captured["headers"]["Authorization"] == "Bearer demo-key"
    assert {key: value for key, value in captured["headers"].items() if key != "Authorization"} == expected_headers
    assert set(sent_payload) == {"aue", "auf", "vcn", "text", "encoding", "reqId"}
    assert sent_payload["aue"] == 0
    assert sent_payload["auf"] == TTS_AUDIO_FORMAT
    assert sent_payload["vcn"] == "yige"
    assert sent_payload["encoding"] == "utf8"
    assert isinstance(sent_payload["reqId"], int)
    assert result["provider"] == "vivo-tts"
    assert result["mode"] == "live"
    assert result["audioUrl"].startswith("data:audio/wav;base64,")
    wav_bytes = base64.b64decode(result["audioUrl"].split(",", 1)[1])
    assert wav_bytes[:4] == b"RIFF"
    assert result["voiceStyle"] == "warm-storytelling"
    assert result["engineId"] == "short_audio_synthesis_jovi"
    assert result["voiceName"] == "yige"
    assert result["requestId"]


def test_vivo_tts_provider_uses_rich_runtime_handshake_query(monkeypatch: pytest.MonkeyPatch):
    captured: dict[str, object] = {}

    def fake_connect(url, **kwargs):
        del kwargs
        captured["url"] = url
        return _FakeWebSocket(
            [
                {
                    "error_code": 0,
                    "data": {
                        "audio": base64.b64encode(b"\x01\x02").decode("utf-8"),
                        "status": 2,
                        "progress": 100,
                        "slice": 0,
                    },
                },
            ]
        )

    monkeypatch.setattr("app.providers.vivo_tts.connect", fake_connect)

    VivoTtsProvider(_settings()).synthesize(text="bedtime story", child_id="child-1", story_id="storybook-1")

    query = _single_value_query(captured["url"])
    assert set(query) == {"engineid", "system_time", "user_id", "requestId", *TTS_RUNTIME_METADATA_KEYS}
    assert query["requestId"]
    assert all(query[key] for key in TTS_RUNTIME_METADATA_KEYS)


def test_vivo_tts_provider_normalizes_placeholder_runtime_metadata_in_query_and_diagnostics(
    monkeypatch: pytest.MonkeyPatch,
):
    captured: dict[str, object] = {}

    monkeypatch.setattr("app.providers.vivo_tts.InvalidStatus", _FakeInvalidStatus)

    def fake_connect(url, **kwargs):
        captured["url"] = url
        del kwargs
        raise _FakeInvalidStatus(
            _FakeResponse(
                status_code=400,
                headers={"Content-Type": "application/json"},
                body=b'{"error_code":10000,"error_msg":"package not exist"}',
            )
        )

    monkeypatch.setattr("app.providers.vivo_tts.connect", fake_connect)

    with pytest.raises(ProviderResponseError, match="status 400") as exc:
        VivoTtsProvider(
            _settings(
                storybook_tts_model="unknown",
                storybook_tts_product="placeholder",
                storybook_tts_package="n/a",
                storybook_tts_client_version="todo",
                storybook_tts_system_version="unset",
                storybook_tts_sdk_version="none",
                storybook_tts_android_version="null",
            )
        ).synthesize(text="handshake 400", child_id="child-1", story_id="storybook-1")

    query = _single_value_query(captured["url"])
    assert set(query) == {"engineid", "system_time", "user_id", "requestId", *TTS_RUNTIME_METADATA_KEYS}
    assert all(query[key] == "" for key in TTS_RUNTIME_METADATA_KEYS)
    assert exc.value.diagnosis == "runtime_profile_missing_or_placeholder"
    assert exc.value.invalid_runtime_fields == list(TTS_RUNTIME_METADATA_KEYS)
    assert exc.value.runtime_metadata == {key: "" for key in TTS_RUNTIME_METADATA_KEYS}
    assert "runtime_fields=model,product,package,client_version,system_version,sdk_version,android_version" in str(exc.value)


def test_vivo_tts_provider_ignores_ack_frames_without_data(monkeypatch: pytest.MonkeyPatch):
    def fake_connect(url, **kwargs):
        del url, kwargs
        return _FakeWebSocket(
            [
                {"error_code": 0, "error_msg": "connect success"},
                {
                    "error_code": 0,
                    "data": {
                        "audio": base64.b64encode(b"\x01\x02").decode("utf-8"),
                        "status": 2,
                        "progress": 100,
                        "slice": 0,
                    },
                },
            ]
        )

    monkeypatch.setattr("app.providers.vivo_tts.connect", fake_connect)

    result = VivoTtsProvider(_settings()).synthesize(text="ack frame", child_id="child-1", story_id="storybook-1")

    assert result["engineId"] == "short_audio_synthesis_jovi"
    assert result["voiceName"] == "yige"


def test_vivo_tts_provider_includes_speed_and_volume_when_non_default(monkeypatch: pytest.MonkeyPatch):
    captured: dict[str, object] = {}

    def fake_connect(url, **kwargs):
        websocket = _FakeWebSocket(
            [
                {
                    "error_code": 0,
                    "data": {
                        "audio": base64.b64encode(b"\x01\x02").decode("utf-8"),
                        "status": 2,
                        "progress": 100,
                        "slice": 0,
                    },
                },
            ]
        )
        captured["websocket"] = websocket
        return websocket

    monkeypatch.setattr("app.providers.vivo_tts.connect", fake_connect)

    VivoTtsProvider(_settings(storybook_tts_speed=60, storybook_tts_volume=30)).synthesize(
        text="speed volume",
        child_id="child-1",
        story_id="storybook-1",
    )

    sent_payload = json.loads(captured["websocket"].sent_messages[0])
    assert sent_payload["speed"] == 60
    assert sent_payload["volume"] == 30


def test_vivo_tts_provider_raises_on_frame_error(monkeypatch: pytest.MonkeyPatch):
    def fake_connect(url, **kwargs):
        del url, kwargs
        return _FakeWebSocket(
            [
                {"error_code": 12345, "error_msg": "bad frame"},
            ]
        )

    monkeypatch.setattr("app.providers.vivo_tts.connect", fake_connect)

    with pytest.raises(ProviderResponseError, match="synthesis failed"):
        VivoTtsProvider(_settings()).synthesize(text="frame error", child_id="child-1", story_id="storybook-1")


def test_vivo_tts_provider_raises_when_audio_is_empty(monkeypatch: pytest.MonkeyPatch):
    def fake_connect(url, **kwargs):
        del url, kwargs
        return _FakeWebSocket(
            [
                {"error_code": 0, "data": {"status": 2, "progress": 100, "slice": 1}},
            ]
        )

    monkeypatch.setattr("app.providers.vivo_tts.connect", fake_connect)

    with pytest.raises(ProviderResponseError, match="without audio data"):
        VivoTtsProvider(_settings()).synthesize(text="no audio", child_id="child-1", story_id="storybook-1")


def test_vivo_tts_provider_logs_handshake_400_with_redacted_context(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
):
    monkeypatch.setattr("app.providers.vivo_tts.InvalidStatus", _FakeInvalidStatus)

    def fake_connect(url, **kwargs):
        del url, kwargs
        raise _FakeInvalidStatus(
            _FakeResponse(
                status_code=400,
                headers={"Content-Type": "application/json", "X-Request-Id": "req-123"},
                body=b'{"error_code":10000,"error_msg":"package not exist","trace_id":"trace-123"}',
            )
        )

    monkeypatch.setattr("app.providers.vivo_tts.connect", fake_connect)
    caplog.set_level(logging.WARNING, logger="app.providers.vivo_tts")

    with pytest.raises(ProviderResponseError, match="status 400") as exc:
        VivoTtsProvider(
            _settings(
                storybook_tts_fallback_engineid="short_audio_synthesis_jovi",
                storybook_tts_fallback_voice="yige",
            )
        ).synthesize(text="handshake 400", child_id="child-1", story_id="storybook-1")

    message = str(exc.value)
    assert "profile=primary" in message
    assert "engine=short_audio_synthesis_jovi" in message
    assert "voice=yige" in message
    assert "diagnosis=runtime_profile_rejected" in message
    assert "error_code=10000" in message
    assert "package not exist" in message
    assert "demo-key" not in message
    assert exc.value.diagnosis == "runtime_profile_rejected"
    assert exc.value.error_code == 10000
    assert exc.value.error_msg == "package not exist"
    assert exc.value.invalid_runtime_fields == []
    assert "demo-key" not in caplog.text
    assert "wss://api-ai.vivo.com.cn/tts?" in caplog.text
    assert "package not exist" in caplog.text
    assert '"profile": "primary"' in caplog.text
    assert f'"auth_mode": "{TTS_AUTH_MODE}"' in caplog.text
    assert '"requestId"' in caplog.text
    assert '"package"' in caplog.text
    assert '"diagnosis": "runtime_profile_rejected"' in caplog.text
    assert '"trace_id": "trace-123"' in caplog.text


def test_vivo_tts_provider_falls_back_to_secondary_voice_profile(monkeypatch: pytest.MonkeyPatch):
    calls: list[str] = []

    def fake_connect(url, **kwargs):
        del kwargs
        calls.append(url)
        if "engineid=broken_engine" in url:
            raise ProviderResponseError("primary profile rejected")
        return _FakeWebSocket(
            [
                {
                    "error_code": 0,
                    "data": {
                        "audio": base64.b64encode(b"\x11\x22").decode("utf-8"),
                        "status": 2,
                        "progress": 2,
                        "slice": 0,
                    },
                },
            ]
        )

    monkeypatch.setattr("app.providers.vivo_tts.connect", fake_connect)

    result = VivoTtsProvider(
        _settings(
            storybook_tts_engineid="broken_engine",
            storybook_tts_voice="broken_voice",
            storybook_tts_fallback_engineid="short_audio_synthesis_jovi",
            storybook_tts_fallback_voice="vivoHelper",
        )
    ).synthesize(text="fallback", child_id="child-1", story_id="storybook-1")

    assert len(calls) == 2
    assert "engineid=short_audio_synthesis_jovi" in calls[1]
    assert result["engineId"] == "short_audio_synthesis_jovi"
    assert result["voiceName"] == "vivoHelper"
    assert result["profileLabel"] == "fallback"
    assert result["mode"] == "live"
