from __future__ import annotations

import hashlib
import time
from typing import Any
from uuid import uuid4

import requests

from app.core.config import Settings
from app.providers.base import (
    ProviderAuthenticationError,
    ProviderConfigurationError,
    ProviderResponseError,
    ProviderResult,
)
from app.providers.vivo_llm import VivoLlmProvider
from app.services.storybook_runtime_cache import get_storybook_runtime_cache

IMAGE_SUBMIT_PATH = "/api/v1/task_submit"
IMAGE_PROGRESS_PATH = "/api/v1/task_progress"
DEFAULT_IMAGE_NEGATIVE_PROMPT = (
    "不要任何中文、不要任何英文、不要任何数字、不要任何标题、不要任何对话气泡、不要任何对白框、"
    "不要任何书页文字、不要任何海报排版文字、不要任何logo、不要任何watermark、不要任何水印、"
    "不要任何signature、不要任何签名、不要任何标识、image-only composition、no readable text、no typography"
)


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split())


def _normalize_int(value: Any, *, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _normalize_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [_normalize_text(item) for item in value if _normalize_text(item)]


def _ensure_no_text_image_prompt(prompt: str) -> str:
    normalized = _normalize_text(prompt)
    if not normalized:
        normalized = "温柔儿童绘本场景插画，纯画面叙事，只表现人物、场景、动作与情绪"
    if "image-only composition" in normalized.lower() or "no readable text" in normalized.lower():
        return normalized
    return f"{normalized}；严格禁止任何文字元素：{DEFAULT_IMAGE_NEGATIVE_PROMPT}"


def _is_success_code(value: Any) -> bool:
    return _normalize_text(value) in {"0", "200"}


def _has_vivo_credentials(settings: Settings) -> bool:
    app_id = (settings.vivo_app_id or "").strip()
    app_key = settings.vivo_app_key.get_secret_value().strip() if settings.vivo_app_key else ""
    return bool(app_id and app_key)


def can_use_vivo_story_image_provider(settings: Settings) -> bool:
    return settings.storybook_image_provider.strip().lower() == "vivo" and _has_vivo_credentials(settings)


def _build_default_prompt(
    *,
    child_name: str,
    class_name: str | None,
    scene_title: str,
    scene_text: str,
) -> str:
    scene_hint = "温暖教室或家庭陪伴场景" if class_name else "温暖日常陪伴场景"
    child_hint = child_name or "一位小朋友"
    visual_hint = _normalize_text(scene_text[:48]) or _normalize_text(scene_title) or "安静的睡前陪伴时刻"
    return _ensure_no_text_image_prompt(
        "；".join(
            [
                "温柔儿童绘本场景插画，纯画面叙事，只表现人物、场景、动作与情绪",
                f"主角：{child_hint}",
                f"场景：{scene_hint}",
                f"画面线索：围绕{visual_hint}营造温暖陪伴感",
                "风格：真实儿童绘本质感，暖黄与浅蓝色调，前景简洁，突出角色动作与情绪",
            ]
        )
    )


def _build_story_image_cache_key(
    *,
    prompt: str,
    business_code: str,
    style_config: str,
    width: int,
    height: int,
) -> str:
    seed = "::".join(
        [
            prompt,
            business_code,
            style_config,
            str(width),
            str(height),
        ]
    )
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()


class MockStoryImageProvider:
    provider_name = "storybook-asset"
    mode_name = "fallback"
    model_name = "storybook-asset-v1"

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
        class_name: str | None = None,
        image_prompt: str | None = None,
    ) -> ProviderResult[dict[str, Any]] | None:
        del story_mode, scene_index, child_name, scene_title, scene_text, child_id, story_id, class_name, image_prompt
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
        class_name: str | None = None,
        image_prompt: str | None = None,
    ) -> ProviderResult[dict[str, Any]]:
        del child_id, story_id
        prompt = _ensure_no_text_image_prompt(
            image_prompt
            or _build_default_prompt(
                child_name=child_name,
                class_name=class_name,
                scene_title=scene_title,
                scene_text=scene_text,
            )
        )
        return ProviderResult(
            output={
                "imagePrompt": prompt,
                "imageUrl": None,
                "assetRef": None,
                "imageStatus": "fallback" if story_mode == "storybook" else "mock",
                "cacheHit": False,
            },
            provider=self.provider_name,
            mode=self.mode_name,
            source="mock",
            model=self.model_name,
        )


class VivoStoryImageProvider:
    provider_name = "vivo-story-image"
    mode_name = "live"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

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
        class_name: str | None = None,
        image_prompt: str | None = None,
    ) -> ProviderResult[dict[str, Any]] | None:
        del story_mode, scene_index, child_id, story_id
        prompt = _ensure_no_text_image_prompt(
            image_prompt
            or _build_default_prompt(
                child_name=child_name,
                class_name=class_name,
                scene_title=scene_title,
                scene_text=scene_text,
            )
        )
        cache_key = _build_story_image_cache_key(
            prompt=prompt,
            business_code=self.settings.storybook_image_business_code,
            style_config=self.settings.storybook_image_style_config,
            width=self.settings.storybook_image_width,
            height=self.settings.storybook_image_height,
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
        class_name: str | None = None,
        image_prompt: str | None = None,
    ) -> ProviderResult[dict[str, Any]]:
        if story_mode != "storybook":
            raise ProviderResponseError("Vivo story image provider only runs for storybook mode")

        prompt = _ensure_no_text_image_prompt(
            image_prompt
            or _build_default_prompt(
                child_name=child_name,
                class_name=class_name,
                scene_title=scene_title,
                scene_text=scene_text,
            )
        )
        cache_key = _build_story_image_cache_key(
            prompt=prompt,
            business_code=self.settings.storybook_image_business_code,
            style_config=self.settings.storybook_image_style_config,
            width=self.settings.storybook_image_width,
            height=self.settings.storybook_image_height,
        )
        cached_result = self.read_cached_scene(
            story_mode=story_mode,
            scene_index=scene_index,
            child_name=child_name,
            scene_title=scene_title,
            scene_text=scene_text,
            child_id=child_id,
            story_id=story_id,
            class_name=class_name,
            image_prompt=prompt,
        )
        if cached_result:
            return cached_result

        app_id, app_key = self._require_credentials()
        request_id = uuid4().hex

        submit_payload = {
            "dataId": request_id,
            "businessCode": self.settings.storybook_image_business_code,
            "userAccount": self._build_user_account(child_id=child_id, story_id=story_id, scene_index=scene_index),
            "prompt": prompt,
            "styleConfig": self.settings.storybook_image_style_config,
            "width": self.settings.storybook_image_width,
            "height": self.settings.storybook_image_height,
        }
        submit_response = requests.post(
            self._url(IMAGE_SUBMIT_PATH),
            headers=self._build_headers(
                app_id=app_id,
                app_key=app_key,
                method="POST",
                path=IMAGE_SUBMIT_PATH,
            ),
            json=submit_payload,
            timeout=self.settings.request_timeout_seconds,
        )
        submit_result = self._parse_response(stage="task_submit", response=submit_response)
        task_id = _normalize_text((submit_result.get("result") or {}).get("task_id"))
        if not task_id:
            raise ProviderResponseError("Vivo story image submit succeeded without task_id")

        poll_interval = max(self.settings.storybook_image_poll_interval_ms, 0) / 1000
        deadline = time.monotonic() + max(self.settings.storybook_image_poll_timeout_ms, 0) / 1000

        while True:
            query = {"task_id": task_id}
            progress_response = requests.get(
                self._url(IMAGE_PROGRESS_PATH),
                params=query,
                headers=self._build_headers(
                    app_id=app_id,
                    app_key=app_key,
                    method="GET",
                    path=IMAGE_PROGRESS_PATH,
                    query=query,
                ),
                timeout=self.settings.request_timeout_seconds,
            )
            progress_payload = self._parse_response(stage="task_progress", response=progress_response)
            progress_result = progress_payload.get("result") or {}
            status = _normalize_text(progress_result.get("status"))
            finished = bool(progress_result.get("finished")) or status == "2"
            images = _normalize_list(progress_result.get("images_url") or progress_result.get("imagesUrl"))

            if finished:
                if not images:
                    raise ProviderResponseError("Vivo story image task finished without images_url")
                image_url = images[0]
                model_name = _normalize_text(progress_result.get("model")) or None
                output = {
                    "imagePrompt": prompt,
                    "imageUrl": image_url,
                    "assetRef": image_url,
                    "imageStatus": "ready",
                    "cacheHit": False,
                }
                get_storybook_runtime_cache().set(
                    cache_key,
                    {
                        "output": output,
                        "model": model_name,
                        "requestId": request_id,
                    },
                )
                return ProviderResult(
                    output=output,
                    provider=self.provider_name,
                    mode=self.mode_name,
                    source="vivo",
                    model=model_name,
                    request_id=request_id,
                )

            if status in {"3", "4"}:
                raise ProviderResponseError(
                    f"Vivo story image task failed with status={status or 'unknown'}"
                )
            if time.monotonic() >= deadline:
                raise ProviderResponseError("Vivo story image task timed out before completion")
            time.sleep(poll_interval)

    def _require_credentials(self) -> tuple[str, str]:
        app_id = (self.settings.vivo_app_id or "").strip()
        app_key = self.settings.vivo_app_key.get_secret_value().strip() if self.settings.vivo_app_key else ""
        if not app_id or not app_key:
            raise ProviderConfigurationError(
                "VIVO_APP_ID and VIVO_APP_KEY are required for vivo story image requests"
            )
        return app_id, app_key

    def _build_headers(
        self,
        *,
        app_id: str,
        app_key: str,
        method: str,
        path: str,
        query: dict[str, Any] | None = None,
    ) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {app_key}",
            "Content-Type": "application/json; charset=utf-8",
            **VivoLlmProvider._build_gateway_headers(
                app_id=app_id,
                app_key=app_key,
                method=method,
                uri=path,
                query=query or {},
            ),
        }

    def _parse_response(self, *, stage: str, response: requests.Response) -> dict[str, Any]:
        if response.status_code in {401, 403}:
            raise ProviderAuthenticationError(
                f"Vivo story image authentication failed with status {response.status_code}"
            )
        payload = self._try_parse_json(response)
        if response.status_code == 429:
            raise ProviderResponseError("Vivo story image rate limited")
        if response.status_code >= 400:
            message = _normalize_text(payload.get("msg") or payload.get("message")) or "http-error"
            raise ProviderResponseError(f"Vivo story image {stage} failed: {message}")
        if not _is_success_code(payload.get("code")):
            message = _normalize_text(payload.get("msg") or payload.get("message")) or "business-error"
            raise ProviderResponseError(f"Vivo story image {stage} failed: {message}")
        return payload

    @staticmethod
    def _try_parse_json(response: requests.Response) -> dict[str, Any]:
        try:
            payload = response.json()
        except Exception as exc:
            raise ProviderResponseError(f"Vivo story image invalid JSON response: {type(exc).__name__}") from exc
        if not isinstance(payload, dict):
            raise ProviderResponseError("Vivo story image response is not a JSON object")
        return payload

    @staticmethod
    def _build_user_account(*, child_id: str | None, story_id: str | None, scene_index: int) -> str:
        seed = "::".join(
            [
                _normalize_text(child_id) or "child",
                _normalize_text(story_id) or "story",
                str(scene_index + 1),
            ]
        )
        return hashlib.sha256(seed.encode("utf-8")).hexdigest()[:32]

    def _url(self, path: str) -> str:
        return f"{self.settings.vivo_base_url.rstrip('/')}{path}"


def resolve_story_image_provider(settings: Settings | None = None) -> MockStoryImageProvider | VivoStoryImageProvider:
    if settings and can_use_vivo_story_image_provider(settings):
        return VivoStoryImageProvider(settings)
    return MockStoryImageProvider()
