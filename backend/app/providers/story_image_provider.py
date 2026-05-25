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
from app.services.storybook_runtime_cache import get_storybook_runtime_cache

IMAGE_GENERATION_PATH = "/api/v1/image_generation"
IMAGE_GENERATION_MODULE = "aigc"
DEFAULT_IMAGE_NEGATIVE_PROMPT = (
    "不要任何中文、不要任何英文、不要任何数字、不要任何标题、不要任何对话气泡、不要任何对白框、"
    "不要任何书页文字、不要任何海报排版文字、不要任何logo、不要任何watermark、不要任何水印、"
    "不要任何signature、不要任何签名、不要任何标识、image-only composition、no readable text、no typography"
)


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split())


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
    model: str,
    size: str,
) -> str:
    seed = "::".join(
        [
            prompt,
            model,
            size,
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
            model=self.settings.storybook_image_model,
            size=self.settings.storybook_image_size,
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
            model=self.settings.storybook_image_model,
            size=self.settings.storybook_image_size,
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

        _app_id, app_key = self._require_credentials()
        request_id = uuid4().hex

        image_payload = {
            "model": self.settings.storybook_image_model,
            "prompt": prompt,
            "parameters": {
                "size": self.settings.storybook_image_size,
            },
        }
        query = {
            "module": IMAGE_GENERATION_MODULE,
            "request_id": request_id,
            "system_time": int(time.time()),
        }
        response = requests.post(
            self._url(IMAGE_GENERATION_PATH),
            params=query,
            headers=self._build_headers(app_key=app_key),
            json=image_payload,
            timeout=self.settings.request_timeout_seconds,
        )
        payload = self._parse_response(stage="image_generation", response=response)
        data = payload.get("data") or {}
        if not isinstance(data, dict):
            raise ProviderResponseError("Vivo story image response data is not a JSON object")
        image_url = self._extract_image_url(data)
        if not image_url:
            raise ProviderResponseError("Vivo story image generation finished without image url")
        model_name = _normalize_text(data.get("model")) or self.settings.storybook_image_model
        output = {
            "imagePrompt": prompt,
            "imageUrl": image_url,
            "assetRef": image_url,
            "imageStatus": "ready",
            "cacheHit": False,
            "providerTraceId": _normalize_text(payload.get("trace_id")) or None,
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

    def _require_credentials(self) -> tuple[str, str]:
        app_id = (self.settings.vivo_app_id or "").strip()
        app_key = self.settings.vivo_app_key.get_secret_value().strip() if self.settings.vivo_app_key else ""
        if not app_id or not app_key:
            raise ProviderConfigurationError(
                "VIVO_APP_ID and VIVO_APP_KEY are required for vivo story image requests"
            )
        return app_id, app_key

    def _build_headers(self, *, app_key: str) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {app_key}",
            "Content-Type": "application/json; charset=utf-8",
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
        code = payload.get("code")
        if not _is_success_code(code):
            message = _normalize_text(payload.get("msg") or payload.get("message")) or "business-error"
            if str(code).strip() == "1002":
                raise ProviderAuthenticationError(f"Vivo story image {stage} permission denied: {message}")
            if str(code).strip() == "1003":
                raise ProviderResponseError(f"Vivo story image {stage} rate limited: {message}")
            if str(code).strip() == "1004":
                raise ProviderResponseError(f"Vivo story image {stage} content moderation failed: {message}")
            raise ProviderResponseError(f"Vivo story image {stage} failed: {message}")
        return payload

    @staticmethod
    def _extract_image_url(data: dict[str, Any]) -> str:
        images = data.get("images")
        if isinstance(images, list):
            for item in images:
                if isinstance(item, dict):
                    url = _normalize_text(item.get("url"))
                    if url:
                        return url
                url = _normalize_text(item)
                if url:
                    return url
        return _normalize_text(data.get("image"))

    @staticmethod
    def _try_parse_json(response: requests.Response) -> dict[str, Any]:
        try:
            payload = response.json()
        except Exception as exc:
            raise ProviderResponseError(f"Vivo story image invalid JSON response: {type(exc).__name__}") from exc
        if not isinstance(payload, dict):
            raise ProviderResponseError("Vivo story image response is not a JSON object")
        return payload

    def _url(self, path: str) -> str:
        return f"{self.settings.vivo_base_url.rstrip('/')}{path}"


def resolve_story_image_provider(settings: Settings | None = None) -> MockStoryImageProvider | VivoStoryImageProvider:
    if settings and can_use_vivo_story_image_provider(settings):
        return VivoStoryImageProvider(settings)
    return MockStoryImageProvider()
