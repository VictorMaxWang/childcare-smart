from __future__ import annotations

import json
import re
from dataclasses import dataclass
from time import monotonic
from typing import Any

from app.core.config import Settings
from app.providers.base import (
    ProviderAuthenticationError,
    ProviderConfigurationError,
    ProviderResponseError,
)
from app.providers.resolver import resolve_text_provider


class ParentStoryBookTextProviderError(RuntimeError):
    def __init__(self, message: str, *, fallback_reason: str, status_code: int = 503) -> None:
        super().__init__(message)
        self.fallback_reason = fallback_reason
        self.status_code = status_code


@dataclass(slots=True)
class ParentStoryBookTextGeneration:
    title: str
    summary: str
    moral: str
    parent_note: str
    scenes: list[dict[str, Any]]
    source: str
    provider: str
    model: str | None
    text_delivery: str
    real_provider: bool
    fallback: bool
    fallback_reason: str | None
    elapsed_ms: int
    request_id: str | None = None


def _normalize_text(value: Any) -> str:
    return " ".join(str(value or "").strip().split())


def _elapsed_ms(started_at: float) -> int:
    return max(0, int((monotonic() - started_at) * 1000))


def _compact_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _is_placeholder_secret(value: Any) -> bool:
    text = _normalize_text(value).lower()
    if not text:
        return True
    return text.startswith("your_") or text in {"placeholder", "changeme", "change-me"}


def _secret_text(value: Any) -> str:
    getter = getattr(value, "get_secret_value", None)
    if callable(getter):
        return _normalize_text(getter())
    return _normalize_text(value)


def _has_real_vivo_text_config(settings: Settings) -> bool:
    app_id = _normalize_text(getattr(settings, "vivo_app_id", ""))
    app_key = _secret_text(getattr(settings, "vivo_app_key", None))
    brain_provider = _normalize_text(getattr(settings, "brain_provider", "mock")).lower()
    return (
        brain_provider == "vivo"
        and not _is_placeholder_secret(app_id)
        and not _is_placeholder_secret(app_key)
    )


def _strip_json_fence(value: str) -> str:
    text = value.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _extract_json_object(value: str) -> dict[str, Any]:
    text = _strip_json_fence(value)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end <= start:
            raise
        parsed = json.loads(text[start : end + 1])
    if not isinstance(parsed, dict):
        raise ValueError("storybook text provider returned non-object JSON")
    return parsed


def _contains_fixed_demo(value: Any) -> bool:
    text = _compact_json(value)
    return "林小雨的一小步勇敢" in text or "lin-xiaoyu-one-small-brave-step" in text


def _coerce_scene(
    *,
    raw_scene: dict[str, Any],
    rule_scene: dict[str, Any],
    index: int,
) -> dict[str, Any]:
    scene_title = _normalize_text(
        raw_scene.get("sceneTitle") or raw_scene.get("scene_title")
    )
    scene_text = _normalize_text(raw_scene.get("sceneText") or raw_scene.get("scene_text"))
    image_prompt = _normalize_text(raw_scene.get("imagePrompt") or raw_scene.get("image_prompt"))
    audio_script = _normalize_text(raw_scene.get("audioScript") or raw_scene.get("audio_script"))
    voice_style = _normalize_text(raw_scene.get("voiceStyle") or raw_scene.get("voice_style"))
    highlight_source = _normalize_text(
        raw_scene.get("highlightSource") or raw_scene.get("highlight_source")
    )

    if not scene_title or not scene_text:
        raise ValueError(f"scene {index + 1} is missing sceneTitle or sceneText")

    if not audio_script:
        audio_script = f"{scene_title}。{scene_text}"

    merged_image_prompt = rule_scene["imagePrompt"]
    if image_prompt:
        merged_image_prompt = f"{merged_image_prompt}；AI画面补充：{image_prompt}"

    return {
        **rule_scene,
        "sceneIndex": index + 1,
        "sceneTitle": scene_title,
        "sceneText": scene_text,
        "imagePrompt": merged_image_prompt,
        "audioScript": audio_script,
        "voiceStyle": voice_style or rule_scene["voiceStyle"],
        "highlightSource": highlight_source or rule_scene["highlightSource"],
    }


def _validate_story_payload(
    parsed: dict[str, Any],
    *,
    rule_story: dict[str, Any],
    expected_scene_count: int,
) -> dict[str, Any]:
    if _contains_fixed_demo(parsed):
        raise ValueError("storybook text provider returned fixed demo story")

    raw_scenes = parsed.get("scenes")
    if not isinstance(raw_scenes, list) or len(raw_scenes) != expected_scene_count:
        raise ValueError("storybook text provider returned wrong page count")

    rule_scenes = rule_story["scenes"]
    scenes: list[dict[str, Any]] = []
    for index, raw_scene in enumerate(raw_scenes):
        if not isinstance(raw_scene, dict):
            raise ValueError(f"scene {index + 1} is not an object")
        scenes.append(
            _coerce_scene(
                raw_scene=raw_scene,
                rule_scene=rule_scenes[index],
                index=index,
            )
        )

    return {
        "title": _normalize_text(parsed.get("title")) or rule_story["title"],
        "summary": _normalize_text(parsed.get("summary")) or rule_story["summary"],
        "moral": _normalize_text(parsed.get("moral")) or rule_story["moral"],
        "parentNote": _normalize_text(parsed.get("parentNote") or parsed.get("parent_note"))
        or rule_story["parentNote"],
        "scenes": scenes,
    }


def _fallback_generation(
    *,
    rule_story: dict[str, Any],
    fallback_reason: str,
    provider: str,
    model: str | None,
    elapsed_ms: int,
    source: str = "fallback",
    request_id: str | None = None,
) -> ParentStoryBookTextGeneration:
    return ParentStoryBookTextGeneration(
        title=rule_story["title"],
        summary=rule_story["summary"],
        moral=rule_story["moral"],
        parent_note=rule_story["parentNote"],
        scenes=rule_story["scenes"],
        source=source,
        provider=provider,
        model=model,
        text_delivery="mock" if source == "mock" else "fallback",
        real_provider=False,
        fallback=True,
        fallback_reason=fallback_reason,
        elapsed_ms=elapsed_ms,
        request_id=request_id,
    )


def _build_storybook_prompt(
    *,
    payload: dict[str, Any],
    ingredients: dict[str, Any],
    rule_story: dict[str, Any],
    expected_scene_count: int,
) -> str:
    context = {
        "child": payload.get("snapshot", {}).get("child", {}),
        "summary": payload.get("snapshot", {}).get("summary", {}),
        "recentDetails": payload.get("snapshot", {}).get("recentDetails", {}),
        "theme": ingredients["focus_theme"],
        "generationMode": ingredients["generation_mode"],
        "pageCount": expected_scene_count,
        "goalKeywords": ingredients["goal_keywords"],
        "stylePrompt": ingredients["style_prompt"],
        "protagonist": ingredients["protagonist"],
        "highlights": ingredients["highlights"],
        "latestInterventionCard": payload.get("latestInterventionCard")
        or payload.get("latest_intervention_card"),
        "latestConsultation": payload.get("latestConsultation")
        or payload.get("latest_consultation"),
        "ruleDraft": {
            "title": rule_story["title"],
            "summary": rule_story["summary"],
            "parentNote": rule_story["parentNote"],
            "sceneTitles": [scene["sceneTitle"] for scene in rule_story["scenes"]],
        },
    }
    schema = {
        "title": "string",
        "summary": "string",
        "moral": "string",
        "parentNote": "string",
        "scenes": [
            {
                "sceneTitle": "string",
                "sceneText": "string",
                "audioScript": "string",
                "imagePrompt": "string",
                "voiceStyle": "gentle-bedtime | warm-storytelling | calm-encouraging",
                "highlightSource": "string",
            }
        ],
    }
    return "\n".join(
        [
            "你是幼儿园成长绘本生成器。请基于输入为家长生成真实、原创、可朗读的儿童成长绘本。",
            "硬性要求：只输出 JSON；不要 Markdown；不要解释；不要返回固定演示绘本；不要出现林小雨或《林小雨的一小步勇敢》。",
            f"必须输出 exactly {expected_scene_count} 个 scenes，sceneText 要适合 3-6 岁孩子听，每页 45-90 个中文字符。",
            "故事必须综合孩子、主题、页数、风格、教师记录、成长亮点、家长反馈、干预卡和会诊信息；输入变化时故事内容也要变化。",
            "imagePrompt 用中文描述画面，不要要求画真实孩子正脸，不要包含画面文字。",
            f"JSON schema: {_compact_json(schema)}",
            f"输入上下文: {_compact_json(context)}",
        ]
    )


def generate_parent_storybook_text(
    *,
    settings: Settings,
    payload: dict[str, Any],
    ingredients: dict[str, Any],
    rule_story: dict[str, Any],
) -> ParentStoryBookTextGeneration:
    started_at = monotonic()
    expected_scene_count = 1 if ingredients["story_mode"] == "card" else int(ingredients["page_count"])
    model_name = None
    text_provider_ready = _has_real_vivo_text_config(settings)

    if ingredients["story_mode"] == "card":
        return _fallback_generation(
            rule_story=rule_story,
            fallback_reason="sparse-parent-context",
            provider="parent-storybook-rule",
            model=None,
            elapsed_ms=_elapsed_ms(started_at),
        )

    if not text_provider_ready:
        if not getattr(settings, "enable_mock_provider", True):
            raise ParentStoryBookTextProviderError(
                "vivo storybook text provider is not configured",
                fallback_reason="provider-unconfigured",
                status_code=503,
            )
        fallback_reason = "provider-unconfigured-dev-fallback"
        return _fallback_generation(
            rule_story=rule_story,
            fallback_reason=fallback_reason,
            provider="parent-storybook-rule",
            model=None,
            elapsed_ms=_elapsed_ms(started_at),
        )

    provider = resolve_text_provider(settings)
    provider_name = _normalize_text(getattr(provider, "provider_name", "")) or "text-provider"
    prompt = _build_storybook_prompt(
        payload=payload,
        ingredients=ingredients,
        rule_story=rule_story,
        expected_scene_count=expected_scene_count,
    )
    fallback_json = _compact_json(
        {
            "title": rule_story["title"],
            "summary": rule_story["summary"],
            "moral": rule_story["moral"],
            "parentNote": rule_story["parentNote"],
            "scenes": [
                {
                    "sceneTitle": scene["sceneTitle"],
                    "sceneText": scene["sceneText"],
                    "audioScript": scene["audioScript"],
                    "imagePrompt": "",
                    "voiceStyle": scene["voiceStyle"],
                    "highlightSource": scene["highlightSource"],
                }
                for scene in rule_story["scenes"]
            ],
        }
    )

    try:
        provider_result = provider.summarize(prompt=prompt, fallback=fallback_json)
    except ProviderConfigurationError as error:
        raise ParentStoryBookTextProviderError(
            "storybook text provider is missing required configuration",
            fallback_reason="provider-configuration-error",
            status_code=503,
        ) from error
    except ProviderAuthenticationError as error:
        raise ParentStoryBookTextProviderError(
            "storybook text provider authentication failed",
            fallback_reason="provider-authentication-error",
            status_code=502,
        ) from error
    except ProviderResponseError as error:
        raise ParentStoryBookTextProviderError(
            "storybook text provider failed",
            fallback_reason=_normalize_text(getattr(error, "diagnosis", "")) or "provider-response-error",
            status_code=int(getattr(error, "http_status", 502) or 502),
        ) from error

    model_name = provider_result.model
    try:
        parsed = _extract_json_object(provider_result.text or provider_result.content or "")
        validated = _validate_story_payload(
            parsed,
            rule_story=rule_story,
            expected_scene_count=expected_scene_count,
        )
    except Exception as error:
        if not getattr(settings, "enable_mock_provider", True):
            raise ParentStoryBookTextProviderError(
                "storybook text provider returned invalid story JSON",
                fallback_reason="provider-invalid-json",
                status_code=502,
            ) from error
        return _fallback_generation(
            rule_story=rule_story,
            fallback_reason="provider-invalid-json-dev-fallback",
            provider=provider_name,
            model=model_name,
            elapsed_ms=_elapsed_ms(started_at),
            source="fallback",
            request_id=provider_result.request_id,
        )

    if provider_result.fallback:
        reason = _normalize_text((provider_result.meta or {}).get("reason")) or "provider-fallback"
        return ParentStoryBookTextGeneration(
            title=validated["title"],
            summary=validated["summary"],
            moral=validated["moral"],
            parent_note=validated["parentNote"],
            scenes=validated["scenes"],
            source="fallback",
            provider=provider_name,
            model=model_name,
            text_delivery="fallback",
            real_provider=False,
            fallback=True,
            fallback_reason=f"text-provider-{reason}",
            elapsed_ms=_elapsed_ms(started_at),
            request_id=provider_result.request_id,
        )

    return ParentStoryBookTextGeneration(
        title=validated["title"],
        summary=validated["summary"],
        moral=validated["moral"],
        parent_note=validated["parentNote"],
        scenes=validated["scenes"],
        source="vivo" if provider_result.source == "vivo" else "ai",
        provider=provider_result.provider or provider_name,
        model=model_name,
        text_delivery="real",
        real_provider=True,
        fallback=False,
        fallback_reason=None,
        elapsed_ms=_elapsed_ms(started_at),
        request_id=provider_result.request_id,
    )
