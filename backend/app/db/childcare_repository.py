from __future__ import annotations

import copy
import json
import ssl
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import parse_qs, unquote, urlsplit
from uuid import uuid4

import aiomysql

from app.db.demo_snapshot import build_demo_snapshot
from app.services.age_band_policy import resolve_age_band_context


DEFAULT_SNAPSHOT_KEYS = (
    "children",
    "attendance",
    "meals",
    "growth",
    "feedback",
    "health",
    "taskCheckIns",
    "interventionCards",
    "consultations",
    "mobileDrafts",
    "reminders",
    "tasks",
)

FEEDBACK_EXECUTION_STATUSES = {
    "not_started",
    "partial",
    "completed",
    "unable_to_execute",
}
FEEDBACK_IMPROVEMENT_STATUSES = {
    "no_change",
    "slight_improvement",
    "clear_improvement",
    "worse",
    "unknown",
}
FEEDBACK_CHILD_REACTIONS = {"resisted", "neutral", "accepted", "improved"}
FEEDBACK_EXECUTOR_ROLES = {
    "parent",
    "grandparent",
    "caregiver",
    "teacher",
    "mixed",
}
FEEDBACK_SOURCE_ROLES = {"parent", "teacher", "admin", "system", "unknown"}
LEGACY_FEEDBACK_WORKFLOWS = {"parent-agent", "teacher-agent", "manual"}


def _create_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().isoformat()


def _coerce_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _ensure_list(value: Any) -> list[Any]:
    return list(value) if isinstance(value, list) else []


def _decode_json(value: Any) -> dict[str, Any] | None:
    if value is None:
        return None
    if isinstance(value, dict):
        return copy.deepcopy(value)
    if isinstance(value, (bytes, bytearray)):
        value = value.decode("utf-8")
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        decoded = json.loads(text)
        return copy.deepcopy(decoded) if isinstance(decoded, dict) else None
    return None


def _encode_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


def _parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = _coerce_string(value)
    if not text:
        return None
    normalized = text.replace("Z", "+00:00")
    try:
        if "T" in normalized:
            parsed = datetime.fromisoformat(normalized)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        parsed = datetime.fromisoformat(f"{normalized}T00:00:00+00:00")
        return parsed
    except ValueError:
        return None


def _unique_strings(values: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = value.strip()
        if not text or text in seen:
            continue
        seen.add(text)
        result.append(text)
    return result


def _coerce_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return _unique_strings([str(item) for item in value if _coerce_string(item)])


def _coerce_positive_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and value > 0:
        return value
    if isinstance(value, float) and value > 0:
        return int(round(value))
    text = _coerce_string(value)
    if not text:
        return None
    try:
        parsed = int(float(text))
    except ValueError:
        return None
    return parsed if parsed > 0 else None


def _normalize_feedback_source_role(
    value: Any,
    *,
    created_by_role: Any = None,
    source_workflow: Any = None,
) -> str:
    direct = (_coerce_string(value) or "").lower()
    if direct in FEEDBACK_SOURCE_ROLES:
        return direct

    workflow = (_coerce_string(source_workflow) or "").lower()
    if workflow == "parent-agent":
        return "parent"
    if workflow == "teacher-agent":
        return "teacher"

    created_role = (_coerce_string(created_by_role) or "").lower()
    if "parent" in created_role:
        return "parent"
    if "teacher" in created_role:
        return "teacher"
    if "admin" in created_role or "director" in created_role:
        return "admin"
    if "system" in created_role:
        return "system"


def _normalize_feedback_source_channel(value: Any, *, source_workflow: Any = None) -> str:
    return _coerce_string(value) or _coerce_string(source_workflow) or "manual"


def _normalize_feedback_execution_status(value: Any, *, executed: Any = None) -> str:
    normalized = (_coerce_string(value) or "").lower()
    if normalized in FEEDBACK_EXECUTION_STATUSES:
        return normalized
    if executed is True:
        return "completed"
    return "not_started"


def _normalize_feedback_improvement_status(value: Any) -> str:
    if isinstance(value, bool):
        return "clear_improvement" if value else "no_change"

    normalized = (_coerce_string(value) or "").lower()
    if normalized in FEEDBACK_IMPROVEMENT_STATUSES:
        return normalized
    if normalized in {"partial", "slight"}:
        return "slight_improvement"
    if normalized in {"yes", "clear"}:
        return "clear_improvement"
    if normalized in {"no", "false"}:
        return "no_change"
    return "unknown"


def _normalize_feedback_child_reaction(value: Any, *, improvement_status: str) -> str:
    normalized = (_coerce_string(value) or "").lower()
    if normalized in FEEDBACK_CHILD_REACTIONS:
        return normalized
    if any(token in normalized for token in ("resist", "cry")):
        return "resisted"
    if any(token in normalized for token in ("accept", "cooperate")):
        return "accepted"
    if improvement_status in {"slight_improvement", "clear_improvement"} or any(
        token in normalized for token in ("improve", "better")
    ):
        return "improved"
    return "neutral"


def _normalize_feedback_executor_role(value: Any, *, source_role: str) -> str:
    normalized = (_coerce_string(value) or "").lower()
    if normalized in FEEDBACK_EXECUTOR_ROLES:
        return normalized
    if source_role == "teacher":
        return "teacher"
    if source_role == "parent":
        return "parent"
    return "mixed"


def _normalize_feedback_attachment_refs(value: Any) -> list[dict[str, Any]]:
    raw_items = value if isinstance(value, list) else ([value] if value is not None else [])
    refs: list[dict[str, Any]] = []
    for item in raw_items:
        if isinstance(item, str):
            text = _coerce_string(item)
            if text:
                refs.append({"url": text})
            continue
        if not isinstance(item, dict):
            continue
        normalized = {
            "url": _coerce_string(item.get("url")),
            "name": _coerce_string(item.get("name")),
            "mimeType": _coerce_string(item.get("mimeType")),
            "sizeBytes": item.get("sizeBytes") if isinstance(item.get("sizeBytes"), (int, float)) else None,
            "meta": copy.deepcopy(item.get("meta")) if isinstance(item.get("meta"), dict) else None,
        }
        if any(value is not None for value in normalized.values()):
            refs.append({key: value for key, value in normalized.items() if value is not None})
    return refs


def _normalize_feedback_attachments(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    voice = _normalize_feedback_attachment_refs(value.get("voice"))
    image = _normalize_feedback_attachment_refs(value.get("image"))
    attachments: dict[str, Any] = {}
    if voice:
        attachments["voice"] = voice
    if image:
        attachments["image"] = image
    return attachments


def _map_feedback_improvement_to_legacy(value: str) -> bool | str:
    if value in {"clear_improvement", "slight_improvement"}:
        return True
    if value in {"no_change", "worse"}:
        return False
    return "unknown"


def _map_feedback_execution_to_legacy(value: str, *, explicit_executed: Any) -> bool:
    if isinstance(explicit_executed, bool):
        return explicit_executed
    return value in {"completed", "partial"}


def _build_feedback_legacy_content(
    *,
    explicit_content: Any,
    notes: str,
    barriers: list[str],
    child_reaction: str,
    improvement_status: str,
    execution_status: str,
) -> str:
    explicit = _coerce_string(explicit_content)
    if explicit:
        return explicit

    parts = [notes]
    if barriers:
        parts.append(f"Barriers: {'; '.join(barriers)}")
    if child_reaction != "neutral":
        parts.append(f"Child reaction: {child_reaction}")
    if improvement_status != "unknown":
        parts.append(f"Improvement: {improvement_status}")
    parts.append(f"Execution: {execution_status}")
    return " | ".join(part for part in parts if part) or "Parent feedback recorded."


def _build_feedback_legacy_free_note(*, explicit_free_note: Any, notes: str, barriers: list[str]) -> str | None:
    explicit = _coerce_string(explicit_free_note)
    if explicit:
        return explicit
    parts = [notes] if notes else []
    if barriers:
        parts.append(f"Barriers: {'; '.join(barriers)}")
    return " | ".join(parts) or None


def _feedback_score(record: dict[str, Any]) -> int:
    attachments = record.get("attachments") if isinstance(record.get("attachments"), dict) else {}
    fields = [
        record.get("relatedTaskId"),
        record.get("relatedConsultationId"),
        record.get("executionCount"),
        record.get("notes"),
        bool(_ensure_list(record.get("barriers"))),
        bool(_ensure_list(attachments.get("voice"))),
        bool(_ensure_list(attachments.get("image"))),
        record.get("sourceChannel"),
    ]
    return sum(1 for field in fields if field)


def _feedback_timestamp(record: dict[str, Any]) -> str | None:
    return _coerce_string(record.get("submittedAt")) or _coerce_string(record.get("date"))


def _feedback_summary(record: dict[str, Any]) -> str:
    return (
        _coerce_string(record.get("notes"))
        or _coerce_string(record.get("content"))
        or _coerce_string(record.get("freeNote"))
        or "Parent feedback recorded."
    )


def _normalize_feedback_record(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None

    feedback_id = _coerce_string(value.get("feedbackId")) or _coerce_string(value.get("id"))
    child_id = _coerce_string(value.get("childId"))
    if not feedback_id or not child_id:
        return None

    created_by = _coerce_string(value.get("createdBy")) or "Unknown"
    created_by_role = _coerce_string(value.get("createdByRole")) or "unknown"
    source_role = _normalize_feedback_source_role(
        value.get("sourceRole"),
        created_by_role=created_by_role,
        source_workflow=value.get("sourceWorkflow"),
    )
    source_channel = _normalize_feedback_source_channel(
        value.get("sourceChannel"),
        source_workflow=value.get("sourceWorkflow"),
    )
    execution_status = _normalize_feedback_execution_status(
        value.get("executionStatus"),
        executed=value.get("executed"),
    )
    improvement_status = _normalize_feedback_improvement_status(
        value.get("improvementStatus") if value.get("improvementStatus") is not None else value.get("improved")
    )
    child_reaction = _normalize_feedback_child_reaction(
        value.get("childReaction"),
        improvement_status=improvement_status,
    )
    notes = (
        _coerce_string(value.get("notes"))
        or _coerce_string(value.get("freeNote"))
        or _coerce_string(value.get("content"))
        or ""
    )
    barriers = _coerce_string_list(value.get("barriers"))
    attachments = _normalize_feedback_attachments(value.get("attachments"))
    submitted_at = _coerce_string(value.get("submittedAt")) or _coerce_string(value.get("date")) or _now_iso()
    executor_role = _normalize_feedback_executor_role(value.get("executorRole"), source_role=source_role)
    execution_count = _coerce_positive_int(value.get("executionCount"))
    related_task_id = _coerce_string(value.get("relatedTaskId")) or _coerce_string(value.get("interventionCardId"))
    related_consultation_id = _coerce_string(value.get("relatedConsultationId")) or _coerce_string(value.get("consultationId"))

    source_value = value.get("source")
    if isinstance(source_value, dict):
        source = {
            "kind": _coerce_string(source_value.get("kind")) or ("structured" if value.get("feedbackId") else "legacy_guardian_feedback"),
            "workflow": _coerce_string(source_value.get("workflow")) or source_channel,
            "createdBy": _coerce_string(source_value.get("createdBy")) or created_by,
            "createdByRole": _coerce_string(source_value.get("createdByRole")) or created_by_role,
            "traceId": _coerce_string(source_value.get("traceId")),
            "meta": copy.deepcopy(source_value.get("meta")) if isinstance(source_value.get("meta"), dict) else None,
        }
    else:
        source = {
            "kind": "structured" if value.get("feedbackId") else "legacy_guardian_feedback",
            "workflow": source_channel,
            "createdBy": created_by,
            "createdByRole": created_by_role,
        }
    source = {key: item for key, item in source.items() if item is not None}

    fallback_value = value.get("fallback")
    if isinstance(fallback_value, dict):
        fallback = {
            "rawStatus": _coerce_string(fallback_value.get("rawStatus")) or _coerce_string(value.get("status")),
            "rawChildReaction": _coerce_string(fallback_value.get("rawChildReaction")) or _coerce_string(value.get("childReaction")),
            "rawImproved": fallback_value.get("rawImproved") if fallback_value.get("rawImproved") is not None else value.get("improved"),
            "rawExecutionStatus": _coerce_string(fallback_value.get("rawExecutionStatus")) or _coerce_string(value.get("executionStatus")),
            "rawInterventionCardId": _coerce_string(fallback_value.get("rawInterventionCardId")) or _coerce_string(value.get("interventionCardId")),
            "rawSourceWorkflow": _coerce_string(fallback_value.get("rawSourceWorkflow")) or _coerce_string(value.get("sourceWorkflow")),
            "notesSummary": _coerce_string(fallback_value.get("notesSummary")) or (notes[:160] if notes else None),
        }
    else:
        fallback = {
            "rawStatus": _coerce_string(value.get("status")),
            "rawChildReaction": _coerce_string(value.get("childReaction")),
            "rawImproved": value.get("improved"),
            "rawExecutionStatus": _coerce_string(value.get("executionStatus")),
            "rawInterventionCardId": _coerce_string(value.get("interventionCardId")),
            "rawSourceWorkflow": _coerce_string(value.get("sourceWorkflow")),
            "notesSummary": notes[:160] if notes else None,
        }
    fallback = {key: item for key, item in fallback.items() if item is not None}

    legacy_status = _coerce_string(value.get("status")) or execution_status
    legacy_content = _build_feedback_legacy_content(
        explicit_content=value.get("content"),
        notes=notes,
        barriers=barriers,
        child_reaction=child_reaction,
        improvement_status=improvement_status,
        execution_status=execution_status,
    )
    legacy_free_note = _build_feedback_legacy_free_note(
        explicit_free_note=value.get("freeNote"),
        notes=notes,
        barriers=barriers,
    )
    improved = (
        value.get("improved")
        if value.get("improved") in {True, False, "unknown"}
        else _map_feedback_improvement_to_legacy(improvement_status)
    )
    source_workflow = _coerce_string(value.get("sourceWorkflow"))
    if source_workflow not in LEGACY_FEEDBACK_WORKFLOWS:
        source_workflow = source_channel if source_channel in LEGACY_FEEDBACK_WORKFLOWS else "manual"

    return {
        "feedbackId": feedback_id,
        "childId": child_id,
        "sourceRole": source_role,
        "sourceChannel": source_channel,
        "relatedTaskId": related_task_id,
        "relatedConsultationId": related_consultation_id,
        "executionStatus": execution_status,
        "executionCount": execution_count,
        "executorRole": executor_role,
        "childReaction": child_reaction,
        "improvementStatus": improvement_status,
        "barriers": barriers,
        "notes": notes,
        "attachments": attachments,
        "submittedAt": submitted_at,
        "source": source,
        "fallback": fallback,
        "id": feedback_id,
        "date": _coerce_string(value.get("date")) or submitted_at,
        "status": legacy_status,
        "content": legacy_content,
        "interventionCardId": related_task_id,
        "sourceWorkflow": source_workflow,
        "executed": _map_feedback_execution_to_legacy(execution_status, explicit_executed=value.get("executed")),
        "improved": improved,
        "freeNote": legacy_free_note,
        "createdBy": created_by,
        "createdByRole": created_by_role,
    }


def _normalize_feedback_bucket(values: Any) -> list[dict[str, Any]]:
    records = _ensure_list(values)
    deduped: dict[str, dict[str, Any]] = {}
    for item in records:
        normalized = _normalize_feedback_record(item)
        if not normalized:
            continue
        key = (
            _coerce_string(normalized.get("feedbackId"))
            or _coerce_string(normalized.get("id"))
            or ":".join(
                [
                    _coerce_string(normalized.get("childId")) or "",
                    _feedback_timestamp(normalized) or "",
                    _coerce_string(normalized.get("content")) or "",
                ]
            )
        )
        existing = deduped.get(key)
        if existing is None or _feedback_score(normalized) > _feedback_score(existing):
            deduped[key] = normalized
    return list(deduped.values())


def _normalize_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    normalized = copy.deepcopy(snapshot)
    for key in DEFAULT_SNAPSHOT_KEYS:
        normalized[key] = _ensure_list(normalized.get(key))
    normalized["feedback"] = _normalize_feedback_bucket(normalized.get("feedback"))
    if not _coerce_string(normalized.get("updatedAt")):
        normalized["updatedAt"] = _now_iso()
    return normalized


def _demo_snapshot_legacy_block_unused() -> dict[str, Any]:
    return _normalize_snapshot(
        {
            "children": [
                {
                    "id": "c-8",
                    "name": "黄嘉豪",
                    "nickname": "豪豪",
                    "birthDate": "2021-08-15",
                    "gender": "male",
                    "allergies": [],
                    "heightCm": 101,
                    "weightKg": 16.8,
                    "guardians": [{"name": "黄妈妈", "phone": "13800000008"}],
                    "institutionId": "inst-demo",
                    "className": "向日葵班",
                    "specialNotes": "午睡前需要稳定过渡。",
                },
                {
                    "id": "c-11",
                    "name": "周诗雨",
                    "nickname": "诗诗",
                    "birthDate": "2021-11-03",
                    "gender": "female",
                    "allergies": [],
                    "heightCm": 99,
                    "weightKg": 15.4,
                    "guardians": [{"name": "周妈妈", "phone": "13800000011"}],
                    "institutionId": "inst-demo",
                    "className": "向日葵班",
                    "specialNotes": "偏好熟悉食物，需要鼓励尝试蔬菜。",
                },
            ],
            "attendance": [],
            "meals": [
                {
                    "id": "meal-c11-1",
                    "childId": "c-11",
                    "date": "2026-04-03",
                    "meal": "lunch",
                    "foods": ["米饭", "番茄炒蛋", "青菜"],
                    "intakeLevel": "low",
                    "preference": "dislike",
                    "waterMl": 120,
                    "nutritionScore": 66,
                    "aiEvaluation": {"summary": "偏爱鸡蛋和米饭，青菜基本未动。"},
                },
                {
                    "id": "meal-c11-2",
                    "childId": "c-11",
                    "date": "2026-04-02",
                    "meal": "lunch",
                    "foods": ["小米饭", "牛肉丸", "西兰花"],
                    "intakeLevel": "medium",
                    "preference": "dislike",
                    "waterMl": 140,
                    "nutritionScore": 70,
                    "aiEvaluation": {"summary": "只优先吃肉类，蔬菜剩余明显。"},
                },
                {
                    "id": "meal-c11-3",
                    "childId": "c-11",
                    "date": "2026-04-01",
                    "meal": "lunch",
                    "foods": ["面条", "胡萝卜", "鸡胸肉"],
                    "intakeLevel": "low",
                    "preference": "dislike",
                    "waterMl": 110,
                    "nutritionScore": 64,
                    "aiEvaluation": {"summary": "重复挑出胡萝卜，只吃面和鸡肉。"},
                },
                {
                    "id": "meal-c11-4",
                    "childId": "c-11",
                    "date": "2026-03-31",
                    "meal": "lunch",
                    "foods": ["米饭", "清蒸南瓜", "鸡腿肉"],
                    "intakeLevel": "medium",
                    "preference": "neutral",
                    "waterMl": 150,
                    "nutritionScore": 72,
                },
                {
                    "id": "meal-c11-5",
                    "childId": "c-11",
                    "date": "2026-03-30",
                    "meal": "lunch",
                    "foods": ["米饭", "菠菜豆腐", "鱼丸"],
                    "intakeLevel": "low",
                    "preference": "dislike",
                    "waterMl": 130,
                    "nutritionScore": 63,
                    "aiEvaluation": {"summary": "看到菠菜后主动回避，需要多次提醒。"},
                },
            ],
            "growth": [
                {
                    "id": "growth-c8-1",
                    "childId": "c-8",
                    "createdAt": "2026-04-03T12:35:00+08:00",
                    "recorder": "李老师",
                    "recorderRole": "teacher",
                    "category": "social-emotional",
                    "tags": ["午睡", "哭闹", "安抚"],
                    "selectedIndicators": ["情绪调节"],
                    "description": "午睡前再次出现哭闹，需要搂抱和轻声安抚 8 分钟后才入睡。",
                    "needsAttention": True,
                    "followUpAction": "连续观察午睡过渡，并和家长同步晚间睡前节律。",
                    "reviewDate": "2026-04-04",
                },
                {
                    "id": "growth-c8-2",
                    "childId": "c-8",
                    "createdAt": "2026-04-01T12:42:00+08:00",
                    "recorder": "王老师",
                    "recorderRole": "teacher",
                    "category": "social-emotional",
                    "tags": ["午睡", "分离焦虑"],
                    "selectedIndicators": ["情绪调节"],
                    "description": "午睡入场时因想妈妈哭泣，老师陪伴后逐步平静。",
                    "needsAttention": True,
                    "followUpAction": "午睡前增加固定安抚语。",
                    "reviewDate": "2026-04-02",
                },
            ],
            "feedback": [
                {
                    "id": "feedback-c8-1",
                    "childId": "c-8",
                    "date": "2026-04-02",
                    "status": "partial",
                    "content": "昨晚睡前也有些黏人，今天早上入园时说不想午睡。",
                    "sourceWorkflow": "manual",
                    "executed": True,
                    "childReaction": "睡前情绪波动明显",
                    "improved": "unknown",
                    "freeNote": "家里准备尝试更固定的睡前流程。",
                }
            ],
            "health": [
                {
                    "id": "health-c8-1",
                    "childId": "c-8",
                    "date": "2026-04-04",
                    "temperature": 36.6,
                    "mood": "午睡前紧张，出现哭闹",
                    "handMouthEye": "正常",
                    "isAbnormal": False,
                    "remark": "今日午睡前再次哭闹，需要老师陪伴安抚。",
                    "checkedBy": "陈老师",
                    "checkedByRole": "teacher",
                },
                {
                    "id": "health-c8-2",
                    "childId": "c-8",
                    "date": "2026-04-02",
                    "temperature": 36.5,
                    "mood": "入睡前焦虑，反复说想妈妈",
                    "handMouthEye": "正常",
                    "isAbnormal": False,
                    "remark": "午睡过渡偏慢，需持续陪伴。",
                    "checkedBy": "李老师",
                    "checkedByRole": "teacher",
                },
            ],
            "taskCheckIns": [],
            "interventionCards": [],
            "consultations": [],
            "mobileDrafts": [],
            "reminders": [],
            "updatedAt": _now_iso(),
        }
    )


def _build_mysql_kwargs(url: str) -> dict[str, Any]:
    parsed = urlsplit(url)
    if parsed.scheme not in {"mysql", "mysqls"}:
        raise ValueError("DATABASE_URL must use mysql:// or mysqls://")

    database = parsed.path.lstrip("/")
    if not database:
        raise ValueError("DATABASE_URL must include a database name")

    query = parse_qs(parsed.query)
    ssl_enabled = parsed.scheme == "mysqls" or query.get("ssl", ["false"])[0].lower() in {"1", "true", "yes", "required"}
    ssl_value = None
    if ssl_enabled:
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        ssl_value = context

    return {
        "host": parsed.hostname or "127.0.0.1",
        "port": parsed.port or 3306,
        "user": unquote(parsed.username or ""),
        "password": unquote(parsed.password or ""),
        "db": database,
        "charset": "utf8mb4",
        "autocommit": True,
        "connect_timeout": 5,
        "cursorclass": aiomysql.DictCursor,
        "ssl": ssl_value,
    }
# Use backend.app.db.demo_snapshot as the single live demo seed source.
def _demo_snapshot() -> dict[str, Any]:
    return _normalize_snapshot(build_demo_snapshot())


def _meal_summary(record: dict[str, Any]) -> str:
    foods = record.get("foods")
    if isinstance(foods, list):
        food_text = "、".join(str(item) for item in foods[:3])
    else:
        food_text = ""
    ai_summary = ""
    ai_evaluation = record.get("aiEvaluation")
    if isinstance(ai_evaluation, dict):
        ai_summary = _coerce_string(ai_evaluation.get("summary")) or ""
    return "；".join(part for part in [food_text, ai_summary] if part)


def _looks_like_sleep_distress(text: str) -> bool:
    keywords = ("午睡", "哭", "哭闹", "分离", "想妈妈", "安抚", "入睡")
    return any(keyword in text for keyword in keywords)


def _looks_like_picky_eating(record: dict[str, Any]) -> bool:
    preference = (_coerce_string(record.get("preference")) or "").lower()
    intake_level = (_coerce_string(record.get("intakeLevel")) or "").lower()
    summary = _meal_summary(record)
    return any(flag in preference for flag in ("dislike", "refuse", "low")) or intake_level in {
        "low",
        "poor",
    } or any(keyword in summary for keyword in ("偏", "挑", "蔬菜", "未动", "回避", "只吃"))


@dataclass(slots=True)
class ChildcareRepository:
    snapshot: dict[str, Any]
    source: str
    institution_id: str | None = None
    database_url: str | None = None
    errors: list[str] = field(default_factory=list)
    business_data_persisted: bool = False

    @classmethod
    async def create(
        cls,
        *,
        app_snapshot: dict[str, Any] | None,
        institution_id: str | None,
        database_url: str | None,
    ) -> "ChildcareRepository":
        if isinstance(app_snapshot, dict):
            return cls(
                snapshot=_normalize_snapshot(app_snapshot),
                source="request_snapshot",
                institution_id=_coerce_string(institution_id),
                database_url=_coerce_string(database_url),
            )

        normalized_institution_id = _coerce_string(institution_id)
        normalized_database_url = _coerce_string(database_url)
        if normalized_institution_id and normalized_database_url:
            remote_snapshot, errors = await cls._load_remote_snapshot(normalized_institution_id, normalized_database_url)
            if remote_snapshot:
                return cls(
                    snapshot=_normalize_snapshot(remote_snapshot),
                    source="remote_snapshot",
                    institution_id=normalized_institution_id,
                    database_url=normalized_database_url,
                    errors=errors,
                )
            return cls(
                snapshot=_demo_snapshot(),
                source="demo_snapshot",
                institution_id=normalized_institution_id,
                database_url=normalized_database_url,
                errors=errors,
            )

        return cls(snapshot=_demo_snapshot(), source="demo_snapshot")

    @staticmethod
    async def _load_remote_snapshot(institution_id: str, database_url: str) -> tuple[dict[str, Any] | None, list[str]]:
        errors: list[str] = []
        try:
            connection = await aiomysql.connect(**_build_mysql_kwargs(database_url))
            try:
                async with connection.cursor() as cursor:
                    await cursor.execute(
                        """
                        select snapshot
                        from app_state_snapshots
                        where institution_id = %s
                        limit 1
                        """,
                        (institution_id,),
                    )
                    row = await cursor.fetchone()
            finally:
                connection.close()
            if not row:
                return None, errors
            raw_snapshot = row.get("snapshot") if isinstance(row, dict) else None
            snapshot = _decode_json(raw_snapshot)
            return snapshot, errors
        except Exception as error:
            errors.append(f"remote_snapshot_load:{type(error).__name__}")
            return None, errors

    @property
    def fallback(self) -> bool:
        return self.source == "demo_snapshot"

    def get_child_by_id(self, child_id: str | None) -> dict[str, Any] | None:
        normalized_child_id = _coerce_string(child_id)
        if not normalized_child_id:
            return None
        return next(
            (
                child
                for child in self.snapshot.get("children", [])
                if isinstance(child, dict) and _coerce_string(child.get("id")) == normalized_child_id
            ),
            None,
        )

    def find_child_from_task(self, task: str) -> dict[str, Any] | None:
        text = task.strip()
        if not text:
            return None
        for child in self.snapshot.get("children", []):
            if not isinstance(child, dict):
                continue
            name = _coerce_string(child.get("name"))
            nickname = _coerce_string(child.get("nickname"))
            if name and name in text:
                return child
            if nickname and nickname in text:
                return child
        return None

    def child_summary(self, child: dict[str, Any]) -> dict[str, Any]:
        age_band_context = resolve_age_band_context(
            {
                "birthDate": _coerce_string(child.get("birthDate")),
                "ageBand": _coerce_string(child.get("ageBand")),
                "asOfDate": self.snapshot.get("updatedAt"),
            }
        )
        return {
            "childId": _coerce_string(child.get("id")),
            "name": _coerce_string(child.get("name")),
            "nickname": _coerce_string(child.get("nickname")),
            "className": _coerce_string(child.get("className")),
            "institutionId": _coerce_string(child.get("institutionId")) or self.institution_id,
            "birthDate": _coerce_string(child.get("birthDate")),
            "ageBand": _coerce_string(child.get("ageBand")),
            "normalizedAgeBand": _coerce_string(age_band_context.get("normalizedAgeBand")),
            "ageBandSource": _coerce_string(age_band_context.get("source")),
        }

    def _child_records(self, bucket: str, child_id: str) -> list[dict[str, Any]]:
        return [
            item
            for item in self.snapshot.get(bucket, [])
            if isinstance(item, dict) and _coerce_string(item.get("childId")) == child_id
        ]

    def _sort_newest(self, records: list[dict[str, Any]], *keys: str) -> list[dict[str, Any]]:
        def _sort_key(record: dict[str, Any]) -> datetime:
            for key in keys:
                parsed = _parse_datetime(record.get(key))
                if parsed is not None:
                    return parsed
            return datetime.min.replace(tzinfo=timezone.utc)

        return sorted(records, key=_sort_key, reverse=True)

    def _history_anchor(self, child_id: str) -> datetime:
        candidates: list[datetime] = []
        snapshot_updated_at = _parse_datetime(self.snapshot.get("updatedAt"))
        if snapshot_updated_at is not None:
            candidates.append(snapshot_updated_at)

        for bucket, keys in (
            ("meals", ("date",)),
            ("health", ("date",)),
            ("growth", ("createdAt", "reviewDate")),
            ("feedback", ("submittedAt", "date")),
        ):
            for record in self._child_records(bucket, child_id):
                for key in keys:
                    parsed = _parse_datetime(record.get(key))
                    if parsed is not None:
                        candidates.append(parsed)
                        break

        return max(candidates) if candidates else _now()

    def get_recent_observations(self, child_id: str, limit: int) -> list[dict[str, Any]]:
        normalized_limit = max(1, min(limit, 20))
        observations: list[dict[str, Any]] = []

        for record in self._sort_newest(self._child_records("growth", child_id), "createdAt", "reviewDate"):
            description = _coerce_string(record.get("description"))
            if not description:
                continue
            observations.append(
                {
                    "observationId": _coerce_string(record.get("id")) or _create_id("observation"),
                    "sourceType": "growth",
                    "date": _coerce_string(record.get("createdAt")) or _coerce_string(record.get("reviewDate")),
                    "observationType": _coerce_string(record.get("category")) or "growth",
                    "content": description,
                    "tags": _ensure_list(record.get("tags")),
                    "metadata": {
                        "needsAttention": bool(record.get("needsAttention")),
                        "followUpAction": _coerce_string(record.get("followUpAction")),
                    },
                }
            )

        for record in self._sort_newest(self._child_records("health", child_id), "date"):
            content = _coerce_string(record.get("remark")) or _coerce_string(record.get("mood"))
            if not content:
                continue
            observations.append(
                {
                    "observationId": _coerce_string(record.get("id")) or _create_id("observation"),
                    "sourceType": "health",
                    "date": _coerce_string(record.get("date")),
                    "observationType": "health-check",
                    "content": content,
                    "tags": _unique_strings(
                        [
                            item
                            for item in [
                                _coerce_string(record.get("mood")),
                                "异常" if bool(record.get("isAbnormal")) else "",
                            ]
                            if item
                        ]
                    ),
                    "metadata": {
                        "temperature": record.get("temperature"),
                        "handMouthEye": record.get("handMouthEye"),
                    },
                }
            )

        observations = sorted(
            observations,
            key=lambda item: _parse_datetime(item.get("date")) or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )
        return observations[:normalized_limit]

    def get_child_history(self, child_id: str, days: int) -> dict[str, Any]:
        normalized_days = max(1, min(days, 30))
        cutoff = self._history_anchor(child_id) - timedelta(days=normalized_days)

        def _recent(records: list[dict[str, Any]], *keys: str) -> list[dict[str, Any]]:
            items = []
            for record in records:
                for key in keys:
                    parsed = _parse_datetime(record.get(key))
                    if parsed and parsed >= cutoff:
                        items.append(record)
                        break
            return self._sort_newest(items, *keys)

        child = self.get_child_by_id(child_id)
        meals = _recent(self._child_records("meals", child_id), "date")
        health = _recent(self._child_records("health", child_id), "date")
        growth = _recent(self._child_records("growth", child_id), "createdAt", "reviewDate")
        feedback = _recent(self._child_records("feedback", child_id), "submittedAt", "date")

        timeline: list[dict[str, Any]] = []
        for record in meals:
            timeline.append(
                {
                    "type": "meal",
                    "date": _coerce_string(record.get("date")),
                    "summary": _meal_summary(record),
                    "recordId": _coerce_string(record.get("id")),
                }
            )
        for record in health:
            timeline.append(
                {
                    "type": "health",
                    "date": _coerce_string(record.get("date")),
                    "summary": _coerce_string(record.get("remark")) or _coerce_string(record.get("mood")),
                    "recordId": _coerce_string(record.get("id")),
                }
            )
        for record in growth:
            timeline.append(
                {
                    "type": "growth",
                    "date": _coerce_string(record.get("createdAt")) or _coerce_string(record.get("reviewDate")),
                    "summary": _coerce_string(record.get("description")),
                    "recordId": _coerce_string(record.get("id")),
                }
            )
        for record in feedback:
            timeline.append(
                {
                    "type": "feedback",
                    "date": _feedback_timestamp(record),
                    "summary": _feedback_summary(record),
                    "recordId": _coerce_string(record.get("feedbackId")) or _coerce_string(record.get("id")),
                }
            )

        timeline.sort(
            key=lambda item: _parse_datetime(item.get("date")) or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )

        sleep_signal_count = sum(
            1
            for item in timeline
            if item.get("type") in {"growth", "health", "feedback"} and _looks_like_sleep_distress(_coerce_string(item.get("summary")) or "")
        )
        picky_meal_count = sum(1 for record in meals if _looks_like_picky_eating(record))

        return {
            "child": self.child_summary(child or {"id": child_id}),
            "days": normalized_days,
            "meals": meals,
            "health": health,
            "growth": growth,
            "feedback": feedback,
            "timeline": timeline,
            "aggregates": {
                "sleepDistressSignals": sleep_signal_count,
                "pickyEatingSignals": picky_meal_count,
                "mealCount": len(meals),
                "observationCount": len(health) + len(growth),
                "feedbackCount": len(feedback),
            },
        }

    async def insert_observation(
        self,
        *,
        child_id: str,
        observation_type: str,
        content: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload = metadata or {}
        record = {
            "id": _create_id("growth"),
            "childId": child_id,
            "createdAt": _now_iso(),
            "recorder": _coerce_string(payload.get("recorder")) or "ReAct Runner",
            "recorderRole": _coerce_string(payload.get("recorderRole")) or "teacher",
            "category": _coerce_string(payload.get("category")) or "social-emotional",
            "tags": _unique_strings([observation_type, *[str(item) for item in _ensure_list(payload.get("tags"))]]),
            "selectedIndicators": _ensure_list(payload.get("selectedIndicators")),
            "description": content,
            "needsAttention": bool(payload.get("needsAttention", True)),
            "followUpAction": _coerce_string(payload.get("followUpAction")),
            "reviewDate": _coerce_string(payload.get("reviewDate")),
        }
        self.snapshot["growth"] = [record, *self.snapshot.get("growth", [])]
        self.snapshot["updatedAt"] = _now_iso()
        persisted = await self.persist_snapshot()
        return {
            "record": record,
            "persisted": persisted,
            "syncStatus": "synced" if persisted else "local_pending",
        }

    async def write_draft_record(
        self,
        *,
        child_id: str,
        draft_type: str,
        target_role: str,
        content: str,
        structured_payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        now_iso = _now_iso()
        record = {
            "draftId": _create_id("draft"),
            "childId": child_id,
            "draftType": draft_type,
            "targetRole": target_role,
            "content": content,
            "structuredPayload": structured_payload or {},
            "syncStatus": "local_pending",
            "createdAt": now_iso,
            "updatedAt": now_iso,
        }
        self.snapshot["mobileDrafts"] = [record, *self.snapshot.get("mobileDrafts", [])]
        self.snapshot["updatedAt"] = now_iso
        persisted = await self.persist_snapshot()
        if persisted:
            record["syncStatus"] = "synced"
            record["syncedAt"] = _now_iso()
            self.snapshot["mobileDrafts"][0] = record
        return {
            "record": record,
            "persisted": persisted,
        }

    async def persist_snapshot(self) -> bool:
        if not self.institution_id or not self.database_url:
            self.business_data_persisted = False
            return False

        try:
            connection = await aiomysql.connect(**_build_mysql_kwargs(self.database_url))
            try:
                async with connection.cursor() as cursor:
                    encoded_snapshot = _encode_json(self.snapshot)
                    await cursor.execute(
                        """
                        insert into app_state_snapshots (institution_id, snapshot, updated_by)
                        values (%s, %s, %s)
                        on duplicate key update
                          snapshot = values(snapshot),
                          updated_by = values(updated_by)
                        """,
                        (self.institution_id, encoded_snapshot, "brain-react-runner"),
                    )
            finally:
                connection.close()
            self.business_data_persisted = True
            return True
        except Exception as error:
            self.errors.append(f"remote_snapshot_save:{type(error).__name__}")
            self.business_data_persisted = False
            return False
