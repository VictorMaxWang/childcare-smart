from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from typing import Any

from app.core.config import Settings, get_settings
from app.providers.base import ProviderTextResult
from app.providers.mock import build_mock_high_risk_bundle
from app.providers.resolver import can_use_vivo_text_provider, resolve_text_provider
from app.services.high_risk_consultation_contract import (
    build_high_risk_done_event,
    normalize_high_risk_consultation_result,
)
from app.tools.summary_tools import first_non_empty, safe_dict, safe_list, unique_texts


logger = logging.getLogger(__name__)


def _coerce_text(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def _child_name(payload: dict[str, Any], scaffold: dict[str, Any]) -> str:
    auto_context = safe_dict(scaffold.get("autoContext"))
    child_name = _coerce_text(auto_context.get("childName"))
    if child_name:
        return child_name

    target_child_id = _coerce_text(payload.get("targetChildId"))
    for child in safe_list(payload.get("visibleChildren")):
        child_record = safe_dict(child)
        if _coerce_text(child_record.get("id")) == target_child_id:
            return _coerce_text(child_record.get("name")) or "目标儿童"

    return "目标儿童"


def _teacher_signals(payload: dict[str, Any]) -> list[str]:
    image_input = safe_dict(payload.get("imageInput"))
    voice_input = safe_dict(payload.get("voiceInput"))
    return unique_texts(
        [
            _coerce_text(payload.get("teacherNote")),
            _coerce_text(image_input.get("content")),
            _coerce_text(voice_input.get("content")),
        ],
        limit=4,
    )


def _profile_lines(profile_json: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    for key, value in profile_json.items():
        if isinstance(value, list):
            joined = "、".join(_coerce_text(item) for item in value if _coerce_text(item))
            if joined:
                lines.append(f"{key}：{joined}")
            continue
        text = _coerce_text(value)
        if text:
            lines.append(f"{key}：{text}")
    return unique_texts(lines, limit=6)


def _snapshot_summary(record: dict[str, Any]) -> str:
    snapshot_json = safe_dict(record.get("snapshot_json"))
    result = safe_dict(snapshot_json.get("result"))
    summary = first_non_empty(
        [
            _coerce_text(result.get("summary")),
            _coerce_text(safe_dict(result.get("coordinatorSummary")).get("finalConclusion")),
            _coerce_text(record.get("input_summary")),
        ],
        "",
    )
    snapshot_type = _coerce_text(record.get("snapshot_type")) or "snapshot"
    return f"{snapshot_type}：{summary}" if summary else ""


def _trace_summary(record: dict[str, Any]) -> str:
    node_name = _coerce_text(record.get("node_name")) or "trace"
    summary = first_non_empty(
        [
            _coerce_text(record.get("output_summary")),
            _coerce_text(record.get("input_summary")),
        ],
        "",
    )
    return f"{node_name}：{summary}" if summary else ""


def _memory_sections(payload: dict[str, Any], scaffold: dict[str, Any]) -> dict[str, Any]:
    memory_context = safe_dict(payload.get("memory_context"))
    prompt_context = safe_dict(memory_context.get("prompt_context"))
    profile = safe_dict(safe_dict(memory_context.get("child_profile")).get("profile_json"))
    recent_consultations = [safe_dict(item) for item in safe_list(memory_context.get("recent_consultations"))]
    recent_snapshots = [safe_dict(item) for item in safe_list(memory_context.get("recent_snapshots"))]
    relevant_traces = [safe_dict(item) for item in safe_list(memory_context.get("relevant_traces"))]
    teacher_signals = _teacher_signals(payload)

    long_term_items = unique_texts(
        [
            *[_coerce_text(item) for item in safe_list(prompt_context.get("long_term_traits"))],
            *_profile_lines(profile),
        ],
        limit=6,
    )
    recent_items = unique_texts(
        [
            *[_coerce_text(item) for item in safe_list(prompt_context.get("recent_continuity_signals"))],
            *[_coerce_text(item) for item in safe_list(prompt_context.get("last_consultation_takeaways"))],
            *[_snapshot_summary(item) for item in recent_consultations[:2]],
            *[_snapshot_summary(item) for item in recent_snapshots[:3]],
            *[_trace_summary(item) for item in relevant_traces[:3]],
        ],
        limit=6,
    )
    open_loop_items = unique_texts(
        [
            *[_coerce_text(item) for item in safe_list(prompt_context.get("open_loops"))],
            *teacher_signals,
            *[_coerce_text(item) for item in safe_list(scaffold.get("continuityNotes"))],
        ],
        limit=6,
    )

    child_name = _child_name(payload, scaffold)
    return {
        "childName": child_name,
        "teacherSignals": teacher_signals,
        "longTermItems": long_term_items or [f"{child_name} 暂无完整长期画像，先结合当前会诊信号判断。"],
        "recentItems": recent_items or [f"{child_name} 暂无最近会诊快照，优先参考本次教师发起上下文。"],
        "openLoopItems": open_loop_items or [f"{child_name} 本轮最重要的是保留 48 小时复查点并形成今晚家庭反馈。"],
    }


def _stage_text(title: str, items: list[str]) -> str:
    joined = "；".join(item for item in items if item)
    if joined:
        return f"{title}：{joined}"
    return title


def _build_narrative_prompt(payload: dict[str, Any], scaffold: dict[str, Any], sections: dict[str, Any]) -> str:
    auto_context = safe_dict(scaffold.get("autoContext"))
    teacher_signals = sections["teacherSignals"]
    return "\n".join(
        [
            "你是 SmartChildcare Agent 的高风险会诊主叙事引擎。",
            "请基于长期画像、最近会诊/快照和当前未闭环事项，输出一段适合教师端移动界面的简洁中文摘要。",
            "要求：",
            "1. 先点出儿童的长期底色。",
            "2. 再点出最近连续风险或快照变化。",
            "3. 最后给出今天最重要的一条会诊建议。",
            "4. 不要输出标题、列表或技术术语，不超过120字。",
            f"儿童：{sections['childName']}",
            f"班级：{_coerce_text(auto_context.get('className')) or '当前班级'}",
            "长期画像：",
            *[f"- {item}" for item in sections["longTermItems"]],
            "最近会诊/快照：",
            *[f"- {item}" for item in sections["recentItems"]],
            "当前未闭环事项：",
            *[f"- {item}" for item in sections["openLoopItems"]],
            "现有结构化动作：",
            *[f"- 今日园内：{item}" for item in safe_list(scaffold.get("todayInSchoolActions"))[:2]],
            *[f"- 今晚家庭：{item}" for item in safe_list(scaffold.get("tonightAtHomeActions"))[:2]],
            f"- 48小时复查：{_coerce_text(scaffold.get('reviewIn48h'))}",
            *(["教师补充："] + [f"- {item}" for item in teacher_signals] if teacher_signals else []),
            f"默认触发原因：{_coerce_text(scaffold.get('triggerReason')) or '高风险会诊'}",
        ]
    )


def _build_provider_trace(scaffold: dict[str, Any], provider_result: ProviderTextResult, settings: Settings) -> dict[str, Any]:
    existing = safe_dict(scaffold.get("providerTrace"))
    llm_mode = "real" if provider_result.source == "vivo" and not provider_result.fallback else "mock"
    model = provider_result.model or _coerce_text(safe_dict(provider_result.meta).get("attempted_model")) or settings.vivo_llm_model
    consultation_source = first_non_empty(
        [
            _coerce_text(existing.get("consultationSource")),
            _coerce_text(scaffold.get("source")),
        ],
        "",
    )
    fallback_reason = _coerce_text(safe_dict(provider_result.meta).get("reason"))
    return {
        **existing,
        "llm": provider_result.provider or "unknown-llm",
        "provider": provider_result.provider or "unknown-llm",
        "source": provider_result.source,
        "model": model,
        "requestId": provider_result.request_id,
        "transport": "fastapi-brain",
        "transportSource": "fastapi-brain",
        "consultationSource": consultation_source,
        "fallbackReason": fallback_reason,
        "brainProvider": settings.brain_provider.strip().lower(),
        "fallback": provider_result.fallback,
        "realProvider": provider_result.source == "vivo" and not provider_result.fallback,
        "meta": provider_result.meta or {},
        "modes": {
            **safe_dict(existing.get("modes")),
            "llm": llm_mode,
            "ocr": _coerce_text(safe_dict(existing.get("modes")).get("ocr")) or "unused",
            "asr": _coerce_text(safe_dict(existing.get("modes")).get("asr")) or "unused",
            "tts": _coerce_text(safe_dict(existing.get("modes")).get("tts")) or "unused",
        },
        "ocr": _coerce_text(existing.get("ocr")) or "unused",
        "asr": _coerce_text(existing.get("asr")) or "unused",
        "tts": _coerce_text(existing.get("tts")) or "unused",
    }


def _apply_narrative(
    scaffold: dict[str, Any],
    *,
    narrative: str,
    provider_result: ProviderTextResult,
    settings: Settings,
    sections: dict[str, Any],
) -> dict[str, Any]:
    provider_trace = _build_provider_trace(scaffold, provider_result, settings)
    real_provider = bool(provider_trace["realProvider"])
    result = dict(scaffold)
    result["summary"] = narrative
    result["source"] = provider_trace["source"]
    result["provider"] = provider_trace["provider"]
    result["model"] = provider_trace["model"]
    result["realProvider"] = real_provider
    result["fallback"] = bool(provider_trace["fallback"])
    result["providerTrace"] = provider_trace
    result["traceMeta"] = {
        "provider": provider_trace["provider"],
        "source": provider_trace["source"],
        "model": provider_trace["model"],
        "requestId": provider_trace["requestId"],
        "transport": provider_trace["transport"],
        "transportSource": provider_trace["transportSource"],
        "consultationSource": provider_trace["consultationSource"],
        "fallbackReason": provider_trace["fallbackReason"],
        "brainProvider": provider_trace["brainProvider"],
        "fallback": provider_trace["fallback"],
        "realProvider": provider_trace["realProvider"],
        "memory": result.get("memoryMeta"),
    }
    result["audioNarrationScript"] = narrative

    coordinator_summary = dict(safe_dict(result.get("coordinatorSummary")))
    coordinator_summary["finalConclusion"] = narrative
    coordinator_summary["problemDefinition"] = first_non_empty(
        sections["recentItems"][:1] + [_coerce_text(coordinator_summary.get("problemDefinition"))],
        narrative,
    )
    result["coordinatorSummary"] = coordinator_summary

    intervention_card = dict(safe_dict(result.get("interventionCard")))
    if intervention_card:
        intervention_card["summary"] = narrative
        intervention_card["consultationSummary"] = narrative
        intervention_card["source"] = result["source"]
        intervention_card["model"] = result["model"]
        result["interventionCard"] = intervention_card

    return result


def _enrich_multimodal_notes(payload: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    multimodal_notes = dict(safe_dict(result.get("multimodalNotes")))
    image_input = safe_dict(payload.get("imageInput"))
    voice_input = safe_dict(payload.get("voiceInput"))
    multimodal_notes["imageText"] = _coerce_text(image_input.get("content")) or _coerce_text(multimodal_notes.get("imageText"))
    multimodal_notes["voiceText"] = _coerce_text(voice_input.get("content")) or _coerce_text(multimodal_notes.get("voiceText"))
    multimodal_notes["teacherNote"] = _coerce_text(payload.get("teacherNote")) or _coerce_text(multimodal_notes.get("teacherNote"))
    result["multimodalNotes"] = multimodal_notes
    return result


def _generate_narrative(payload: dict[str, Any], scaffold: dict[str, Any], settings: Settings) -> tuple[dict[str, Any], ProviderTextResult, dict[str, Any]]:
    sections = _memory_sections(payload, scaffold)
    text_provider = resolve_text_provider(settings)
    prompt = _build_narrative_prompt(payload, scaffold, sections)
    provider_result = text_provider.summarize(prompt=prompt, fallback=_coerce_text(scaffold.get("summary")))
    narrative = first_non_empty(
        [
            _coerce_text(provider_result.text),
            _coerce_text(scaffold.get("summary")),
        ],
        "当前高风险会诊已启动，请先完成今天园内动作并在今晚形成家庭反馈。",
    )
    result = _apply_narrative(
        scaffold,
        narrative=narrative,
        provider_result=provider_result,
        settings=settings,
        sections=sections,
    )
    result = _enrich_multimodal_notes(payload, result)
    logger.info(
        "consultation.provider=%s mode=%s model=%s request_id=%s fallback=%s",
        provider_result.provider or "unknown",
        provider_result.source,
        provider_result.model or settings.vivo_llm_model,
        provider_result.request_id or "",
        provider_result.fallback,
    )
    return result, provider_result, sections


def _summary_card_payload(stage: str, title: str, *, content: str, items: list[str], provider_trace: dict[str, Any] | None = None, memory_meta: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "stage": stage,
        "cardType": "ConsultationSummaryCard",
        "data": {
            "stage": stage,
            "title": title,
            "content": content,
            "items": items,
            "providerTrace": provider_trace,
            "memoryMeta": memory_meta,
        },
    }


def _brain_provider(settings: Settings) -> str:
    return settings.brain_provider.strip().lower() or "unknown"


def _normalize_consultation_result(
    *,
    payload: dict[str, Any],
    result: dict[str, Any],
    settings: Settings,
    fallback_reason: str = "",
) -> dict[str, Any]:
    return normalize_high_risk_consultation_result(
        result,
        payload=payload,
        brain_provider=_brain_provider(settings),
        default_transport="fastapi-brain",
        default_transport_source="fastapi-brain",
        default_consultation_source=_coerce_text(result.get("source")) or "mock",
        default_fallback_reason=fallback_reason,
    )


async def run_high_risk_consultation(payload: dict[str, Any]) -> dict[str, Any]:
    settings = get_settings()
    scaffold = build_mock_high_risk_bundle({**payload, "workflow": "high-risk-consultation"})
    result, provider_result, _ = _generate_narrative(payload, scaffold, settings)
    return _normalize_consultation_result(
        payload=payload,
        result=result,
        settings=settings,
        fallback_reason=_coerce_text(safe_dict(provider_result.meta).get("reason")),
    )


async def stream_high_risk_consultation(payload: dict[str, Any], trace_id: str) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    settings = get_settings()
    scaffold = build_mock_high_risk_bundle({**payload, "workflow": "high-risk-consultation"})
    memory_meta = safe_dict(scaffold.get("memoryMeta"))
    sections = _memory_sections(payload, scaffold)
    prefers_vivo = can_use_vivo_text_provider(settings)
    provider_preview = {
        "provider": "vivo-llm" if prefers_vivo else "mock-brain",
        "source": "vivo" if prefers_vivo else "mock",
        "model": settings.vivo_llm_model,
        "transport": "fastapi-brain",
        "transportSource": "fastapi-brain",
        "consultationSource": _coerce_text(scaffold.get("source")),
        "fallbackReason": "",
        "brainProvider": settings.brain_provider.strip().lower(),
        "fallback": not prefers_vivo,
        "realProvider": prefers_vivo,
    }

    yield (
        "status",
        {
            "stage": "long_term_profile",
            "title": "长期画像",
            "message": "正在读取长期画像与权威记忆。",
            "traceId": trace_id,
            "memory": memory_meta,
        },
    )
    long_term_text = _stage_text("长期画像", sections["longTermItems"])
    yield (
        "text",
        {
            "stage": "long_term_profile",
            "title": "长期画像",
            "text": long_term_text,
            "items": sections["longTermItems"],
            "append": False,
            "source": "memory",
        },
    )
    yield (
        "ui",
        _summary_card_payload(
            "long_term_profile",
            "长期画像",
            content=long_term_text,
            items=sections["longTermItems"],
            memory_meta=memory_meta,
        ),
    )

    yield (
        "status",
        {
            "stage": "recent_context",
            "title": "最近会诊 / 最近快照",
            "message": "正在拼接最近会诊、快照和连续性信号。",
            "traceId": trace_id,
            "memory": memory_meta,
        },
    )
    recent_text = _stage_text("最近会诊 / 最近快照", sections["recentItems"])
    yield (
        "text",
        {
            "stage": "recent_context",
            "title": "最近会诊 / 最近快照",
            "text": recent_text,
            "items": sections["recentItems"],
            "append": False,
            "source": "memory",
        },
    )
    yield (
        "ui",
        _summary_card_payload(
            "recent_context",
            "最近会诊 / 最近快照",
            content=recent_text,
            items=sections["recentItems"],
            memory_meta=memory_meta,
        ),
    )

    yield (
        "status",
        {
            "stage": "current_recommendation",
            "title": "当前建议",
            "message": "正在生成当前会诊建议。",
            "traceId": trace_id,
            "providerTrace": provider_preview,
            "memory": memory_meta,
        },
    )
    result, provider_result, sections = _generate_narrative(payload, scaffold, settings)
    result = _normalize_consultation_result(
        payload=payload,
        result=result,
        settings=settings,
        fallback_reason=_coerce_text(safe_dict(provider_result.meta).get("reason")),
    )
    provider_trace = safe_dict(result.get("providerTrace"))
    memory_meta = safe_dict(result.get("memoryMeta"))
    current_text = first_non_empty(
        [
            _coerce_text(result.get("summary")),
            _stage_text("当前建议", sections["openLoopItems"]),
        ],
        "当前建议：先完成今天园内动作，再在今晚形成家庭反馈，并保留 48 小时复查。",
    )
    yield (
        "text",
        {
            "stage": "current_recommendation",
            "title": "当前建议",
            "text": current_text,
            "items": unique_texts(
                [
                    *[_coerce_text(item) for item in safe_list(result.get("todayInSchoolActions"))[:2]],
                    *[_coerce_text(item) for item in safe_list(result.get("tonightAtHomeActions"))[:2]],
                ],
                limit=4,
            ),
            "append": False,
            "source": provider_result.source,
        },
    )
    yield (
        "ui",
        {
            "stage": "current_recommendation",
            "cardType": "ConsultationSummaryCard",
            "data": {
                "stage": "current_recommendation",
                "title": "当前建议",
                "summary": _coerce_text(result.get("summary")),
                "content": current_text,
                "items": unique_texts(
                    [
                        *[_coerce_text(item) for item in safe_list(result.get("todayInSchoolActions"))[:2]],
                        *[_coerce_text(item) for item in safe_list(result.get("tonightAtHomeActions"))[:2]],
                        _coerce_text(result.get("reviewIn48h")),
                    ],
                    limit=5,
                ),
                "providerTrace": provider_trace,
                "memoryMeta": memory_meta,
            },
        },
    )
    yield (
        "ui",
        {
            "stage": "current_recommendation",
            "cardType": "FollowUp48hCard",
            "data": {
                "title": "48 小时复查",
                "items": safe_list(result.get("followUp48h")),
                "reviewIn48h": _coerce_text(result.get("reviewIn48h")),
                "providerTrace": provider_trace,
            },
        },
    )
    yield (
        "done",
        build_high_risk_done_event(
            trace_id=trace_id,
            result=result,
            payload=payload,
            brain_provider=_brain_provider(settings),
            default_transport="fastapi-brain",
            default_transport_source="fastapi-brain",
            default_consultation_source=_coerce_text(result.get("source")) or "mock",
            default_fallback_reason=_coerce_text(safe_dict(provider_result.meta).get("reason")),
        ),
    )
