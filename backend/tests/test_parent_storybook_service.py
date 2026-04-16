from __future__ import annotations

import asyncio
from copy import deepcopy
from threading import Event
from time import perf_counter

from app.providers.base import ProviderResponseError, ProviderResult
from app.services import parent_storybook_service
from app.services.parent_storybook_service import await_storybook_media_warming, run_parent_storybook
from app.services.storybook_media_cache import get_storybook_media_cache
from conftest import load_storybook_fixture


def _base_payload() -> dict:
    return {
        "snapshot": {
            "child": {
                "id": "child-1",
                "name": "安安",
                "className": "小一班",
            },
            "summary": {
                "growth": {"recordCount": 2},
                "feedback": {"count": 1},
            },
            "ruleFallback": [],
        },
        "highlightCandidates": [
            {
                "kind": "todayGrowth",
                "title": "今天的小亮点",
                "detail": "今天愿意主动和老师说早安，还愿意轻轻挥手。",
                "priority": 1,
                "source": "todayGrowth",
            },
            {
                "kind": "consultationAction",
                "title": "今晚最适合做的一件事",
                "detail": "睡前和孩子一起回顾今天最开心的瞬间，再轻声复述一遍。",
                "priority": 2,
                "source": "interventionCard",
            },
            {
                "kind": "weeklyTrend",
                "title": "一周趋势",
                "detail": "最近一周的情绪和作息都在慢慢稳定下来。",
                "priority": 3,
                "source": "weeklyTrend",
            },
        ],
        "latestInterventionCard": {
            "title": "安安今夜家庭任务",
            "tonightHomeAction": "睡前一起复盘今天的一个闪光点。",
        },
        "requestSource": "pytest",
    }


def _heavy_payload(request_source_suffix: str) -> dict:
    payload = load_storybook_fixture("page-recording-c1-bedtime.json")
    payload["requestSource"] = f"{payload['requestSource']}:{request_source_suffix}"
    return payload


def _read_cached_scene_svg(story: dict, scene_index: int = 0) -> str:
    media_url = story["scenes"][scene_index]["imageUrl"]
    media_key = media_url.rsplit("/", 1)[-1]
    payload = get_storybook_media_cache().get_image(media_key)
    assert payload is not None
    return str(payload["svg"])


class _SceneProvider:
    def __init__(self, *, provider_name: str, image_status: str | None = None, audio_status: str | None = None):
        self.provider_name = provider_name
        self.image_status = image_status
        self.audio_status = audio_status
        self.calls: list[dict] = []
        self._cached_results: dict[str, ProviderResult[dict]] = {}

    def _cache_key(self, kwargs: dict) -> str:
        if "image_prompt" in kwargs:
            return f"image::{kwargs['scene_index']}::{kwargs['image_prompt']}"
        return f"audio::{kwargs['scene_index']}::{kwargs['audio_script']}"

    def read_cached_scene(self, **kwargs):
        cached = self._cached_results.get(self._cache_key(kwargs))
        if not cached:
            return None
        return ProviderResult(
            output={
                **deepcopy(cached.output),
                "cacheHit": True,
            },
            provider=cached.provider,
            mode=cached.mode,
            source="cache",
            model=cached.model,
            request_id=cached.request_id,
        )

    def render_scene(self, **kwargs):
        self.calls.append(kwargs)
        if "image_prompt" in kwargs:
            status = self.image_status or "fallback"
            image_url = "https://cdn.example.com/story-1.png" if status == "ready" else None
            result = ProviderResult(
                output={
                    "imagePrompt": kwargs["image_prompt"],
                    "imageUrl": image_url,
                    "assetRef": image_url,
                    "imageStatus": status,
                },
                provider=self.provider_name,
                mode="live" if status == "ready" else "fallback",
                source="vivo" if status == "ready" else "mock",
                model="mock-image-v1",
            )
            self._cached_results[self._cache_key(kwargs)] = result
            return result

        status = self.audio_status or "fallback"
        audio_url = "data:audio/wav;base64,AAAA" if status == "ready" else None
        result = ProviderResult(
            output={
                "audioUrl": audio_url,
                "audioRef": "storybook-audio-1",
                "audioScript": kwargs["audio_script"],
                "audioStatus": status,
                "voiceStyle": kwargs["voice_style"],
                "engineId": "short_audio_synthesis_jovi" if status == "ready" else None,
                "voiceName": "yige" if status == "ready" else None,
                "audioBytes": b"RIFF" if status == "ready" else None,
                "audioContentType": "audio/wav" if status == "ready" else None,
            },
            provider=self.provider_name,
            mode="live" if status == "ready" else "fallback",
            source="vivo" if status == "ready" else "mock",
            model="mock-audio-v1",
        )
        self._cached_results[self._cache_key(kwargs)] = result
        return result


class _BlockingSceneProvider(_SceneProvider):
    def __init__(
        self,
        *,
        provider_name: str,
        release: Event,
        image_status: str | None = None,
        audio_status: str | None = None,
    ) -> None:
        super().__init__(
            provider_name=provider_name,
            image_status=image_status,
            audio_status=audio_status,
        )
        self.release = release

    def render_scene(self, **kwargs):
        self.release.wait(timeout=1.0)
        return super().render_scene(**kwargs)


def test_parent_storybook_service_returns_six_page_storybook_by_default():
    result = asyncio.run(run_parent_storybook(_base_payload()))

    assert result["mode"] == "storybook"
    assert result["title"]
    assert result["moral"]
    assert result["parentNote"]
    assert len(result["scenes"]) == 6
    assert result["providerMeta"]["sceneCount"] == 6
    assert result["providerMeta"]["imageProvider"] == "storybook-dynamic-fallback"
    assert result["providerMeta"]["audioProvider"] == "storybook-mock-preview"
    assert result["providerMeta"]["mode"] == "fallback"
    assert result["providerMeta"]["transport"] == "fastapi-brain"
    assert result["providerMeta"]["imageDelivery"] == "dynamic-fallback"
    assert result["providerMeta"]["audioDelivery"] == "preview-only"
    assert result["providerMeta"]["realProvider"] is False
    assert result["fallback"] is True
    assert result["scenes"][0]["imagePrompt"]
    assert result["scenes"][0]["imageSourceKind"] == "dynamic-fallback"
    assert result["scenes"][0]["imageUrl"].startswith("/api/ai/parent-storybook/media/")
    assert result["scenes"][0]["assetRef"] == result["scenes"][0]["imageUrl"]
    assert result["scenes"][0]["audioScript"]
    assert "不要任何中文" in result["scenes"][0]["imagePrompt"]
    assert "image-only composition" in result["scenes"][0]["imagePrompt"]
    assert "本页画面目标" not in result["scenes"][0]["imagePrompt"]
    assert "叙事锚点" not in result["scenes"][0]["imagePrompt"]
    assert "必须出现" not in result["scenes"][0]["imagePrompt"]
    assert result["scenes"][0]["captionTiming"]["mode"] == "duration-derived"
    assert result["providerMeta"]["diagnostics"]["image"]["resolvedProvider"] == "storybook-dynamic-fallback"
    assert result["providerMeta"]["diagnostics"]["audio"]["resolvedProvider"] == "storybook-mock-preview"
    assert "storybook_image_provider" in result["providerMeta"]["diagnostics"]["image"]["missingConfig"]
    assert result["providerMeta"]["diagnostics"]["brain"]["statusCode"] is None
    assert result["providerMeta"]["diagnostics"]["brain"]["retryStrategy"] == "none"


def test_parent_storybook_service_first_byte_payload_trims_rich_fixture_fields():
    payload = _heavy_payload("service-thin-payload")

    first_byte_payload = parent_storybook_service._resolve_storybook_first_byte_payload(payload)

    assert "recentDetails" in payload["snapshot"]
    assert "recentDetails" not in first_byte_payload["snapshot"]
    assert set(first_byte_payload["snapshot"].keys()) == {"child", "summary", "ruleFallback"}
    assert set(first_byte_payload["snapshot"]["child"].keys()) == {"id", "name", "className"}
    assert len(first_byte_payload["highlightCandidates"]) == 4
    assert first_byte_payload["highlightCandidates"][-1]["priority"] == 4

    consultation = first_byte_payload["latestConsultation"]
    assert set(consultation.keys()) == {"summary", "homeAction", "followUp48h"}
    assert consultation["followUp48h"] == [payload["latestConsultation"]["followUp48h"][0]]
    assert "agentFindings" in payload["latestConsultation"]
    assert "agentFindings" not in consultation
    assert "evidenceItems" not in consultation
    assert "todayInSchoolActions" not in consultation
    assert "tonightAtHomeActions" not in consultation
    assert "nextCheckpoints" not in consultation

    intervention = first_byte_payload["latestInterventionCard"]
    assert set(intervention.keys()) == {
        "tonightHomeAction",
        "tomorrowObservationPoint",
        "reviewIn48h",
    }
    assert "homeSteps" in payload["latestInterventionCard"]
    assert "homeSteps" not in intervention
    assert "observationPoints" not in intervention
    assert "teacherFollowupDraft" not in intervention


def test_parent_storybook_service_marks_live_when_all_media_is_real(monkeypatch):
    image_provider = _SceneProvider(provider_name="vivo-story-image", image_status="ready")
    audio_provider = _SceneProvider(provider_name="vivo-story-tts", audio_status="ready")

    monkeypatch.setattr(
        "app.services.parent_storybook_service.resolve_story_image_provider",
        lambda settings: image_provider,
    )
    monkeypatch.setattr(
        "app.services.parent_storybook_service.resolve_story_audio_provider",
        lambda settings: audio_provider,
    )

    first = asyncio.run(run_parent_storybook(_base_payload()))
    assert first["providerMeta"]["mode"] == "mixed"
    assert first["providerMeta"]["realProvider"] is True
    assert first["fallback"] is True
    assert first["providerMeta"]["imageDelivery"] == "dynamic-fallback"
    assert first["providerMeta"]["audioDelivery"] == "mixed"
    assert first["providerMeta"]["audioProvider"] == "vivo-story-tts+storybook-mock-preview"
    assert first["scenes"][0]["audioStatus"] == "ready"
    assert first["scenes"][0]["audioUrl"].startswith("/api/ai/parent-storybook/media/")
    assert first["scenes"][0]["audioRef"]
    assert first["scenes"][0]["engineId"] == "short_audio_synthesis_jovi"
    assert first["scenes"][0]["voiceName"] == "yige"
    assert first["scenes"][2]["audioStatus"] == "fallback"
    assert first["providerMeta"]["diagnostics"]["image"]["jobStatus"] == "warming"
    assert first["providerMeta"]["diagnostics"]["audio"]["jobStatus"] == "warming"
    assert first["providerMeta"]["diagnostics"]["audio"]["readySceneCount"] == 2

    assert await_storybook_media_warming(first["storyId"], timeout_seconds=2.0) is True

    result = asyncio.run(run_parent_storybook(_base_payload()))
    assert result["providerMeta"]["mode"] == "live"
    assert result["providerMeta"]["realProvider"] is True
    assert result["fallback"] is False
    assert result["providerMeta"]["imageDelivery"] == "real"
    assert result["providerMeta"]["imageProvider"] == "vivo-story-image"
    assert result["providerMeta"]["audioProvider"] == "vivo-story-tts"
    assert result["providerMeta"]["audioDelivery"] == "real"
    assert result["scenes"][0]["imageStatus"] == "ready"
    assert result["scenes"][0]["audioStatus"] == "ready"
    assert result["scenes"][0]["imageUrl"].startswith("https://cdn.example.com/")
    assert result["scenes"][0]["audioUrl"].startswith("/api/ai/parent-storybook/media/")
    assert result["scenes"][0]["audioRef"]
    assert result["scenes"][0]["imageSourceKind"] == "real"
    assert result["scenes"][0]["captionTiming"]["mode"] == "duration-derived"
    assert result["scenes"][0]["engineId"] == "short_audio_synthesis_jovi"
    assert result["scenes"][0]["voiceName"] == "yige"
    assert result["providerMeta"]["diagnostics"]["image"]["resolvedProvider"] == "vivo-story-image"
    assert result["providerMeta"]["diagnostics"]["audio"]["resolvedProvider"] == "vivo-story-tts"
    assert result["providerMeta"]["diagnostics"]["image"]["jobStatus"] == "ready"
    assert result["providerMeta"]["diagnostics"]["audio"]["jobStatus"] == "ready"


def test_parent_storybook_service_marks_mixed_when_only_image_is_real(monkeypatch):
    image_provider = _SceneProvider(provider_name="vivo-story-image", image_status="ready")
    audio_provider = _SceneProvider(provider_name="storybook-mock-preview", audio_status="fallback")

    monkeypatch.setattr(
        "app.services.parent_storybook_service.resolve_story_image_provider",
        lambda settings: image_provider,
    )
    monkeypatch.setattr(
        "app.services.parent_storybook_service.resolve_story_audio_provider",
        lambda settings: audio_provider,
    )

    first = asyncio.run(run_parent_storybook(_base_payload()))
    assert first["providerMeta"]["mode"] == "fallback"
    assert first["providerMeta"]["diagnostics"]["image"]["jobStatus"] == "warming"
    assert first["providerMeta"]["diagnostics"]["audio"]["jobStatus"] == "disabled"

    assert await_storybook_media_warming(first["storyId"], timeout_seconds=2.0) is True

    result = asyncio.run(run_parent_storybook(_base_payload()))
    assert result["providerMeta"]["mode"] == "mixed"
    assert result["providerMeta"]["realProvider"] is True
    assert result["fallback"] is True
    assert result["providerMeta"]["imageDelivery"] == "real"
    assert result["providerMeta"]["imageProvider"] == "vivo-story-image"
    assert result["providerMeta"]["audioProvider"] == "storybook-mock-preview"
    assert result["providerMeta"]["audioDelivery"] == "preview-only"
    assert result["scenes"][0]["imageStatus"] == "ready"
    assert result["scenes"][0]["audioStatus"] == "fallback"
    assert result["scenes"][0]["imageSourceKind"] == "real"
    assert result["scenes"][0]["captionTiming"]["mode"] == "duration-derived"
    assert result["providerMeta"]["diagnostics"]["image"]["jobStatus"] == "ready"


def test_parent_storybook_service_heavy_payload_returns_first_byte_without_waiting_for_live_provider(
    monkeypatch,
):
    release = Event()
    image_provider = _BlockingSceneProvider(
        provider_name="vivo-story-image",
        image_status="ready",
        release=release,
    )
    audio_provider = _SceneProvider(provider_name="storybook-mock-preview", audio_status="fallback")
    get_storybook_media_cache()._entries.clear()

    monkeypatch.setattr(
        "app.services.parent_storybook_service.resolve_story_image_provider",
        lambda settings: image_provider,
    )
    monkeypatch.setattr(
        "app.services.parent_storybook_service.resolve_story_audio_provider",
        lambda settings: audio_provider,
    )

    payload = _heavy_payload("service-first-byte")
    started_at = perf_counter()
    first = asyncio.run(run_parent_storybook(payload))
    elapsed = perf_counter() - started_at

    assert elapsed < 0.45
    assert first["providerMeta"]["transport"] == "fastapi-brain"
    assert first["providerMeta"]["mode"] == "fallback"
    assert first["providerMeta"]["imageDelivery"] == "dynamic-fallback"
    assert first["providerMeta"]["audioDelivery"] == "preview-only"
    assert first["providerMeta"]["diagnostics"]["image"]["jobStatus"] == "warming"
    assert first["providerMeta"]["highlightCount"] == 4
    assert first["providerMeta"]["sceneCount"] == 6
    assert all(scene["imageSourceKind"] == "dynamic-fallback" for scene in first["scenes"])

    release.set()
    assert await_storybook_media_warming(first["storyId"], timeout_seconds=2.0) is True


def test_parent_storybook_service_heavy_payload_returns_first_byte_without_waiting_for_blocking_audio_provider(
    monkeypatch,
):
    release = Event()
    image_provider = _SceneProvider(provider_name="storybook-dynamic-fallback", image_status="fallback")
    audio_provider = _BlockingSceneProvider(
        provider_name="vivo-story-tts",
        audio_status="ready",
        release=release,
    )
    get_storybook_media_cache()._entries.clear()

    monkeypatch.setattr(
        "app.services.parent_storybook_service.resolve_story_image_provider",
        lambda settings: image_provider,
    )
    monkeypatch.setattr(
        "app.services.parent_storybook_service.resolve_story_audio_provider",
        lambda settings: audio_provider,
    )

    payload = _heavy_payload("service-first-byte-audio")
    started_at = perf_counter()
    first = asyncio.run(run_parent_storybook(payload))
    elapsed = perf_counter() - started_at

    assert elapsed < 0.45
    assert first["providerMeta"]["transport"] == "fastapi-brain"
    assert first["providerMeta"]["mode"] == "fallback"
    assert first["providerMeta"]["imageDelivery"] == "dynamic-fallback"
    assert first["providerMeta"]["audioDelivery"] == "preview-only"
    assert first["providerMeta"]["diagnostics"]["image"]["jobStatus"] == "disabled"
    assert first["providerMeta"]["diagnostics"]["audio"]["jobStatus"] == "warming"
    assert all(scene["audioStatus"] == "fallback" for scene in first["scenes"])

    release.set()
    assert await_storybook_media_warming(first["storyId"], timeout_seconds=2.0) is True


def test_parent_storybook_service_heavy_payload_returns_first_byte_without_waiting_for_dual_blocking_providers(
    monkeypatch,
):
    image_release = Event()
    audio_release = Event()
    image_provider = _BlockingSceneProvider(
        provider_name="vivo-story-image",
        image_status="ready",
        release=image_release,
    )
    audio_provider = _BlockingSceneProvider(
        provider_name="vivo-story-tts",
        audio_status="ready",
        release=audio_release,
    )
    get_storybook_media_cache()._entries.clear()

    monkeypatch.setattr(
        "app.services.parent_storybook_service.resolve_story_image_provider",
        lambda settings: image_provider,
    )
    monkeypatch.setattr(
        "app.services.parent_storybook_service.resolve_story_audio_provider",
        lambda settings: audio_provider,
    )

    payload = _heavy_payload("service-first-byte-dual")
    started_at = perf_counter()
    first = asyncio.run(run_parent_storybook(payload))
    elapsed = perf_counter() - started_at

    assert elapsed < 0.55
    assert first["providerMeta"]["transport"] == "fastapi-brain"
    assert first["providerMeta"]["mode"] == "fallback"
    assert first["providerMeta"]["imageDelivery"] == "dynamic-fallback"
    assert first["providerMeta"]["audioDelivery"] == "preview-only"
    assert first["providerMeta"]["diagnostics"]["image"]["jobStatus"] == "warming"
    assert first["providerMeta"]["diagnostics"]["audio"]["jobStatus"] == "warming"

    image_release.set()
    audio_release.set()
    assert await_storybook_media_warming(first["storyId"], timeout_seconds=2.0) is True

    result = asyncio.run(run_parent_storybook(payload))
    assert result["providerMeta"]["mode"] == "live"
    assert result["providerMeta"]["imageDelivery"] == "real"
    assert result["providerMeta"]["audioDelivery"] == "real"
    assert result["fallback"] is False


def test_parent_storybook_service_heavy_payload_warms_into_mixed(monkeypatch):
    image_provider = _SceneProvider(provider_name="vivo-story-image", image_status="ready")
    audio_provider = _SceneProvider(provider_name="storybook-mock-preview", audio_status="fallback")
    get_storybook_media_cache()._entries.clear()

    monkeypatch.setattr(
        "app.services.parent_storybook_service.resolve_story_image_provider",
        lambda settings: image_provider,
    )
    monkeypatch.setattr(
        "app.services.parent_storybook_service.resolve_story_audio_provider",
        lambda settings: audio_provider,
    )

    payload = _heavy_payload("service-mixed")
    first = asyncio.run(run_parent_storybook(payload))
    assert first["providerMeta"]["mode"] == "fallback"
    assert first["providerMeta"]["transport"] == "fastapi-brain"
    assert first["providerMeta"]["diagnostics"]["image"]["jobStatus"] == "warming"
    assert first["providerMeta"]["diagnostics"]["audio"]["jobStatus"] == "disabled"
    assert first["providerMeta"]["highlightCount"] == 4
    assert await_storybook_media_warming(first["storyId"], timeout_seconds=2.0) is True

    result = asyncio.run(run_parent_storybook(payload))

    assert result["providerMeta"]["mode"] == "mixed"
    assert result["providerMeta"]["realProvider"] is True
    assert result["fallback"] is True
    assert result["providerMeta"]["imageDelivery"] == "real"
    assert result["providerMeta"]["audioDelivery"] == "preview-only"
    assert result["providerMeta"]["transport"] == "fastapi-brain"
    assert result["providerMeta"]["requestSource"] == payload["requestSource"]
    assert result["stylePreset"] == "sunrise-watercolor"
    assert result["providerMeta"]["highlightCount"] == 4
    assert result["providerMeta"]["sceneCount"] == 6
    assert result["scenes"][0]["imageStatus"] == "ready"
    assert result["scenes"][0]["audioStatus"] == "fallback"
    assert result["scenes"][0]["imageSourceKind"] == "real"


def test_parent_storybook_service_surfaces_media_warm_error_diagnostics(monkeypatch):
    image_provider = _SceneProvider(provider_name="vivo-story-image", image_status="ready")

    class _FailingAudioProvider:
        provider_name = "vivo-story-tts"

        def read_cached_scene(self, **kwargs):
            del kwargs
            return None

        def render_scene(self, **kwargs):
            del kwargs
            error = ProviderResponseError(
                "Vivo TTS websocket handshake failed with status 400; "
                "profile=primary, engine=short_audio_synthesis_jovi, voice=yige, "
                "diagnosis=runtime_profile_rejected, error_code=10000, error_msg=package not exist"
            )
            error.profile = "primary"  # type: ignore[attr-defined]
            error.engine_id = "short_audio_synthesis_jovi"  # type: ignore[attr-defined]
            error.voice_name = "yige"  # type: ignore[attr-defined]
            error.http_status = 400  # type: ignore[attr-defined]
            error.error_code = 10000  # type: ignore[attr-defined]
            error.error_msg = "package not exist"  # type: ignore[attr-defined]
            error.diagnosis = "runtime_profile_rejected"  # type: ignore[attr-defined]
            raise error

    monkeypatch.setattr(
        "app.services.parent_storybook_service.resolve_story_image_provider",
        lambda settings: image_provider,
    )
    monkeypatch.setattr(
        "app.services.parent_storybook_service.resolve_story_audio_provider",
        lambda settings: _FailingAudioProvider(),
    )

    first = asyncio.run(run_parent_storybook(_base_payload()))
    assert first["providerMeta"]["diagnostics"]["audio"]["jobStatus"] == "warming"
    assert await_storybook_media_warming(first["storyId"], timeout_seconds=2.0) is True

    warm_job = parent_storybook_service._get_storybook_media_warm_job(first["storyId"])
    assert warm_job is not None
    assert warm_job.audio.error_scene_count == len(first["scenes"])
    assert warm_job.audio.last_error_stage == "primary"
    assert "http=400" in (warm_job.audio.last_error_reason or "")
    assert "engine=short_audio_synthesis_jovi" in (warm_job.audio.last_error_reason or "")
    assert "voice=yige" in (warm_job.audio.last_error_reason or "")
    assert "diagnosis=runtime_profile_rejected" in (warm_job.audio.last_error_reason or "")
    assert "error_code=10000" in (warm_job.audio.last_error_reason or "")
    assert "error_msg=package not exist" in (warm_job.audio.last_error_reason or "")

    diagnostics = parent_storybook_service._resolve_media_diagnostics(
        story_id=first["storyId"],
        settings=parent_storybook_service.get_settings(),
        image_provider=image_provider,
        audio_provider=_FailingAudioProvider(),
        scenes=first["scenes"],
        request_elapsed_ms=0,
    )
    assert diagnostics["audio"]["jobStatus"] == "error"
    assert diagnostics["audio"]["errorSceneCount"] == len(first["scenes"])
    assert diagnostics["audio"]["lastErrorStage"] == "primary"
    assert "http=400" in (diagnostics["audio"]["lastErrorReason"] or "")
    assert "engine=short_audio_synthesis_jovi" in (diagnostics["audio"]["lastErrorReason"] or "")
    assert "voice=yige" in (diagnostics["audio"]["lastErrorReason"] or "")
    assert "diagnosis=runtime_profile_rejected" in (diagnostics["audio"]["lastErrorReason"] or "")
    assert "error_code=10000" in (diagnostics["audio"]["lastErrorReason"] or "")
    assert "error_msg=package not exist" in (diagnostics["audio"]["lastErrorReason"] or "")


def test_parent_storybook_service_degrades_to_card_when_context_is_sparse():
    payload = _base_payload()
    payload["highlightCandidates"] = []
    payload["snapshot"]["summary"]["growth"]["recordCount"] = 0
    payload["snapshot"]["summary"]["feedback"]["count"] = 0
    payload["snapshot"]["ruleFallback"] = []

    result = asyncio.run(run_parent_storybook(payload))

    assert result["mode"] == "card"
    assert len(result["scenes"]) == 1
    assert result["fallback"] is True
    assert result["fallbackReason"] == "sparse-parent-context"
    assert result["providerMeta"]["mode"] == "fallback"


def test_parent_storybook_service_includes_style_preset_in_prompt(monkeypatch):
    image_provider = _SceneProvider(provider_name="vivo-story-image", image_status="ready")
    audio_provider = _SceneProvider(provider_name="storybook-mock-preview", audio_status="fallback")

    monkeypatch.setattr(
        "app.services.parent_storybook_service.resolve_story_image_provider",
        lambda settings: image_provider,
    )
    monkeypatch.setattr(
        "app.services.parent_storybook_service.resolve_story_audio_provider",
        lambda settings: audio_provider,
    )

    payload = _base_payload()
    payload["stylePreset"] = "moonlit-cutout"
    payload["requestSource"] = "pytest-style-preset"
    result = asyncio.run(run_parent_storybook(payload))
    assert await_storybook_media_warming(result["storyId"], timeout_seconds=2.0) is True

    assert result["stylePreset"] == "moonlit-cutout"
    assert "月夜剪纸" in image_provider.calls[0]["image_prompt"]


def test_parent_storybook_service_custom_style_overrides_preset_prompt(monkeypatch):
    image_provider = _SceneProvider(provider_name="vivo-story-image", image_status="ready")
    audio_provider = _SceneProvider(provider_name="storybook-mock-preview", audio_status="fallback")

    monkeypatch.setattr(
        "app.services.parent_storybook_service.resolve_story_image_provider",
        lambda settings: image_provider,
    )
    monkeypatch.setattr(
        "app.services.parent_storybook_service.resolve_story_audio_provider",
        lambda settings: audio_provider,
    )

    payload = _base_payload()
    payload["stylePreset"] = "moonlit-cutout"
    payload["styleMode"] = "custom"
    payload["customStylePrompt"] = "梦幻3D儿童绘本，柔焦，浅景深"
    payload["customStyleNegativePrompt"] = "不要照片感、不要复杂背景"
    payload["requestSource"] = "pytest-style-custom"

    result = asyncio.run(run_parent_storybook(payload))
    assert await_storybook_media_warming(result["storyId"], timeout_seconds=2.0) is True

    assert "梦幻3D儿童绘本" in image_provider.calls[0]["image_prompt"]
    assert "不要照片感" in image_provider.calls[0]["image_prompt"]
    assert "不要任何中文" in image_provider.calls[0]["image_prompt"]
    assert "image-only composition" in image_provider.calls[0]["image_prompt"]
    assert "月夜剪纸" not in image_provider.calls[0]["image_prompt"]
    assert "分镜标题" not in image_provider.calls[0]["image_prompt"]
    assert "文案核心" not in image_provider.calls[0]["image_prompt"]
    assert "本页画面目标" not in image_provider.calls[0]["image_prompt"]


def test_parent_storybook_service_style_recipe_merges_no_text_guardrail():
    recipe = parent_storybook_service._resolve_style_recipe(
        {
            "styleMode": "custom",
            "customStylePrompt": "梦幻3D儿童绘本，柔焦，电影感光影",
            "customStyleNegativePrompt": "不要复杂背景、不要水印",
        }
    )

    assert recipe["negative_prompt"]
    assert "不要复杂背景" in recipe["negative_prompt"]
    assert "不要任何中文" in recipe["negative_prompt"]
    assert "不要任何英文" in recipe["negative_prompt"]
    assert "不要任何数字" in recipe["negative_prompt"]
    assert "不要任何对话气泡" in recipe["negative_prompt"]
    assert "image-only composition" in recipe["negative_prompt"]
    assert recipe["prompt"].startswith("儿童绘本风格方向：")
    assert "负面约束：" in recipe["prompt"]


def test_parent_storybook_service_reuses_media_cache(monkeypatch):
    image_provider = _SceneProvider(provider_name="vivo-story-image", image_status="ready")
    audio_provider = _SceneProvider(provider_name="vivo-story-tts", audio_status="ready")

    monkeypatch.setattr(
        "app.services.parent_storybook_service.resolve_story_image_provider",
        lambda settings: image_provider,
    )
    monkeypatch.setattr(
        "app.services.parent_storybook_service.resolve_story_audio_provider",
        lambda settings: audio_provider,
    )

    media_cache = get_storybook_media_cache()
    media_cache._entries.clear()

    first = asyncio.run(run_parent_storybook(_base_payload()))
    assert await_storybook_media_warming(first["storyId"], timeout_seconds=2.0) is True
    second = asyncio.run(run_parent_storybook(_base_payload()))
    third = asyncio.run(run_parent_storybook(_base_payload()))

    assert 0 <= first["providerMeta"]["cacheHitCount"] <= 2
    assert second["providerMeta"]["cacheHitCount"] == 12
    assert third["providerMeta"]["cacheHitCount"] == 12
    assert image_provider.calls and len(image_provider.calls) == 6
    assert audio_provider.calls and len(audio_provider.calls) == 6
    assert len(media_cache._entries) == 12
    assert second["scenes"][0]["imageCacheHit"] is True
    assert second["scenes"][0]["audioCacheHit"] is True
    assert third["scenes"][0]["audioUrl"] == second["scenes"][0]["audioUrl"]
    assert second["scenes"][0]["audioUrl"].startswith("/api/ai/parent-storybook/media/")


def test_parent_storybook_service_supports_page_count_variants_and_manual_theme_without_child_data():
    for page_count in (4, 6, 8):
        payload = {
            "snapshot": {
                "child": {},
                "summary": {
                    "growth": {"recordCount": 0, "topCategories": []},
                    "feedback": {"count": 0, "keywords": []},
                },
                "ruleFallback": [],
            },
            "highlightCandidates": [],
            "generationMode": "manual-theme",
            "manualTheme": "独立入睡",
            "manualPrompt": "把睡前分离讲成轻柔、可朗读的晚安故事。",
            "pageCount": page_count,
            "goalKeywords": ["独立入睡", "睡前安抚"],
            "requestSource": "pytest-manual",
        }

        result = asyncio.run(run_parent_storybook(payload))

        assert result["mode"] == "storybook"
        assert result["childId"] == "storybook-guest"
        assert len(result["scenes"]) == page_count
        assert result["providerMeta"]["sceneCount"] == page_count
        assert result["providerMeta"]["imageDelivery"] == "dynamic-fallback"
        assert result["providerMeta"]["audioDelivery"] == "preview-only"
        assert all(scene["audioScript"] for scene in result["scenes"])
        assert all(scene["imageSourceKind"] == "dynamic-fallback" for scene in result["scenes"])
        assert all(scene["imageUrl"].startswith("/api/ai/parent-storybook/media/") for scene in result["scenes"])
        assert len({scene["imageUrl"] for scene in result["scenes"]}) == page_count
        assert all(scene["captionTiming"]["mode"] == "duration-derived" for scene in result["scenes"])
        assert "独立入睡" in result["summary"]
        assert "今晚" in result["scenes"][-1]["sceneText"]


def test_parent_storybook_service_hybrid_threads_theme_into_story_content():
    payload = _base_payload()
    child_detail = "先停一停，再轻轻说出难过。"
    payload.update(
        {
            "generationMode": "hybrid",
            "manualTheme": "表达情绪",
            "manualPrompt": "让孩子知道情绪可以被看见，也可以慢慢说出来。",
            "pageCount": 4,
            "goalKeywords": ["表达情绪"],
        }
    )
    payload["highlightCandidates"] = [
        {
            "kind": "warningSuggestion",
            "title": "先停一停",
            "detail": child_detail,
            "priority": 1,
            "source": "suggestions",
        },
        *payload["highlightCandidates"],
    ]

    result = asyncio.run(run_parent_storybook(payload))

    assert result["mode"] == "storybook"
    assert len(result["scenes"]) == 4
    assert any("表达情绪" in scene["sceneText"] for scene in result["scenes"])
    assert any(child_detail in scene["sceneText"] for scene in result["scenes"])
    assert any("表达情绪" in scene["imagePrompt"] for scene in result["scenes"])
    assert any(child_detail in scene["imagePrompt"] for scene in result["scenes"])
    assert any("表达情绪" in scene["audioScript"] for scene in result["scenes"])
    assert all(scene["imageSourceKind"] == "dynamic-fallback" for scene in result["scenes"])
    assert len({scene["imageUrl"] for scene in result["scenes"]}) == 4
    assert all(scene["captionTiming"]["mode"] == "duration-derived" for scene in result["scenes"])


def test_parent_storybook_service_uses_demo_art_only_after_dynamic_fallback_fails(monkeypatch):
    monkeypatch.setattr(
        "app.services.parent_storybook_service._build_dynamic_fallback_scene_svg_v2",
        lambda blueprint, scene_text, ingredients: "",
    )

    result = asyncio.run(run_parent_storybook(_base_payload()))

    assert result["providerMeta"]["imageDelivery"] == "demo-art"
    assert result["providerMeta"]["imageProvider"] == "storybook-demo-art"
    assert result["providerMeta"]["diagnostics"]["image"]["resolvedProvider"] == "storybook-demo-art"
    assert all(scene["imageSourceKind"] == "demo-art" for scene in result["scenes"])


def test_parent_storybook_service_uses_svg_fallback_only_after_dynamic_and_demo_fail(monkeypatch):
    monkeypatch.setattr(
        "app.services.parent_storybook_service._build_dynamic_fallback_scene_svg_v2",
        lambda blueprint, scene_text, ingredients: "",
    )
    monkeypatch.setattr(
        "app.services.parent_storybook_service._build_demo_art_scene_svg_v2",
        lambda blueprint, scene_text, ingredients: "",
    )

    result = asyncio.run(run_parent_storybook(_base_payload()))

    assert result["providerMeta"]["imageDelivery"] == "svg-fallback"
    assert result["providerMeta"]["imageProvider"] == "storybook-svg-fallback"
    assert result["providerMeta"]["diagnostics"]["image"]["resolvedProvider"] == "storybook-svg-fallback"
    assert all(scene["imageSourceKind"] == "svg-fallback" for scene in result["scenes"])


def test_parent_storybook_service_dynamic_fallback_svg_changes_with_story_theme():
    media_cache = get_storybook_media_cache()
    media_cache._entries.clear()

    honesty_payload = _base_payload()
    honesty_payload.update(
        {
            "generationMode": "manual-theme",
            "manualTheme": "璇氬疄",
            "manualPrompt": "鎶婅瘹瀹炶鎴愬瀛愯兘鎳傜殑鎴愰暱灏忔晠浜嬨€?",
            "goalKeywords": ["璇氬疄"],
        }
    )

    sleep_payload = _base_payload()
    sleep_payload.update(
        {
            "generationMode": "manual-theme",
            "manualTheme": "鐙珛鍏ョ潯",
            "manualPrompt": "鎶婄潯鍓嶅垎绂昏鎴愭俯鏌斿彲鏈楄鐨勬櫄瀹夋晠浜嬨€?",
            "goalKeywords": ["鐙珛鍏ョ潯"],
        }
    )

    honesty_story = asyncio.run(run_parent_storybook(honesty_payload))
    sleep_story = asyncio.run(run_parent_storybook(sleep_payload))
    honesty_svg = _read_cached_scene_svg(honesty_story, 0)
    sleep_svg = _read_cached_scene_svg(sleep_story, 0)

    assert honesty_story["scenes"][0]["imageSourceKind"] == "dynamic-fallback"
    assert sleep_story["scenes"][0]["imageSourceKind"] == "dynamic-fallback"
    assert honesty_svg != sleep_svg
    assert "璇氬疄" in honesty_svg
    assert "鐙珛鍏ョ潯" in sleep_svg
