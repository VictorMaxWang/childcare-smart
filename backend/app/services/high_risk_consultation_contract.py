from __future__ import annotations

from typing import Any

from app.tools.summary_tools import safe_dict, safe_list, unique_texts


def _as_text(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def _as_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes"}:
            return True
        if normalized in {"false", "0", "no"}:
            return False
    return default


def _as_string_list(value: Any, *, limit: int = 24) -> list[str]:
    return unique_texts([_as_text(item) for item in safe_list(value)], limit=limit)


def _first_list_text(value: Any) -> str:
    items = _as_string_list(value, limit=1)
    return items[0] if items else ""


def _coalesce_text(*values: Any, fallback: str = "") -> str:
    for value in values:
        text = _as_text(value)
        if text:
            return text
    return fallback


def _normalize_memory_meta(
    value: Any,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    record = safe_dict(value)
    trace_meta = safe_dict(payload.get("_memory_trace_meta")) if payload else {}

    normalized: dict[str, Any] = {
        "backend": _coalesce_text(
            record.get("backend"),
            record.get("memoryContextBackend"),
            trace_meta.get("memory_context_backend"),
            fallback="unknown",
        ),
        "degraded": _as_bool(
            record.get("degraded"),
            _as_bool(trace_meta.get("memory_context_degraded")),
        ),
        "usedSources": _as_string_list(
            record.get("usedSources")
            or record.get("used_sources")
            or trace_meta.get("memory_used_sources")
        ),
        "errors": _as_string_list(record.get("errors")),
        "matchedSnapshotIds": _as_string_list(
            record.get("matchedSnapshotIds") or record.get("matched_snapshot_ids")
        ),
        "matchedTraceIds": _as_string_list(
            record.get("matchedTraceIds") or record.get("matched_trace_ids")
        ),
    }

    matched_search_sources = _as_string_list(
        record.get("matchedSearchSources") or record.get("matched_search_sources")
    )
    if matched_search_sources:
        normalized["matchedSearchSources"] = matched_search_sources

    if "memory_context_used" in trace_meta:
        normalized["memoryContextUsed"] = _as_bool(trace_meta.get("memory_context_used"))
    if "memory_context_count" in trace_meta:
        try:
            normalized["memoryContextCount"] = int(trace_meta["memory_context_count"])
        except (TypeError, ValueError):
            pass
    if trace_meta.get("memory_context_child_ids"):
        normalized["memoryContextChildIds"] = _as_string_list(
            trace_meta.get("memory_context_child_ids")
        )

    return normalized


def _normalize_provider_trace(
    value: Any,
    result: dict[str, Any],
    *,
    brain_provider: str = "unknown",
    default_transport: str = "",
    default_transport_source: str = "",
    default_consultation_source: str = "",
    default_fallback_reason: str = "",
) -> dict[str, Any]:
    record = safe_dict(value)
    source = _coalesce_text(record.get("source"), result.get("source"), fallback="unknown")
    provider = _coalesce_text(
        record.get("provider"),
        record.get("llm"),
        result.get("provider"),
        source,
        fallback="unknown",
    )
    model = _coalesce_text(record.get("model"), result.get("model"))
    request_id = _coalesce_text(record.get("requestId"), record.get("request_id"))
    transport = _coalesce_text(record.get("transport"), default_transport)
    transport_source = _coalesce_text(
        record.get("transportSource"),
        default_transport_source,
        transport,
    )
    consultation_source = _coalesce_text(
        record.get("consultationSource"),
        default_consultation_source,
        result.get("source"),
    )
    fallback_reason = _coalesce_text(
        record.get("fallbackReason"),
        record.get("fallback_reason"),
        default_fallback_reason,
    )
    fallback = (
        _as_bool(record.get("fallback"))
        if "fallback" in record
        else source != "vivo"
    )
    real_provider = (
        _as_bool(record.get("realProvider"))
        if "realProvider" in record
        else source == "vivo" and not fallback
    )

    normalized = {
        "provider": provider,
        "source": source,
        "model": model,
        "requestId": request_id,
        "transport": transport,
        "transportSource": transport_source,
        "consultationSource": consultation_source,
        "fallbackReason": fallback_reason,
        "brainProvider": _coalesce_text(
            record.get("brainProvider"),
            brain_provider,
            fallback="unknown",
        ),
        "realProvider": real_provider,
        "fallback": fallback,
    }

    for key in ("llm", "ocr", "asr", "tts", "modes", "meta"):
        if key in record:
            normalized[key] = record[key]

    return normalized


def _normalize_participants(value: Any) -> list[dict[str, str]]:
    participants: list[dict[str, str]] = []
    for item in safe_list(value):
        record = safe_dict(item)
        participant_id = _coalesce_text(record.get("id"), fallback="unknown")
        label = _coalesce_text(record.get("label"), participant_id, fallback="unknown")
        participants.append({"id": participant_id, "label": label})
    return participants


def _normalize_coordinator_summary(result: dict[str, Any]) -> dict[str, Any]:
    record = safe_dict(result.get("coordinatorSummary"))
    summary = _coalesce_text(result.get("summary"))
    school_action = _coalesce_text(
        record.get("schoolAction"),
        _first_list_text(result.get("todayInSchoolActions")),
        result.get("schoolAction"),
        fallback="\u4eca\u5929\u5148\u8865\u9f50\u56ed\u5185\u89c2\u5bdf\u8bb0\u5f55\u3002",
    )
    home_action = _coalesce_text(
        record.get("homeAction"),
        _first_list_text(result.get("tonightAtHomeActions")),
        result.get("homeAction"),
        fallback="\u4eca\u665a\u5f62\u6210\u4e00\u6761\u660e\u786e\u7684\u5bb6\u5ead\u53cd\u9988\u3002",
    )
    observation_points = _as_string_list(
        record.get("observationPoints")
        or result.get("observationPoints")
        or result.get("nextCheckpoints")
    )
    review_in_48h = _coalesce_text(
        record.get("reviewIn48h"),
        result.get("reviewIn48h"),
        _first_list_text(result.get("followUp48h")),
    )
    should_escalate = _as_bool(
        record.get("shouldEscalateToAdmin"),
        _as_bool(result.get("shouldEscalateToAdmin")),
    )

    return {
        "finalConclusion": _coalesce_text(
            record.get("finalConclusion"),
            summary,
            fallback=summary,
        ),
        "riskLevel": _coalesce_text(
            record.get("riskLevel"),
            result.get("riskLevel"),
            fallback="medium",
        ),
        "problemDefinition": _coalesce_text(
            record.get("problemDefinition"),
            _first_list_text(result.get("keyFindings")),
            summary,
        ),
        "schoolAction": school_action,
        "homeAction": home_action,
        "observationPoints": observation_points,
        "reviewIn48h": review_in_48h,
        "shouldEscalateToAdmin": should_escalate,
    }


def _normalize_director_decision_card(
    result: dict[str, Any],
    *,
    escalation: bool,
) -> dict[str, Any]:
    record = safe_dict(result.get("directorDecisionCard"))
    recommended_owner_role = _coalesce_text(
        record.get("recommendedOwnerRole"),
        "admin" if escalation else "teacher",
    )
    recommended_owner_name = _coalesce_text(
        record.get("recommendedOwnerName"),
        "\u56ed\u957f" if recommended_owner_role == "admin" else "\u73ed\u7ea7\u8001\u5e08",
    )

    return {
        "title": _coalesce_text(
            record.get("title"),
            fallback="\u56ed\u957f\u51b3\u7b56\u5361",
        ),
        "reason": _coalesce_text(
            record.get("reason"),
            safe_dict(result.get("coordinatorSummary")).get("problemDefinition"),
            result.get("summary"),
            fallback="\u5f53\u524d\u9ad8\u98ce\u9669\u4f1a\u8bca\u9700\u8981\u7ee7\u7eed\u63a8\u8fdb\u95ed\u73af\u52a8\u4f5c\u3002",
        ),
        "recommendedOwnerRole": recommended_owner_role,
        "recommendedOwnerName": recommended_owner_name,
        "recommendedAt": _coalesce_text(record.get("recommendedAt"), fallback="today"),
        "status": _coalesce_text(record.get("status"), fallback="pending"),
    }


def _normalize_explainability(
    result: dict[str, Any],
    participants: list[dict[str, str]],
    key_findings: list[str],
    coordination_conclusion: str,
) -> list[dict[str, str]]:
    participant_labels = unique_texts([item["label"] for item in participants], limit=8)
    canonical = [
        {
            "label": "Agent \u53c2\u4e0e",
            "detail": (
                "\u3001".join(participant_labels)
                if participant_labels
                else "\u9ad8\u98ce\u9669\u4f1a\u8bca\u4e3b\u94fe\u5df2\u53c2\u4e0e\u534f\u540c\u3002"
            ),
        },
        {
            "label": "\u5173\u952e\u53d1\u73b0",
            "detail": (
                "\u3001".join(key_findings[:3])
                if key_findings
                else "\u5f53\u524d\u9700\u8981\u56f4\u7ed5\u98ce\u9669\u4fe1\u53f7\u7ee7\u7eed\u4fdd\u7559\u95ed\u73af\u89c2\u5bdf\u3002"
            ),
        },
        {
            "label": "\u534f\u8c03\u7ed3\u8bba",
            "detail": coordination_conclusion or _coalesce_text(result.get("summary")),
        },
    ]

    seen = {(item["label"], item["detail"]) for item in canonical}
    extras: list[dict[str, str]] = []
    for item in safe_list(result.get("explainability")):
        record = safe_dict(item)
        label = _coalesce_text(record.get("label"), fallback="\u8bf4\u660e")
        detail = _coalesce_text(record.get("detail"))
        if not detail:
            continue
        key = (label, detail)
        if key in seen:
            continue
        seen.add(key)
        extras.append({"label": label, "detail": detail})

    return canonical + extras


def _unique_support_refs(
    refs: list[dict[str, str] | None],
) -> list[dict[str, str]]:
    seen: set[tuple[str, str, str]] = set()
    items: list[dict[str, str]] = []

    for ref in refs:
        if not ref:
            continue
        key = (
            _coalesce_text(ref.get("type")),
            _coalesce_text(ref.get("targetId")),
            _coalesce_text(ref.get("targetLabel")),
        )
        if not key[0] or not key[1] or key in seen:
            continue
        seen.add(key)
        items.append(ref)

    return items


def _build_finding_support(kind: str, index: int, label: str) -> dict[str, str]:
    return {
        "type": "finding",
        "targetId": f"finding:{kind}:{index}",
        "targetLabel": label,
    }


def _build_action_support(kind: str, index: int, label: str) -> dict[str, str]:
    return {
        "type": "action",
        "targetId": f"action:{kind}:{index}",
        "targetLabel": label,
    }


def _build_explainability_support(index: int, label: str) -> dict[str, str]:
    return {
        "type": "explainability",
        "targetId": f"explainability:{index}",
        "targetLabel": label,
    }


def _first_action_support(
    *,
    today_in_school_actions: list[str],
    tonight_at_home_actions: list[str],
    follow_up_48h: list[str],
) -> dict[str, str] | None:
    if today_in_school_actions and today_in_school_actions[0]:
        return _build_action_support("school", 0, today_in_school_actions[0])
    if tonight_at_home_actions and tonight_at_home_actions[0]:
        return _build_action_support("home", 0, tonight_at_home_actions[0])
    if follow_up_48h and follow_up_48h[0]:
        return _build_action_support("followup", 0, follow_up_48h[0])
    return None


def _first_finding_support(key_findings: list[str]) -> dict[str, str] | None:
    if key_findings and key_findings[0]:
        return _build_finding_support("key", 0, key_findings[0])
    return None


def _build_provenance(provider_trace: dict[str, Any] | None) -> dict[str, Any] | None:
    trace = safe_dict(provider_trace)
    provenance: dict[str, Any] = {}
    for key in ("provider", "source", "model", "requestId", "transport"):
        value = trace.get(key)
        if value not in (None, ""):
            provenance[key] = value
    return provenance or None


def _resolve_evidence_category(
    source_type: str,
    supports: list[dict[str, str]],
) -> str:
    if source_type == "guardian_feedback":
        return "family_communication"
    if source_type == "trend":
        return "development_support"
    if source_type in {"memory_snapshot", "consultation_history"}:
        return "daily_care"
    if any(_coalesce_text(item.get("targetId")).startswith("action:home:") for item in supports):
        return "family_communication"
    if any(_coalesce_text(item.get("targetId")).startswith("action:followup:") for item in supports):
        return "development_support"
    if any(_coalesce_text(item.get("targetId")).startswith("action:school:") for item in supports):
        return "daily_care"
    return "risk_control"


def _build_evidence_metadata(
    *,
    source_field: str | None = None,
    provider_trace: dict[str, Any] | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    metadata: dict[str, Any] = {}
    if source_field:
        metadata["sourceField"] = source_field
    provenance = _build_provenance(provider_trace)
    if provenance:
        metadata["provenance"] = provenance
    for key, value in (extra or {}).items():
        if value in (None, ""):
            continue
        metadata[key] = value
    return metadata or None


def _build_evidence_item(
    *,
    consultation_id: str,
    source_type: str,
    bucket: str,
    index: int,
    source_label: str,
    summary: str,
    source_id: str | None = None,
    excerpt: str | None = None,
    confidence: str = "low",
    requires_human_review: bool = True,
    supports: list[dict[str, str]] | None = None,
    timestamp: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    normalized_summary = _coalesce_text(summary)
    if not normalized_summary:
        return None

    normalized_supports = _unique_support_refs(supports or [])
    return {
        "id": f"ce:{consultation_id}:{source_type}:{bucket}:{index}",
        "sourceType": source_type,
        "sourceLabel": source_label,
        "sourceId": source_id,
        "summary": normalized_summary,
        "excerpt": _coalesce_text(excerpt) or None,
        "confidence": confidence,
        "requiresHumanReview": requires_human_review,
        "evidenceCategory": _resolve_evidence_category(source_type, normalized_supports),
        "supports": normalized_supports,
        "timestamp": _coalesce_text(timestamp) or None,
        "metadata": metadata or None,
    }


def _normalize_evidence_items(value: Any) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for raw_item in safe_list(value):
        record = safe_dict(raw_item)
        source_type = _coalesce_text(record.get("sourceType"), fallback="derived_explainability")
        supports = []
        for raw_support in safe_list(record.get("supports")):
            support = safe_dict(raw_support)
            support_type = _coalesce_text(support.get("type"))
            target_id = _coalesce_text(support.get("targetId"))
            if support_type not in {"finding", "action", "explainability"} or not target_id:
                continue
            supports.append(
                {
                    "type": support_type,
                    "targetId": target_id,
                    "targetLabel": _coalesce_text(support.get("targetLabel")),
                }
            )

        normalized = _build_evidence_item(
            consultation_id="normalized",
            source_type=source_type,
            bucket="normalized",
            index=0,
            source_label=_coalesce_text(record.get("sourceLabel"), fallback="证据"),
            source_id=_coalesce_text(record.get("sourceId")) or None,
            summary=_coalesce_text(record.get("summary"), record.get("excerpt")),
            excerpt=_coalesce_text(record.get("excerpt")) or None,
            confidence=_coalesce_text(record.get("confidence"), fallback="low"),
            requires_human_review=(
                bool(record.get("requiresHumanReview"))
                if "requiresHumanReview" in record
                else True
            ),
            supports=supports,
            timestamp=_coalesce_text(record.get("timestamp")) or None,
            metadata=safe_dict(record.get("metadata")),
        )
        if not normalized:
            continue
        normalized["id"] = _coalesce_text(record.get("id"), normalized["id"])
        normalized["evidenceCategory"] = _coalesce_text(
            record.get("evidenceCategory"),
            normalized["evidenceCategory"],
            fallback="risk_control",
        )
        items.append(normalized)

    return items


def _build_consultation_evidence_items(
    *,
    consultation_id: str,
    generated_at: str,
    key_findings: list[str],
    trigger_reasons: list[str],
    today_in_school_actions: list[str],
    tonight_at_home_actions: list[str],
    follow_up_48h: list[str],
    explainability: list[dict[str, str]],
    continuity_notes: list[str],
    memory_meta: dict[str, Any] | None,
    provider_trace: dict[str, Any] | None,
    multimodal_notes: dict[str, Any] | None,
    raw_evidence_items: Any,
) -> list[dict[str, Any]]:
    existing_items = _normalize_evidence_items(raw_evidence_items)
    if existing_items:
        provenance = _build_provenance(provider_trace)
        if not provenance:
            return existing_items
        enriched_items: list[dict[str, Any]] = []
        for item in existing_items:
            metadata = safe_dict(item.get("metadata"))
            if "provenance" not in metadata:
                metadata["provenance"] = provenance
            enriched_items.append({**item, "metadata": metadata})
        return enriched_items

    items: list[dict[str, Any]] = []
    default_supports = _unique_support_refs(
        [
            _first_finding_support(key_findings),
            _first_action_support(
                today_in_school_actions=today_in_school_actions,
                tonight_at_home_actions=tonight_at_home_actions,
                follow_up_48h=follow_up_48h,
            ),
        ]
    )
    multimodal = safe_dict(multimodal_notes)
    teacher_note = _coalesce_text(multimodal.get("teacherNote"))
    voice_text = _coalesce_text(multimodal.get("voiceText"))
    image_text = _coalesce_text(multimodal.get("imageText"))

    for item in (
        _build_evidence_item(
            consultation_id=consultation_id,
            source_type="teacher_note",
            bucket="multimodal",
            index=0,
            source_label="教师补充",
            source_id="multimodalNotes.teacherNote",
            summary=teacher_note,
            excerpt=teacher_note,
            confidence="high",
            requires_human_review=False,
            supports=default_supports,
            metadata=_build_evidence_metadata(
                source_field="multimodalNotes.teacherNote",
                provider_trace=provider_trace,
            ),
        ),
        _build_evidence_item(
            consultation_id=consultation_id,
            source_type="teacher_voice",
            bucket="multimodal",
            index=1,
            source_label="教师语音转写",
            source_id="multimodalNotes.voiceText",
            summary=voice_text,
            excerpt=voice_text,
            confidence="medium",
            requires_human_review=True,
            supports=default_supports,
            metadata=_build_evidence_metadata(
                source_field="multimodalNotes.voiceText",
                provider_trace=provider_trace,
            ),
        ),
        _build_evidence_item(
            consultation_id=consultation_id,
            source_type="ocr_document",
            bucket="multimodal",
            index=2,
            source_label="OCR 文本",
            source_id="multimodalNotes.imageText",
            summary=image_text,
            excerpt=image_text,
            confidence="medium",
            requires_human_review=True,
            supports=default_supports,
            metadata=_build_evidence_metadata(
                source_field="multimodalNotes.imageText",
                provider_trace=provider_trace,
            ),
        ),
    ):
        if item:
            items.append(item)

    for index, detail in enumerate(continuity_notes):
        item = _build_evidence_item(
            consultation_id=consultation_id,
            source_type="consultation_history",
            bucket="continuity",
            index=index,
            source_label="连续性说明",
            source_id=f"continuityNotes:{index}",
            summary=detail,
            excerpt=detail,
            confidence="medium",
            requires_human_review=False,
            supports=_unique_support_refs(
                [
                    _build_finding_support("key", 0, key_findings[0] if key_findings else detail),
                    _build_action_support(
                        "followup",
                        0,
                        follow_up_48h[0]
                        if follow_up_48h
                        else today_in_school_actions[0]
                        if today_in_school_actions
                        else detail,
                    ),
                ]
            ),
            metadata=_build_evidence_metadata(
                source_field="continuityNotes",
                provider_trace=provider_trace,
            ),
        )
        if item:
            items.append(item)

    memory = safe_dict(memory_meta)
    used_sources = _as_string_list(memory.get("usedSources"), limit=4)
    matched_snapshot_ids = _as_string_list(memory.get("matchedSnapshotIds"), limit=4)
    matched_trace_ids = _as_string_list(memory.get("matchedTraceIds"), limit=4)

    memory_snapshot_summary = "；".join(
        [
            part
            for part in (
                f"命中记忆来源：{'、'.join(used_sources[:3])}" if used_sources else "",
                f"快照 {len(matched_snapshot_ids)} 条" if matched_snapshot_ids else "",
            )
            if part
        ]
    )
    memory_snapshot_item = _build_evidence_item(
        consultation_id=consultation_id,
        source_type="memory_snapshot",
        bucket="memory",
        index=0,
        source_label="记忆快照",
        source_id="memoryMeta.matchedSnapshotIds" if matched_snapshot_ids else None,
        summary=memory_snapshot_summary,
        confidence="medium",
        requires_human_review=False,
        supports=_unique_support_refs(
            [
                _first_finding_support(key_findings),
                _build_action_support(
                    "followup",
                    0,
                    follow_up_48h[0]
                    if follow_up_48h
                    else today_in_school_actions[0]
                    if today_in_school_actions
                    else "继续复核",
                ),
            ]
        ),
        metadata=_build_evidence_metadata(
            source_field="memoryMeta",
            provider_trace=provider_trace,
            extra={
                "backend": _coalesce_text(memory.get("backend")),
                "usedSources": used_sources,
                "matchedSnapshotCount": len(matched_snapshot_ids),
            },
        ),
    )
    if memory_snapshot_item:
        items.append(memory_snapshot_item)

    history_trace_item = _build_evidence_item(
        consultation_id=consultation_id,
        source_type="consultation_history",
        bucket="memory",
        index=1,
        source_label="历史会诊",
        source_id="memoryMeta.matchedTraceIds" if matched_trace_ids else None,
        summary=(
            f"命中历史会诊 trace {len(matched_trace_ids)} 条"
            if matched_trace_ids
            else ""
        ),
        confidence="medium",
        requires_human_review=False,
        supports=_unique_support_refs(
            [
                _first_finding_support(key_findings),
                _build_action_support(
                    "followup",
                    0,
                    follow_up_48h[0]
                    if follow_up_48h
                    else today_in_school_actions[0]
                    if today_in_school_actions
                    else "继续复核",
                ),
            ]
        ),
        metadata=_build_evidence_metadata(
            source_field="memoryMeta.matchedTraceIds",
            provider_trace=provider_trace,
            extra={
                "matchedTraceCount": len(matched_trace_ids),
            },
        ),
    )
    if history_trace_item:
        items.append(history_trace_item)

    for index, detail in enumerate(key_findings):
        item = _build_evidence_item(
            consultation_id=consultation_id,
            source_type="derived_explainability",
            bucket="finding",
            index=index,
            source_label="关键发现推断",
            source_id=f"finding:key:{index}",
            summary=detail,
            excerpt=detail,
            confidence="medium",
            requires_human_review=True,
            supports=[_build_finding_support("key", index, detail)],
            timestamp=generated_at,
            metadata=_build_evidence_metadata(
                source_field="keyFindings",
                provider_trace=provider_trace,
            ),
        )
        if item:
            items.append(item)

    for index, detail in enumerate(trigger_reasons):
        item = _build_evidence_item(
            consultation_id=consultation_id,
            source_type="derived_explainability",
            bucket="trigger",
            index=index,
            source_label="触发原因推断",
            source_id=f"finding:trigger:{index}",
            summary=detail,
            excerpt=detail,
            confidence="medium",
            requires_human_review=True,
            supports=[_build_finding_support("trigger", index, detail)],
            timestamp=generated_at,
            metadata=_build_evidence_metadata(
                source_field="triggerReasons",
                provider_trace=provider_trace,
            ),
        )
        if item:
            items.append(item)

    for index, detail in enumerate(explainability):
        label = _coalesce_text(detail.get("label"), fallback="说明")
        text = _coalesce_text(detail.get("detail"))
        item = _build_evidence_item(
            consultation_id=consultation_id,
            source_type="derived_explainability",
            bucket="explainability",
            index=index,
            source_label=label,
            source_id=f"explainability:{index}",
            summary=text,
            excerpt=text,
            confidence="low",
            requires_human_review=True,
            supports=_unique_support_refs(
                [
                    _build_explainability_support(index, f"{label}: {text}"),
                    _first_finding_support(key_findings) if "关键发现" in label else None,
                    _build_action_support("followup", 0, follow_up_48h[0])
                    if "协调结论" in label and follow_up_48h
                    else None,
                ]
            ),
            timestamp=generated_at,
            metadata=_build_evidence_metadata(
                source_field="explainability",
                provider_trace=provider_trace,
                extra={"explainabilityLabel": label},
            ),
        )
        if item:
            items.append(item)

    return items


def _validate_required_fields(result: dict[str, Any]) -> None:
    issues: list[str] = []

    for key in (
        "consultationId",
        "childId",
        "generatedAt",
        "riskLevel",
        "source",
        "summary",
        "parentMessageDraft",
        "reviewIn48h",
    ):
        if not _as_text(result.get(key)):
            issues.append(key)

    for key in (
        "triggerReasons",
        "keyFindings",
        "todayInSchoolActions",
        "tonightAtHomeActions",
        "followUp48h",
        "nextCheckpoints",
        "explainability",
        "evidenceItems",
    ):
        if not isinstance(result.get(key), list):
            issues.append(key)

    for key in (
        "providerTrace",
        "memoryMeta",
        "traceMeta",
        "coordinatorSummary",
        "directorDecisionCard",
        "interventionCard",
    ):
        if not safe_dict(result.get(key)):
            issues.append(key)

    if not isinstance(result.get("shouldEscalateToAdmin"), bool):
        issues.append("shouldEscalateToAdmin")

    if not safe_dict(safe_dict(result.get("traceMeta")).get("memory")):
        issues.append("traceMeta.memory")

    if issues:
        raise ValueError(
            f"normalized consultation result missing required fields: {', '.join(issues)}"
        )


def normalize_high_risk_consultation_result(
    raw_result: dict[str, Any],
    *,
    payload: dict[str, Any] | None = None,
    brain_provider: str = "unknown",
    default_transport: str = "",
    default_transport_source: str = "",
    default_consultation_source: str = "",
    default_fallback_reason: str = "",
) -> dict[str, Any]:
    result = dict(raw_result)
    participants = _normalize_participants(result.get("participants"))
    trigger_reasons = _as_string_list(result.get("triggerReasons"))
    key_findings = _as_string_list(result.get("keyFindings"))
    today_in_school_actions = _as_string_list(result.get("todayInSchoolActions"))
    tonight_at_home_actions = _as_string_list(result.get("tonightAtHomeActions"))
    follow_up_48h = _as_string_list(result.get("followUp48h"))
    next_checkpoints = _as_string_list(result.get("nextCheckpoints"))
    continuity_notes = _as_string_list(result.get("continuityNotes"))

    provider_trace = _normalize_provider_trace(
        result.get("providerTrace"),
        result,
        brain_provider=brain_provider,
        default_transport=default_transport,
        default_transport_source=default_transport_source,
        default_consultation_source=default_consultation_source,
        default_fallback_reason=default_fallback_reason,
    )
    memory_meta = _normalize_memory_meta(
        result.get("memoryMeta") or safe_dict(result.get("traceMeta")).get("memory"),
        payload,
    )
    coordinator_summary = _normalize_coordinator_summary(result)
    director_decision_card = _normalize_director_decision_card(
        result,
        escalation=coordinator_summary["shouldEscalateToAdmin"],
    )
    explainability = _normalize_explainability(
        result,
        participants,
        key_findings,
        coordinator_summary["finalConclusion"],
    )
    evidence_items = _build_consultation_evidence_items(
        consultation_id=_coalesce_text(result.get("consultationId"), fallback=""),
        generated_at=_coalesce_text(result.get("generatedAt"), fallback=""),
        key_findings=key_findings,
        trigger_reasons=trigger_reasons,
        today_in_school_actions=today_in_school_actions,
        tonight_at_home_actions=tonight_at_home_actions,
        follow_up_48h=follow_up_48h,
        explainability=explainability,
        continuity_notes=continuity_notes,
        memory_meta=memory_meta,
        provider_trace=provider_trace,
        multimodal_notes=safe_dict(result.get("multimodalNotes")),
        raw_evidence_items=result.get("evidenceItems"),
    )

    existing_trace_meta = safe_dict(result.get("traceMeta"))
    trace_meta = {
        **existing_trace_meta,
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
        "memory": memory_meta,
        "agentParticipants": [item["label"] for item in participants],
        "coordinationConclusion": coordinator_summary["finalConclusion"],
        "keyFindings": key_findings,
        "evidenceCount": len(evidence_items),
    }

    normalized = {
        **result,
        "consultationId": _coalesce_text(result.get("consultationId"), fallback=""),
        "childId": _coalesce_text(result.get("childId"), fallback=""),
        "generatedAt": _coalesce_text(result.get("generatedAt"), fallback=""),
        "riskLevel": _coalesce_text(result.get("riskLevel"), fallback="medium"),
        "source": _coalesce_text(
            result.get("source"),
            provider_trace["source"],
            fallback="mock",
        ),
        "provider": provider_trace["provider"],
        "model": provider_trace["model"],
        "realProvider": provider_trace["realProvider"],
        "fallback": provider_trace["fallback"],
        "triggerReason": _coalesce_text(
            result.get("triggerReason"),
            trigger_reasons[0] if trigger_reasons else "",
        ),
        "triggerReasons": trigger_reasons,
        "keyFindings": key_findings,
        "todayInSchoolActions": today_in_school_actions,
        "tonightAtHomeActions": tonight_at_home_actions,
        "followUp48h": follow_up_48h,
        "nextCheckpoints": next_checkpoints,
        "continuityNotes": continuity_notes,
        "evidenceItems": evidence_items,
        "participants": participants,
        "shouldEscalateToAdmin": coordinator_summary["shouldEscalateToAdmin"],
        "coordinatorSummary": coordinator_summary,
        "directorDecisionCard": director_decision_card,
        "providerTrace": provider_trace,
        "memoryMeta": memory_meta,
        "traceMeta": trace_meta,
        "explainability": explainability,
        "reviewIn48h": _coalesce_text(
            result.get("reviewIn48h"),
            coordinator_summary["reviewIn48h"],
            follow_up_48h[0] if follow_up_48h else "",
        ),
        "parentMessageDraft": _coalesce_text(
            result.get("parentMessageDraft"),
            fallback="",
        ),
    }

    _validate_required_fields(normalized)
    return normalized


def build_high_risk_done_event(
    *,
    trace_id: str,
    result: dict[str, Any] | None,
    payload: dict[str, Any] | None = None,
    brain_provider: str = "unknown",
    default_transport: str = "",
    default_transport_source: str = "",
    default_consultation_source: str = "",
    default_fallback_reason: str = "",
) -> dict[str, Any]:
    normalized_result = (
        normalize_high_risk_consultation_result(
            result,
            payload=payload,
            brain_provider=brain_provider,
            default_transport=default_transport,
            default_transport_source=default_transport_source,
            default_consultation_source=default_consultation_source,
            default_fallback_reason=default_fallback_reason,
        )
        if isinstance(result, dict)
        else None
    )

    if normalized_result is None:
        provider_trace = _normalize_provider_trace(
            {},
            {},
            brain_provider=brain_provider,
            default_transport=default_transport,
            default_transport_source=default_transport_source,
            default_consultation_source=default_consultation_source,
            default_fallback_reason=default_fallback_reason,
        )
        memory_meta = _normalize_memory_meta({}, payload)
    else:
        provider_trace = safe_dict(normalized_result.get("providerTrace"))
        memory_meta = safe_dict(normalized_result.get("memoryMeta"))

    return {
        "traceId": trace_id,
        "result": normalized_result,
        "providerTrace": provider_trace,
        "memoryMeta": memory_meta,
        "realProvider": _as_bool(provider_trace.get("realProvider")),
        "fallback": _as_bool(provider_trace.get("fallback"), default=True),
    }
