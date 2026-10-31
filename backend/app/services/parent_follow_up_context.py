from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta, timezone
from typing import Any


_BUSINESS_ZONE = timezone(timedelta(hours=8))
_RECORD_FIELDS = (
    "id", "childId", "date", "submittedAt", "createdAt", "updatedAt", "recordVersion",
    "temperature", "mood", "handMouthEye", "isAbnormal", "remark", "meal", "foods", "waterMl",
    "preference", "allergyReaction", "category", "description", "needsAttention", "followUpAction",
    "reviewStatus", "status", "executionStatus", "improvementStatus", "childReaction", "notes",
    "content", "freeNote", "barriers", "tags", "relatedTaskId", "relatedConsultationId", "interventionCardId",
)
_TASK_FIELDS = (
    "taskId", "id", "childId", "targetChildId", "taskType", "ownerRole", "status", "title",
    "createdAt", "updatedAt", "dueAt", "consultationId", "relatedConsultationId", "sourceRecordIds",
    "summary", "description", "primaryAction", "whyNow", "evidence", "actionPlan", "action", "steps",
    "homeSteps", "schoolSteps", "homeActions", "schoolActions", "reviewIn48h", "tonightTopAction",
)


def _json_size(value: Any) -> int:
    return len(json.dumps(value, ensure_ascii=False))


def _bounded(value: Any, *, depth: int = 2) -> Any:
    """只投影有限深度的业务值，绝不递归携带生成回执、附件或整个历史输入。"""
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return value[:300]
    if depth <= 0:
        return None
    if isinstance(value, list):
        return [_bounded(item, depth=depth - 1) for item in value[:6]]
    if isinstance(value, dict):
        return {key: _bounded(item, depth=depth - 1) for key, item in list(value.items())[:12]}
    return None


def _project(record: Any, fields: tuple[str, ...], *, budget: int = 2_000) -> dict[str, Any]:
    if not isinstance(record, dict):
        return {}
    result: dict[str, Any] = {}
    for key in fields:
        if key not in record:
            continue
        value = _bounded(record[key])
        if _json_size({**result, key: value}) <= budget:
            result[key] = value
    return result


def _business_date(record: dict[str, Any]) -> str | None:
    raw = next((record.get(key) for key in ("date", "submittedAt", "createdAt") if record.get(key)), None)
    if not isinstance(raw, str):
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return (parsed.astimezone(_BUSINESS_ZONE) if parsed.tzinfo else parsed).date().isoformat()
    except ValueError:
        return None


def _records(values: Any, fields: tuple[str, ...], *, child_id: str, budget: int = 4_500,
             start_date: str | None = None, end_date: str | None = None, limit: int = 7) -> list[dict[str, Any]]:
    items = [value for value in values if isinstance(value, dict)] if isinstance(values, list) else []
    # 即使上层已经重建过会话scope，也不让混合历史记忆把别的儿童带入本次追问。
    items = [item for item in items if (item.get("childId") or item.get("child_id") or item.get("targetChildId") or child_id) == child_id]
    if start_date and end_date:
        items = [item for item in items if (day := _business_date(item)) and start_date <= day <= end_date]
    items.sort(key=lambda item: str(item.get("updatedAt") or item.get("submittedAt") or item.get("createdAt") or item.get("date") or ""), reverse=True)
    result: list[dict[str, Any]] = []
    for item in items[:limit]:
        projected = _project(item, fields)
        if projected and _json_size([*result, projected]) <= budget:
            result.append(projected)
    return result


def _memory_evidence(memory: Any, *, child_id: str) -> dict[str, Any]:
    if not isinstance(memory, dict) or memory.get("child_id") not in (None, child_id):
        return {}
    context = memory.get("prompt_context") if isinstance(memory.get("prompt_context"), dict) else {}
    meta = memory.get("meta") if isinstance(memory.get("meta"), dict) else {}
    snapshots: list[dict[str, Any]] = []
    seen: set[str] = set()
    for field in ("recent_snapshots", "recent_consultations"):
        values = memory.get(field) if isinstance(memory.get(field), list) else []
        for item in values:
            if not isinstance(item, dict) or item.get("child_id") not in (None, child_id):
                continue
            identity = str(item.get("id") or "")
            if not identity or identity in seen or len(snapshots) >= 5:
                continue
            seen.add(identity)
            raw = item.get("snapshot_json") if isinstance(item.get("snapshot_json"), dict) else {}
            historical = raw.get("result") if isinstance(raw.get("result"), dict) else {}
            coordinator = historical.get("coordinatorSummary") if isinstance(historical.get("coordinatorSummary"), dict) else {}
            # 旧模型结果只作为有来源的历史建议摘要；不把raw snapshot_json重新嵌入模型上下文。
            summary = historical.get("summary") or historical.get("answer") or historical.get("assistantAnswer") or coordinator.get("finalConclusion") or historical.get("title")
            snapshots.append({
                **_project(item, ("id", "snapshot_type", "created_at"), budget=500),
                "kind": "historical-agent-output",
                "summary": summary[:300] if isinstance(summary, str) else None,
            })
    traces = _records(memory.get("relevant_traces"), ("id", "trace_id", "node_name", "status", "created_at"), child_id=child_id, budget=1_000, limit=3)
    return {
        "prompt_context": {
            field: [item[:220] for item in context.get(field, [])[:4] if isinstance(item, str)]
            for field in ("long_term_traits", "recent_continuity_signals", "last_consultation_takeaways", "open_loops")
            if isinstance(context.get(field), list)
        },
        "sourceReferences": {
            field: [item[:120] for item in meta.get(field, [])[:5] if isinstance(item, str)]
            for field in ("matched_snapshot_ids", "matched_trace_ids", "matched_search_sources")
            if isinstance(meta.get(field), list)
        },
        "historicalSuggestions": snapshots,
        "traceReferences": traces,
    }


def build_parent_follow_up_context(payload: dict[str, Any], *, now: datetime | None = None) -> dict[str, Any]:
    """生成有界追问上下文；不修改可信原记录、记忆持久化或100k模型请求防线。"""
    snapshot = payload.get("snapshot") if isinstance(payload.get("snapshot"), dict) else {}
    child = snapshot.get("child") if isinstance(snapshot.get("child"), dict) else {}
    child_id = str(child.get("id") or payload.get("childId") or "")
    today = (now or datetime.now(UTC)).astimezone(_BUSINESS_ZONE).date()
    end_date, start_date = today.isoformat(), (today - timedelta(days=6)).isoformat()
    details = snapshot.get("recentDetails") if isinstance(snapshot.get("recentDetails"), dict) else {}
    result: dict[str, Any] = {
        "question": str(payload.get("question") or "")[:1_000],
        "suggestionTitle": str(payload.get("suggestionTitle") or "")[:500],
        "snapshot": {
            "child": _project(child, ("id", "name", "birthDate", "ageBand", "ageBandContext", "className", "allergies", "specialNotes"), budget=3_000),
            "summary": _project(snapshot.get("summary"), ("health", "meals", "growth", "feedback"), budget=6_000),
            "summaryScope": "all-authorized-records; recentDetails uses the explicit business-date window",
            "recentDetails": {field: _records(details.get(field), _RECORD_FIELDS, child_id=child_id, start_date=start_date, end_date=end_date) for field in ("health", "meals", "growth", "feedback")},
        },
        "evidenceWindow": {"startDate": start_date, "endDate": end_date, "timeZone": "UTC+08:00", "maxRecordsPerKind": 7},
        "latestFeedback": _project(payload.get("latestFeedback"), _RECORD_FIELDS),
        "tasks": _records(payload.get("tasks"), _TASK_FIELDS, child_id=child_id, budget=4_000, limit=5),
        "activeTask": _project(payload.get("activeTask"), _TASK_FIELDS),
        "currentInterventionCard": _project(payload.get("currentInterventionCard"), _TASK_FIELDS),
        "history": _records(payload.get("history", [])[-6:] if isinstance(payload.get("history"), list) else [], ("role", "content"), child_id=child_id, budget=2_000, limit=6),
        "memory_context": _memory_evidence(payload.get("memory_context"), child_id=child_id),
    }
    return result
