from __future__ import annotations

from copy import deepcopy
from time import perf_counter

from fastapi.testclient import TestClient

from app.main import app
from app.providers.base import ProviderResult
from app.schemas.parent_storybook import ParentStoryBookRequest
from app.services.parent_storybook_service import await_storybook_media_warming
from conftest import load_storybook_fixture


client = TestClient(app)


def build_payload() -> dict:
    return {
        "snapshot": {
            "child": {"id": "child-1", "name": "安安", "className": "小一班"},
            "summary": {
                "growth": {"recordCount": 1},
                "feedback": {"count": 1},
            },
            "ruleFallback": [],
        },
        "highlightCandidates": [
            {
                "kind": "todayGrowth",
                "title": "今天的小亮点",
                "detail": "今天愿意主动打招呼，也愿意跟着老师一起收玩具。",
                "priority": 1,
            }
        ],
        "requestSource": "pytest-endpoint",
        "stylePreset": "forest-crayon",
    }


def build_heavy_payload(request_source_suffix: str) -> dict:
    payload = load_storybook_fixture("page-recording-c1-bedtime.json")
    payload["requestSource"] = f"{payload['requestSource']}:{request_source_suffix}"
    return payload


class _WarmableProvider:
    def __init__(self, *, provider_name: str, media_kind: str, ready: bool) -> None:
        self.provider_name = provider_name
        self.media_kind = media_kind
        self.ready = ready
        self._cached_results: dict[str, ProviderResult[dict]] = {}

    def _cache_key(self, kwargs: dict) -> str:
        if self.media_kind == "image":
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
        if self.media_kind == "image":
            result = ProviderResult(
                output={
                    "imagePrompt": kwargs["image_prompt"],
                    "imageUrl": "https://cdn.example.com/story-live.png" if self.ready else None,
                    "assetRef": "https://cdn.example.com/story-live.png" if self.ready else None,
                    "imageStatus": "ready" if self.ready else "fallback",
                },
                provider=self.provider_name,
                mode="live" if self.ready else "fallback",
                source="vivo" if self.ready else "mock",
                model="live-image" if self.ready else "fallback-image",
            )
        else:
            result = ProviderResult(
                output={
                    "audioUrl": "data:audio/wav;base64,AAAA" if self.ready else None,
                    "audioRef": "live-audio-1" if self.ready else "story-mixed-audio-1",
                    "audioScript": kwargs["audio_script"],
                    "audioStatus": "ready" if self.ready else "fallback",
                    "voiceStyle": kwargs["voice_style"],
                    "engineId": "short_audio_synthesis_jovi" if self.ready else None,
                    "voiceName": "yige" if self.ready else None,
                    "audioBytes": b"RIFF" if self.ready else None,
                    "audioContentType": "audio/wav" if self.ready else None,
                },
                provider=self.provider_name,
                mode="live" if self.ready else "fallback",
                source="vivo" if self.ready else "mock",
                model="live-audio" if self.ready else "mixed-audio",
            )
        self._cached_results[self._cache_key(kwargs)] = result
        return result


def test_parent_storybook_endpoint_returns_structured_response():
    response = client.post("/api/v1/agents/parent/storybook", json=build_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["storyId"]
    assert body["childId"] == "child-1"
    assert body["mode"] == "storybook"
    assert body["stylePreset"] == "forest-crayon"
    assert len(body["scenes"]) == 6
    assert body["providerMeta"]["sceneCount"] == 6
    assert body["providerMeta"]["provider"] == "parent-storybook-rule"
    assert body["providerMeta"]["mode"] == "fallback"
    assert body["providerMeta"]["realProvider"] is False
    assert body["providerMeta"]["imageDelivery"] == "dynamic-fallback"
    assert body["providerMeta"]["audioDelivery"] == "preview-only"
    assert body["scenes"][0]["imageSourceKind"] == "dynamic-fallback"
    assert body["scenes"][0]["imageUrl"].startswith("/api/ai/parent-storybook/media/")
    assert body["scenes"][0]["assetRef"] == body["scenes"][0]["imageUrl"]
    assert body["scenes"][0]["captionTiming"]["mode"] == "duration-derived"
    assert body["providerMeta"]["diagnostics"]["image"]["resolvedProvider"] == "storybook-dynamic-fallback"
    assert body["providerMeta"]["diagnostics"]["audio"]["resolvedProvider"] == "storybook-mock-preview"
    assert body["providerMeta"]["diagnostics"]["brain"]["statusCode"] is None
    assert body["providerMeta"]["diagnostics"]["brain"]["retryStrategy"] == "none"


def test_parent_storybook_endpoint_accepts_heavy_page_payload_fixture():
    payload = build_heavy_payload("endpoint-heavy")
    started_at = perf_counter()

    response = client.post("/api/v1/agents/parent/storybook", json=payload)
    elapsed = perf_counter() - started_at

    assert response.status_code == 200
    assert elapsed < 0.75
    body = response.json()
    assert body["storyId"]
    assert body["childId"] == "c-1"
    assert body["mode"] == "storybook"
    assert body["stylePreset"] == "sunrise-watercolor"
    assert len(body["scenes"]) == 6
    assert body["providerMeta"]["transport"] == "fastapi-brain"
    assert body["providerMeta"]["mode"] == "fallback"
    assert body["providerMeta"]["requestSource"] == payload["requestSource"]
    assert body["providerMeta"]["highlightCount"] == 4
    assert body["providerMeta"]["sceneCount"] == 6
    assert body["providerMeta"]["imageDelivery"] == "dynamic-fallback"
    assert body["providerMeta"]["audioDelivery"] == "preview-only"
    assert body["providerMeta"]["diagnostics"]["brain"]["statusCode"] is None
    assert body["fallbackReason"] != "brain-proxy-timeout"
    assert body["providerMeta"]["fallbackReason"] != "brain-proxy-timeout"
    assert body["providerMeta"]["diagnostics"]["brain"]["fallbackReason"] is None
    assert body["providerMeta"]["diagnostics"]["brain"]["timeoutMs"] is None


def test_parent_storybook_endpoint_can_return_live_media(monkeypatch):
    image_provider = _WarmableProvider(
        provider_name="vivo-story-image",
        media_kind="image",
        ready=True,
    )
    audio_provider = _WarmableProvider(
        provider_name="vivo-story-tts",
        media_kind="audio",
        ready=True,
    )

    monkeypatch.setattr(
        "app.services.parent_storybook_service.resolve_story_image_provider",
        lambda settings: image_provider,
    )
    monkeypatch.setattr(
        "app.services.parent_storybook_service.resolve_story_audio_provider",
        lambda settings: audio_provider,
    )

    first = client.post("/api/v1/agents/parent/storybook", json=build_payload())
    first_body = first.json()
    assert first_body["providerMeta"]["mode"] == "mixed"
    assert first_body["providerMeta"]["audioDelivery"] == "mixed"
    assert first_body["providerMeta"]["audioProvider"] == "vivo-story-tts+storybook-mock-preview"
    assert first_body["providerMeta"]["diagnostics"]["image"]["jobStatus"] == "warming"
    assert first_body["providerMeta"]["diagnostics"]["audio"]["jobStatus"] == "warming"
    assert first_body["providerMeta"]["diagnostics"]["audio"]["readySceneCount"] == 2
    assert first_body["scenes"][0]["audioStatus"] == "ready"
    assert first_body["scenes"][0]["audioUrl"].startswith("/api/ai/parent-storybook/media/")
    assert first_body["scenes"][0]["audioRef"]
    assert first_body["scenes"][0]["engineId"] == "short_audio_synthesis_jovi"
    assert first_body["scenes"][0]["voiceName"] == "yige"
    assert await_storybook_media_warming(first_body["storyId"], timeout_seconds=2.0) is True

    response = client.post("/api/v1/agents/parent/storybook", json=build_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["providerMeta"]["mode"] == "live"
    assert body["providerMeta"]["realProvider"] is True
    assert body["providerMeta"]["imageDelivery"] == "real"
    assert body["providerMeta"]["audioDelivery"] == "real"
    assert body["fallback"] is False
    assert body["scenes"][0]["imageStatus"] == "ready"
    assert body["scenes"][0]["audioStatus"] == "ready"
    assert body["scenes"][0]["audioUrl"].startswith("/api/ai/parent-storybook/media/")
    assert body["scenes"][0]["audioRef"]
    assert body["scenes"][0]["engineId"] == "short_audio_synthesis_jovi"
    assert body["scenes"][0]["voiceName"] == "yige"
    assert body["scenes"][0]["imageSourceKind"] == "real"
    assert body["scenes"][0]["captionTiming"]["mode"] == "duration-derived"
    assert body["providerMeta"]["diagnostics"]["brain"]["reachable"] is True


def test_parent_storybook_media_endpoint_serves_cached_audio(monkeypatch):
    image_provider = _WarmableProvider(
        provider_name="vivo-story-image",
        media_kind="image",
        ready=True,
    )
    audio_provider = _WarmableProvider(
        provider_name="vivo-story-tts",
        media_kind="audio",
        ready=True,
    )

    monkeypatch.setattr(
        "app.services.parent_storybook_service.resolve_story_image_provider",
        lambda settings: image_provider,
    )
    monkeypatch.setattr(
        "app.services.parent_storybook_service.resolve_story_audio_provider",
        lambda settings: audio_provider,
    )

    first = client.post("/api/v1/agents/parent/storybook", json=build_payload())
    first_body = first.json()
    assert await_storybook_media_warming(first_body["storyId"], timeout_seconds=2.0) is True

    response = client.post("/api/v1/agents/parent/storybook", json=build_payload())
    body = response.json()
    media_url = body["scenes"][0]["audioUrl"]
    media_key = media_url.rsplit("/", 1)[-1]
    media_response = client.get(f"/api/v1/agents/parent/storybook/media/{media_key}")

    assert media_response.status_code == 200
    assert media_response.headers["content-type"] == "audio/wav"
    assert media_response.content == b"RIFF"


def test_parent_storybook_media_endpoint_serves_cached_fallback_svg(monkeypatch):
    class _LiveEnabledSettings:
        storybook_image_provider = "vivo"
        storybook_audio_provider = "mock"
        vivo_app_id = "demo-app"

        class _Secret:
            def get_secret_value(self):
                return "demo-key"

        vivo_app_key = _Secret()
        storybook_media_cache_ttl_seconds = 900

    class _SvgFallbackImageProvider:
        provider_name = "vivo-story-image"

        def render_scene(self, **kwargs):
            return ProviderResult(
                output={
                    "imagePrompt": kwargs["image_prompt"],
                    "imageUrl": None,
                    "assetRef": None,
                    "imageStatus": "fallback",
                },
                provider=self.provider_name,
                mode="fallback",
                source="vivo",
                model="fallback-image",
            )

    monkeypatch.setattr(
        "app.services.parent_storybook_service.get_settings",
        lambda: _LiveEnabledSettings(),
    )
    monkeypatch.setattr(
        "app.services.parent_storybook_service.resolve_story_image_provider",
        lambda settings: _SvgFallbackImageProvider(),
    )

    response = client.post("/api/v1/agents/parent/storybook", json=build_payload())

    assert response.status_code == 200
    body = response.json()
    media_url = body["scenes"][0]["imageUrl"]
    media_key = media_url.rsplit("/", 1)[-1]
    media_response = client.get(f"/api/v1/agents/parent/storybook/media/{media_key}")

    assert media_response.status_code == 200
    assert media_response.headers["content-type"] == "image/svg+xml"
    assert "今天的小亮点" in media_response.text
    assert body["scenes"][0]["imageSourceKind"] == "dynamic-fallback"
    assert body["scenes"][0]["imageUrl"].startswith("/api/ai/parent-storybook/media/")


def test_parent_storybook_endpoint_can_return_mixed_media(monkeypatch):
    image_provider = _WarmableProvider(
        provider_name="vivo-story-image",
        media_kind="image",
        ready=True,
    )
    audio_provider = _WarmableProvider(
        provider_name="storybook-mock-preview",
        media_kind="audio",
        ready=False,
    )

    monkeypatch.setattr(
        "app.services.parent_storybook_service.resolve_story_image_provider",
        lambda settings: image_provider,
    )
    monkeypatch.setattr(
        "app.services.parent_storybook_service.resolve_story_audio_provider",
        lambda settings: audio_provider,
    )

    first = client.post("/api/v1/agents/parent/storybook", json=build_payload())
    first_body = first.json()
    assert first_body["providerMeta"]["mode"] == "fallback"
    assert first_body["providerMeta"]["diagnostics"]["image"]["jobStatus"] == "warming"
    assert first_body["providerMeta"]["diagnostics"]["audio"]["jobStatus"] == "disabled"
    assert await_storybook_media_warming(first_body["storyId"], timeout_seconds=2.0) is True

    response = client.post("/api/v1/agents/parent/storybook", json=build_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["providerMeta"]["mode"] == "mixed"
    assert body["providerMeta"]["realProvider"] is True
    assert body["providerMeta"]["imageDelivery"] == "real"
    assert body["providerMeta"]["audioDelivery"] == "preview-only"
    assert body["fallback"] is True
    assert body["scenes"][0]["imageStatus"] == "ready"
    assert body["scenes"][0]["audioStatus"] == "fallback"
    assert body["scenes"][0]["imageSourceKind"] == "real"
    assert body["scenes"][0]["captionTiming"]["mode"] == "duration-derived"


def test_parent_storybook_schema_parses_new_v2_fields_with_aliases():
    request = ParentStoryBookRequest.model_validate(
        {
            **build_payload(),
            "generationMode": "hybrid",
            "manualTheme": "表达情绪",
            "manualPrompt": "把主题讲成一部可朗读的小绘本。",
            "pageCount": 8,
            "goalKeywords": ["表达情绪", "勇气"],
            "protagonistArchetype": "bunny",
            "styleMode": "custom",
            "customStylePrompt": "梦幻3D儿童绘本，柔焦，浅景深",
            "customStyleNegativePrompt": "不要照片感，不要复杂背景",
        }
    )
    snake_case_request = ParentStoryBookRequest.model_validate(
        {
            **build_payload(),
            "generation_mode": "manual-theme",
            "manual_theme": "独立入睡",
            "manual_prompt": "把睡前安抚讲成晚安故事。",
            "page_count": 4,
            "goal_keywords": ["独立入睡"],
            "protagonist_archetype": "bear",
            "style_mode": "preset",
            "custom_style_prompt": "暖色拼贴",
            "custom_style_negative_prompt": "不要写实人脸",
        }
    )

    assert request.generation_mode == "hybrid"
    assert request.manual_theme == "表达情绪"
    assert request.manual_prompt == "把主题讲成一部可朗读的小绘本。"
    assert request.page_count == 8
    assert request.goal_keywords == ["表达情绪", "勇气"]
    assert request.protagonist_archetype == "bunny"
    assert request.style_mode == "custom"
    assert request.custom_style_prompt == "梦幻3D儿童绘本，柔焦，浅景深"
    assert request.custom_style_negative_prompt == "不要照片感，不要复杂背景"
    assert request.style_mode == "custom"
    assert snake_case_request.generation_mode == "manual-theme"
    assert snake_case_request.page_count == 4
    assert snake_case_request.protagonist_archetype == "bear"
    assert snake_case_request.style_mode == "preset"
    assert snake_case_request.custom_style_prompt == "暖色拼贴"
    assert snake_case_request.custom_style_negative_prompt == "不要写实人脸"


def test_parent_storybook_endpoint_rejects_invalid_page_count():
    payload = build_payload()
    payload["pageCount"] = 5

    response = client.post("/api/v1/agents/parent/storybook", json=payload)

    assert response.status_code == 422
