from __future__ import annotations

import asyncio
from concurrent.futures import Future, ThreadPoolExecutor, TimeoutError as FutureTimeoutError, as_completed
from dataclasses import dataclass, field
import hashlib
import logging
import re
from datetime import UTC, datetime, timedelta
from threading import Event, Lock
from time import monotonic, time
from typing import Any, Literal

from app.core.config import get_settings
from app.providers.story_audio_provider import (
    MockStoryAudioProvider,
    build_story_caption_timing,
    can_use_vivo_story_audio_provider,
    resolve_story_audio_provider,
    story_audio_provider_prefers_vivo,
)
from app.providers.story_image_provider import (
    MockStoryImageProvider,
    can_use_vivo_story_image_provider,
    resolve_story_image_provider,
)
from app.services.storybook_media_cache import get_storybook_media_cache

logger = logging.getLogger(__name__)

DEFAULT_STYLE_PRESET = "sunrise-watercolor"
DEFAULT_STYLE_MODE = "preset"
DEFAULT_GENERATION_MODE = "child-personalized"
DEFAULT_PAGE_COUNT = 6
STORYBOOK_FOCUS_FALLBACK = "慢慢长大的力量"
PROVIDER_CACHE_WINDOW_SECONDS = 15 * 60
STYLE_PRESET_PROMPTS = {
    "sunrise-watercolor": "儿童绘本插画，晨光水彩质感，暖金高光，柔软纸张肌理，治愈、童趣、适合移动端纵向绘本。",
    "moonlit-cutout": "儿童绘本插画，月夜剪纸风格，深蓝与奶白层叠，星光柔雾，安静、轻柔、适合晚安故事。",
    "forest-crayon": "儿童绘本插画，森林蜡笔风格，浅绿与木色，明显手绘纹理，轻冒险感，温暖而有生命力。",
}
PAGE_STRUCTURES: dict[int, list[str]] = {
    4: ["opening", "challenge", "attempt", "landing"],
    6: ["opening", "challenge", "support", "attempt", "small-success", "landing"],
    8: [
        "opening",
        "setup",
        "challenge",
        "support",
        "attempt",
        "wobble",
        "small-success",
        "landing",
    ],
}
PROTAGONISTS = [
    {"archetype": "bunny", "label": "小兔团团", "visual_cue": "圆圆耳朵、软软围巾"},
    {"archetype": "bear", "label": "小熊暖暖", "visual_cue": "毛绒外套、小小灯笼"},
    {"archetype": "deer", "label": "小鹿悠悠", "visual_cue": "细长步子、月光披风"},
    {"archetype": "fox", "label": "小狐狸点点", "visual_cue": "蓬松尾巴、暖橙小背包"},
    {"archetype": "otter", "label": "小水獭泡泡", "visual_cue": "亮晶晶眼睛、柔软披肩"},
]
STORYBOOK_BASE_DATE = datetime(2026, 4, 7, 12, 0, 0, tzinfo=UTC)

StoryMode = Literal["storybook", "card"]
GenerationMode = Literal["child-personalized", "manual-theme", "hybrid"]
StyleMode = Literal["preset", "custom"]

DEFAULT_STYLE_NEGATIVE_PROMPT = "不要照片感、不要写实人脸、不要复杂背景、不要成人化"
DEFAULT_NO_TEXT_IMAGE_GUARDRAIL = (
    "不要任何中文、不要任何英文、不要任何数字、不要任何标题、不要任何对话气泡、不要任何对白框、"
    "不要任何书页文字、不要任何海报排版文字、不要任何logo、不要任何watermark、不要任何水印、"
    "不要任何signature、不要任何签名、不要任何标识、image-only composition、no readable text、no typography"
)
STYLE_PALETTES: dict[str, dict[str, str]] = {
    "sunrise-watercolor": {
        "backgroundStart": "#fff3cf",
        "backgroundEnd": "#fde5ea",
        "accent": "#f59e0b",
        "text": "#7c3a0f",
        "chip": "#fff8e6",
    },
    "moonlit-cutout": {
        "backgroundStart": "#dbeafe",
        "backgroundEnd": "#e0e7ff",
        "accent": "#2563eb",
        "text": "#1d4ed8",
        "chip": "#eff6ff",
    },
    "forest-crayon": {
        "backgroundStart": "#dcfce7",
        "backgroundEnd": "#fef3c7",
        "accent": "#059669",
        "text": "#166534",
        "chip": "#f0fdf4",
    },
}
STORYBOOK_MEDIA_WARM_JOB_TTL_SECONDS = 20 * 60
STORYBOOK_MEDIA_WARM_MAX_WORKERS = 4
STORYBOOK_MEDIA_WARM_PRIORITY_SCENE_COUNT = 2
STORYBOOK_AUDIO_PRIORITY_SYNC_TIMEOUT_SECONDS = 0.3
STORYBOOK_FIRST_BYTE_HIGHLIGHT_LIMIT = 4

MediaWarmJobStatus = Literal["disabled", "idle", "warming", "ready", "partial", "error"]


@dataclass(slots=True)
class _MediaWarmChannelState:
    total_scene_count: int = 0
    ready_scene_count: int = 0
    pending_scene_count: int = 0
    error_scene_count: int = 0
    last_error_stage: str | None = None
    last_error_reason: str | None = None
    started_at: float | None = None
    updated_at: float | None = None


@dataclass(slots=True)
class _StoryBookMediaWarmJob:
    story_id: str
    created_at: float
    updated_at: float
    image: _MediaWarmChannelState = field(default_factory=_MediaWarmChannelState)
    audio: _MediaWarmChannelState = field(default_factory=_MediaWarmChannelState)
    completed: Event = field(default_factory=Event)
    future: Future[Any] | None = None


_storybook_media_warm_executor = ThreadPoolExecutor(
    max_workers=STORYBOOK_MEDIA_WARM_MAX_WORKERS,
    thread_name_prefix="storybook-media",
)
_storybook_audio_priority_executor = ThreadPoolExecutor(
    max_workers=max(1, STORYBOOK_MEDIA_WARM_PRIORITY_SCENE_COUNT),
    thread_name_prefix="storybook-audio-priority",
)
_storybook_media_warm_jobs: dict[str, _StoryBookMediaWarmJob] = {}
_storybook_media_warm_lock = Lock()


def _payload_get(payload: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in payload:
            return payload.get(key)
    return None


def _coerce_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _normalize_text(value: Any) -> str:
    return " ".join(_coerce_text(value).split())


def _split_prompt_clauses(value: Any) -> list[str]:
    if isinstance(value, (list, tuple, set)):
        result: list[str] = []
        for item in value:
            result.extend(_split_prompt_clauses(item))
        return result
    text = _normalize_text(value)
    if not text:
        return []
    return [item.strip("：: ") for item in re.split(r"[、，,；;。\n]+", text) if item.strip("：: ")]


def _merge_prompt_clauses(*values: Any) -> str:
    merged: list[str] = []
    seen: set[str] = set()
    for value in values:
        for clause in _split_prompt_clauses(value):
            key = clause.casefold()
            if key in seen:
                continue
            seen.add(key)
            merged.append(clause)
    return "、".join(merged)


def _extract_style_prompt_body(value: Any) -> str:
    text = _normalize_text(value)
    if not text:
        return ""
    prefix = "儿童绘本风格方向："
    if text.startswith(prefix):
        text = text[len(prefix) :].strip()
    if "负面约束：" in text:
        text = text.split("负面约束：", 1)[0].strip()
    return text.rstrip("。；;，, ")


def _extract_style_prompt_negative(value: Any) -> str:
    text = _normalize_text(value)
    if "负面约束：" not in text:
        return ""
    return text.split("负面约束：", 1)[1].strip().rstrip("。；;，, ")


def _build_story_image_negative_prompt(*extra_values: Any) -> str:
    return _merge_prompt_clauses(
        DEFAULT_STYLE_NEGATIVE_PROMPT,
        DEFAULT_NO_TEXT_IMAGE_GUARDRAIL,
        *extra_values,
    )


def _elapsed_ms(started_at: float, ended_at: float | None = None) -> int:
    return max(0, int((((ended_at or monotonic()) - started_at)) * 1000))


def _normalize_keywords(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = _normalize_text(value)
        if not text or text in seen:
            continue
        seen.add(text)
        result.append(text)
    return result[:4]


def _resolve_storybook_first_byte_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    child = snapshot.get("child")
    growth = snapshot.get("summary", {}).get("growth") if isinstance(snapshot.get("summary"), dict) else {}
    feedback = snapshot.get("summary", {}).get("feedback") if isinstance(snapshot.get("summary"), dict) else {}
    return {
        "child": {
            "id": _normalize_text(child.get("id")) if isinstance(child, dict) else "",
            "name": _normalize_text(child.get("name")) if isinstance(child, dict) else "",
            "className": _normalize_text(child.get("className")) if isinstance(child, dict) else "",
        },
        "summary": {
            "growth": {
                "recordCount": int(growth.get("recordCount") or 0) if isinstance(growth, dict) else 0,
                "topCategories": growth.get("topCategories") if isinstance(growth.get("topCategories"), list) else [],
            },
            "feedback": {
                "count": int(feedback.get("count") or 0) if isinstance(feedback, dict) else 0,
                "keywords": feedback.get("keywords") if isinstance(feedback.get("keywords"), list) else [],
            },
        },
        "ruleFallback": snapshot.get("ruleFallback") if isinstance(snapshot.get("ruleFallback"), list) else [],
    }


def _resolve_storybook_first_byte_consultation(payload: dict[str, Any]) -> dict[str, Any] | None:
    consultation = _payload_get(payload, "latestConsultation", "latest_consultation")
    if not isinstance(consultation, dict):
        return None
    follow_up = consultation.get("followUp48h")
    first_follow_up = ""
    if isinstance(follow_up, list) and follow_up:
        first_follow_up = _normalize_text(follow_up[0])
    return {
        "summary": _normalize_text(consultation.get("summary")),
        "homeAction": _normalize_text(consultation.get("homeAction")),
        "followUp48h": [first_follow_up] if first_follow_up else [],
    }


def _resolve_storybook_first_byte_intervention(payload: dict[str, Any]) -> dict[str, Any] | None:
    intervention = _payload_get(payload, "latestInterventionCard", "latest_intervention_card")
    if not isinstance(intervention, dict):
        return None
    return {
        "tonightHomeAction": _normalize_text(intervention.get("tonightHomeAction")),
        "tomorrowObservationPoint": _normalize_text(intervention.get("tomorrowObservationPoint")),
        "reviewIn48h": _normalize_text(intervention.get("reviewIn48h")),
    }


def _resolve_storybook_first_byte_payload(payload: dict[str, Any]) -> dict[str, Any]:
    snapshot = _payload_get(payload, "snapshot")
    raw_highlights = _payload_get(payload, "highlightCandidates", "highlight_candidates")
    first_byte_highlights: list[dict[str, Any]] = []
    if isinstance(raw_highlights, list):
        for item in raw_highlights:
            if not isinstance(item, dict):
                continue
            if not _normalize_text(item.get("detail") or item.get("title")):
                continue
            first_byte_highlights.append(dict(item))
            if len(first_byte_highlights) >= STORYBOOK_FIRST_BYTE_HIGHLIGHT_LIMIT:
                break
    first_byte_payload: dict[str, Any] = {
        "snapshot": _resolve_storybook_first_byte_snapshot(snapshot if isinstance(snapshot, dict) else {}),
        "highlightCandidates": first_byte_highlights,
    }

    for key in (
        "childId",
        "child_id",
        "storyMode",
        "story_mode",
        "generationMode",
        "generation_mode",
        "manualTheme",
        "manual_theme",
        "manualPrompt",
        "manual_prompt",
        "pageCount",
        "page_count",
        "goalKeywords",
        "goal_keywords",
        "protagonistArchetype",
        "protagonist_archetype",
        "requestSource",
        "request_source",
        "stylePreset",
        "style_preset",
        "styleMode",
        "style_mode",
        "customStylePrompt",
        "custom_style_prompt",
        "customStyleNegativePrompt",
        "custom_style_negative_prompt",
        "stylePrompt",
        "style_prompt",
    ):
        if key in payload:
            first_byte_payload[key] = payload.get(key)

    consultation = _resolve_storybook_first_byte_consultation(payload)
    if consultation is not None:
        first_byte_payload["latestConsultation"] = consultation
    intervention = _resolve_storybook_first_byte_intervention(payload)
    if intervention is not None:
        first_byte_payload["latestInterventionCard"] = intervention
    return first_byte_payload


def _stable_hash(seed: str, *, length: int = 12) -> str:
    return hashlib.sha1(seed.encode("utf-8")).hexdigest()[:length]


def _stable_timestamp(seed: str) -> str:
    offset_seconds = int(_stable_hash(seed), 16) % (24 * 60 * 60)
    return (STORYBOOK_BASE_DATE + timedelta(seconds=offset_seconds)).isoformat().replace("+00:00", "Z")


def _prune_storybook_media_warm_jobs_locked(now: float) -> None:
    expired_story_ids = [
        story_id
        for story_id, job in _storybook_media_warm_jobs.items()
        if job.completed.is_set() and now - job.updated_at >= STORYBOOK_MEDIA_WARM_JOB_TTL_SECONDS
    ]
    for story_id in expired_story_ids:
        _storybook_media_warm_jobs.pop(story_id, None)


def _serialize_storybook_media_error(error: Exception) -> tuple[str | None, str | None]:
    stage = _normalize_text(
        getattr(error, "stage", None)
        or getattr(error, "provider_stage", None)
        or getattr(error, "profile", None)
        or type(error).__name__
    ) or None
    parts = [_normalize_text(str(error))]
    http_status = getattr(error, "http_status", None)
    if http_status:
        parts.append(f"http={http_status}")
    profile = _normalize_text(getattr(error, "profile", None))
    if profile and profile != stage:
        parts.append(f"profile={profile}")
    engine_id = _normalize_text(getattr(error, "engine_id", None))
    voice_name = _normalize_text(getattr(error, "voice_name", None))
    if engine_id:
        parts.append(f"engine={engine_id}")
    if voice_name:
        parts.append(f"voice={voice_name}")
    diagnosis = _normalize_text(getattr(error, "diagnosis", None))
    if diagnosis:
        parts.append(f"diagnosis={diagnosis}")
    error_code = getattr(error, "error_code", None)
    if error_code not in (None, ""):
        parts.append(f"error_code={error_code}")
    error_msg = _normalize_text(getattr(error, "error_msg", None))
    if error_msg:
        parts.append(f"error_msg={error_msg}")
    reason = " | ".join(part for part in parts if part).strip() or None
    return stage, reason


def _resolve_media_live_enabled(*, settings: Any, provider: Any, media_kind: Literal["image", "audio"]) -> bool:
    if media_kind == "image":
        if can_use_vivo_story_image_provider(settings):
            return True
    else:
        if can_use_vivo_story_audio_provider(settings):
            return True

    provider_name = _normalize_text(getattr(provider, "provider_name", ""))
    mode_name = _normalize_text(getattr(provider, "mode_name", ""))
    return mode_name == "live" or provider_name.startswith("vivo-")


def _resolve_media_job_status(
    channel: _MediaWarmChannelState,
    *,
    live_enabled: bool,
) -> MediaWarmJobStatus:
    if not live_enabled:
        return "disabled"
    if channel.pending_scene_count > 0:
        return "warming"
    if channel.error_scene_count > 0 and channel.ready_scene_count > 0:
        return "partial"
    if channel.error_scene_count > 0:
        return "error"
    if channel.ready_scene_count > 0:
        return "ready"
    return "idle"


def _snapshot_media_channel(
    channel: _MediaWarmChannelState | None,
    *,
    live_enabled: bool,
    ready_scene_count: int,
    pending_scene_count: int,
    error_scene_count: int,
    last_error_stage: str | None = None,
    last_error_reason: str | None = None,
) -> dict[str, Any]:
    state = channel
    started_at = state.started_at if state else None
    updated_at = state.updated_at if state else None
    elapsed_ms = None
    if started_at is not None:
        elapsed_ms = max(0, int((((updated_at or monotonic()) - started_at)) * 1000))

    snapshot_state = _MediaWarmChannelState(
        total_scene_count=state.total_scene_count if state else 0,
        ready_scene_count=max(ready_scene_count, 0),
        pending_scene_count=max(pending_scene_count, 0),
        error_scene_count=max(error_scene_count, 0),
        last_error_stage=last_error_stage or (state.last_error_stage if state else None),
        last_error_reason=last_error_reason or (state.last_error_reason if state else None),
        started_at=started_at,
        updated_at=updated_at,
    )

    return {
        "jobStatus": _resolve_media_job_status(snapshot_state, live_enabled=live_enabled),
        "pendingSceneCount": snapshot_state.pending_scene_count,
        "readySceneCount": snapshot_state.ready_scene_count,
        "errorSceneCount": snapshot_state.error_scene_count,
        "lastErrorStage": snapshot_state.last_error_stage,
        "lastErrorReason": snapshot_state.last_error_reason,
        "elapsedMs": elapsed_ms,
    }


def _get_storybook_media_warm_job(story_id: str) -> _StoryBookMediaWarmJob | None:
    with _storybook_media_warm_lock:
        _prune_storybook_media_warm_jobs_locked(monotonic())
        return _storybook_media_warm_jobs.get(story_id)


def await_storybook_media_warming(story_id: str, timeout_seconds: float = 10.0) -> bool:
    job = _get_storybook_media_warm_job(story_id)
    if not job:
        return True
    return job.completed.wait(timeout=max(timeout_seconds, 0.0))


def _resolve_style_preset(payload: dict[str, Any]) -> str:
    requested = _normalize_text(_payload_get(payload, "stylePreset", "style_preset"))
    if requested in STYLE_PRESET_PROMPTS:
        return requested
    return DEFAULT_STYLE_PRESET


def _resolve_style_mode(payload: dict[str, Any]) -> StyleMode:
    requested = _normalize_text(_payload_get(payload, "styleMode", "style_mode"))
    return "custom" if requested == "custom" else DEFAULT_STYLE_MODE  # type: ignore[return-value]


def _resolve_style_palette(style_mode: StyleMode, style_preset: str, custom_prompt: str) -> dict[str, str]:
    if style_mode != "custom":
        return STYLE_PALETTES.get(style_preset, STYLE_PALETTES[DEFAULT_STYLE_PRESET]).copy()

    lowered = custom_prompt.lower()
    if any(token in lowered for token in ["night", "moon", "蓝", "夜", "星"]):
        return {
            "backgroundStart": "#dbeafe",
            "backgroundEnd": "#e0e7ff",
            "accent": "#2563eb",
            "text": "#1e3a8a",
            "chip": "#eff6ff",
        }
    if any(token in lowered for token in ["forest", "green", "森", "草", "自然"]):
        return {
            "backgroundStart": "#dcfce7",
            "backgroundEnd": "#fef3c7",
            "accent": "#059669",
            "text": "#166534",
            "chip": "#f0fdf4",
        }
    return {
        "backgroundStart": "#fff7ed",
        "backgroundEnd": "#fce7f3",
        "accent": "#ea580c",
        "text": "#7c2d12",
        "chip": "#fff7ed",
    }


def _resolve_style_recipe(payload: dict[str, Any]) -> dict[str, Any]:
    style_preset = _resolve_style_preset(payload)
    style_mode = _resolve_style_mode(payload)
    explicit_raw = _normalize_text(_payload_get(payload, "stylePrompt", "style_prompt"))
    explicit = _extract_style_prompt_body(explicit_raw)
    explicit_negative = _extract_style_prompt_negative(explicit_raw)
    custom_prompt = _extract_style_prompt_body(
        _normalize_text(_payload_get(payload, "customStylePrompt", "custom_style_prompt"))
    )
    custom_negative_raw = _normalize_text(
        _payload_get(payload, "customStyleNegativePrompt", "custom_style_negative_prompt")
    )
    custom_negative = _merge_prompt_clauses(
        _extract_style_prompt_negative(custom_negative_raw),
        custom_negative_raw,
    )
    resolved_negative = _build_story_image_negative_prompt(explicit_negative, custom_negative)

    if style_mode == "custom":
        resolved_prompt = (
            custom_prompt
            or explicit
            or "梦幻儿童绘本，柔焦，浅景深，温柔光影，移动端纵向大画幅"
        )
        prompt = f"儿童绘本风格方向：{resolved_prompt}。负面约束：{resolved_negative}。"
        return {
            "mode": style_mode,
            "preset": style_preset,
            "prompt": prompt,
            "custom_prompt": resolved_prompt,
            "custom_negative_prompt": resolved_negative,
            "negative_prompt": resolved_negative,
            "palette": _resolve_style_palette(style_mode, style_preset, resolved_prompt),
        }

    resolved_prompt = explicit or STYLE_PRESET_PROMPTS.get(style_preset, STYLE_PRESET_PROMPTS[DEFAULT_STYLE_PRESET])
    prompt = f"儿童绘本风格方向：{resolved_prompt}。负面约束：{resolved_negative}。"
    return {
        "mode": style_mode,
        "preset": style_preset,
        "prompt": prompt,
        "custom_prompt": "",
        "custom_negative_prompt": "",
        "negative_prompt": resolved_negative,
        "palette": _resolve_style_palette(style_mode, style_preset, ""),
    }


def _resolve_demo_art_style_family(style_recipe: dict[str, Any]) -> str:
    preset = _normalize_text(style_recipe.get("preset")) or DEFAULT_STYLE_PRESET
    if _normalize_text(style_recipe.get("mode")) != "custom":
        return preset

    custom_prompt = _normalize_text(style_recipe.get("custom_prompt")).lower()
    if any(token in custom_prompt for token in ("night", "moon", "星", "夜", "晚")):
        return "moonlit-cutout"
    if any(token in custom_prompt for token in ("forest", "green", "森", "树", "自然")):
        return "forest-crayon"
    return "sunrise-watercolor"


def _resolve_generation_mode(payload: dict[str, Any]) -> GenerationMode:
    requested = _normalize_text(_payload_get(payload, "generationMode", "generation_mode"))
    if requested in {"child-personalized", "manual-theme", "hybrid"}:
        return requested  # type: ignore[return-value]

    manual_theme = _normalize_text(_payload_get(payload, "manualTheme", "manual_theme"))
    snapshot = _payload_get(payload, "snapshot")
    child = snapshot.get("child") if isinstance(snapshot, dict) else {}
    has_child = isinstance(child, dict) and bool(_normalize_text(child.get("id")))
    if manual_theme and has_child:
        return "hybrid"
    if manual_theme:
        return "manual-theme"
    return "child-personalized"


def _resolve_page_count(payload: dict[str, Any]) -> int:
    value = _payload_get(payload, "pageCount", "page_count")
    if value in {4, 6, 8}:
        return int(value)
    return DEFAULT_PAGE_COUNT


def _build_fallback_highlights(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    fallback_items = snapshot.get("ruleFallback")
    if not isinstance(fallback_items, list):
        return []

    results: list[dict[str, Any]] = []
    for index, item in enumerate(fallback_items, start=1):
        if not isinstance(item, dict):
            continue
        detail = _normalize_text(item.get("description") or item.get("title"))
        if not detail:
            continue
        results.append(
            {
                "kind": "weeklyTrend",
                "title": _normalize_text(item.get("title")) or f"亮点 {index}",
                "detail": detail,
                "priority": index,
                "source": "ruleFallback",
            }
        )
        if len(results) >= 4:
            break
    return results


def _normalize_payload_highlights(payload: dict[str, Any]) -> list[dict[str, Any]]:
    raw_items = _payload_get(payload, "highlightCandidates", "highlight_candidates")
    results: list[dict[str, Any]] = []

    if isinstance(raw_items, list):
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            detail = _normalize_text(item.get("detail") or item.get("title"))
            if not detail:
                continue
            try:
                priority = int(item.get("priority") or 99)
            except (TypeError, ValueError):
                priority = 99
            results.append(
                {
                    "kind": _normalize_text(item.get("kind")) or "todayGrowth",
                    "title": _normalize_text(item.get("title")) or "今日亮点",
                    "detail": detail,
                    "priority": priority,
                    "source": _normalize_text(item.get("source"))
                    or _normalize_text(item.get("kind"))
                    or "highlight",
                }
            )

    if results:
        return sorted(results, key=lambda item: item["priority"])

    snapshot = _payload_get(payload, "snapshot")
    if isinstance(snapshot, dict):
        return _build_fallback_highlights(snapshot)
    return []


def _build_theme_highlights(payload: dict[str, Any]) -> list[dict[str, Any]]:
    manual_theme = _normalize_text(_payload_get(payload, "manualTheme", "manual_theme"))
    manual_prompt = _normalize_text(_payload_get(payload, "manualPrompt", "manual_prompt"))
    goal_keywords = _normalize_keywords(_payload_get(payload, "goalKeywords", "goal_keywords"))

    results: list[dict[str, Any]] = []
    if manual_theme:
        results.append(
            {
                "kind": "manualTheme",
                "title": f"主题：{manual_theme}",
                "detail": manual_prompt
                or f"把“{manual_theme}”讲成孩子能听懂、家长愿意读、今晚就能用上的成长故事。",
                "priority": 1,
                "source": "manualTheme",
            }
        )

    for index, keyword in enumerate(goal_keywords, start=2):
        results.append(
            {
                "kind": "goalKeyword",
                "title": f"关键词：{keyword}",
                "detail": f"故事会把“{keyword}”落到一个能被孩子感受到的小动作里。",
                "priority": index,
                "source": "goalKeyword",
            }
        )

    if not results and manual_prompt:
        results.append(
            {
                "kind": "manualTheme",
                "title": "主题设定",
                "detail": manual_prompt,
                "priority": 1,
                "source": "manualTheme",
            }
        )

    return results


def _dedupe_highlights(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for item in items:
        key = "::".join(
            [
                _normalize_text(item.get("kind")),
                _normalize_text(item.get("title")),
                _normalize_text(item.get("detail")),
            ]
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def _build_highlights(payload: dict[str, Any], generation_mode: GenerationMode) -> list[dict[str, Any]]:
    base_highlights = _normalize_payload_highlights(payload)
    theme_highlights = _build_theme_highlights(payload)
    if generation_mode == "manual-theme":
        return _dedupe_highlights(theme_highlights or base_highlights)
    if generation_mode == "hybrid":
        return _dedupe_highlights([*theme_highlights, *base_highlights])
    return _dedupe_highlights(base_highlights or theme_highlights)


def _resolve_story_mode(
    *,
    payload: dict[str, Any],
    generation_mode: GenerationMode,
    highlights: list[dict[str, Any]],
    snapshot: dict[str, Any],
) -> StoryMode:
    requested_mode = _coerce_text(_payload_get(payload, "storyMode", "story_mode"))
    if requested_mode == "card":
        return "card"
    if generation_mode in {"manual-theme", "hybrid"}:
        return "storybook"
    summary = snapshot.get("summary") if isinstance(snapshot, dict) else {}
    growth = summary.get("growth") if isinstance(summary, dict) else {}
    feedback = summary.get("feedback") if isinstance(summary, dict) else {}
    if not highlights:
        return "card"
    if int(growth.get("recordCount") or 0) == 0 and int(feedback.get("count") or 0) == 0:
        return "card"
    return "storybook"


def _resolve_focus_theme(
    *,
    payload: dict[str, Any],
    snapshot: dict[str, Any],
    highlights: list[dict[str, Any]],
) -> str:
    summary = snapshot.get("summary") if isinstance(snapshot, dict) else {}
    growth = summary.get("growth") if isinstance(summary, dict) else {}
    feedback = summary.get("feedback") if isinstance(summary, dict) else {}
    top_categories = growth.get("topCategories") if isinstance(growth, dict) else []
    feedback_keywords = feedback.get("keywords") if isinstance(feedback, dict) else []
    first_category = top_categories[0].get("category") if isinstance(top_categories, list) and top_categories and isinstance(top_categories[0], dict) else ""
    first_keyword = feedback_keywords[0] if isinstance(feedback_keywords, list) and feedback_keywords else ""
    return (
        _normalize_text(_payload_get(payload, "manualTheme", "manual_theme"))
        or (_normalize_keywords(_payload_get(payload, "goalKeywords", "goal_keywords")) or [""])[0]
        or _normalize_text(first_category)
        or _normalize_text(first_keyword)
        or _normalize_text(highlights[0].get("title") if highlights else "")
        or STORYBOOK_FOCUS_FALLBACK
    )


def _shorten_detail(value: str, fallback: str) -> str:
    normalized = _normalize_text(value) or fallback
    if len(normalized) <= 38:
        return normalized
    return f"{normalized[:38]}…"


def _resolve_protagonist(payload: dict[str, Any], *, focus_theme: str, child_name: str, child_hints: list[str]) -> dict[str, str]:
    requested = _normalize_text(_payload_get(payload, "protagonistArchetype", "protagonist_archetype"))
    for protagonist in PROTAGONISTS:
        if protagonist["archetype"] == requested:
            return protagonist

    seed = "::".join([requested, focus_theme, child_name, "|".join(child_hints)])
    index = int(_stable_hash(seed, length=4), 16) % len(PROTAGONISTS)
    return PROTAGONISTS[index]


def _build_parent_note(*, child_name: str, story_mode: StoryMode, tonight_action: str, tomorrow_observation: str, generation_mode: GenerationMode) -> str:
    if story_mode == "card":
        return f"{child_name} 今晚先用一张轻量成长卡收束情绪，再把最亮的一点小进步说给孩子听。"
    if generation_mode == "manual-theme":
        return f"今晚可以先试一件小事：{tonight_action}。明天继续观察：{tomorrow_observation}。"
    return f"{child_name} 今晚可以先试一件小事：{tonight_action}。明天继续观察：{tomorrow_observation}。"


def _build_moral(*, protagonist_name: str, focus_theme: str, summary_highlight: str) -> str:
    return (
        f"{protagonist_name} 记住的，不是“要快一点”，而是“原来我可以慢慢学会 {focus_theme}”。"
        f"那些被看见的 {summary_highlight}，会一点点变成真正的力量。"
    )


def _build_story_ingredients(payload: dict[str, Any], snapshot: dict[str, Any], child: dict[str, Any], highlights: list[dict[str, Any]]) -> dict[str, Any]:
    generation_mode = _resolve_generation_mode(payload)
    focus_theme = _resolve_focus_theme(payload=payload, snapshot=snapshot, highlights=highlights)
    child_name = _normalize_text(child.get("name")) or "小朋友"
    class_name = _normalize_text(child.get("className")) or None
    consultation = _payload_get(payload, "latestConsultation", "latest_consultation")
    consultation_summary = _normalize_text(consultation.get("summary")) if isinstance(consultation, dict) else ""
    consultation_home_action = _normalize_text(consultation.get("homeAction")) if isinstance(consultation, dict) else ""
    consultation_followup = ""
    if isinstance(consultation, dict):
        followup_items = consultation.get("followUp48h")
        if isinstance(followup_items, list) and followup_items:
            consultation_followup = _normalize_text(followup_items[0])

    intervention = _payload_get(payload, "latestInterventionCard", "latest_intervention_card")
    intervention_action = _normalize_text(intervention.get("tonightHomeAction")) if isinstance(intervention, dict) else ""
    intervention_observation = _normalize_text(intervention.get("tomorrowObservationPoint")) if isinstance(intervention, dict) else ""
    intervention_review = _normalize_text(intervention.get("reviewIn48h")) if isinstance(intervention, dict) else ""

    summary_highlight = _shorten_detail(
        _normalize_text(highlights[0].get("detail") if highlights else ""),
        "被轻轻看见的小进步",
    )
    support_detail = _shorten_detail(
        next(
            (
                _normalize_text(item.get("detail"))
                for item in highlights
                if item.get("kind") in {"consultationAction", "guardianFeedback"}
                and _normalize_text(item.get("detail"))
            ),
            consultation_summary or "大人把节奏放慢一点，先接住情绪，再陪它继续往前。",
        ),
        "大人把节奏放慢一点，先接住情绪，再陪它继续往前。",
    )
    attempt_detail = _shorten_detail(
        next(
            (
                _normalize_text(item.get("detail"))
                for item in highlights
                if item.get("kind") in {"warningSuggestion", "consultationSummary"}
                and _normalize_text(item.get("detail"))
            ),
            _normalize_text(highlights[1].get("detail")) if len(highlights) > 1 else "",
        ),
        "先试一个小动作，再把脚步放稳。",
    )
    success_detail = _shorten_detail(
        next(
            (
                _normalize_text(item.get("detail"))
                for item in highlights
                if item.get("kind") in {"todayGrowth", "guardianFeedback"}
                and _normalize_text(item.get("detail"))
            ),
            _normalize_text(highlights[2].get("detail")) if len(highlights) > 2 else "",
        ),
        "原来一点点靠近，也是在认真长大。",
    )
    challenge_detail = _shorten_detail(
        next(
            (
                _normalize_text(item.get("detail"))
                for item in highlights
                if item.get("kind") == "warningSuggestion" and _normalize_text(item.get("detail"))
            ),
            _normalize_text(highlights[0].get("detail")) if highlights else "",
        )
        or _normalize_text(_payload_get(payload, "manualPrompt", "manual_prompt")),
        "面对新的小关卡时，心里还是会轻轻打鼓。",
    )
    wobble_detail = _shorten_detail(
        next(
            (
                _normalize_text(item.get("detail"))
                for item in highlights
                if item.get("kind") == "weeklyTrend" and _normalize_text(item.get("detail"))
            ),
            consultation_summary or _normalize_text(_payload_get(payload, "manualPrompt", "manual_prompt")),
        ),
        "有一点摇晃很正常，停一停，再出发就好。",
    )
    tonight_action = (
        intervention_action
        or consultation_home_action
        or next(
            (
                _normalize_text(item.get("detail"))
                for item in highlights
                if item.get("kind") == "consultationAction" and _normalize_text(item.get("detail"))
            ),
            "",
        )
        or f"和孩子一起做一个关于“{focus_theme}”的小练习"
    )
    tomorrow_observation = (
        intervention_observation
        or intervention_review
        or consultation_followup
        or next(
            (
                _normalize_text(item.get("detail"))
                for item in highlights
                if item.get("kind") == "weeklyTrend" and _normalize_text(item.get("detail"))
            ),
            "",
        )
        or f"明天再看看孩子遇到“{focus_theme}”时会不会更从容一点"
    )
    child_hints = [
        _normalize_text(child.get("specialNotes")),
        _normalize_text(highlights[0].get("title") if highlights else ""),
    ]
    protagonist = _resolve_protagonist(
        payload,
        focus_theme=focus_theme,
        child_name=child_name,
        child_hints=[item for item in child_hints if item],
    )
    story_mode = _resolve_story_mode(
        payload=payload,
        generation_mode=generation_mode,
        highlights=highlights,
        snapshot=snapshot,
    )
    parent_note = _build_parent_note(
        child_name=child_name,
        story_mode=story_mode,
        tonight_action=tonight_action,
        tomorrow_observation=tomorrow_observation,
        generation_mode=generation_mode,
    )
    style_recipe = _resolve_style_recipe(payload)
    return {
        "child_name": child_name,
        "class_name": class_name,
        "focus_theme": focus_theme,
        "goal_keywords": _normalize_keywords(_payload_get(payload, "goalKeywords", "goal_keywords")),
        "protagonist": protagonist,
        "protagonist_name": protagonist["label"],
        "protagonist_archetype": protagonist["archetype"],
        "generation_mode": generation_mode,
        "page_count": _resolve_page_count(payload),
        "highlights": highlights,
        "summary_highlight": summary_highlight,
        "challenge_detail": challenge_detail,
        "support_detail": support_detail,
        "attempt_detail": attempt_detail,
        "success_detail": success_detail,
        "wobble_detail": wobble_detail,
        "tonight_action": tonight_action,
        "tomorrow_observation": tomorrow_observation,
        "prompt_hint": _normalize_text(_payload_get(payload, "manualPrompt", "manual_prompt")),
        "parent_note": parent_note,
        "style_prompt": style_recipe["prompt"],
        "style_recipe": style_recipe,
        "story_mode": story_mode,
    }


def _build_scene_title(stage: str) -> str:
    return {
        "opening": "月光翻开第一页",
        "setup": "小脚步在路上",
        "challenge": "遇到一点点难",
        "support": "有人轻轻托住它",
        "attempt": "它决定再试一下",
        "wobble": "风吹来时先停一停",
        "small-success": "小小光亮出现了",
        "landing": "把温柔带回今晚",
    }[stage]


def _build_scene_text(stage: str, ingredients: dict[str, Any]) -> str:
    protagonist_name = ingredients["protagonist"]["label"]
    focus_theme = ingredients["focus_theme"]
    if stage == "opening":
        return f"{protagonist_name} 今天想练习“{focus_theme}”。白天里，它已经悄悄做到了一点点：{ingredients['summary_highlight']}。"
    if stage == "setup":
        return f"它没有一下子就变得很厉害，而是先听一听、停一停，再把脚步放轻。{protagonist_name} 知道，慢慢来也是一种本事。"
    if stage == "challenge":
        return f"可当新的小关卡出现时，{protagonist_name} 还是会有点犹豫。{ingredients['challenge_detail']}"
    if stage == "support":
        return f"这时，老师和家长没有催它，只把声音放轻、把节奏放慢。{ingredients['support_detail']}"
    if stage == "attempt":
        return f"{protagonist_name} 先做了一个最小的动作，再试一次。{ingredients['attempt_detail']}"
    if stage == "wobble":
        return f"中间也会有一点摇晃，但那不是退步。{ingredients['wobble_detail']}"
    if stage == "small-success":
        return f"慢慢地，{protagonist_name} 发现自己真的做到了。{ingredients['success_detail']}"
    if ingredients["generation_mode"] == "manual-theme":
        return f"今晚，只要先做一件小事：{ingredients['tonight_action']}。明天，再一起看看{ingredients['tomorrow_observation']}。"
    return f"把这份小小的力量带回今晚吧：{ingredients['tonight_action']}。明天，再一起看看{ingredients['tomorrow_observation']}。"


def _build_scene_voice_style(stage: str) -> str:
    if stage == "landing":
        return "gentle-bedtime"
    if stage in {"challenge", "wobble"}:
        return "warm-storytelling"
    return "calm-encouraging"


def _build_scene_image_prompt(stage: str, scene_title: str, scene_text: str, ingredients: dict[str, Any]) -> str:
    keyword_text = (
        f"，关键词：{'、'.join(ingredients['goal_keywords'])}"
        if ingredients["goal_keywords"]
        else ""
    )
    prompt_hint = f"，补充要求：{ingredients['prompt_hint']}" if ingredients["prompt_hint"] else ""
    return "，".join(
        [
            ingredients["style_prompt"],
            f"儿童绘本插画，移动端纵向大画幅，拟人小动物主角“{ingredients['protagonist']['label']}”",
            f"原型 {ingredients['protagonist']['archetype']}，主题“{ingredients['focus_theme']}”{keyword_text}",
            f"分镜阶段：{stage}，标题“{scene_title}”",
            f"画面内容：{scene_text}",
            f"不要直接画真实孩子本人，不要照片感，不要复杂背景，不要说教标语{prompt_hint}",
        ]
    )


def _build_scene_audio_script(scene_title: str, scene_text: str) -> str:
    return f"{scene_title}。{scene_text}"


def _build_card_scene(ingredients: dict[str, Any]) -> dict[str, Any]:
    scene_title = "把今天轻轻收好"
    scene_text = (
        f"{ingredients['protagonist']['label']} 把今天那一点点亮光抱进怀里。"
        f"今晚只做一件小事：{ingredients['tonight_action']}。"
    )
    return {
        "sceneIndex": 1,
        "sceneTitle": scene_title,
        "sceneText": scene_text,
        "imagePrompt": _build_scene_image_prompt("landing", scene_title, scene_text, ingredients),
        "imageUrl": "/storybook/card.svg",
        "assetRef": "/storybook/card.svg",
        "imageStatus": "fallback",
        "audioUrl": None,
        "audioRef": "storybook-audio-card",
        "audioScript": _build_scene_audio_script(scene_title, scene_text),
        "audioStatus": "fallback",
        "voiceStyle": "gentle-bedtime",
        "highlightSource": "rule",
        "imageCacheHit": False,
        "audioCacheHit": False,
    }


def _build_story_scenes(ingredients: dict[str, Any]) -> list[dict[str, Any]]:
    if ingredients["story_mode"] == "card":
        return [_build_card_scene(ingredients)]

    scenes: list[dict[str, Any]] = []
    for index, stage in enumerate(PAGE_STRUCTURES[ingredients["page_count"]]):
        highlight = ingredients["highlights"][index] if index < len(ingredients["highlights"]) else None
        scene_title = _build_scene_title(stage)
        scene_text = _build_scene_text(stage, ingredients)
        scenes.append(
            {
                "sceneIndex": index + 1,
                "sceneTitle": scene_title,
                "sceneText": scene_text,
                "imagePrompt": _build_scene_image_prompt(stage, scene_title, scene_text, ingredients),
                "imageUrl": f"/storybook/scene-{min(index + 1, 3)}.svg",
                "assetRef": f"/storybook/scene-{min(index + 1, 3)}.svg",
                "imageStatus": "fallback",
                "audioUrl": None,
                "audioRef": f"storybook-audio-{index + 1}",
                "audioScript": _build_scene_audio_script(scene_title, scene_text),
                "audioStatus": "fallback",
                "voiceStyle": _build_scene_voice_style(stage),
                "highlightSource": _normalize_text(highlight.get("source")) if isinstance(highlight, dict) else "rule",
                "imageCacheHit": False,
                "audioCacheHit": False,
            }
        )
    return scenes


def _build_scene_title_v2(stage: str) -> str:
    return {
        "opening": "月光翻开第一页",
        "setup": "小脚步在路上",
        "challenge": "遇到一点点难",
        "support": "有人轻轻托住它",
        "attempt": "它决定再试一下",
        "wobble": "风吹来时先停一停",
        "small-success": "小小光亮出现了",
        "landing": "把温柔带回今晚",
    }[stage]


def _build_stage_goal_v2(stage: str) -> str:
    return {
        "opening": "建立温柔开场，让孩子先感到被看见",
        "setup": "把节奏放慢，让故事进入可尝试的状态",
        "challenge": "呈现眼前的小挑战，但不责备",
        "support": "让支持先出现，稳定情绪",
        "attempt": "把行动拆成最小的一步",
        "wobble": "承认波动正常，让孩子可以停一停",
        "small-success": "让孩子看见已经发生的小成功",
        "landing": "落到今晚行动和明天观察，形成成长闭环",
    }[stage]


def _build_scene_environment_v2(stage: str, ingredients: dict[str, Any]) -> str:
    class_name = _normalize_text(ingredients.get("class_name"))
    class_hint = f"{class_name}旁的故事角" if class_name else "柔软安静的故事角"
    return {
        "opening": f"{class_hint}和暖暖窗边",
        "setup": "铺着浅色地毯的小路口",
        "challenge": "要迈出一步的小门前",
        "support": "有抱抱和轻声提醒的陪伴角",
        "attempt": "留着一束小光的练习地毯",
        "wobble": "可以先停下来深呼吸的安静角落",
        "small-success": "冒出一点点光亮的林间小路",
        "landing": "睡前灯光柔柔的小房间",
    }[stage]


def _build_scene_emotion_v2(stage: str) -> str:
    return {
        "opening": "安心又期待",
        "setup": "慢慢稳下来",
        "challenge": "有点犹豫，但还想试试",
        "support": "被接住、被陪伴",
        "attempt": "鼓起一点点勇气",
        "wobble": "轻轻摇晃，但没有放弃",
        "small-success": "惊喜、亮起来",
        "landing": "安定、适合睡前",
    }[stage]


def _build_scene_visible_action_v2(stage: str, ingredients: dict[str, Any]) -> str:
    protagonist_label = ingredients["protagonist"]["label"]
    return {
        "opening": f"{protagonist_label}抱着今天的小亮点，轻轻看向前方",
        "setup": f"{protagonist_label}先停一停，再把脚步放轻",
        "challenge": f"{protagonist_label}站在小挑战前，耳朵和尾巴都慢下来",
        "support": f"一只温柔的大手递来陪伴，{protagonist_label}慢慢靠近",
        "attempt": f"{protagonist_label}先做一个最小的动作",
        "wobble": f"{protagonist_label}先抱抱自己，再重新出发",
        "small-success": f"{protagonist_label}抬起头，发现自己已经往前走了一小步",
        "landing": f"{protagonist_label}把今晚的小动作收进睡前仪式",
    }[stage]


def _select_highlight_v2(ingredients: dict[str, Any], index: int, stage: str) -> dict[str, Any]:
    highlights = ingredients["highlights"]
    fallback_detail = ingredients["tonight_action"] if stage == "landing" else ingredients["summary_highlight"]
    if index < len(highlights):
        return highlights[index]
    if highlights:
        return highlights[-1]
    return {
        "kind": "weeklyTrend",
        "title": _build_scene_title_v2(stage),
        "detail": fallback_detail,
        "priority": 99,
        "source": "rule",
    }


def _build_scene_narrative_anchor_v2(stage: str, ingredients: dict[str, Any], highlight: dict[str, Any]) -> str:
    bound_detail = _normalize_text(highlight.get("detail")) or (
        ingredients["tonight_action"] if stage == "landing" else ingredients["summary_highlight"]
    )
    theme_anchor = (
        f"主题“{ingredients['focus_theme']}”，今晚行动“{ingredients['tonight_action']}”，明天观察“{ingredients['tomorrow_observation']}”"
        if stage == "landing"
        else f"主题“{ingredients['focus_theme']}”，本页绑定“{bound_detail}”"
    )
    if ingredients["generation_mode"] == "hybrid" and stage != "landing":
        return f"{theme_anchor}，孩子线索“{bound_detail}”"
    return theme_anchor


def _truncate_scene_cue_v2(value: str, fallback: str, *, limit: int = 28) -> str:
    text = _normalize_text(value) or fallback
    if len(text) <= limit:
        return text
    return f"{text[: max(limit - 3, 1)].rstrip()}..."


def _build_visual_anchor_v2(stage: str, ingredients: dict[str, Any], highlight: dict[str, Any]) -> str:
    scene_title = _build_scene_title_v2(stage)
    scene_goal = _build_stage_goal_v2(stage)
    highlight_title = _truncate_scene_cue_v2(_normalize_text(highlight.get("title")), scene_title, limit=18)
    highlight_detail = _truncate_scene_cue_v2(
        _normalize_text(highlight.get("detail")),
        ingredients["tonight_action"] if stage == "landing" else ingredients["summary_highlight"],
        limit=20,
    )
    generation_mode_label = (
        "成长线索驱动"
        if ingredients["generation_mode"] == "child-personalized"
        else "混合线索驱动"
        if ingredients["generation_mode"] == "hybrid"
        else "主题线索驱动"
    )
    return f"{scene_title} / {scene_goal} / {ingredients['focus_theme']} / {highlight_title} / {highlight_detail} / {generation_mode_label}"


def _build_scene_object_cue_v2(stage: str, ingredients: dict[str, Any], highlight: dict[str, Any]) -> str:
    scene_object_map = {
        "opening": _normalize_text(highlight.get("title")) or ingredients["focus_theme"],
        "setup": _normalize_text(highlight.get("detail")) or ingredients["summary_highlight"],
        "challenge": ingredients["challenge_detail"],
        "support": ingredients["support_detail"],
        "attempt": ingredients["attempt_detail"],
        "wobble": ingredients["wobble_detail"],
        "small-success": ingredients["success_detail"],
        "landing": ingredients["tonight_action"],
    }
    return _truncate_scene_cue_v2(scene_object_map.get(stage, ingredients["focus_theme"]), ingredients["focus_theme"])


def _build_support_character_cue_v2(stage: str, ingredients: dict[str, Any], highlight: dict[str, Any]) -> str:
    highlight_title = _normalize_text(highlight.get("title")) or ingredients["focus_theme"]
    if stage in {"support", "landing"}:
        return _truncate_scene_cue_v2(f"轻声陪伴的大人围绕“{highlight_title}”给出回应", "轻声陪伴的大人")
    if ingredients["generation_mode"] == "hybrid":
        return _truncate_scene_cue_v2(f"把最近线索“{highlight_title}”接进这一页", "最近被看见的成长线索")
    return _truncate_scene_cue_v2(f"让场景里的小伙伴回应“{highlight_title}”", "回应主题的小伙伴")


def _build_activity_cue_v2(stage: str, ingredients: dict[str, Any], highlight: dict[str, Any]) -> str:
    action_tail = (
        ingredients["tonight_action"]
        if stage in {"attempt", "small-success", "landing"}
        else _normalize_text(highlight.get("detail")) or ingredients["summary_highlight"]
    )
    return _truncate_scene_cue_v2(
        f"{_build_scene_visible_action_v2(stage, ingredients)}；{action_tail}",
        _build_scene_visible_action_v2(stage, ingredients),
        limit=34,
    )


def _build_emotion_cue_v2(stage: str, ingredients: dict[str, Any]) -> str:
    return _truncate_scene_cue_v2(
        f"{_build_scene_emotion_v2(stage)}；{_build_stage_goal_v2(stage)}",
        _build_scene_emotion_v2(stage),
        limit=30,
    )


def _build_task_cue_v2(stage: str, ingredients: dict[str, Any]) -> str:
    if stage == "landing":
        return _truncate_scene_cue_v2(
            f"今晚先做：{ingredients['tonight_action']}；明天观察：{ingredients['tomorrow_observation']}",
            ingredients["tonight_action"],
            limit=34,
        )
    if stage in {"attempt", "small-success"}:
        return _truncate_scene_cue_v2(
            f"这一页先练：{ingredients['tonight_action']}",
            ingredients["tonight_action"],
            limit=28,
        )
    return _truncate_scene_cue_v2(
        f"把“{ingredients['focus_theme']}”往明天延续：{ingredients['tomorrow_observation']}",
        ingredients["tomorrow_observation"],
        limit=34,
    )


def _build_scene_blueprint_v2(stage: str, index: int, ingredients: dict[str, Any]) -> dict[str, Any]:
    highlight = _select_highlight_v2(ingredients, index, stage)
    visual_anchor = _build_visual_anchor_v2(stage, ingredients, highlight)
    scene_object_cue = _build_scene_object_cue_v2(stage, ingredients, highlight)
    support_character_cue = _build_support_character_cue_v2(stage, ingredients, highlight)
    activity_cue = _build_activity_cue_v2(stage, ingredients, highlight)
    emotion_cue = _build_emotion_cue_v2(stage, ingredients)
    task_cue = _build_task_cue_v2(stage, ingredients)
    negative_prompt = _build_story_image_negative_prompt(ingredients["style_recipe"].get("negative_prompt"))
    return {
        "pageIndex": index + 1,
        "stage": stage,
        "sceneTitle": _build_scene_title_v2(stage),
        "sceneGoal": _build_stage_goal_v2(stage),
        "protagonist": ingredients["protagonist"],
        "environment": _build_scene_environment_v2(stage, ingredients),
        "visibleAction": _build_scene_visible_action_v2(stage, ingredients),
        "emotion": _build_scene_emotion_v2(stage),
        "mustInclude": [
            visual_anchor,
            scene_object_cue,
            support_character_cue,
            activity_cue,
        ],
        "avoid": [
            "真实孩子正脸",
            "照片感",
            "复杂背景",
            "成人化",
            *_split_prompt_clauses(negative_prompt),
        ],
        "narrativeAnchor": _build_scene_narrative_anchor_v2(stage, ingredients, highlight),
        "highlightSource": _normalize_text(highlight.get("source")) or _normalize_text(highlight.get("kind")) or "rule",
        "voiceStyle": _build_scene_voice_style(stage),
        "visualAnchor": visual_anchor,
        "sceneObjectCue": scene_object_cue,
        "supportCharacterCue": support_character_cue,
        "activityCue": activity_cue,
        "emotionCue": emotion_cue,
        "taskCue": task_cue,
    }


def _build_scene_text_v2(blueprint: dict[str, Any], ingredients: dict[str, Any]) -> str:
    protagonist_name = blueprint["protagonist"]["label"]
    if blueprint["stage"] == "opening":
        return f"{protagonist_name}来到{blueprint['environment']}。今天，它想练习“{ingredients['focus_theme']}”。{ingredients['summary_highlight']}。"
    if blueprint["stage"] == "setup":
        return f"{protagonist_name}没有急着往前跑，而是先看一看、停一停。慢一点，也是在认真长大。"
    if blueprint["stage"] == "challenge":
        return f"当新的小难题出现时，{protagonist_name}有一点紧张。{ingredients['challenge_detail']}。"
    if blueprint["stage"] == "support":
        return f"这时，大人没有催它，只是轻轻陪着它。{ingredients['support_detail']}。"
    if blueprint["stage"] == "attempt":
        return f"{protagonist_name}决定先做一个最小的动作。{ingredients['attempt_detail']}。"
    if blueprint["stage"] == "wobble":
        return f"中间有一点摇晃也没关系。{ingredients['wobble_detail']}。"
    if blueprint["stage"] == "small-success":
        return f"{protagonist_name}慢慢发现，自己真的做到了。{ingredients['success_detail']}。"
    return f"今晚先做一件小事：{ingredients['tonight_action']}。明天继续看看{ingredients['tomorrow_observation']}。"


def _build_scene_audio_script_v2(blueprint: dict[str, Any], scene_text: str) -> str:
    if blueprint["stage"] == "landing":
        return f"{blueprint['sceneTitle']}。{scene_text}"
    return f"{blueprint['sceneTitle']}。{scene_text}。这一页想记住的是：{blueprint['narrativeAnchor']}。"


def _build_scene_image_prompt_v2(blueprint: dict[str, Any], ingredients: dict[str, Any]) -> str:
    negative_prompt = _build_story_image_negative_prompt(
        blueprint["avoid"],
        ingredients["style_recipe"].get("negative_prompt"),
    )
    return "；".join(
        [
            ingredients["style_recipe"]["prompt"],
            "儿童成长绘本场景插画，纯画面叙事，只表现角色、场景、动作与情绪",
            f"成长主题氛围：{ingredients['focus_theme']}",
            f"主角设定：拟人{blueprint['protagonist']['archetype']}小动物，视觉特征{blueprint['protagonist']['visual_cue']}",
            f"场景地点：{blueprint['environment']}",
            f"动作：{blueprint['visibleAction']}",
            f"情绪与表情：{blueprint['emotion']}",
            f"画面焦点：{blueprint['visualAnchor']}",
            f"关键道具：{blueprint['sceneObjectCue']}",
            f"陪伴关系：{blueprint['supportCharacterCue']}",
            f"活动线索：{blueprint['activityCue']}",
            f"情绪线索：{blueprint['emotionCue']}",
            f"收尾动作：{blueprint['taskCue']}",
            "构图：主角明确，前景简洁，背景克制，突出人物关系与动作瞬间",
            f"严格禁止任何文字元素：{negative_prompt}",
        ]
    )


def _escape_svg_text_v2(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def _build_demo_art_blueprint_v2(stage: str) -> dict[str, str]:
    mapping = {
        "opening": {
            "environmentFamily": "meadow",
            "cameraLayout": "wide",
            "pose": "wave",
            "expression": "curious",
            "prop": "spark",
            "accentEffect": "glow",
        },
        "setup": {
            "environmentFamily": "path",
            "cameraLayout": "wide",
            "pose": "observe",
            "expression": "calm",
            "prop": "path",
            "accentEffect": "breeze",
        },
        "challenge": {
            "environmentFamily": "doorway",
            "cameraLayout": "focused",
            "pose": "hesitate",
            "expression": "shy",
            "prop": "door",
            "accentEffect": "ripple",
        },
        "support": {
            "environmentFamily": "reading-nook",
            "cameraLayout": "focused",
            "pose": "lean-in",
            "expression": "supported",
            "prop": "lantern",
            "accentEffect": "glow",
        },
        "attempt": {
            "environmentFamily": "path",
            "cameraLayout": "focused",
            "pose": "step-forward",
            "expression": "brave",
            "prop": "star",
            "accentEffect": "breeze",
        },
        "wobble": {
            "environmentFamily": "path",
            "cameraLayout": "focused",
            "pose": "breathe",
            "expression": "wobbly",
            "prop": "heart",
            "accentEffect": "ripple",
        },
        "small-success": {
            "environmentFamily": "meadow",
            "cameraLayout": "close",
            "pose": "celebrate",
            "expression": "bright",
            "prop": "spark",
            "accentEffect": "confetti",
        },
        "landing": {
            "environmentFamily": "sleepy-room",
            "cameraLayout": "close",
            "pose": "curl-up",
            "expression": "sleepy",
            "prop": "moon",
            "accentEffect": "glow",
        },
    }
    return mapping.get(stage, mapping["opening"]).copy()


def _render_demo_backdrop_v2(blueprint: dict[str, Any], ingredients: dict[str, Any], demo: dict[str, str]) -> str:
    palette = ingredients["style_recipe"]["palette"]
    style_family = _resolve_demo_art_style_family(ingredients["style_recipe"])
    sun_color = "#fff7d6" if demo["environmentFamily"] == "sleepy-room" else "#f8fafc" if style_family == "moonlit-cutout" else "#fff3bf"

    if demo["accentEffect"] == "confetti":
        stage_glow = f"""
  <circle cx="690" cy="200" r="126" fill="{palette['accent']}" opacity="0.20" />
  <circle cx="250" cy="220" r="82" fill="{palette['chip']}" opacity="0.34" />
"""
    elif demo["accentEffect"] == "ripple":
        stage_glow = f"""
  <ellipse cx="690" cy="220" rx="140" ry="86" fill="{palette['chip']}" opacity="0.40" />
  <ellipse cx="690" cy="220" rx="188" ry="122" fill="{palette['chip']}" opacity="0.18" />
"""
    else:
        stage_glow = f"""
  <circle cx="690" cy="190" r="110" fill="{sun_color}" opacity="0.88" />
  <circle cx="212" cy="182" r="56" fill="#ffffff" opacity="0.26" />
"""

    environment_family = demo["environmentFamily"]
    if environment_family == "doorway":
        environment_art = f"""
  <path d="M184 950C250 846 340 756 450 680C558 608 648 560 728 542" stroke="#fff7ef" stroke-width="92" stroke-linecap="round" opacity="0.85" />
  <rect x="618" y="330" width="140" height="310" rx="62" fill="#fff7ef" opacity="0.88" />
  <rect x="650" y="378" width="76" height="228" rx="38" fill="{palette['accent']}" opacity="0.42" />
"""
    elif environment_family == "reading-nook":
        environment_art = """
  <rect x="124" y="286" width="212" height="182" rx="42" fill="#fff7ef" opacity="0.84" />
  <rect x="584" y="302" width="188" height="156" rx="34" fill="#ffffff" opacity="0.66" />
  <rect x="202" y="640" width="494" height="176" rx="88" fill="#fffaf3" opacity="0.88" />
"""
    elif environment_family == "sleepy-room":
        environment_art = """
  <rect x="150" y="244" width="600" height="498" rx="54" fill="#fffaf3" opacity="0.78" />
  <rect x="202" y="302" width="156" height="156" rx="28" fill="#dbeafe" opacity="0.72" />
  <rect x="198" y="744" width="520" height="122" rx="52" fill="#fef3c7" opacity="0.72" />
"""
    elif environment_family == "path":
        environment_art = """
  <path d="M162 968C238 866 330 780 438 720C554 654 642 618 748 596" stroke="#fff9ef" stroke-width="98" stroke-linecap="round" opacity="0.84" />
  <ellipse cx="286" cy="864" rx="186" ry="72" fill="#9ad48e" opacity="0.42" />
  <ellipse cx="682" cy="762" rx="220" ry="82" fill="#f6d694" opacity="0.34" />
"""
    else:
        environment_art = """
  <ellipse cx="452" cy="708" rx="488" ry="196" fill="#9ad48e" opacity="0.56" />
  <ellipse cx="666" cy="816" rx="266" ry="110" fill="#f6d694" opacity="0.38" />
  <ellipse cx="238" cy="840" rx="220" ry="98" fill="#b8e3a2" opacity="0.44" />
"""

    prop = demo["prop"]
    if prop == "door":
        props = f'<path d="M648 430C648 388 680 352 720 352" stroke="{palette["text"]}" stroke-width="12" stroke-linecap="round" opacity="0.54" />'
    elif prop == "lantern":
        props = f"""
  <circle cx="222" cy="372" r="34" fill="#fff1bf" opacity="0.94" />
  <rect x="212" y="334" width="20" height="86" rx="10" fill="{palette['accent']}" opacity="0.64" />
"""
    elif prop == "moon":
        props = """
  <path d="M706 118C668 154 664 214 700 252C642 248 594 202 594 144C594 84 644 36 706 36C728 36 748 42 766 52C744 64 724 86 706 118Z" fill="#fff7d6" opacity="0.82" />
"""
    elif prop == "star":
        props = """
  <path d="M676 332L690 366L724 366L698 386L708 420L676 400L644 420L654 386L628 366L662 366Z" fill="#fff7d6" opacity="0.92" />
"""
    elif prop == "heart":
        props = """
  <path d="M690 352C690 326 670 308 648 308C630 308 614 318 606 334C598 318 582 308 564 308C542 308 522 326 522 352C522 404 606 446 606 446C606 446 690 404 690 352Z" fill="#fca5a5" opacity="0.72" />
"""
    else:
        props = '<circle cx="666" cy="320" r="28" fill="#fff7d6" opacity="0.88" />'

    return f"""
  <rect width="900" height="1200" rx="56" fill="url(#storybook-bg-{blueprint['pageIndex']})" />
  {stage_glow}
  {environment_art}
  {props}
  <rect y="0" width="900" height="1200" rx="56" fill="url(#storybook-wash-{blueprint['pageIndex']})" opacity="0.18" />
"""


def _render_demo_accent_v2(ingredients: dict[str, Any], demo: dict[str, str]) -> str:
    accent = ingredients["style_recipe"]["palette"]["accent"]
    if demo["accentEffect"] == "confetti":
        return f"""
  <circle cx="164" cy="246" r="10" fill="{accent}" opacity="0.72" />
  <circle cx="214" cy="228" r="7" fill="{accent}" opacity="0.52" />
  <circle cx="746" cy="284" r="9" fill="{accent}" opacity="0.74" />
  <circle cx="708" cy="246" r="6" fill="{accent}" opacity="0.54" />
"""
    if demo["accentEffect"] == "ripple":
        return f"""
  <path d="M192 930C252 892 320 872 396 872" stroke="{accent}" stroke-width="10" stroke-linecap="round" opacity="0.34" />
  <path d="M506 904C580 860 660 840 736 840" stroke="{accent}" stroke-width="10" stroke-linecap="round" opacity="0.28" />
"""
    if demo["accentEffect"] == "breeze":
        return f"""
  <path d="M134 318C204 286 270 286 332 320" stroke="{accent}" stroke-width="8" stroke-linecap="round" opacity="0.26" />
  <path d="M602 274C666 246 730 250 782 286" stroke="{accent}" stroke-width="8" stroke-linecap="round" opacity="0.26" />
"""
    return f"""
  <circle cx="210" cy="290" r="34" fill="{accent}" opacity="0.16" />
  <circle cx="708" cy="260" r="28" fill="{accent}" opacity="0.14" />
"""


def _render_protagonist_svg_v2(blueprint: dict[str, Any], demo: dict[str, str]) -> str:
    archetype = _normalize_text(blueprint["protagonist"].get("archetype")) or "bunny"
    body_color = (
        "#8c6b4f"
        if archetype == "bear"
        else "#d97706"
        if archetype == "fox"
        else "#a16207"
        if archetype == "deer"
        else "#7c6f64"
        if archetype == "otter"
        else "#f8fafc"
    )
    body_stroke = "#94a3b8" if archetype == "bunny" else "#4b3a2c"
    belly_color = "#ffedd5" if archetype == "fox" else "#efe3d1"
    center_x = 452 if demo["cameraLayout"] == "wide" else 468 if demo["cameraLayout"] == "focused" else 486
    center_y = 742 if demo["cameraLayout"] == "wide" else 764 if demo["cameraLayout"] == "focused" else 788
    body_scale = 0.86 if demo["cameraLayout"] == "wide" else 0.96 if demo["cameraLayout"] == "focused" else 1.04
    head_y = center_y - 170 * body_scale
    body_y = center_y
    eye_y = head_y + 12
    mouth_y = head_y + 46
    arm_lift = 42 if demo["pose"] in {"wave", "celebrate"} else 18 if demo["pose"] == "lean-in" else -6 if demo["pose"] == "hesitate" else 12
    left_arm_end_x = center_x - 72 * body_scale
    left_arm_end_y = body_y - 32 * body_scale - arm_lift
    right_arm_end_x = center_x + 72 * body_scale
    right_arm_end_y = body_y - 30 * body_scale - (26 if demo["pose"] == "step-forward" else arm_lift * 0.7)
    leg_spread = 34 if demo["pose"] == "step-forward" else 12 if demo["pose"] == "curl-up" else 24
    if demo["expression"] == "bright":
        mouth_path = f"M{center_x - 22 * body_scale} {mouth_y}C{center_x - 8 * body_scale} {mouth_y + 18 * body_scale},{center_x + 8 * body_scale} {mouth_y + 18 * body_scale},{center_x + 22 * body_scale} {mouth_y}"
    elif demo["expression"] in {"shy", "wobbly"}:
        mouth_path = f"M{center_x - 12 * body_scale} {mouth_y + 6 * body_scale}C{center_x - 2 * body_scale} {mouth_y - 6 * body_scale},{center_x + 4 * body_scale} {mouth_y - 6 * body_scale},{center_x + 12 * body_scale} {mouth_y + 4 * body_scale}"
    else:
        mouth_path = f"M{center_x - 16 * body_scale} {mouth_y}C{center_x - 6 * body_scale} {mouth_y + 8 * body_scale},{center_x + 6 * body_scale} {mouth_y + 8 * body_scale},{center_x + 16 * body_scale} {mouth_y}"

    if archetype == "bunny":
        ears = f"""
    <ellipse cx="{center_x - 48 * body_scale}" cy="{head_y - 86 * body_scale}" rx="{18 * body_scale}" ry="{82 * body_scale}" fill="{body_color}" stroke="{body_stroke}" stroke-width="{7 * body_scale}" />
    <ellipse cx="{center_x + 48 * body_scale}" cy="{head_y - 86 * body_scale}" rx="{18 * body_scale}" ry="{82 * body_scale}" fill="{body_color}" stroke="{body_stroke}" stroke-width="{7 * body_scale}" />
    <ellipse cx="{center_x - 48 * body_scale}" cy="{head_y - 96 * body_scale}" rx="{8 * body_scale}" ry="{44 * body_scale}" fill="#fecdd3" opacity="0.74" />
    <ellipse cx="{center_x + 48 * body_scale}" cy="{head_y - 96 * body_scale}" rx="{8 * body_scale}" ry="{44 * body_scale}" fill="#fecdd3" opacity="0.74" />
"""
    elif archetype == "bear":
        ears = f"""
    <circle cx="{center_x - 54 * body_scale}" cy="{head_y - 44 * body_scale}" r="{28 * body_scale}" fill="{body_color}" stroke="{body_stroke}" stroke-width="{7 * body_scale}" />
    <circle cx="{center_x + 54 * body_scale}" cy="{head_y - 44 * body_scale}" r="{28 * body_scale}" fill="{body_color}" stroke="{body_stroke}" stroke-width="{7 * body_scale}" />
"""
    elif archetype == "deer":
        ears = f"""
    <circle cx="{center_x - 48 * body_scale}" cy="{head_y - 40 * body_scale}" r="{24 * body_scale}" fill="{body_color}" stroke="{body_stroke}" stroke-width="{7 * body_scale}" />
    <circle cx="{center_x + 48 * body_scale}" cy="{head_y - 40 * body_scale}" r="{24 * body_scale}" fill="{body_color}" stroke="{body_stroke}" stroke-width="{7 * body_scale}" />
    <path d="M{center_x - 34 * body_scale} {head_y - 68 * body_scale}C{center_x - 52 * body_scale} {head_y - 122 * body_scale},{center_x - 74 * body_scale} {head_y - 134 * body_scale},{center_x - 88 * body_scale} {head_y - 170 * body_scale}" stroke="{body_stroke}" stroke-width="{6 * body_scale}" stroke-linecap="round" />
    <path d="M{center_x + 34 * body_scale} {head_y - 68 * body_scale}C{center_x + 52 * body_scale} {head_y - 122 * body_scale},{center_x + 74 * body_scale} {head_y - 134 * body_scale},{center_x + 88 * body_scale} {head_y - 170 * body_scale}" stroke="{body_stroke}" stroke-width="{6 * body_scale}" stroke-linecap="round" />
"""
    elif archetype == "fox":
        ears = f"""
    <polygon points="{center_x - 70 * body_scale},{head_y - 24 * body_scale} {center_x - 30 * body_scale},{head_y - 94 * body_scale} {center_x - 8 * body_scale},{head_y - 10 * body_scale}" fill="{body_color}" stroke="{body_stroke}" stroke-width="{7 * body_scale}" />
    <polygon points="{center_x + 70 * body_scale},{head_y - 24 * body_scale} {center_x + 30 * body_scale},{head_y - 94 * body_scale} {center_x + 8 * body_scale},{head_y - 10 * body_scale}" fill="{body_color}" stroke="{body_stroke}" stroke-width="{7 * body_scale}" />
"""
    else:
        ears = f"""
    <circle cx="{center_x - 42 * body_scale}" cy="{head_y - 26 * body_scale}" r="{20 * body_scale}" fill="{body_color}" stroke="{body_stroke}" stroke-width="{6 * body_scale}" />
    <circle cx="{center_x + 42 * body_scale}" cy="{head_y - 26 * body_scale}" r="{20 * body_scale}" fill="{body_color}" stroke="{body_stroke}" stroke-width="{6 * body_scale}" />
"""

    if archetype == "fox":
        tail = f'<path d="M{center_x + 110 * body_scale} {body_y + 24 * body_scale}C{center_x + 182 * body_scale} {body_y + 10 * body_scale},{center_x + 196 * body_scale} {body_y + 96 * body_scale},{center_x + 130 * body_scale} {body_y + 130 * body_scale}" stroke="{body_stroke}" stroke-width="{20 * body_scale}" stroke-linecap="round" fill="none" />'
    elif archetype == "otter":
        tail = f'<path d="M{center_x + 106 * body_scale} {body_y + 60 * body_scale}C{center_x + 176 * body_scale} {body_y + 94 * body_scale},{center_x + 154 * body_scale} {body_y + 160 * body_scale},{center_x + 94 * body_scale} {body_y + 166 * body_scale}" stroke="{body_stroke}" stroke-width="{18 * body_scale}" stroke-linecap="round" fill="none" />'
    else:
        tail = ""

    return f"""
  <g filter="url(#shadow-{blueprint['pageIndex']})">
    {ears}
    <ellipse cx="{center_x}" cy="{head_y}" rx="{88 * body_scale}" ry="{94 * body_scale}" fill="{body_color}" stroke="{body_stroke}" stroke-width="{8 * body_scale}" />
    <ellipse cx="{center_x}" cy="{body_y}" rx="{118 * body_scale}" ry="{140 * body_scale}" fill="{body_color}" stroke="{body_stroke}" stroke-width="{8 * body_scale}" />
    <ellipse cx="{center_x}" cy="{body_y + 10 * body_scale}" rx="{66 * body_scale}" ry="{84 * body_scale}" fill="{belly_color}" opacity="0.94" />
    <ellipse cx="{center_x - 32 * body_scale}" cy="{eye_y}" rx="{10 * body_scale}" ry="{14 * body_scale}" fill="{body_stroke}" />
    <ellipse cx="{center_x + 32 * body_scale}" cy="{eye_y}" rx="{10 * body_scale}" ry="{14 * body_scale}" fill="{body_stroke}" />
    <ellipse cx="{center_x}" cy="{head_y + 44 * body_scale}" rx="{18 * body_scale}" ry="{14 * body_scale}" fill="#f59ab5" />
    <path d="{mouth_path}" stroke="{body_stroke}" stroke-width="{7 * body_scale}" stroke-linecap="round" fill="none" />
    <path d="M{center_x - 74 * body_scale} {body_y - 56 * body_scale}C{center_x - 106 * body_scale} {body_y - 18 * body_scale},{left_arm_end_x} {left_arm_end_y},{left_arm_end_x - 4 * body_scale} {left_arm_end_y + 24 * body_scale}" stroke="{body_stroke}" stroke-width="{16 * body_scale}" stroke-linecap="round" fill="none" />
    <path d="M{center_x + 74 * body_scale} {body_y - 56 * body_scale}C{center_x + 104 * body_scale} {body_y - 18 * body_scale},{right_arm_end_x} {right_arm_end_y},{right_arm_end_x + 6 * body_scale} {right_arm_end_y + 20 * body_scale}" stroke="{body_stroke}" stroke-width="{16 * body_scale}" stroke-linecap="round" fill="none" />
    <path d="M{center_x - 42 * body_scale} {body_y + 126 * body_scale}C{center_x - 42 * body_scale} {body_y + 194 * body_scale},{center_x - leg_spread * body_scale} {body_y + 242 * body_scale},{center_x - 24 * body_scale} {body_y + 282 * body_scale}" stroke="{body_stroke}" stroke-width="{18 * body_scale}" stroke-linecap="round" fill="none" />
    <path d="M{center_x + 42 * body_scale} {body_y + 126 * body_scale}C{center_x + 42 * body_scale} {body_y + 194 * body_scale},{center_x + leg_spread * body_scale} {body_y + 242 * body_scale},{center_x + 24 * body_scale} {body_y + 282 * body_scale}" stroke="{body_stroke}" stroke-width="{18 * body_scale}" stroke-linecap="round" fill="none" />
    {tail}
  </g>
"""


def _build_demo_art_scene_svg_v2(blueprint: dict[str, Any], scene_text: str, ingredients: dict[str, Any]) -> str:
    palette = ingredients["style_recipe"]["palette"]
    demo = _build_demo_art_blueprint_v2(blueprint["stage"])
    return f"""
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200" fill="none">
  <defs>
    <linearGradient id="storybook-bg-{blueprint['pageIndex']}" x1="110" y1="70" x2="790" y2="1140" gradientUnits="userSpaceOnUse">
      <stop stop-color="{palette['backgroundStart']}" />
      <stop offset="1" stop-color="{palette['backgroundEnd']}" />
    </linearGradient>
    <linearGradient id="storybook-wash-{blueprint['pageIndex']}" x1="150" y1="120" x2="760" y2="1080" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ffffff" />
      <stop offset="1" stop-color="{palette['chip']}" />
    </linearGradient>
    <filter id="shadow-{blueprint['pageIndex']}" x="120" y="140" width="660" height="900" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#0f172a" flood-opacity="0.18" />
    </filter>
  </defs>
  {_render_demo_backdrop_v2(blueprint, ingredients, demo)}
  {_render_demo_accent_v2(ingredients, demo)}
  {_render_protagonist_svg_v2(blueprint, demo)}
  <rect x="54" y="934" width="792" height="190" rx="40" fill="rgba(255,255,255,0.16)" />
  <rect x="72" y="952" width="756" height="154" rx="32" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.42)" />
  <text x="102" y="998" fill="{palette['text']}" font-size="34" font-family="'Noto Sans SC','PingFang SC',sans-serif" font-weight="700">{_escape_svg_text_v2(blueprint['sceneTitle'])}</text>
  <text x="102" y="1048" fill="{palette['text']}" font-size="21" font-family="'Noto Sans SC','PingFang SC',sans-serif">{_escape_svg_text_v2(blueprint['visibleAction'])}</text>
  <text x="102" y="1088" fill="{palette['text']}" font-size="18" font-family="'Noto Sans SC','PingFang SC',sans-serif" opacity="0.88">{_escape_svg_text_v2(scene_text[:52])}</text>
</svg>
""".strip()


def _hash_scene_visual_seed_v2(*parts: str) -> int:
    seed = "::".join(_normalize_text(part) for part in parts if _normalize_text(part))
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    return int(digest[:8], 16)


def _build_dynamic_fallback_scene_svg_v2(blueprint: dict[str, Any], scene_text: str, ingredients: dict[str, Any]) -> str:
    palette = ingredients["style_recipe"]["palette"]
    visual_seed = _hash_scene_visual_seed_v2(
        blueprint["visualAnchor"],
        blueprint["sceneObjectCue"],
        blueprint["supportCharacterCue"],
        blueprint["activityCue"],
        blueprint["emotionCue"],
        blueprint["taskCue"],
    )
    accent_x = 118 + (visual_seed % 150)
    accent_y = 158 + ((visual_seed // 8) % 120)
    accent_r = 74 + (visual_seed % 22)
    ribbon_width = 250 + ((visual_seed // 16) % 160)
    wave_height = 682 + ((visual_seed // 64) % 72)
    overlay_opacity = 0.22 + ((visual_seed % 10) / 100)
    mode_label = (
        "成长线索驱动"
        if ingredients["generation_mode"] == "child-personalized"
        else "混合线索驱动"
        if ingredients["generation_mode"] == "hybrid"
        else "主题线索驱动"
    )
    demo = _build_demo_art_blueprint_v2(blueprint["stage"])
    demo["accentEffect"] = (
        "confetti"
        if blueprint["stage"] == "small-success"
        else "ripple"
        if ingredients["generation_mode"] == "hybrid"
        else "glow"
        if blueprint["stage"] == "landing"
        else "breeze"
    )
    demo["prop"] = (
        "moon"
        if "睡" in blueprint["taskCue"] or "晚安" in blueprint["taskCue"]
        else "heart"
        if "情绪" in ingredients["focus_theme"] or "安抚" in blueprint["supportCharacterCue"]
        else "star"
        if "尝试" in blueprint["activityCue"] or "勇气" in ingredients["focus_theme"]
        else "door"
        if blueprint["stage"] == "challenge"
        else demo["prop"]
    )

    return f"""
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200" fill="none">
  <defs>
    <linearGradient id="dynamic-bg-{blueprint['pageIndex']}" x1="72" y1="56" x2="808" y2="1168" gradientUnits="userSpaceOnUse">
      <stop stop-color="{palette['backgroundStart']}" />
      <stop offset="1" stop-color="{palette['backgroundEnd']}" />
    </linearGradient>
    <linearGradient id="dynamic-panel-{blueprint['pageIndex']}" x1="128" y1="94" x2="750" y2="1096" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ffffff" stop-opacity="0.90" />
      <stop offset="1" stop-color="{palette['chip']}" stop-opacity="0.64" />
    </linearGradient>
    <filter id="dynamic-shadow-{blueprint['pageIndex']}" x="78" y="74" width="744" height="1042" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="22" stdDeviation="22" flood-color="#0f172a" flood-opacity="0.18" />
    </filter>
  </defs>
  <rect width="900" height="1200" rx="56" fill="url(#dynamic-bg-{blueprint['pageIndex']})" />
  <circle cx="{accent_x}" cy="{accent_y}" r="{accent_r}" fill="{palette['chip']}" opacity="0.92" />
  <circle cx="756" cy="{220 + ((visual_seed // 32) % 70)}" r="{42 + ((visual_seed // 4) % 26)}" fill="{palette['accent']}" opacity="0.16" />
  <path d="M92 {wave_height}C240 {wave_height - 92},426 {wave_height - 120},812 {wave_height - 32}V1200H92Z" fill="{palette['chip']}" opacity="0.52" />
  <rect x="78" y="78" width="744" height="1038" rx="46" fill="url(#dynamic-panel-{blueprint['pageIndex']})" filter="url(#dynamic-shadow-{blueprint['pageIndex']})" />
  <rect x="110" y="112" width="{ribbon_width}" height="44" rx="22" fill="{palette['chip']}" />
  <text x="136" y="141" fill="{palette['text']}" font-size="22" font-family="'Noto Sans SC','PingFang SC',sans-serif" font-weight="700">{_escape_svg_text_v2(mode_label)}</text>
  <rect x="628" y="112" width="158" height="44" rx="22" fill="{palette['accent']}" fill-opacity="0.14" />
  <text x="652" y="141" fill="{palette['text']}" font-size="22" font-family="'Noto Sans SC','PingFang SC',sans-serif">{_escape_svg_text_v2(ingredients['focus_theme'])}</text>
  <text x="118" y="208" fill="{palette['text']}" font-size="38" font-family="'Noto Sans SC','PingFang SC',sans-serif" font-weight="700">{_escape_svg_text_v2(blueprint['sceneTitle'])}</text>
  <text x="118" y="248" fill="{palette['text']}" font-size="22" font-family="'Noto Sans SC','PingFang SC',sans-serif" opacity="0.84">{_escape_svg_text_v2(_truncate_scene_cue_v2(blueprint['visualAnchor'], blueprint['sceneGoal'], limit=62))}</text>
  <g opacity="{overlay_opacity}">
    {_render_demo_backdrop_v2(blueprint, ingredients, demo)}
  </g>
  <g opacity="0.22">
    {_render_demo_accent_v2(ingredients, demo)}
  </g>
  <g opacity="0.90">
    {_render_protagonist_svg_v2(blueprint, demo)}
  </g>
  <rect x="102" y="798" width="324" height="124" rx="28" fill="#ffffff" fill-opacity="0.84" />
  <text x="128" y="842" fill="{palette['text']}" font-size="22" font-family="'Noto Sans SC','PingFang SC',sans-serif">场景物件</text>
  <text x="128" y="886" fill="{palette['text']}" font-size="28" font-family="'Noto Sans SC','PingFang SC',sans-serif" font-weight="700">{_escape_svg_text_v2(blueprint['sceneObjectCue'])}</text>
  <rect x="474" y="798" width="324" height="124" rx="28" fill="#ffffff" fill-opacity="0.84" />
  <text x="500" y="842" fill="{palette['text']}" font-size="22" font-family="'Noto Sans SC','PingFang SC',sans-serif">当前动作</text>
  <text x="500" y="886" fill="{palette['text']}" font-size="26" font-family="'Noto Sans SC','PingFang SC',sans-serif" font-weight="700">{_escape_svg_text_v2(_truncate_scene_cue_v2(blueprint['activityCue'], blueprint['visibleAction'], limit=20))}</text>
  <rect x="102" y="948" width="696" height="132" rx="32" fill="{palette['chip']}" fill-opacity="0.92" />
  <text x="132" y="994" fill="{palette['text']}" font-size="22" font-family="'Noto Sans SC','PingFang SC',sans-serif">辅助角色</text>
  <text x="132" y="1034" fill="{palette['text']}" font-size="24" font-family="'Noto Sans SC','PingFang SC',sans-serif" font-weight="700">{_escape_svg_text_v2(_truncate_scene_cue_v2(blueprint['supportCharacterCue'], blueprint['narrativeAnchor'], limit=34))}</text>
  <text x="132" y="1070" fill="{palette['text']}" font-size="20" font-family="'Noto Sans SC','PingFang SC',sans-serif" opacity="0.86">{_escape_svg_text_v2(_truncate_scene_cue_v2(blueprint['emotionCue'], blueprint['emotion'], limit=34))}</text>
  <rect x="102" y="1092" width="420" height="54" rx="27" fill="{palette['accent']}" fill-opacity="0.16" />
  <text x="130" y="1127" fill="{palette['text']}" font-size="22" font-family="'Noto Sans SC','PingFang SC',sans-serif">{_escape_svg_text_v2(_truncate_scene_cue_v2(blueprint['taskCue'], ingredients['tonight_action'], limit=28))}</text>
  <text x="102" y="1178" fill="{palette['text']}" font-size="18" font-family="'Noto Sans SC','PingFang SC',sans-serif" opacity="0.76">{_escape_svg_text_v2(_truncate_scene_cue_v2(scene_text, blueprint['narrativeAnchor'], limit=62))}</text>
</svg>
""".strip()


def _build_scene_fallback_svg_v2(blueprint: dict[str, Any], scene_text: str, ingredients: dict[str, Any]) -> str:
    palette = ingredients["style_recipe"]["palette"]
    return f"""
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200" fill="none">
  <defs>
    <linearGradient id="storybook-bg-{blueprint['pageIndex']}" x1="120" y1="80" x2="780" y2="1120" gradientUnits="userSpaceOnUse">
      <stop stop-color="{palette['backgroundStart']}" />
      <stop offset="1" stop-color="{palette['backgroundEnd']}" />
    </linearGradient>
  </defs>
  <rect width="900" height="1200" rx="56" fill="url(#storybook-bg-{blueprint['pageIndex']})" />
  <circle cx="150" cy="165" r="82" fill="{palette['chip']}" opacity="0.88" />
  <circle cx="738" cy="220" r="56" fill="{palette['chip']}" opacity="0.62" />
  <rect x="84" y="92" width="732" height="92" rx="30" fill="white" fill-opacity="0.68" />
  <text x="120" y="148" fill="{palette['text']}" font-size="38" font-family="'Noto Sans SC', 'PingFang SC', sans-serif" font-weight="700">{_escape_svg_text_v2(blueprint['sceneTitle'])}</text>
  <rect x="84" y="222" width="732" height="520" rx="44" fill="white" fill-opacity="0.52" stroke="white" stroke-opacity="0.7" />
  <text x="120" y="320" fill="{palette['text']}" font-size="42" font-family="'Noto Sans SC', 'PingFang SC', sans-serif" font-weight="700">{_escape_svg_text_v2(blueprint['protagonist']['label'])}</text>
  <text x="120" y="378" fill="{palette['text']}" font-size="28" font-family="'Noto Sans SC', 'PingFang SC', sans-serif">主题：{_escape_svg_text_v2(ingredients['focus_theme'])}</text>
  <text x="120" y="440" fill="{palette['text']}" font-size="28" font-family="'Noto Sans SC', 'PingFang SC', sans-serif">动作：{_escape_svg_text_v2(blueprint['visibleAction'])}</text>
  <text x="120" y="502" fill="{palette['text']}" font-size="28" font-family="'Noto Sans SC', 'PingFang SC', sans-serif">情绪：{_escape_svg_text_v2(blueprint['emotion'])}</text>
  <rect x="120" y="560" width="224" height="18" rx="9" fill="{palette['accent']}" fill-opacity="0.9" />
  <rect x="120" y="604" width="296" height="14" rx="7" fill="{palette['accent']}" fill-opacity="0.45" />
  <rect x="84" y="782" width="732" height="276" rx="40" fill="white" fill-opacity="0.76" />
  <text x="120" y="860" fill="{palette['text']}" font-size="22" font-family="'Noto Sans SC', 'PingFang SC', sans-serif">本页剧情</text>
  <text x="120" y="918" fill="{palette['text']}" font-size="30" font-family="'Noto Sans SC', 'PingFang SC', sans-serif">{_escape_svg_text_v2(scene_text)}</text>
  <rect x="84" y="1088" width="320" height="58" rx="29" fill="{palette['chip']}" />
  <text x="120" y="1126" fill="{palette['text']}" font-size="24" font-family="'Noto Sans SC', 'PingFang SC', sans-serif">Page {blueprint['pageIndex']}</text>
</svg>
""".strip()


def _build_story_scenes_v2(ingredients: dict[str, Any]) -> list[dict[str, Any]]:
    stages = ["landing"] if ingredients["story_mode"] == "card" else PAGE_STRUCTURES[ingredients["page_count"]]
    scenes: list[dict[str, Any]] = []
    for index, stage in enumerate(stages):
        blueprint = _build_scene_blueprint_v2(stage, index, ingredients)
        scene_text = (
            f"{ingredients['protagonist']['label']}把今天那一点点亮光抱进怀里。今晚先做一件小事：{ingredients['tonight_action']}。"
            if ingredients["story_mode"] == "card"
            else _build_scene_text_v2(blueprint, ingredients)
        )
        audio_script = _build_scene_audio_script_v2(blueprint, scene_text)
        scenes.append(
            {
                "sceneIndex": blueprint["pageIndex"],
                "sceneTitle": blueprint["sceneTitle"],
                "sceneText": scene_text,
                "imagePrompt": _build_scene_image_prompt_v2(blueprint, ingredients),
                "imageUrl": None,
                "assetRef": None,
                "imageStatus": "fallback",
                "audioUrl": None,
                "audioRef": "storybook-audio-card"
                if ingredients["story_mode"] == "card"
                else f"storybook-audio-{blueprint['pageIndex']}",
                "audioScript": audio_script,
                "audioStatus": "fallback",
                "captionTiming": build_story_caption_timing(audio_script),
                "voiceStyle": blueprint["voiceStyle"],
                "highlightSource": blueprint["highlightSource"],
                "imageCacheHit": False,
                "audioCacheHit": False,
                "sceneBlueprint": blueprint,
            }
        )
    return scenes


def _build_story_title(generation_mode: GenerationMode, *, child_name: str, focus_theme: str) -> str:
    if generation_mode == "manual-theme":
        return f"关于{focus_theme}的成长绘本"
    if generation_mode == "hybrid":
        return f"{child_name}的{focus_theme}成长绘本"
    return f"{child_name}的成长绘本"


def _build_story_summary(generation_mode: GenerationMode, story_mode: StoryMode, *, child_name: str, focus_theme: str, page_count: int) -> str:
    page_text = f"{1 if story_mode == 'card' else page_count} 页"
    if generation_mode == "manual-theme":
        return f"这本 {page_text} 绘本会把“{focus_theme}”讲成孩子能听懂的小故事，并在最后自然落到今晚可以做的一件小事。"
    if generation_mode == "hybrid":
        return f"这本 {page_text} 绘本把“{focus_theme}”和 {child_name} 最近被看见的成长线索串成一条温柔、可朗读、可继续行动的成长闭环。"
    return f"这本 {page_text} 绘本会把 {child_name} 最近被看见的小进步、今晚的陪伴动作和明天的观察点串成完整的成长故事。"


def _build_story_seed(payload: dict[str, Any], ingredients: dict[str, Any], child_id: str) -> str:
    return "::".join(
        [
            child_id or "storybook-guest",
            ingredients["story_mode"],
            ingredients["generation_mode"],
            str(ingredients["page_count"]),
            _resolve_style_mode(payload),
            _resolve_style_preset(payload),
            _normalize_text(_payload_get(payload, "customStylePrompt", "custom_style_prompt")),
            _normalize_text(
                _payload_get(payload, "customStyleNegativePrompt", "custom_style_negative_prompt")
            ),
            ingredients["focus_theme"],
            ingredients["protagonist"]["archetype"],
            "|".join(ingredients["goal_keywords"]),
            "|".join(
                f"{item.get('kind')}:{item.get('title')}:{item.get('detail')}"
                for item in ingredients["highlights"]
            ),
            _normalize_text(_payload_get(payload, "requestSource", "request_source")),
        ]
    )


def _read_cached_scene(*, provider: Any, kwargs: dict[str, Any]) -> Any | None:
    reader = getattr(provider, "read_cached_scene", None)
    if not callable(reader):
        return None
    try:
        return reader(**kwargs)
    except Exception:
        return None


def _is_priority_storybook_audio_scene(scene_index: int) -> bool:
    return 1 <= scene_index <= STORYBOOK_MEDIA_WARM_PRIORITY_SCENE_COUNT


def _submit_priority_storybook_audio_render(*, provider: Any, kwargs: dict[str, Any]) -> Future[Any]:
    return _storybook_audio_priority_executor.submit(provider.render_scene, **kwargs)


def _resolve_prefetched_provider_result(*, future: Future[Any], timeout_seconds: float) -> Any | None:
    try:
        return future.result(timeout=max(timeout_seconds, 0.0))
    except FutureTimeoutError:
        future.cancel()
        return None
    except Exception:
        return None


def _render_cached_or_fallback(
    *,
    primary_provider: Any,
    fallback_provider: Any,
    kwargs: dict[str, Any],
    prefetched_result_future: Future[Any] | None = None,
    prefetched_result_timeout_seconds: float | None = None,
) -> tuple[Any, bool]:
    # First-byte image delivery remains cache-first. Audio may prefetch priority scenes within a bounded
    # sync budget; misses still fall back honestly and continue async warming after the skeleton returns.
    cached_result = _read_cached_scene(provider=primary_provider, kwargs=kwargs)
    if cached_result is not None:
        return cached_result, True
    if prefetched_result_future is not None:
        prefetched_result = _resolve_prefetched_provider_result(
            future=prefetched_result_future,
            timeout_seconds=prefetched_result_timeout_seconds or 0.0,
        )
        if prefetched_result is not None:
            return prefetched_result, bool(prefetched_result.output.get("cacheHit"))
    return fallback_provider.render_scene(**kwargs), False


def _scene_has_real_image(result: Any) -> bool:
    return result.output.get("imageStatus") == "ready" and bool(result.output.get("imageUrl"))


def _scene_has_real_audio(result: Any) -> bool:
    return result.output.get("audioStatus") == "ready" and bool(result.output.get("audioUrl"))


def _set_storybook_media_warm_channel(
    channel: _MediaWarmChannelState,
    *,
    total_scene_count: int,
    ready_scene_count: int,
    pending_scene_count: int,
) -> None:
    now = monotonic()
    channel.total_scene_count = max(total_scene_count, 0)
    channel.ready_scene_count = max(ready_scene_count, 0)
    channel.pending_scene_count = max(pending_scene_count, 0)
    channel.error_scene_count = 0
    channel.last_error_stage = None
    channel.last_error_reason = None
    channel.started_at = now if pending_scene_count > 0 or ready_scene_count > 0 else None
    channel.updated_at = now if pending_scene_count > 0 or ready_scene_count > 0 else None


def _update_storybook_media_warm_channel(
    story_id: str,
    media_kind: Literal["image", "audio"],
    *,
    success: bool,
    error: Exception | None = None,
) -> None:
    with _storybook_media_warm_lock:
        job = _storybook_media_warm_jobs.get(story_id)
        if not job:
            return
        channel = job.image if media_kind == "image" else job.audio
        now = monotonic()
        if channel.started_at is None:
            channel.started_at = now
        channel.updated_at = now
        channel.pending_scene_count = max(channel.pending_scene_count - 1, 0)
        if success:
            channel.ready_scene_count += 1
        else:
            channel.error_scene_count += 1
            if error is not None:
                stage, reason = _serialize_storybook_media_error(error)
                channel.last_error_stage = stage
                channel.last_error_reason = reason
        job.updated_at = now


def _complete_storybook_media_warm_job(story_id: str) -> None:
    with _storybook_media_warm_lock:
        job = _storybook_media_warm_jobs.get(story_id)
        if not job:
            return
        job.updated_at = monotonic()
        job.completed.set()


def _prioritize_storybook_media_scene_requests(
    scene_requests: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    return sorted(
        scene_requests,
        key=lambda scene_request: (
            0
            if int(scene_request["sceneIndex"]) <= STORYBOOK_MEDIA_WARM_PRIORITY_SCENE_COUNT
            else 1,
            int(scene_request["sceneIndex"]),
        ),
    )


def _run_storybook_media_warm_task(
    *,
    story_id: str,
    media_kind: Literal["image", "audio"],
    provider: Any,
    kwargs: dict[str, Any],
) -> None:
    try:
        result = provider.render_scene(**kwargs)
        if media_kind == "image":
            if _scene_has_real_image(result):
                _update_storybook_media_warm_channel(story_id, media_kind, success=True)
                return
            error = RuntimeError("image provider returned without ready image")
            error.stage = "image_not_ready"  # type: ignore[attr-defined]
        else:
            if _scene_has_real_audio(result):
                _store_audio_asset(
                    story_id=story_id,
                    scene_index=int(kwargs["scene_index"]),
                    audio_script=_normalize_text(kwargs.get("audio_script")),
                    voice_style=_normalize_text(kwargs.get("voice_style")),
                    audio_result=result,
                )
                _update_storybook_media_warm_channel(story_id, media_kind, success=True)
                return
            error = RuntimeError("audio provider returned without ready audio")
            error.stage = "audio_not_ready"  # type: ignore[attr-defined]
        _update_storybook_media_warm_channel(
            story_id,
            media_kind,
            success=False,
            error=error,
        )
    except Exception as error:
        _update_storybook_media_warm_channel(
            story_id,
            media_kind,
            success=False,
            error=error,
        )


def _warm_storybook_media_job(
    *,
    story_id: str,
    scene_requests: list[dict[str, Any]],
    image_provider: Any,
    audio_provider: Any,
    image_pending_scene_indices: set[int],
    audio_pending_scene_indices: set[int],
) -> None:
    try:
        prioritized_scene_requests = _prioritize_storybook_media_scene_requests(scene_requests)
        warm_tasks: list[tuple[Literal["image", "audio"], Any, dict[str, Any]]] = []

        for scene_request in prioritized_scene_requests:
            scene_index = int(scene_request["sceneIndex"])
            if scene_index in image_pending_scene_indices:
                warm_tasks.append(("image", image_provider, scene_request["image_kwargs"]))
            if scene_index in audio_pending_scene_indices:
                warm_tasks.append(("audio", audio_provider, scene_request["audio_kwargs"]))

        if not warm_tasks:
            return

        max_workers = max(1, min(STORYBOOK_MEDIA_WARM_MAX_WORKERS, len(warm_tasks)))
        with ThreadPoolExecutor(
            max_workers=max_workers,
            thread_name_prefix="storybook-media-warm",
        ) as executor:
            futures = [
                executor.submit(
                    _run_storybook_media_warm_task,
                    story_id=story_id,
                    media_kind=media_kind,
                    provider=provider,
                    kwargs=kwargs,
                )
                for media_kind, provider, kwargs in warm_tasks
            ]
            for future in as_completed(futures):
                future.result()
    finally:
        _complete_storybook_media_warm_job(story_id)


def _ensure_storybook_media_warming(
    *,
    story_id: str,
    scene_requests: list[dict[str, Any]],
    image_provider: Any,
    audio_provider: Any,
    image_live_enabled: bool,
    audio_live_enabled: bool,
    image_ready_scene_count: int,
    audio_ready_scene_count: int,
    image_pending_scene_indices: set[int],
    audio_pending_scene_indices: set[int],
) -> _StoryBookMediaWarmJob | None:
    if not image_live_enabled and not audio_live_enabled:
        return None

    if not image_pending_scene_indices and not audio_pending_scene_indices:
        return _get_storybook_media_warm_job(story_id)

    with _storybook_media_warm_lock:
        now = monotonic()
        _prune_storybook_media_warm_jobs_locked(now)
        existing = _storybook_media_warm_jobs.get(story_id)
        if existing and existing.future and not existing.future.done():
            return existing

        job = existing or _StoryBookMediaWarmJob(
            story_id=story_id,
            created_at=now,
            updated_at=now,
        )
        job.completed.clear()
        job.updated_at = now
        _set_storybook_media_warm_channel(
            job.image,
            total_scene_count=len(scene_requests) if image_live_enabled else 0,
            ready_scene_count=image_ready_scene_count,
            pending_scene_count=len(image_pending_scene_indices) if image_live_enabled else 0,
        )
        _set_storybook_media_warm_channel(
            job.audio,
            total_scene_count=len(scene_requests) if audio_live_enabled else 0,
            ready_scene_count=audio_ready_scene_count,
            pending_scene_count=len(audio_pending_scene_indices) if audio_live_enabled else 0,
        )
        job.future = _storybook_media_warm_executor.submit(
            _warm_storybook_media_job,
            story_id=story_id,
            scene_requests=scene_requests,
            image_provider=image_provider,
            audio_provider=audio_provider,
            image_pending_scene_indices=set(image_pending_scene_indices),
            audio_pending_scene_indices=set(audio_pending_scene_indices),
        )
        _storybook_media_warm_jobs[story_id] = job
        return job


def _provider_mode_from_scenes(scenes: list[dict[str, Any]]) -> str:
    if scenes and all(scene["imageStatus"] == "ready" and scene["audioStatus"] == "ready" for scene in scenes):
        return "live"
    if any(scene["imageStatus"] == "ready" or scene["audioStatus"] == "ready" for scene in scenes):
        return "mixed"
    return "fallback"


def _provider_label(*, primary_name: str, fallback_name: str, scenes: list[dict[str, Any]], status_key: str) -> str:
    ready = any(scene[status_key] == "ready" for scene in scenes)
    fallback = any(scene[status_key] != "ready" for scene in scenes)
    if ready and fallback and primary_name != fallback_name:
        return f"{primary_name}+{fallback_name}"
    if ready:
        return primary_name
    return fallback_name


def _resolve_missing_image_config(settings: Any) -> list[str]:
    missing: list[str] = []
    if _normalize_text(getattr(settings, "storybook_image_provider", "")) != "vivo":
        missing.append("storybook_image_provider")
    if not _normalize_text(getattr(settings, "vivo_app_id", "")):
        missing.append("VIVO_APP_ID")
    vivo_app_key = getattr(settings, "vivo_app_key", None)
    key_text = vivo_app_key.get_secret_value().strip() if vivo_app_key else ""
    if not key_text:
        missing.append("VIVO_APP_KEY")
    return missing


def _resolve_missing_audio_config(settings: Any) -> list[str]:
    missing: list[str] = []
    if not story_audio_provider_prefers_vivo(settings):
        missing.append("storybook_audio_provider")
    if not _normalize_text(getattr(settings, "vivo_app_id", "")):
        missing.append("VIVO_APP_ID")
    vivo_app_key = getattr(settings, "vivo_app_key", None)
    key_text = vivo_app_key.get_secret_value().strip() if vivo_app_key else ""
    if not key_text:
        missing.append("VIVO_APP_KEY")
    return missing


def _store_scene_image_svg_asset(
    *,
    story_id: str,
    scene_blueprint: dict[str, Any],
    svg: str,
    image_source_kind: str,
) -> str:
    media_key = _build_image_media_key(
        story_id=story_id,
        scene_index=scene_blueprint["sceneIndex"] - 1,
        scene_title=scene_blueprint["sceneTitle"],
    )
    get_storybook_media_cache().put_image(
        media_key,
        payload={
            "storyId": story_id,
            "sceneIndex": scene_blueprint["sceneIndex"],
            "sceneTitle": scene_blueprint["sceneTitle"],
            "contentType": "image/svg+xml",
            "svg": svg,
            "imageSourceKind": image_source_kind,
            "expiresAt": time() + float(get_storybook_media_cache().cache_window_seconds),
        },
    )
    return f"/api/ai/parent-storybook/media/{media_key}"


def _resolve_scene_image_asset(
    *,
    story_id: str,
    scene_blueprint: dict[str, Any],
    scene_text: str,
    image_status: str,
    image_result: Any,
    ingredients: dict[str, Any],
) -> tuple[str | None, str | None, str]:
    image_url = image_result.output.get("imageUrl")
    asset_ref = image_result.output.get("assetRef")
    render_blueprint = scene_blueprint.get("sceneBlueprint")
    if not isinstance(render_blueprint, dict):
        render_blueprint = scene_blueprint

    if image_status == "ready" and image_url:
        return image_url, asset_ref or image_url, "real"

    dynamic_svg = _build_dynamic_fallback_scene_svg_v2(render_blueprint, scene_text, ingredients)
    if isinstance(dynamic_svg, str) and dynamic_svg.strip():
        asset_url = _store_scene_image_svg_asset(
            story_id=story_id,
            scene_blueprint=scene_blueprint,
            svg=dynamic_svg,
            image_source_kind="dynamic-fallback",
        )
        return asset_url, asset_url, "dynamic-fallback"

    demo_svg = _build_demo_art_scene_svg_v2(render_blueprint, scene_text, ingredients)
    if isinstance(demo_svg, str) and demo_svg.strip():
        asset_url = _store_scene_image_svg_asset(
            story_id=story_id,
            scene_blueprint=scene_blueprint,
            svg=demo_svg,
            image_source_kind="demo-art",
        )
        return asset_url, asset_url, "demo-art"

    fallback_svg = _build_scene_fallback_svg_v2(render_blueprint, scene_text, ingredients)
    if not isinstance(fallback_svg, str) or not fallback_svg.strip():
        return image_url, asset_ref, "svg-fallback"

    asset_url = _store_scene_image_svg_asset(
        story_id=story_id,
        scene_blueprint=scene_blueprint,
        svg=fallback_svg,
        image_source_kind="svg-fallback",
    )
    return asset_url, asset_url, "svg-fallback"


def _resolve_image_delivery(
    image_source_kinds: list[str],
) -> Literal["real", "mixed", "dynamic-fallback", "demo-art", "svg-fallback"]:
    unique_kinds = [kind for kind in dict.fromkeys(image_source_kinds) if kind]
    if not unique_kinds:
        return "svg-fallback"
    if len(unique_kinds) == 1:
        return unique_kinds[0]  # type: ignore[return-value]
    return "mixed"


def _resolve_storybook_fallback_provider(image_source_kinds: list[str]) -> str:
    if any(kind == "dynamic-fallback" for kind in image_source_kinds):
        return "storybook-dynamic-fallback"
    if any(kind == "demo-art" for kind in image_source_kinds):
        return "storybook-demo-art"
    return "storybook-svg-fallback"


def _resolve_scene_image_provider_label(primary_name: str, image_source_kinds: list[str]) -> str:
    image_delivery = _resolve_image_delivery(image_source_kinds)
    fallback_provider = _resolve_storybook_fallback_provider(image_source_kinds)
    if image_delivery == "real":
        return primary_name
    if image_delivery == "mixed":
        return f"{primary_name}+{fallback_provider}"
    return fallback_provider


def _resolve_media_diagnostics(
    *,
    story_id: str,
    settings: Any,
    image_provider: Any,
    audio_provider: Any,
    scenes: list[dict[str, Any]],
    request_elapsed_ms: int | None = None,
) -> dict[str, Any]:
    image_live_enabled = _resolve_media_live_enabled(
        settings=settings,
        provider=image_provider,
        media_kind="image",
    )
    audio_live_enabled = _resolve_media_live_enabled(
        settings=settings,
        provider=audio_provider,
        media_kind="audio",
    )
    warm_job = _get_storybook_media_warm_job(story_id)
    image_source_kinds = [str(scene.get("imageSourceKind") or "svg-fallback") for scene in scenes]
    image_delivery = _resolve_image_delivery(image_source_kinds)
    audio_delivery = _resolve_audio_delivery(scenes)
    image_provider_name = getattr(image_provider, "provider_name", "storybook-asset")
    audio_provider_name = getattr(audio_provider, "provider_name", "storybook-mock-preview")
    image_ready_scene_count = sum(1 for kind in image_source_kinds if kind == "real")
    audio_ready_scene_count = sum(
        1 for scene in scenes if scene["audioStatus"] == "ready" and bool(scene.get("audioUrl"))
    )
    if image_delivery == "real":
        image_resolved_provider = image_provider_name
    elif image_delivery == "dynamic-fallback":
        image_resolved_provider = "storybook-dynamic-fallback"
    elif image_delivery == "demo-art":
        image_resolved_provider = "storybook-demo-art"
    elif image_delivery == "svg-fallback":
        image_resolved_provider = "storybook-svg-fallback"
    else:
        image_resolved_provider = f"{image_provider_name}+{_resolve_storybook_fallback_provider(image_source_kinds)}"

    return {
        "brain": {
            "reachable": True,
            "fallbackReason": None,
            "upstreamHost": None,
            "statusCode": None,
            "retryStrategy": "none",
            "elapsedMs": request_elapsed_ms,
            "timeoutMs": None,
        },
        "image": {
            "requestedProvider": _normalize_text(getattr(settings, "storybook_image_provider", "")) or "mock",
            "resolvedProvider": image_resolved_provider,
            "liveEnabled": image_live_enabled,
            "missingConfig": [] if image_live_enabled else _resolve_missing_image_config(settings),
            **_snapshot_media_channel(
                warm_job.image if warm_job else None,
                live_enabled=image_live_enabled,
                ready_scene_count=warm_job.image.ready_scene_count if warm_job else image_ready_scene_count,
                pending_scene_count=warm_job.image.pending_scene_count if warm_job else 0,
                error_scene_count=warm_job.image.error_scene_count if warm_job else 0,
                last_error_stage=warm_job.image.last_error_stage if warm_job else None,
                last_error_reason=warm_job.image.last_error_reason if warm_job else None,
            ),
        },
        "audio": {
            "requestedProvider": _normalize_text(getattr(settings, "storybook_audio_provider", "")) or "mock",
            "resolvedProvider": (
                audio_provider_name
                if audio_delivery == "real"
                else f"{audio_provider_name}+storybook-mock-preview"
                if audio_delivery == "mixed"
                else "storybook-mock-preview"
            ),
            "liveEnabled": audio_live_enabled,
            "missingConfig": [] if audio_live_enabled else _resolve_missing_audio_config(settings),
            **_snapshot_media_channel(
                warm_job.audio if warm_job else None,
                live_enabled=audio_live_enabled,
                ready_scene_count=warm_job.audio.ready_scene_count if warm_job else audio_ready_scene_count,
                pending_scene_count=warm_job.audio.pending_scene_count if warm_job else 0,
                error_scene_count=warm_job.audio.error_scene_count if warm_job else 0,
                last_error_stage=warm_job.audio.last_error_stage if warm_job else None,
                last_error_reason=warm_job.audio.last_error_reason if warm_job else None,
            ),
        },
    }


def _build_media_key(*, story_id: str, scene_index: int, audio_script: str) -> str:
    seed = "::".join([story_id, str(scene_index), audio_script[:96]])
    return f"storybook-media-{_stable_hash(seed, length=16)}"


def _build_image_media_key(*, story_id: str, scene_index: int, scene_title: str) -> str:
    seed = "::".join([story_id, str(scene_index), scene_title[:96], "image"])
    return f"storybook-media-{_stable_hash(seed, length=16)}"


def _storybook_audio_media_url(media_key: str) -> str:
    return f"/api/ai/parent-storybook/media/{media_key}"


def _store_audio_asset(
    *,
    story_id: str,
    scene_index: int,
    audio_script: str,
    voice_style: str,
    audio_result: Any,
) -> str | None:
    audio_bytes = audio_result.output.get("audioBytes")
    if not isinstance(audio_bytes, (bytes, bytearray)) or len(audio_bytes) == 0:
        return None

    media_key = _build_media_key(
        story_id=story_id,
        scene_index=scene_index,
        audio_script=audio_script,
    )
    content_type = _normalize_text(audio_result.output.get("audioContentType")) or "audio/wav"
    get_storybook_media_cache().put_audio(
        media_key,
        payload={
            "storyId": story_id,
            "sceneIndex": scene_index + 1,
            "voiceStyle": voice_style,
        },
        audio_bytes=bytes(audio_bytes),
        content_type=content_type,
    )
    return media_key


def _maybe_store_audio_asset(*, story_id: str, scene_index: int, audio_script: str, voice_style: str, audio_status: str, audio_result: Any) -> tuple[str | None, str | None]:
    audio_url = audio_result.output.get("audioUrl")
    audio_ref = _normalize_text(audio_result.output.get("audioRef")) or None
    if audio_status != "ready":
        return audio_url, audio_ref

    media_key = _build_media_key(
        story_id=story_id,
        scene_index=scene_index,
        audio_script=audio_script,
    )
    if get_storybook_media_cache().get_audio_asset(media_key):
        return _storybook_audio_media_url(media_key), media_key

    stored_media_key = _store_audio_asset(
        story_id=story_id,
        scene_index=scene_index,
        audio_script=audio_script,
        voice_style=voice_style,
        audio_result=audio_result,
    )
    if stored_media_key:
        return _storybook_audio_media_url(stored_media_key), stored_media_key
    return audio_url, audio_ref


def _resolve_audio_delivery(scenes: list[dict[str, Any]]) -> Literal["real", "mixed", "preview-only"]:
    ready_count = sum(1 for scene in scenes if scene["audioStatus"] == "ready" and scene.get("audioUrl"))
    if ready_count == 0:
        return "preview-only"
    if ready_count == len(scenes):
        return "real"
    return "mixed"


async def run_parent_storybook(payload: dict[str, Any]) -> dict[str, Any]:
    request_started_at = monotonic()
    payload_trim_started_at = request_started_at
    first_byte_payload = _resolve_storybook_first_byte_payload(payload)
    payload_trim_ms = _elapsed_ms(payload_trim_started_at)
    snapshot = _payload_get(first_byte_payload, "snapshot")
    if not isinstance(snapshot, dict):
        raise ValueError("snapshot is required")

    child = snapshot.get("child")
    if not isinstance(child, dict):
        raise ValueError("snapshot.child is required")

    child_id = _normalize_text(child.get("id")) or _normalize_text(_payload_get(first_byte_payload, "childId", "child_id")) or "storybook-guest"
    request_source = _normalize_text(_payload_get(first_byte_payload, "requestSource", "request_source")) or "parent-storybook"
    scene_build_started_at = monotonic()
    generation_mode = _resolve_generation_mode(first_byte_payload)
    highlights = _build_highlights(first_byte_payload, generation_mode)
    if not highlights:
        highlights = [
            {
                "kind": "weeklyTrend",
                "title": "成长主题",
                "detail": "先把一个小小的成长目标，讲成今晚就能开始的温柔故事。",
                "priority": 1,
                "source": "rule",
            }
        ]

    ingredients = _build_story_ingredients(first_byte_payload, snapshot, child, highlights)
    scenes_blueprint = _build_story_scenes_v2(ingredients)
    style_preset = ingredients["style_recipe"]["preset"]
    story_seed = _build_story_seed(first_byte_payload, ingredients, child_id)
    story_id = f"storybook-{_stable_hash(story_seed)}"
    generated_at = _stable_timestamp(story_seed)
    scene_build_ms = _elapsed_ms(scene_build_started_at)

    settings = get_settings()
    fallback_image_provider = MockStoryImageProvider()
    fallback_audio_provider = MockStoryAudioProvider()
    image_provider = resolve_story_image_provider(settings) if ingredients["story_mode"] == "storybook" else fallback_image_provider
    audio_provider = resolve_story_audio_provider(settings) if ingredients["story_mode"] == "storybook" else fallback_audio_provider
    image_live_enabled = _resolve_media_live_enabled(
        settings=settings,
        provider=image_provider,
        media_kind="image",
    )
    audio_live_enabled = _resolve_media_live_enabled(
        settings=settings,
        provider=audio_provider,
        media_kind="audio",
    )

    prepared_scene_requests: list[dict[str, Any]] = []
    scene_requests: list[dict[str, Any]] = []
    image_pending_scene_indices: set[int] = set()
    audio_pending_scene_indices: set[int] = set()

    for scene in scenes_blueprint:
        image_kwargs = {
            "story_mode": ingredients["story_mode"],
            "scene_index": scene["sceneIndex"] - 1,
            "child_name": ingredients["protagonist"]["label"],
            "scene_title": scene["sceneTitle"],
            "scene_text": scene["sceneText"],
            "child_id": child_id,
            "story_id": story_id,
            "class_name": ingredients["class_name"],
            "image_prompt": scene["imagePrompt"],
        }
        audio_kwargs = {
            "story_mode": ingredients["story_mode"],
            "scene_index": scene["sceneIndex"] - 1,
            "child_name": ingredients["protagonist"]["label"],
            "scene_title": scene["sceneTitle"],
            "scene_text": scene["sceneText"],
            "child_id": child_id,
            "story_id": story_id,
            "audio_script": scene["audioScript"],
            "voice_style": scene["voiceStyle"],
        }
        priority_audio_future = None
        cached_audio_result = None
        if audio_live_enabled and _is_priority_storybook_audio_scene(scene["sceneIndex"]):
            cached_audio_result = _read_cached_scene(provider=audio_provider, kwargs=audio_kwargs)
            if cached_audio_result is None:
                priority_audio_future = _submit_priority_storybook_audio_render(
                    provider=audio_provider,
                    kwargs=audio_kwargs,
                )
        prepared_scene_requests.append(
            {
                "sceneIndex": scene["sceneIndex"],
                "scene": scene,
                "image_kwargs": image_kwargs,
                "audio_kwargs": audio_kwargs,
                "cached_audio_result": cached_audio_result,
                "priority_audio_future": priority_audio_future,
            }
        )

    priority_audio_sync_deadline = (
        monotonic() + STORYBOOK_AUDIO_PRIORITY_SYNC_TIMEOUT_SECONDS
        if any(scene_request["priority_audio_future"] is not None for scene_request in prepared_scene_requests)
        else None
    )

    for scene_request in prepared_scene_requests:
        image_result, image_cache_hit = _render_cached_or_fallback(
            primary_provider=image_provider,
            fallback_provider=fallback_image_provider,
            kwargs=scene_request["image_kwargs"],
        )
        cached_audio_result = scene_request["cached_audio_result"]
        if cached_audio_result is not None:
            audio_result, audio_cache_hit = cached_audio_result, True
        else:
            remaining_audio_sync_budget = (
                max(0.0, priority_audio_sync_deadline - monotonic())
                if priority_audio_sync_deadline is not None
                else None
            )
            audio_result, audio_cache_hit = _render_cached_or_fallback(
                primary_provider=audio_provider,
                fallback_provider=fallback_audio_provider,
                kwargs=scene_request["audio_kwargs"],
                prefetched_result_future=scene_request["priority_audio_future"],
                prefetched_result_timeout_seconds=remaining_audio_sync_budget,
            )
        if image_live_enabled and not _scene_has_real_image(image_result):
            image_pending_scene_indices.add(scene_request["sceneIndex"])
        if audio_live_enabled and not _scene_has_real_audio(audio_result):
            audio_pending_scene_indices.add(scene_request["sceneIndex"])

        scene_requests.append(
            {
                "sceneIndex": scene_request["sceneIndex"],
                "scene": scene_request["scene"],
                "image_kwargs": scene_request["image_kwargs"],
                "audio_kwargs": scene_request["audio_kwargs"],
                "image_result": image_result,
                "audio_result": audio_result,
                "image_cache_hit": image_cache_hit,
                "audio_cache_hit": audio_cache_hit,
            }
        )

    warm_submit_started_at = monotonic()
    _ensure_storybook_media_warming(
        story_id=story_id,
        scene_requests=scene_requests,
        image_provider=image_provider,
        audio_provider=audio_provider,
        image_live_enabled=image_live_enabled,
        audio_live_enabled=audio_live_enabled,
        image_ready_scene_count=sum(
            1 for scene_request in scene_requests if _scene_has_real_image(scene_request["image_result"])
        ),
        audio_ready_scene_count=sum(
            1 for scene_request in scene_requests if _scene_has_real_audio(scene_request["audio_result"])
        ),
        image_pending_scene_indices=image_pending_scene_indices,
        audio_pending_scene_indices=audio_pending_scene_indices,
    )
    warm_submit_ms = _elapsed_ms(warm_submit_started_at)

    cache_hit_count = 0
    image_cache_hit_count = 0
    audio_cache_hit_count = 0
    scenes: list[dict[str, Any]] = []
    fallback_asset_build_started_at = monotonic()
    for scene_request in scene_requests:
        scene_blueprint = scene_request["scene"]
        image_result = scene_request["image_result"]
        audio_result = scene_request["audio_result"]
        image_cache_hit = scene_request["image_cache_hit"] or bool(image_result.output.get("cacheHit"))
        audio_cache_hit = scene_request["audio_cache_hit"] or bool(audio_result.output.get("cacheHit"))
        image_cache_hit_count += int(image_cache_hit)
        audio_cache_hit_count += int(audio_cache_hit)
        cache_hit_count += int(image_cache_hit) + int(audio_cache_hit)
        image_status = image_result.output.get("imageStatus", "fallback")
        audio_status = audio_result.output.get("audioStatus", "fallback")
        image_url, asset_ref, image_source_kind = _resolve_scene_image_asset(
            story_id=story_id,
            scene_blueprint=scene_blueprint,
            scene_text=scene_blueprint["sceneText"],
            image_status=image_status,
            image_result=image_result,
            ingredients=ingredients,
        )
        caption_timing = (
            audio_result.output.get("captionTiming")
            or scene_blueprint.get("captionTiming")
            or build_story_caption_timing(audio_result.output.get("audioScript") or scene_blueprint["audioScript"])
        )
        audio_url, cached_audio_ref = _maybe_store_audio_asset(
            story_id=story_id,
            scene_index=scene_blueprint["sceneIndex"] - 1,
            audio_script=audio_result.output.get("audioScript") or scene_blueprint["audioScript"],
            voice_style=audio_result.output.get("voiceStyle") or scene_blueprint["voiceStyle"],
            audio_status=audio_status,
            audio_result=audio_result,
        )
        scenes.append(
            {
                "sceneIndex": scene_blueprint["sceneIndex"],
                "sceneTitle": scene_blueprint["sceneTitle"],
                "sceneText": scene_blueprint["sceneText"],
                "imagePrompt": image_result.output.get("imagePrompt") or scene_blueprint["imagePrompt"],
                "imageUrl": image_url,
                "assetRef": asset_ref,
                "imageStatus": image_status,
                "imageSourceKind": image_source_kind,
                "audioUrl": audio_url,
                "audioRef": cached_audio_ref or audio_result.output.get("audioRef"),
                "audioScript": audio_result.output.get("audioScript") or scene_blueprint["audioScript"],
                "audioStatus": audio_status,
                "captionTiming": caption_timing,
                "voiceStyle": audio_result.output.get("voiceStyle") or scene_blueprint["voiceStyle"],
                "engineId": _normalize_text(audio_result.output.get("engineId")) or None,
                "voiceName": _normalize_text(audio_result.output.get("voiceName")) or None,
                "highlightSource": scene_blueprint["highlightSource"],
                "imageCacheHit": image_cache_hit,
                "audioCacheHit": audio_cache_hit,
            }
        )
    fallback_asset_build_ms = _elapsed_ms(fallback_asset_build_started_at)

    provider_mode = _provider_mode_from_scenes(scenes)
    if provider_mode == "live":
        fallback_reason = None
    elif provider_mode == "mixed":
        fallback_reason = "partial-media-fallback"
    elif ingredients["story_mode"] == "card":
        fallback_reason = "sparse-parent-context"
    else:
        fallback_reason = "mock-storybook-pipeline"

    image_delivery = _resolve_image_delivery([scene.get("imageSourceKind", "svg-fallback") for scene in scenes])
    diagnostics = _resolve_media_diagnostics(
        story_id=story_id,
        settings=settings,
        image_provider=image_provider,
        audio_provider=audio_provider,
        scenes=scenes,
        request_elapsed_ms=_elapsed_ms(request_started_at),
    )
    first_byte_done_ms = _elapsed_ms(request_started_at)
    logger.info(
        "parent_storybook.first_byte story_id=%s request_source=%s payload_trim_ms=%d scene_build_ms=%d warm_submit_ms=%d fallback_asset_build_ms=%d first_byte_done_ms=%d scene_count=%d cache_hit=%s cache_hit_count=%d image_cache_hit_count=%d audio_cache_hit_count=%d image_live_enabled=%s audio_live_enabled=%s image_pending_scene_count=%d audio_pending_scene_count=%d image_provider=%s audio_provider=%s live_provider_request_thread_policy=priority-sync+async-warm",
        story_id,
        request_source,
        payload_trim_ms,
        scene_build_ms,
        warm_submit_ms,
        fallback_asset_build_ms,
        first_byte_done_ms,
        len(scenes),
        cache_hit_count > 0,
        cache_hit_count,
        image_cache_hit_count,
        audio_cache_hit_count,
        image_live_enabled,
        audio_live_enabled,
        len(image_pending_scene_indices),
        len(audio_pending_scene_indices),
        getattr(image_provider, "provider_name", "storybook-asset"),
        getattr(audio_provider, "provider_name", "storybook-mock-preview"),
    )

    return {
        "storyId": story_id,
        "childId": child_id,
        "mode": ingredients["story_mode"],
        "title": _build_story_title(
            ingredients["generation_mode"],
            child_name=ingredients["child_name"],
            focus_theme=ingredients["focus_theme"],
        ),
        "summary": _build_story_summary(
            ingredients["generation_mode"],
            ingredients["story_mode"],
            child_name=ingredients["child_name"],
            focus_theme=ingredients["focus_theme"],
            page_count=ingredients["page_count"],
        ),
        "moral": _build_moral(
            protagonist_name=ingredients["protagonist"]["label"],
            focus_theme=ingredients["focus_theme"],
            summary_highlight=ingredients["summary_highlight"],
        ),
        "parentNote": ingredients["parent_note"],
        "source": "rule",
        "fallback": provider_mode != "live",
        "fallbackReason": fallback_reason,
        "generatedAt": generated_at,
        "stylePreset": style_preset,
        "providerMeta": {
            "provider": "parent-storybook-rule",
            "mode": provider_mode,
            "transport": "fastapi-brain",
            "imageProvider": _resolve_scene_image_provider_label(
                getattr(image_provider, "provider_name", "storybook-asset"),
                [str(scene.get("imageSourceKind") or "svg-fallback") for scene in scenes],
            ),
            "audioProvider": _provider_label(
                primary_name=getattr(audio_provider, "provider_name", "storybook-mock-preview"),
                fallback_name=fallback_audio_provider.provider_name,
                scenes=scenes,
                status_key="audioStatus",
            ),
            "imageDelivery": image_delivery,
            "audioDelivery": _resolve_audio_delivery(scenes),
            "stylePreset": style_preset,
            "requestSource": request_source,
            "fallbackReason": fallback_reason,
            "realProvider": provider_mode in {"live", "mixed"},
            "highlightCount": len(highlights),
            "sceneCount": len(scenes),
            "cacheHitCount": cache_hit_count,
            "cacheWindowSeconds": max(
                PROVIDER_CACHE_WINDOW_SECONDS,
                int(settings.storybook_media_cache_ttl_seconds or 0),
            ),
            "diagnostics": diagnostics,
        },
        "scenes": scenes,
    }
