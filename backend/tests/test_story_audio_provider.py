from __future__ import annotations

import pytest
from pydantic import SecretStr

from app.core.config import Settings
from app.providers.story_audio_provider import VivoStoryAudioProvider, resolve_story_audio_provider
from app.services.storybook_runtime_cache import get_storybook_runtime_cache


def _settings(**overrides) -> Settings:
    base = {
        "vivo_app_id": "demo-app",
        "vivo_app_key": SecretStr("demo-key"),
        "storybook_audio_provider": "vivo",
        "storybook_tts_engineid": "short_audio_synthesis_jovi",
        "storybook_tts_voice": "yige",
        "storybook_tts_fallback_engineid": "short_audio_synthesis_jovi",
        "storybook_tts_fallback_voice": "vivoHelper",
        "request_timeout_seconds": 1.0,
    }
    base.update(overrides)
    return Settings(**base)


@pytest.fixture(autouse=True)
def clear_storybook_runtime_cache():
    get_storybook_runtime_cache().clear()
    yield
    get_storybook_runtime_cache().clear()


def test_vivo_story_audio_provider_renders_and_reuses_runtime_cache():
    calls: list[dict[str, object]] = []

    class _FakeTtsProvider:
        def synthesize(self, **kwargs):
            calls.append(kwargs)
            return {
                "provider": "vivo-tts",
                "mode": "live",
                "audioUrl": "data:audio/wav;base64,AAAA",
                "audioRef": "vivo-tts-1",
                "audioScript": kwargs["text"],
                "voiceStyle": kwargs["voice_style"],
                "engineId": "short_audio_synthesis_jovi",
                "voiceName": "yige",
                "requestId": "req-1",
                "audioBytes": b"RIFF",
                "audioContentType": "audio/wav",
            }

    provider = VivoStoryAudioProvider(_settings())
    provider._tts_provider = _FakeTtsProvider()

    kwargs = {
        "story_mode": "storybook",
        "scene_index": 0,
        "child_name": "安安",
        "scene_title": "第一页",
        "scene_text": "今晚先慢慢说出自己的感受。",
        "child_id": "child-1",
        "story_id": "storybook-1",
        "audio_script": "第一页。今晚先慢慢说出自己的感受。",
        "voice_style": "warm-storytelling",
    }

    first = provider.render_scene(**kwargs)
    cached = provider.read_cached_scene(**kwargs)

    assert first.output["audioStatus"] == "ready"
    assert first.output["audioUrl"] == "data:audio/wav;base64,AAAA"
    assert first.output["voiceStyle"] == "warm-storytelling"
    assert first.output["engineId"] == "short_audio_synthesis_jovi"
    assert first.output["voiceName"] == "yige"
    assert cached is not None
    assert cached.output["cacheHit"] is True
    assert cached.output["audioStatus"] == "ready"
    assert cached.output["engineId"] == "short_audio_synthesis_jovi"
    assert cached.output["voiceName"] == "yige"
    assert len(calls) == 1


def test_story_audio_provider_prefers_vivo_in_auto_mode_when_credentials_exist():
    provider = resolve_story_audio_provider(_settings(storybook_audio_provider="auto"))

    assert provider.provider_name == "vivo-story-tts"


def test_story_audio_provider_falls_back_to_mock_without_vivo_credentials():
    provider = resolve_story_audio_provider(
        Settings(
            storybook_audio_provider="auto",
            vivo_app_id=None,
            vivo_app_key=None,
        )
    )

    assert provider.provider_name == "storybook-mock-preview"
