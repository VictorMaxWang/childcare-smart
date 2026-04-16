from __future__ import annotations

import hashlib
from typing import Any

from app.core.config import Settings
from app.providers.base import ProviderResult
from app.providers.vivo_tts import VivoTtsProvider
from app.services.storybook_runtime_cache import get_storybook_runtime_cache


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split())


def _safe_setting_text(settings: Settings, field_name: str) -> str:
    return _normalize_text(getattr(settings, field_name, ""))


def _split_caption_segments(text: str) -> list[str]:
    normalized = _normalize_text(text)
    if not normalized:
        return []

    buffer: list[str] = []
    current = ""
    for char in normalized:
        current += char
        if char in "。！？!?":
            buffer.append(current.strip())
            current = ""
    if current.strip():
        buffer.append(current.strip())
    if buffer:
        return buffer

    return [segment.strip() for segment in normalized.replace("；", "，").split("，") if segment.strip()]


def _build_caption_duration_ms(segment: str) -> int:
    content_length = len(segment.replace(" ", ""))
    punctuation_count = sum(1 for char in segment if char in "，,；;：:。！？!?")
    return max(2400, 1700 + content_length * 95 + punctuation_count * 220)


def build_story_caption_timing(text: str) -> dict[str, Any]:
    segment_texts = _split_caption_segments(text)
    safe_segments = segment_texts or [_normalize_text(text)] if _normalize_text(text) else []
    return {
        "mode": "duration-derived",
        "segmentTexts": safe_segments,
        "segmentDurationsMs": [_build_caption_duration_ms(segment) for segment in safe_segments],
    }


def _has_vivo_credentials(settings: Settings) -> bool:
    app_id = (settings.vivo_app_id or "").strip()
    app_key = settings.vivo_app_key.get_secret_value().strip() if settings.vivo_app_key else ""
    return bool(app_id and app_key)


def story_audio_provider_prefers_vivo(settings: Settings) -> bool:
    provider_mode = settings.storybook_audio_provider.strip().lower() or "auto"
    return provider_mode in {"auto", "vivo"}


def can_use_vivo_story_audio_provider(settings: Settings) -> bool:
    return story_audio_provider_prefers_vivo(settings) and _has_vivo_credentials(settings)


def _build_mock_audio_script(
    *,
    child_name: str,
    scene_index: int,
    scene_title: str,
    scene_text: str,
) -> str:
    return f"{child_name} 的第 {scene_index + 1} 幕：{scene_title}。{scene_text[:110]}".strip()


def _build_story_audio_cache_key(
    *,
    script: str,
    voice_style: str,
    settings: Settings,
) -> str:
    seed = "::".join(
        [
            script,
            voice_style,
            settings.storybook_tts_engineid,
            settings.storybook_tts_voice,
            settings.storybook_tts_fallback_engineid,
            settings.storybook_tts_fallback_voice,
            _safe_setting_text(settings, "storybook_tts_model"),
            _safe_setting_text(settings, "storybook_tts_product"),
            _safe_setting_text(settings, "storybook_tts_package"),
            _safe_setting_text(settings, "storybook_tts_client_version"),
            _safe_setting_text(settings, "storybook_tts_system_version"),
            _safe_setting_text(settings, "storybook_tts_sdk_version"),
            _safe_setting_text(settings, "storybook_tts_android_version"),
        ]
    )
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()


class MockStoryAudioProvider:
    provider_name = "storybook-mock-preview"
    mode_name = "fallback"
    model_name = "storybook-audio-v1"

    def read_cached_scene(
        self,
        *,
        story_mode: str,
        scene_index: int,
        child_name: str,
        scene_title: str,
        scene_text: str,
        child_id: str | None = None,
        story_id: str | None = None,
        audio_script: str | None = None,
        voice_style: str | None = None,
    ) -> ProviderResult[dict[str, Any]] | None:
        del story_mode, scene_index, child_name, scene_title, scene_text, child_id, story_id, audio_script, voice_style
        return None

    def render_scene(
        self,
        *,
        story_mode: str,
        scene_index: int,
        child_name: str,
        scene_title: str,
        scene_text: str,
        child_id: str | None = None,
        story_id: str | None = None,
        audio_script: str | None = None,
        voice_style: str | None = None,
    ) -> ProviderResult[dict[str, Any]]:
        del child_id, story_id
        resolved_voice_style = voice_style or ("gentle-bedtime" if scene_index >= 2 else "warm-storytelling")
        script = audio_script or _build_mock_audio_script(
            child_name=child_name,
            scene_index=scene_index,
            scene_title=scene_title,
            scene_text=scene_text,
        )
        return ProviderResult(
            output={
                "audioUrl": None,
                "audioRef": f"storybook-audio-{scene_index + 1}",
                "audioScript": script,
                "audioStatus": "fallback" if story_mode == "storybook" else "mock",
                "captionTiming": build_story_caption_timing(script),
                "voiceStyle": resolved_voice_style,
                "cacheHit": False,
            },
            provider=self.provider_name,
            mode=self.mode_name,
            source="mock",
            model=self.model_name,
        )


class VivoStoryAudioProvider:
    provider_name = "vivo-story-tts"
    mode_name = "live"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._tts_provider = VivoTtsProvider(settings)

    def read_cached_scene(
        self,
        *,
        story_mode: str,
        scene_index: int,
        child_name: str,
        scene_title: str,
        scene_text: str,
        child_id: str | None = None,
        story_id: str | None = None,
        audio_script: str | None = None,
        voice_style: str | None = None,
    ) -> ProviderResult[dict[str, Any]] | None:
        del story_mode, child_id, story_id
        script = audio_script or _build_mock_audio_script(
            child_name=child_name,
            scene_index=scene_index,
            scene_title=scene_title,
            scene_text=scene_text,
        )
        resolved_voice_style = voice_style or self.settings.storybook_tts_voice
        cache_key = _build_story_audio_cache_key(
            script=script,
            voice_style=resolved_voice_style,
            settings=self.settings,
        )
        cached_result = get_storybook_runtime_cache().get(cache_key)
        if not cached_result:
            return None

        return ProviderResult(
            output={
                **cached_result["output"],
                "cacheHit": True,
            },
            provider=self.provider_name,
            mode=self.mode_name,
            source="cache",
            model=cached_result.get("model"),
            request_id=cached_result.get("requestId"),
        )

    def render_scene(
        self,
        *,
        story_mode: str,
        scene_index: int,
        child_name: str,
        scene_title: str,
        scene_text: str,
        child_id: str | None = None,
        story_id: str | None = None,
        audio_script: str | None = None,
        voice_style: str | None = None,
    ) -> ProviderResult[dict[str, Any]]:
        if story_mode != "storybook":
            raise RuntimeError("Vivo story audio provider only runs for storybook mode")

        script = audio_script or _build_mock_audio_script(
            child_name=child_name,
            scene_index=scene_index,
            scene_title=scene_title,
            scene_text=scene_text,
        )
        resolved_voice_style = voice_style or self.settings.storybook_tts_voice
        cache_key = _build_story_audio_cache_key(
            script=script,
            voice_style=resolved_voice_style,
            settings=self.settings,
        )
        cached_result = self.read_cached_scene(
            story_mode=story_mode,
            scene_index=scene_index,
            child_name=child_name,
            scene_title=scene_title,
            scene_text=scene_text,
            child_id=child_id,
            story_id=story_id,
            audio_script=script,
            voice_style=resolved_voice_style,
        )
        if cached_result:
            return cached_result

        tts_result = self._tts_provider.synthesize(
            text=script,
            child_id=child_id,
            story_id=story_id,
            scene_index=scene_index,
            voice_style=resolved_voice_style,
        )
        model_name = f"{tts_result.get('engineId')}/{tts_result.get('voiceName')}"
        output = {
            "audioUrl": tts_result["audioUrl"],
            "audioRef": tts_result["audioRef"],
            "audioScript": script,
            "audioStatus": "ready",
            "captionTiming": tts_result.get("captionTiming") or build_story_caption_timing(script),
            "voiceStyle": tts_result.get("voiceStyle") or resolved_voice_style,
            "engineId": tts_result.get("engineId"),
            "voiceName": tts_result.get("voiceName"),
            "audioBytes": tts_result.get("audioBytes"),
            "audioContentType": tts_result.get("audioContentType") or "audio/wav",
            "cacheHit": False,
        }
        get_storybook_runtime_cache().set(
            cache_key,
            {
                "output": output,
                "model": model_name,
                "requestId": tts_result.get("requestId"),
            },
        )
        return ProviderResult(
            output=output,
            provider=self.provider_name,
            mode=self.mode_name,
            source="vivo",
            model=model_name,
            request_id=tts_result.get("requestId"),
        )


def resolve_story_audio_provider(settings: Settings | None = None) -> MockStoryAudioProvider | VivoStoryAudioProvider:
    if settings and can_use_vivo_story_audio_provider(settings):
        return VivoStoryAudioProvider(settings)
    return MockStoryAudioProvider()
