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
        "storybook_image_poll_interval_ms": 0,
        "storybook_image_poll_timeout_ms": 1_000,
        "request_timeout_seconds": 1.0,
    }
    base.update(overrides)
    return Settings(**base)


@pytest.fixture(autouse=True)
def clear_storybook_runtime_cache():
    get_storybook_runtime_cache().clear()
    yield
    get_storybook_runtime_cache().clear()


def test_vivo_story_image_provider_returns_ready_image(monkeypatch: pytest.MonkeyPatch):
    provider = VivoStoryImageProvider(_settings())
    get_calls = {"count": 0}

    def fake_post(*args, **kwargs):
        del args, kwargs
        return _FakeResponse(200, {"code": 200, "result": {"task_id": "task-1"}})

    def fake_get(*args, **kwargs):
        del args, kwargs
        get_calls["count"] += 1
        if get_calls["count"] == 1:
            return _FakeResponse(200, {"code": 200, "result": {"status": 1, "finished": False}})
        return _FakeResponse(
            200,
            {
                "code": 200,
                "result": {
                    "status": 2,
                    "finished": True,
                    "model": "通用 v6.0",
                    "images_url": ["https://cdn.example.com/story-1.png"],
                },
            },
        )

    monkeypatch.setattr("app.providers.story_image_provider.requests.post", fake_post)
    monkeypatch.setattr("app.providers.story_image_provider.requests.get", fake_get)

    result = provider.render_scene(
        story_mode="storybook",
        scene_index=0,
        child_name="安安",
        scene_title="今天的小亮点",
        scene_text="今天愿意主动说早安。",
        child_id="child-1",
        story_id="storybook-1",
    )

    assert result.output["imageStatus"] == "ready"
    assert result.output["imageUrl"] == "https://cdn.example.com/story-1.png"
    assert result.provider == "vivo-story-image"
    assert get_calls["count"] == 2


def test_vivo_story_image_provider_times_out_when_task_never_finishes(monkeypatch: pytest.MonkeyPatch):
    provider = VivoStoryImageProvider(_settings(storybook_image_poll_timeout_ms=0))

    monkeypatch.setattr(
        "app.providers.story_image_provider.requests.post",
        lambda *args, **kwargs: _FakeResponse(200, {"code": 200, "result": {"task_id": "task-1"}}),
    )
    monkeypatch.setattr(
        "app.providers.story_image_provider.requests.get",
        lambda *args, **kwargs: _FakeResponse(200, {"code": 200, "result": {"status": 1, "finished": False}}),
    )

    with pytest.raises(ProviderResponseError, match="timed out"):
        provider.render_scene(
            story_mode="storybook",
            scene_index=0,
            child_name="安安",
            scene_title="今天的小亮点",
            scene_text="今天愿意主动说早安。",
            child_id="child-1",
            story_id="storybook-1",
        )


def test_vivo_story_image_provider_raises_on_auth_failure(monkeypatch: pytest.MonkeyPatch):
    provider = VivoStoryImageProvider(_settings())
    monkeypatch.setattr(
        "app.providers.story_image_provider.requests.post",
        lambda *args, **kwargs: _FakeResponse(401, {"msg": "unauthorized"}),
    )

    with pytest.raises(ProviderAuthenticationError):
        provider.render_scene(
            story_mode="storybook",
            scene_index=0,
            child_name="安安",
            scene_title="今天的小亮点",
            scene_text="今天愿意主动说早安。",
            child_id="child-1",
            story_id="storybook-1",
        )


def test_vivo_story_image_provider_raises_on_rate_limit(monkeypatch: pytest.MonkeyPatch):
    provider = VivoStoryImageProvider(_settings())
    monkeypatch.setattr(
        "app.providers.story_image_provider.requests.post",
        lambda *args, **kwargs: _FakeResponse(429, {"msg": "rate limited"}),
    )

    with pytest.raises(ProviderResponseError, match="rate limited"):
        provider.render_scene(
            story_mode="storybook",
            scene_index=0,
            child_name="安安",
            scene_title="今天的小亮点",
            scene_text="今天愿意主动说早安。",
            child_id="child-1",
            story_id="storybook-1",
        )


def test_vivo_story_image_provider_raises_when_finished_without_image(monkeypatch: pytest.MonkeyPatch):
    provider = VivoStoryImageProvider(_settings())
    monkeypatch.setattr(
        "app.providers.story_image_provider.requests.post",
        lambda *args, **kwargs: _FakeResponse(200, {"code": 200, "result": {"task_id": "task-1"}}),
    )
    monkeypatch.setattr(
        "app.providers.story_image_provider.requests.get",
        lambda *args, **kwargs: _FakeResponse(200, {"code": 200, "result": {"status": 2, "finished": True, "images_url": []}}),
    )

    with pytest.raises(ProviderResponseError, match="without images_url"):
        provider.render_scene(
            story_mode="storybook",
            scene_index=0,
            child_name="安安",
            scene_title="今天的小亮点",
            scene_text="今天愿意主动说早安。",
            child_id="child-1",
            story_id="storybook-1",
        )
