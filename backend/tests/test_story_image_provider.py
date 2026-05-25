from __future__ import annotations

import pytest

from app.core.config import Settings
from app.providers.base import ProviderAuthenticationError, ProviderResponseError
from app.providers.story_image_provider import VivoStoryImageProvider
from app.services.storybook_runtime_cache import get_storybook_runtime_cache


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict:
        return self._payload


def _settings(**overrides) -> Settings:
    base = {
        "vivo_app_id": "demo-app",
        "vivo_app_key": "demo-key",
        "storybook_image_provider": "vivo",
        "storybook_image_model": "Doubao-Seedream-4.5",
        "storybook_image_size": "2K",
        "request_timeout_seconds": 1.0,
    }
    base.update(overrides)
    return Settings(**base)


@pytest.fixture(autouse=True)
def clear_storybook_runtime_cache():
    get_storybook_runtime_cache().clear()
    yield
    get_storybook_runtime_cache().clear()


def test_vivo_story_image_provider_calls_current_image_generation_api(
    monkeypatch: pytest.MonkeyPatch,
):
    provider = VivoStoryImageProvider(_settings())
    post_calls = []

    def fake_post(*args, **kwargs):
        post_calls.append((args, kwargs))
        return _FakeResponse(
            200,
            {
                "code": 0,
                "message": "success",
                "trace_id": "trace-image-1",
                "data": {
                    "images": [
                        {"url": "https://cdn.example.com/story-1.png", "size": "2048x2048"}
                    ],
                    "finish_reason": "stop",
                    "usage": {"image_count": 1},
                },
            },
        )

    monkeypatch.setattr("app.providers.story_image_provider.requests.post", fake_post)

    result = provider.render_scene(
        story_mode="storybook",
        scene_index=0,
        child_name="An An",
        scene_title="A small bright moment",
        scene_text="Today An An names a feeling before bedtime.",
        child_id="child-1",
        story_id="storybook-1",
    )

    assert result.output["imageStatus"] == "ready"
    assert result.output["imageUrl"] == "https://cdn.example.com/story-1.png"
    assert result.output["providerTraceId"] == "trace-image-1"
    assert result.provider == "vivo-story-image"
    assert result.model == "Doubao-Seedream-4.5"

    assert len(post_calls) == 1
    args, kwargs = post_calls[0]
    assert args[0].endswith("/api/v1/image_generation")
    assert kwargs["params"]["module"] == "aigc"
    assert kwargs["params"]["request_id"]
    assert isinstance(kwargs["params"]["system_time"], int)
    assert kwargs["headers"]["Authorization"] == "Bearer demo-key"
    assert kwargs["json"]["model"] == "Doubao-Seedream-4.5"
    assert kwargs["json"]["parameters"]["size"] == "2K"
    assert "prompt" in kwargs["json"]


def test_vivo_story_image_provider_raises_on_auth_failure(monkeypatch: pytest.MonkeyPatch):
    provider = VivoStoryImageProvider(_settings())
    monkeypatch.setattr(
        "app.providers.story_image_provider.requests.post",
        lambda *args, **kwargs: _FakeResponse(401, {"message": "unauthorized"}),
    )

    with pytest.raises(ProviderAuthenticationError):
        provider.render_scene(
            story_mode="storybook",
            scene_index=0,
            child_name="An An",
            scene_title="A small bright moment",
            scene_text="Today An An names a feeling before bedtime.",
            child_id="child-1",
            story_id="storybook-1",
        )


def test_vivo_story_image_provider_raises_on_permission_error(monkeypatch: pytest.MonkeyPatch):
    provider = VivoStoryImageProvider(_settings())
    monkeypatch.setattr(
        "app.providers.story_image_provider.requests.post",
        lambda *args, **kwargs: _FakeResponse(200, {"code": 1002, "message": "no permission"}),
    )

    with pytest.raises(ProviderAuthenticationError, match="permission denied"):
        provider.render_scene(
            story_mode="storybook",
            scene_index=0,
            child_name="An An",
            scene_title="A small bright moment",
            scene_text="Today An An names a feeling before bedtime.",
            child_id="child-1",
            story_id="storybook-1",
        )


def test_vivo_story_image_provider_raises_on_rate_limit(monkeypatch: pytest.MonkeyPatch):
    provider = VivoStoryImageProvider(_settings())
    monkeypatch.setattr(
        "app.providers.story_image_provider.requests.post",
        lambda *args, **kwargs: _FakeResponse(
            200,
            {"code": 1003, "message": "Rate limit exceeded"},
        ),
    )

    with pytest.raises(ProviderResponseError, match="rate limited"):
        provider.render_scene(
            story_mode="storybook",
            scene_index=0,
            child_name="An An",
            scene_title="A small bright moment",
            scene_text="Today An An names a feeling before bedtime.",
            child_id="child-1",
            story_id="storybook-1",
        )


def test_vivo_story_image_provider_raises_on_content_moderation(
    monkeypatch: pytest.MonkeyPatch,
):
    provider = VivoStoryImageProvider(_settings())
    monkeypatch.setattr(
        "app.providers.story_image_provider.requests.post",
        lambda *args, **kwargs: _FakeResponse(
            200,
            {"code": 1004, "message": "moderation failed"},
        ),
    )

    with pytest.raises(ProviderResponseError, match="content moderation failed"):
        provider.render_scene(
            story_mode="storybook",
            scene_index=0,
            child_name="An An",
            scene_title="A small bright moment",
            scene_text="Today An An names a feeling before bedtime.",
            child_id="child-1",
            story_id="storybook-1",
        )


def test_vivo_story_image_provider_raises_when_generation_has_no_image(
    monkeypatch: pytest.MonkeyPatch,
):
    provider = VivoStoryImageProvider(_settings())
    monkeypatch.setattr(
        "app.providers.story_image_provider.requests.post",
        lambda *args, **kwargs: _FakeResponse(
            200,
            {"code": 0, "message": "success", "data": {"images": []}},
        ),
    )

    with pytest.raises(ProviderResponseError, match="without image url"):
        provider.render_scene(
            story_mode="storybook",
            scene_index=0,
            child_name="An An",
            scene_title="A small bright moment",
            scene_text="Today An An names a feeling before bedtime.",
            child_id="child-1",
            story_id="storybook-1",
        )
