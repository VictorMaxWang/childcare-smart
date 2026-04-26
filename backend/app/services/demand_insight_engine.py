from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from statistics import mean
from typing import Any, Iterable

from app.core.config import get_settings
from app.db.childcare_repository import ChildcareRepository
from app.db.demo_snapshot import build_demo_consultation_feed_items
from app.db.repositories import RepositoryBundle
from app.services.high_risk_consultation_contract import normalize_high_risk_consultation_result
from app.tools.summary_tools import safe_dict, safe_list, unique_texts


TOPIC_RULES: tuple[dict[str, Any], ...] = (
    {
        "key": "sleep_routine",
        "label": "睡眠与午睡过渡",
        "keywords": ("午睡", "睡眠", "入睡", "睡前", "夜醒", "午休", "安睡"),
    },
    {
        "key": "emotion_transition",
        "label": "情绪安抚与入园分离",
        "keywords": ("情绪", "哭闹", "安抚", "分离", "入园", "想妈妈", "焦虑", "紧张", "崩溃"),
    },
    {
        "key": "diet_hydration",
        "label": "饮食挑食与补水",
        "keywords": ("饮食", "进食", "挑食", "蔬菜", "补水", "喝水", "营养", "水量", "食欲"),
    },
    {
        "key": "health_follow_up",
        "label": "健康异常与复查",
        "keywords": ("晨检", "发热", "体温", "咳", "不适", "复查", "健康", "异常", "药"),
    },
    {
        "key": "family_execution",
        "label": "家园协同与反馈闭环",
        "keywords": ("家长", "家庭", "反馈", "执行", "闭环", "配合", "回传", "今晚反馈", "沟通"),
    },
    {
        "key": "development_support",
        "label": "社交语言与发展观察",
        "keywords": ("语言", "表达", "社交", "互动", "发展", "精细动作", "大动作", "观察", "成长"),
    },
    {
        "key": "allergy_special_care",
        "label": "过敏与特殊照护",
        "keywords": ("过敏", "药物", "禁忌", "皮疹", "特殊照护", "食物禁忌", "allergy"),
    },
)

FAMILY_EXECUTION_FALLBACK = {
    "key": "family_execution",
    "label": "家园协同与反馈闭环",
}
HEALTH_FOLLOW_UP_FALLBACK = {
    "key": "health_follow_up",
    "label": "健康异常与复查",
}

SOURCE_LABELS = {
    "consultation_result": "会诊结果",
    "feedback_segment": "反馈分群",
    "growth_record": "成长记录",
    "guardian_feedback": "家长反馈",
    "health_record": "健康记录",
    "weekly_report": "周报摘要",
}


@dataclass(slots=True)
class TopicSignal:
    topic_key: str
    topic_label: str
    source_type: str
    source_id: str | None
    child_id: str | None
    consultation_id: str | None
    segment: str | None
    observed_at: str | None
    excerpt: str
    weight: float
    fallback: bool
    inferred: bool
    source_chain: str


@dataclass(slots=True)
class DemandInsightContext:
    repositories: RepositoryBundle
    current_repository: ChildcareRepository
    current_snapshot: dict[str, Any]
    consultation_records: list[dict[str, Any]]
    weekly_report_records: list[dict[str, Any]]
    analysis_end_date: date
    window_days: int
    limit_per_category: int
    warnings: list[str]
    consultation_fallback_used: bool

    @property
    def start_date(self) -> date:
        return self.analysis_end_date - timedelta(days=self.window_days - 1)

    @property
    def children_by_id(self) -> dict[str, dict[str, Any]]:
        return {
            _coerce_text(child.get("id")): child
            for child in safe_list(self.current_snapshot.get("children"))
            if safe_dict(child) and _coerce_text(safe_dict(child).get("id"))
        }


def _coerce_text(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def _safe_number(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _parse_datetime(value: Any) -> datetime | None:
    text = _coerce_text(value)
    if not text:
        return None
    normalized = text.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _parse_date(value: Any) -> date | None:
    parsed = _parse_datetime(value)
    if parsed is not None:
        return parsed.date()

    text = _coerce_text(value)
    if not text:
        return None
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def _date_in_window(value: Any, *, start_date: date, end_date: date) -> bool:
    parsed = _parse_date(value)
    return parsed is not None and start_date <= parsed <= end_date


def _unique_strings(value: Iterable[str], *, limit: int = 8) -> list[str]:
    return unique_texts([_coerce_text(item) for item in value], limit=limit)


def _round_score(value: float) -> float:
    return round(float(value), 1)


def _months_between(birth_date: date, today: date) -> int:
    months = (today.year - birth_date.year) * 12 + (today.month - birth_date.month)
    if today.day < birth_date.day:
        months -= 1
    return max(months, 0)


def _age_band(child: dict[str, Any], today: date) -> str | None:
    birth_date = _parse_date(child.get("birthDate"))
    if birth_date is None:
        return None
    months = _months_between(birth_date, today)
    if months < 6:
        return "0–6个月"
    if months < 12:
        return "6–12个月"
    if months < 36:
        return "1–3岁"
    if months < 72:
        return "3–6岁"
    return "6–7岁"


def _extract_texts(*values: Any) -> list[str]:
    texts: list[str] = []
    for value in values:
        if isinstance(value, list):
            texts.extend(_extract_texts(*value))
            continue
        text = _coerce_text(value)
        if text:
            texts.append(text)
    return texts


def _match_topics(text: str, *, max_topics: int = 2) -> list[dict[str, str]]:
    normalized = _coerce_text(text).lower()
    if not normalized:
        return []

    scored: list[tuple[int, str, str]] = []
    for rule in TOPIC_RULES:
        hits = sum(1 for keyword in rule["keywords"] if keyword.lower() in normalized)
        if hits <= 0:
            continue
        scored.append((hits, str(rule["key"]), str(rule["label"])))

    scored.sort(key=lambda item: (-item[0], item[2]))
    return [
        {"key": key, "label": label}
        for _, key, label in scored[:max_topics]
    ]


def _first_topics(texts: Iterable[str], *, max_topics: int = 2) -> list[dict[str, str]]:
    merged = " ".join(_extract_texts(*list(texts)))
    return _match_topics(merged, max_topics=max_topics)


def _signal_sort_key(signal: TopicSignal) -> tuple[datetime, float, str]:
    return (
        _parse_datetime(signal.observed_at) or datetime.min.replace(tzinfo=timezone.utc),
        signal.weight,
        signal.excerpt,
    )


def _build_signal(
    *,
    topic: dict[str, str],
    source_type: str,
    source_id: str | None,
    child_id: str | None,
    consultation_id: str | None,
    segment: str | None,
    observed_at: str | None,
    excerpt: str,
    weight: float,
    fallback: bool,
    inferred: bool,
    source_chain: str,
) -> TopicSignal:
    return TopicSignal(
        topic_key=topic["key"],
        topic_label=topic["label"],
        source_type=source_type,
        source_id=source_id,
        child_id=child_id,
        consultation_id=consultation_id,
        segment=segment,
        observed_at=observed_at,
        excerpt=_coerce_text(excerpt),
        weight=float(weight),
        fallback=fallback,
        inferred=inferred,
        source_chain=source_chain,
    )


def _parse_segment_label(label: str) -> tuple[str | None, str | None]:
    normalized = _coerce_text(label)
    if normalized.startswith("班级："):
        return "class", normalized.removeprefix("班级：").strip() or None
    if normalized.startswith("年龄段："):
        return "age_band", normalized.removeprefix("年龄段：").strip() or None
    return None, None


def _build_item(
    *,
    item_id: str | None = None,
    label: str,
    signals: list[TopicSignal],
    summary: str,
    count: int,
    score: float,
    topic_key: str | None = None,
    segment_type: str | None = None,
    segment_key: str | None = None,
    business_snapshot_source: str,
    child_names: dict[str, str] | None = None,
    force_confidence: str | None = None,
) -> dict[str, Any]:
    sorted_signals = sorted(signals, key=_signal_sort_key, reverse=True)
    child_names = child_names or {}
    evidence = [
        {
            "sourceType": signal.source_type,
            "label": signal.segment
            or (
                f"{SOURCE_LABELS.get(signal.source_type, signal.source_type)}｜{child_names.get(_coerce_text(signal.child_id), '')}"
                if child_names.get(_coerce_text(signal.child_id), "")
                else SOURCE_LABELS.get(signal.source_type, signal.source_type)
            ),
            "summary": signal.excerpt,
            "sourceId": signal.source_id,
            "timestamp": signal.observed_at,
            "childId": signal.child_id,
            "childName": child_names.get(_coerce_text(signal.child_id)) or None,
        }
        for signal in sorted_signals[:3]
    ]

    channels = _unique_strings(signal.source_type for signal in signals)
    fallback = any(signal.fallback for signal in signals)
    demo_only = bool(signals) and all(signal.fallback for signal in signals)
    inferred = bool(signals) and all(signal.inferred for signal in signals)
    distinct_children = len({_coerce_text(signal.child_id) for signal in signals if _coerce_text(signal.child_id)})
    multi_source = len({_coerce_text(signal.source_type) for signal in signals if _coerce_text(signal.source_type)}) >= 2
    observed_days = len({_coerce_text(signal.observed_at)[:10] for signal in signals if _coerce_text(signal.observed_at)})
    resolved_topic_key = topic_key or (signals[0].topic_key if signals else None)
    resolved_segment_type = segment_type
    resolved_segment_key = segment_key
    if resolved_segment_type is None and resolved_segment_key is None:
        resolved_segment_type, resolved_segment_key = _parse_segment_label(label)

    confidence = force_confidence or (
        "low"
        if demo_only or inferred
        else "high"
        if len(signals) >= 4 and distinct_children >= 2 and multi_source
        else "medium"
        if len(signals) >= 2
        else "low"
    )

    return {
        "id": item_id or resolved_segment_key or resolved_topic_key or label,
        "label": label,
        "topicKey": None if resolved_segment_type else resolved_topic_key,
        "segmentType": resolved_segment_type,
        "segmentKey": resolved_segment_key,
        "count": int(count),
        "score": _round_score(score),
        "summary": summary,
        "evidence": evidence,
        "source": {
            "channels": channels,
            "businessSnapshotSource": business_snapshot_source,
            "fallbackUsed": fallback,
            "demoOnly": demo_only,
        },
        "confidence": confidence,
        "coverage": {
            "records": len(signals),
            "children": distinct_children,
            "observedDays": observed_days,
        },
    }


def _child_name(context: DemandInsightContext, child_id: str | None) -> str:
    if not child_id:
        return "未知儿童"
    child = context.children_by_id.get(child_id)
    return _coerce_text(safe_dict(child).get("name")) or child_id


def _child_names_map(context: DemandInsightContext) -> dict[str, str]:
    return {
        child_id: _coerce_text(safe_dict(child).get("name")) or child_id
        for child_id, child in context.children_by_id.items()
    }


def _feedback_text(record: dict[str, Any]) -> str:
    return " ".join(
        _extract_texts(
            record.get("content"),
            record.get("childReaction"),
            record.get("freeNote"),
            record.get("status"),
            record.get("executionStatus"),
        )
    )


def _feedback_difficulty_weight(record: dict[str, Any]) -> float:
    weight = 0.0
    status_text = _coerce_text(record.get("status")).lower()
    execution_status = _coerce_text(record.get("executionStatus")).lower()
    improved = record.get("improved")

    if record.get("executed") is False or execution_status == "not_started":
        weight += 3.0
    elif execution_status == "partial" or "partial" in status_text or "部分" in status_text:
        weight += 2.0
    elif status_text:
        weight += 1.0

    if improved is False:
        weight += 2.0
    elif _coerce_text(improved).lower() in {"unknown", "partial"}:
        weight += 1.0

    return weight


def _consultation_record_from_demo_item(item: dict[str, Any]) -> dict[str, Any]:
    explainability = safe_dict(item.get("explainabilitySummary"))
    return {
        "consultationId": _coerce_text(item.get("consultationId")),
        "childId": _coerce_text(item.get("childId")),
        "generatedAt": _coerce_text(item.get("generatedAt")),
        "riskLevel": _coerce_text(item.get("riskLevel")),
        "triggerReason": _coerce_text(item.get("triggerReason")),
        "triggerReasons": _extract_texts(item.get("triggerReasons")),
        "keyFindings": _extract_texts(explainability.get("keyFindings")),
        "todayInSchoolActions": _extract_texts(item.get("todayInSchoolActions")),
        "tonightAtHomeActions": _extract_texts(item.get("tonightAtHomeActions")),
        "followUp48h": _extract_texts(item.get("followUp48h")),
        "parentMessageDraft": "",
        "providerTrace": safe_dict(item.get("providerTraceSummary")),
        "_sourceChain": "demo_consultation_feed",
        "_fallback": True,
    }


async def _load_consultation_records(
    *,
    repositories: RepositoryBundle,
    current_snapshot: dict[str, Any],
    consultation_limit: int,
    brain_provider: str,
) -> tuple[list[dict[str, Any]], bool]:
    records: list[dict[str, Any]] = []
    seen_consultation_ids: set[str] = set()

    snapshots = await repositories.list_recent_snapshots(
        limit=consultation_limit,
        snapshot_types=["consultation-result"],
    )
    for snapshot in snapshots:
        snapshot_json = snapshot.model_dump(mode="json").get("snapshot_json", {})
        raw_result = safe_dict(safe_dict(snapshot_json).get("result"))
        if not raw_result:
            continue
        try:
            normalized = normalize_high_risk_consultation_result(
                raw_result,
                brain_provider=brain_provider,
                default_transport="fastapi-brain",
                default_transport_source="fastapi-brain",
                default_consultation_source=_coerce_text(raw_result.get("source")) or "snapshot",
                default_fallback_reason=_coerce_text(safe_dict(raw_result.get("providerTrace")).get("fallbackReason")),
            )
        except ValueError:
            continue
        consultation_id = _coerce_text(normalized.get("consultationId"))
        if not consultation_id or consultation_id in seen_consultation_ids:
            continue
        seen_consultation_ids.add(consultation_id)
        normalized["_sourceChain"] = "consultation_snapshot"
        normalized["_fallback"] = bool(safe_dict(normalized.get("providerTrace")).get("fallback"))
        records.append(normalized)

    for raw in safe_list(current_snapshot.get("consultations")):
        consultation = safe_dict(raw)
        if not consultation:
            continue
        try:
            normalized = normalize_high_risk_consultation_result(
                consultation,
                brain_provider=brain_provider,
                default_transport="next-json",
                default_transport_source="current-snapshot",
                default_consultation_source="current-snapshot",
                default_fallback_reason=_coerce_text(safe_dict(consultation.get("providerTrace")).get("fallbackReason")),
            )
        except ValueError:
            continue
        consultation_id = _coerce_text(normalized.get("consultationId"))
        if not consultation_id or consultation_id in seen_consultation_ids:
            continue
        seen_consultation_ids.add(consultation_id)
        normalized["_sourceChain"] = "current_snapshot.consultations"
        normalized["_fallback"] = bool(safe_dict(normalized.get("providerTrace")).get("fallback"))
        records.append(normalized)

    if records:
        return records, False

    if current_snapshot.get("children"):
        return [], False

    return [_consultation_record_from_demo_item(item) for item in build_demo_consultation_feed_items()], True


async def _load_weekly_report_records(
    *,
    repositories: RepositoryBundle,
    limit: int = 12,
) -> list[dict[str, Any]]:
    snapshots = await repositories.list_recent_snapshots(
        limit=limit,
        snapshot_types=["weekly-report-result"],
    )
    records: list[dict[str, Any]] = []
    for snapshot in snapshots:
        snapshot_json = snapshot.model_dump(mode="json").get("snapshot_json", {})
        result = safe_dict(safe_dict(snapshot_json).get("result"))
        if not result:
            continue
        result["_sourceChain"] = "weekly_report_snapshot"
        result["_observedAt"] = snapshot.created_at.isoformat()
        records.append(result)
    return records


async def _count_recent_snapshots(
    *,
    repositories: RepositoryBundle,
    snapshot_type: str,
    limit: int = 20,
) -> int:
    snapshots = await repositories.list_recent_snapshots(limit=limit, snapshot_types=[snapshot_type])
    return len(snapshots)


def _resolve_analysis_end_date(
    *,
    today: str | None,
    current_snapshot: dict[str, Any],
    consultation_records: list[dict[str, Any]],
    weekly_report_records: list[dict[str, Any]],
) -> date:
    candidates: list[date] = []
    explicit_today = _parse_date(today)
    if explicit_today is not None:
        candidates.append(explicit_today)

    updated_at = _parse_date(current_snapshot.get("updatedAt"))
    if updated_at is not None:
        candidates.append(updated_at)

    for bucket, keys in (
        ("feedback", ("date",)),
        ("growth", ("createdAt", "reviewDate")),
        ("health", ("date",)),
        ("meals", ("date",)),
        ("taskCheckIns", ("date",)),
    ):
        for record in safe_list(current_snapshot.get(bucket)):
            item = safe_dict(record)
            for key in keys:
                parsed = _parse_date(item.get(key))
                if parsed is not None:
                    candidates.append(parsed)
                    break

    for record in consultation_records:
        parsed = _parse_date(record.get("generatedAt"))
        if parsed is not None:
            candidates.append(parsed)

    for record in weekly_report_records:
        parsed = _parse_date(record.get("_observedAt"))
        if parsed is not None:
            candidates.append(parsed)

    return max(candidates) if candidates else datetime.now(timezone.utc).date()


def _recent_snapshot_records(context: DemandInsightContext, bucket: str, *keys: str) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for record in safe_list(context.current_snapshot.get(bucket)):
        item = safe_dict(record)
        if not item:
            continue
        for key in keys:
            if _date_in_window(item.get(key), start_date=context.start_date, end_date=context.analysis_end_date):
                results.append(item)
                break
    return results


def _recent_consultation_records(context: DemandInsightContext) -> list[dict[str, Any]]:
    return [
        record
        for record in context.consultation_records
        if _date_in_window(record.get("generatedAt"), start_date=context.start_date, end_date=context.analysis_end_date)
    ]


def _recent_weekly_report_records(context: DemandInsightContext) -> list[dict[str, Any]]:
    return [
        record
        for record in context.weekly_report_records
        if _date_in_window(record.get("_observedAt"), start_date=context.start_date, end_date=context.analysis_end_date)
    ]


def _build_top_concern_topics(context: DemandInsightContext) -> list[dict[str, Any]]:
    topic_signals: dict[str, list[TopicSignal]] = defaultdict(list)
    child_names = _child_names_map(context)
    recent_feedbacks = _recent_snapshot_records(context, "feedback", "date")
    direct_feedback_count = 0

    for record in recent_feedbacks:
        child_id = _coerce_text(record.get("childId")) or None
        text = _feedback_text(record)
        topics = _first_topics([text])
        if not topics:
            continue
        direct_feedback_count += 1
        for topic in topics:
            topic_signals[topic["key"]].append(
                _build_signal(
                    topic=topic,
                    source_type="guardian_feedback",
                    source_id=_coerce_text(record.get("id")) or None,
                    child_id=child_id,
                    consultation_id=None,
                    segment=None,
                    observed_at=_coerce_text(record.get("date")) or None,
                    excerpt=text,
                    weight=3.0,
                    fallback=context.current_repository.fallback,
                    inferred=False,
                    source_chain="guardian_feedback",
                )
            )

    for consultation in _recent_consultation_records(context):
        child_id = _coerce_text(consultation.get("childId")) or None
        parent_texts = [
            *_extract_texts(consultation.get("tonightAtHomeActions")),
            _coerce_text(consultation.get("parentMessageDraft")),
        ]
        topics = _first_topics(parent_texts)
        for topic in topics:
            topic_signals[topic["key"]].append(
                _build_signal(
                    topic=topic,
                    source_type="consultation_result",
                    source_id=_coerce_text(consultation.get("consultationId")) or None,
                    child_id=child_id,
                    consultation_id=_coerce_text(consultation.get("consultationId")) or None,
                    segment=None,
                    observed_at=_coerce_text(consultation.get("generatedAt")) or None,
                    excerpt=parent_texts[0] if parent_texts else _coerce_text(consultation.get("triggerReason")),
                    weight=1.5,
                    fallback=bool(consultation.get("_fallback")),
                    inferred=True,
                    source_chain=_coerce_text(consultation.get("_sourceChain")) or "consultation_result",
                )
            )

    total_parent_signals = max(direct_feedback_count, 1)
    items: list[dict[str, Any]] = []
    for signals in topic_signals.values():
        label = signals[0].topic_label
        direct_count = sum(1 for signal in signals if signal.source_type == "guardian_feedback")
        inferred_count = len(signals) - direct_count
        summary_parts = []
        if direct_count:
            summary_parts.append(f"最近 {direct_count} 条家长反馈直接提到这一类问题")
        if inferred_count:
            summary_parts.append(f"另有 {inferred_count} 条家长动作/会诊文本提供弱推断信号")
        if not summary_parts:
            summary_parts.append("当前更多来自弱信号推断，需后续用真实家长反馈校正。")
        items.append(
            _build_item(
                item_id=signals[0].topic_key,
                label=label,
                signals=signals,
                count=len(signals),
                score=sum(signal.weight for signal in signals),
                topic_key=signals[0].topic_key,
                summary="；".join(summary_parts),
                business_snapshot_source=context.current_repository.source,
                child_names=child_names,
                force_confidence="low" if direct_count == 0 else None,
            )
        )

    items.sort(key=lambda item: (-_safe_number(item.get("score")), -int(item.get("count", 0)), item.get("label", "")))
    return items[: context.limit_per_category]


def _build_consultation_proxy_groups(context: DemandInsightContext) -> dict[str, list[TopicSignal]]:
    grouped: dict[str, list[TopicSignal]] = defaultdict(list)

    for record in _recent_snapshot_records(context, "growth", "createdAt", "reviewDate"):
        text = " ".join(_extract_texts(record.get("description"), record.get("followUpAction"), record.get("tags")))
        topics = _first_topics([text])
        for topic in topics:
            grouped[topic["key"]].append(
                _build_signal(
                    topic=topic,
                    source_type="growth_record",
                    source_id=_coerce_text(record.get("id")) or None,
                    child_id=_coerce_text(record.get("childId")) or None,
                    consultation_id=None,
                    segment=None,
                    observed_at=_coerce_text(record.get("createdAt") or record.get("reviewDate")) or None,
                    excerpt=text or "成长关注信号",
                    weight=3.0 if bool(record.get("needsAttention")) else 1.5,
                    fallback=context.current_repository.fallback,
                    inferred=True,
                    source_chain="growth_record",
                )
            )

    for record in _recent_snapshot_records(context, "health", "date"):
        text = " ".join(_extract_texts(record.get("remark"), record.get("mood")))
        topics = _first_topics([text]) or ([HEALTH_FOLLOW_UP_FALLBACK] if bool(record.get("isAbnormal")) else [])
        for topic in topics:
            grouped[topic["key"]].append(
                _build_signal(
                    topic=topic,
                    source_type="health_record",
                    source_id=_coerce_text(record.get("id")) or None,
                    child_id=_coerce_text(record.get("childId")) or None,
                    consultation_id=None,
                    segment=None,
                    observed_at=_coerce_text(record.get("date")) or None,
                    excerpt=text or "健康异常/复查信号",
                    weight=3.0 if bool(record.get("isAbnormal")) else 1.2,
                    fallback=context.current_repository.fallback,
                    inferred=True,
                    source_chain="health_record",
                )
            )

    for record in _recent_snapshot_records(context, "feedback", "date"):
        weight = _feedback_difficulty_weight(record)
        if weight <= 0:
            continue
        text = _feedback_text(record)
        topics = _first_topics([text]) or [FAMILY_EXECUTION_FALLBACK]
        for topic in topics:
            grouped[topic["key"]].append(
                _build_signal(
                    topic=topic,
                    source_type="guardian_feedback",
                    source_id=_coerce_text(record.get("id")) or None,
                    child_id=_coerce_text(record.get("childId")) or None,
                    consultation_id=None,
                    segment=None,
                    observed_at=_coerce_text(record.get("date")) or None,
                    excerpt=text or "家长反馈执行难点",
                    weight=min(weight, 3.5),
                    fallback=context.current_repository.fallback,
                    inferred=True,
                    source_chain="guardian_feedback",
                )
            )

    return grouped


def _build_consultation_trigger_heat(context: DemandInsightContext) -> list[dict[str, Any]]:
    consultation_records = _recent_consultation_records(context)
    child_names = _child_names_map(context)
    grouped: dict[str, list[TopicSignal]] = defaultdict(list)
    total_consultations = len(consultation_records)

    if not consultation_records:
        grouped = _build_consultation_proxy_groups(context)
        if not grouped:
            context.warnings.append("最近周期内没有 consultation-result 样本，consultationTriggerHeat 为空。")
            return []

        context.warnings.append("最近周期内没有 consultation-result 样本，consultationTriggerHeat 已降级为基于 growth/health/feedback 的弱信号推断。")
        items: list[dict[str, Any]] = []
        total_proxy_signals = sum(len(signals) for signals in grouped.values())
        for signals in grouped.values():
            proxy_child_count = len(
                {
                    _coerce_text(signal.child_id)
                    for signal in signals
                    if _coerce_text(signal.child_id)
                }
            )
            items.append(
                _build_item(
                    item_id=signals[0].topic_key,
                    label=signals[0].topic_label,
                    signals=signals,
                    count=proxy_child_count or len(signals),
                    score=sum(signal.weight for signal in signals),
                    topic_key=signals[0].topic_key,
                    summary=(
                        f"最近周期暂无真实 consultation-result 样本，当前依据 {len(signals)}/{max(total_proxy_signals, 1)} "
                        "条 growth/health/feedback 弱信号推断，这类问题更可能触发会诊。"
                    ),
                    business_snapshot_source=context.current_repository.source,
                    child_names=child_names,
                    force_confidence="low",
                )
            )

        items.sort(key=lambda item: (-_safe_number(item.get("score")), -int(item.get("count", 0)), item.get("label", "")))
        return items[: context.limit_per_category]

    for consultation in consultation_records:
        consultation_id = _coerce_text(consultation.get("consultationId")) or None
        child_id = _coerce_text(consultation.get("childId")) or None
        trigger_texts = [
            _coerce_text(consultation.get("triggerReason")),
            *_extract_texts(consultation.get("triggerReasons")),
            *_extract_texts(consultation.get("keyFindings")),
        ]
        topics = _first_topics(trigger_texts)
        for topic in topics:
            risk_bonus = 2.0 if _coerce_text(consultation.get("riskLevel")).lower() == "high" else 0.0
            grouped[topic["key"]].append(
                _build_signal(
                    topic=topic,
                    source_type="consultation_result",
                    source_id=consultation_id,
                    child_id=child_id,
                    consultation_id=consultation_id,
                    segment=None,
                    observed_at=_coerce_text(consultation.get("generatedAt")) or None,
                    excerpt=trigger_texts[0] if trigger_texts else _coerce_text(consultation.get("summary")),
                    weight=4.0 + risk_bonus,
                    fallback=bool(consultation.get("_fallback")),
                    inferred=False,
                    source_chain=_coerce_text(consultation.get("_sourceChain")) or "consultation_result",
                )
            )

    items: list[dict[str, Any]] = []
    for signals in grouped.values():
        consultation_count = len(
            {
                _coerce_text(signal.consultation_id)
                for signal in signals
                if _coerce_text(signal.consultation_id)
            }
        )
        high_risk_count = sum(1 for signal in signals if signal.weight >= 6.0)
        items.append(
            _build_item(
                item_id=signals[0].topic_key,
                label=signals[0].topic_label,
                signals=signals,
                count=consultation_count,
                score=sum(signal.weight for signal in signals),
                topic_key=signals[0].topic_key,
                summary=f"最近 {consultation_count}/{total_consultations} 次会诊由这一类问题触发，其中 {high_risk_count} 次属于高风险样本。",
                business_snapshot_source=context.current_repository.source,
                child_names=child_names,
            )
        )

    items.sort(key=lambda item: (-_safe_number(item.get("score")), -int(item.get("count", 0)), item.get("label", "")))
    return items[: context.limit_per_category]


def _build_action_difficulty_topics(context: DemandInsightContext) -> list[dict[str, Any]]:
    topic_signals: dict[str, list[TopicSignal]] = defaultdict(list)
    child_names = _child_names_map(context)
    recent_feedbacks = _recent_snapshot_records(context, "feedback", "date")
    intervention_cards = {
        _coerce_text(card.get("id")): safe_dict(card)
        for card in safe_list(context.current_snapshot.get("interventionCards"))
        if _coerce_text(safe_dict(card).get("id"))
    }
    latest_consultations_by_child: dict[str, dict[str, Any]] = {}
    for consultation in sorted(_recent_consultation_records(context), key=lambda item: _coerce_text(item.get("generatedAt")), reverse=True):
        child_id = _coerce_text(consultation.get("childId"))
        if child_id and child_id not in latest_consultations_by_child:
            latest_consultations_by_child[child_id] = consultation

    difficult_feedback_count = 0
    for record in recent_feedbacks:
        weight = _feedback_difficulty_weight(record)
        if weight <= 0:
            continue
        difficult_feedback_count += 1
        child_id = _coerce_text(record.get("childId")) or None
        linked_card = intervention_cards.get(_coerce_text(record.get("interventionCardId")))
        latest_consultation = latest_consultations_by_child.get(child_id or "")
        texts = [
            _feedback_text(record),
            _coerce_text(safe_dict(linked_card).get("tonightHomeAction")),
            _coerce_text(safe_dict(linked_card).get("todayInSchoolAction")),
            _coerce_text(safe_dict(latest_consultation).get("parentMessageDraft")),
            *_extract_texts(safe_dict(latest_consultation).get("tonightAtHomeActions")),
        ]
        topics = _first_topics(texts)
        if not topics:
            topics = [FAMILY_EXECUTION_FALLBACK]
        for topic in topics:
            topic_signals[topic["key"]].append(
                _build_signal(
                    topic=topic,
                    source_type="guardian_feedback",
                    source_id=_coerce_text(record.get("id")) or None,
                    child_id=child_id,
                    consultation_id=_coerce_text(safe_dict(latest_consultation).get("consultationId")) or None,
                    segment=None,
                    observed_at=_coerce_text(record.get("date")) or None,
                    excerpt=texts[0],
                    weight=weight,
                    fallback=context.current_repository.fallback,
                    inferred=False,
                    source_chain="guardian_feedback",
                )
            )

    if not topic_signals:
        return []

    items: list[dict[str, Any]] = []
    for signals in topic_signals.values():
        partial_count = len(signals)
        items.append(
            _build_item(
                item_id=signals[0].topic_key,
                label=signals[0].topic_label,
                signals=signals,
                count=partial_count,
                score=sum(signal.weight for signal in signals),
                topic_key=signals[0].topic_key,
                summary=f"最近 {partial_count} 条反馈显示这类动作存在未执行、仅部分执行或效果未明/未改善的情况。",
                business_snapshot_source=context.current_repository.source,
                child_names=child_names,
            )
        )

    items.sort(key=lambda item: (-_safe_number(item.get("score")), -int(item.get("count", 0)), item.get("label", "")))
    return items[: context.limit_per_category]


def _build_weak_feedback_segments(context: DemandInsightContext) -> list[dict[str, Any]]:
    recent_feedbacks = _recent_snapshot_records(context, "feedback", "date")
    child_names = _child_names_map(context)
    latest_feedback_by_child: dict[str, date] = {}
    for record in recent_feedbacks:
        child_id = _coerce_text(record.get("childId"))
        parsed = _parse_date(record.get("date"))
        if not child_id or parsed is None:
            continue
        current_latest = latest_feedback_by_child.get(child_id)
        if current_latest is None or parsed > current_latest:
            latest_feedback_by_child[child_id] = parsed

    segments: list[tuple[str, list[str]]] = []
    class_map: dict[str, list[str]] = defaultdict(list)
    age_map: dict[str, list[str]] = defaultdict(list)
    for child_id, child in context.children_by_id.items():
        class_name = _coerce_text(child.get("className"))
        if class_name:
            class_map[class_name].append(child_id)
        band = _age_band(child, context.analysis_end_date)
        if band:
            age_map[band].append(child_id)

    segments.extend((f"班级：{label}", child_ids) for label, child_ids in class_map.items())
    segments.extend((f"年龄段：{label}", child_ids) for label, child_ids in age_map.items())

    items: list[dict[str, Any]] = []
    for segment_label, child_ids in segments:
        if len(child_ids) < 1:
            continue
        responded = [child_id for child_id in child_ids if child_id in latest_feedback_by_child]
        missing = [child_id for child_id in child_ids if child_id not in latest_feedback_by_child]
        if not missing:
            continue

        coverage = len(responded) / len(child_ids)
        gap_days: list[int] = []
        for child_id in child_ids:
            latest = latest_feedback_by_child.get(child_id)
            if latest is None:
                gap_days.append(context.window_days)
                continue
            gap_days.append(max((context.analysis_end_date - latest).days, 0))
        average_gap = mean(gap_days) if gap_days else float(context.window_days)
        score = ((1 - coverage) * 70.0) + min(average_gap * 1.5, 20.0) + len(missing) * 4.0
        evidence_signals = [
            _build_signal(
                topic=FAMILY_EXECUTION_FALLBACK,
                source_type="feedback_segment",
                source_id=None,
                child_id=child_id,
                consultation_id=None,
                segment=segment_label,
                observed_at=latest_feedback_by_child.get(child_id).isoformat() if latest_feedback_by_child.get(child_id) else None,
                excerpt=(
                    f"{_child_name(context, child_id)} 最近 {context.window_days} 天无反馈"
                    if child_id in missing
                    else f"{_child_name(context, child_id)} 最近反馈日期为 {latest_feedback_by_child[child_id].isoformat()}"
                ),
                weight=1.0,
                fallback=context.current_repository.fallback,
                inferred=False,
                source_chain="children+guardian_feedback",
            )
            for child_id in [*missing[:2], *responded[:1]]
        ]
        items.append(
            _build_item(
                item_id=segment_label,
                label=segment_label,
                signals=evidence_signals,
                count=len(missing),
                score=score,
                summary=f"最近 {context.window_days} 天仅有 {len(responded)}/{len(child_ids)} 名儿童形成反馈，{len(missing)} 名儿童仍缺少近期反馈。",
                business_snapshot_source=context.current_repository.source,
                child_names=child_names,
                force_confidence="low" if context.current_repository.fallback else "medium" if len(child_ids) < 3 else "high",
            )
        )

    items.sort(key=lambda item: (-_safe_number(item.get("score")), -int(item.get("count", 0)), item.get("label", "")))
    return items[: context.limit_per_category]


def _build_recurring_issue_clusters(context: DemandInsightContext) -> list[dict[str, Any]]:
    grouped: dict[str, list[TopicSignal]] = defaultdict(list)
    child_names = _child_names_map(context)

    for record in _recent_snapshot_records(context, "growth", "createdAt", "reviewDate"):
        child_id = _coerce_text(record.get("childId")) or None
        text = " ".join(_extract_texts(record.get("description"), record.get("followUpAction"), record.get("tags")))
        topics = _first_topics([text])
        for topic in topics:
            grouped[topic["key"]].append(
                _build_signal(
                    topic=topic,
                    source_type="growth_record",
                    source_id=_coerce_text(record.get("id")) or None,
                    child_id=child_id,
                    consultation_id=None,
                    segment=None,
                    observed_at=_coerce_text(record.get("createdAt") or record.get("reviewDate")) or None,
                    excerpt=text,
                    weight=2.0 if bool(record.get("needsAttention")) else 1.0,
                    fallback=context.current_repository.fallback,
                    inferred=False,
                    source_chain="growth_record",
                )
            )

    for record in _recent_snapshot_records(context, "health", "date"):
        child_id = _coerce_text(record.get("childId")) or None
        text = " ".join(_extract_texts(record.get("remark"), record.get("mood")))
        topics = _first_topics([text]) or ([HEALTH_FOLLOW_UP_FALLBACK] if bool(record.get("isAbnormal")) else [])
        for topic in topics:
            grouped[topic["key"]].append(
                _build_signal(
                    topic=topic,
                    source_type="health_record",
                    source_id=_coerce_text(record.get("id")) or None,
                    child_id=child_id,
                    consultation_id=None,
                    segment=None,
                    observed_at=_coerce_text(record.get("date")) or None,
                    excerpt=text or "健康异常/复查信号",
                    weight=2.5 if bool(record.get("isAbnormal")) else 1.0,
                    fallback=context.current_repository.fallback,
                    inferred=False,
                    source_chain="health_record",
                )
            )

    for record in _recent_snapshot_records(context, "feedback", "date"):
        child_id = _coerce_text(record.get("childId")) or None
        text = _feedback_text(record)
        topics = _first_topics([text])
        for topic in topics:
            grouped[topic["key"]].append(
                _build_signal(
                    topic=topic,
                    source_type="guardian_feedback",
                    source_id=_coerce_text(record.get("id")) or None,
                    child_id=child_id,
                    consultation_id=None,
                    segment=None,
                    observed_at=_coerce_text(record.get("date")) or None,
                    excerpt=text,
                    weight=1.5,
                    fallback=context.current_repository.fallback,
                    inferred=False,
                    source_chain="guardian_feedback",
                )
            )

    for consultation in _recent_consultation_records(context):
        child_id = _coerce_text(consultation.get("childId")) or None
        consultation_id = _coerce_text(consultation.get("consultationId")) or None
        text = " ".join(
            _extract_texts(
                consultation.get("triggerReason"),
                consultation.get("triggerReasons"),
                consultation.get("keyFindings"),
            )
        )
        topics = _first_topics([text])
        for topic in topics:
            grouped[topic["key"]].append(
                _build_signal(
                    topic=topic,
                    source_type="consultation_result",
                    source_id=consultation_id,
                    child_id=child_id,
                    consultation_id=consultation_id,
                    segment=None,
                    observed_at=_coerce_text(consultation.get("generatedAt")) or None,
                    excerpt=text,
                    weight=3.0,
                    fallback=bool(consultation.get("_fallback")),
                    inferred=False,
                    source_chain=_coerce_text(consultation.get("_sourceChain")) or "consultation_result",
                )
            )

    for report in _recent_weekly_report_records(context):
        report_texts = [
            *_extract_texts(report.get("risks")),
            *_extract_texts(report.get("highlights")),
        ]
        for section in safe_list(report.get("sections")):
            report_texts.append(_coerce_text(safe_dict(section).get("summary")))
            report_texts.extend(_extract_texts([safe_dict(item).get("detail") for item in safe_list(safe_dict(section).get("items"))]))
        text = " ".join(report_texts)
        topics = _first_topics([text], max_topics=1)
        for topic in topics:
            grouped[topic["key"]].append(
                _build_signal(
                    topic=topic,
                    source_type="weekly_report",
                    source_id=_coerce_text(report.get("_observedAt")) or None,
                    child_id=None,
                    consultation_id=None,
                    segment=None,
                    observed_at=_coerce_text(report.get("_observedAt")) or None,
                    excerpt=report_texts[0] if report_texts else "weekly report summary",
                    weight=0.8,
                    fallback=False,
                    inferred=True,
                    source_chain="weekly_report_snapshot",
                )
            )

    total_children = max(len(context.children_by_id), 1)
    items: list[dict[str, Any]] = []
    for signals in grouped.values():
        day_count = len({_coerce_text(signal.observed_at)[:10] for signal in signals if _coerce_text(signal.observed_at)})
        child_count = len({_coerce_text(signal.child_id) for signal in signals if _coerce_text(signal.child_id)})
        consultation_count = len({_coerce_text(signal.consultation_id) for signal in signals if _coerce_text(signal.consultation_id)})
        if day_count < 2 and consultation_count < 2 and not (day_count >= 1 and consultation_count >= 1):
            continue
        score = (day_count * 5.0) + (child_count * 8.0) + (consultation_count * 6.0)
        items.append(
            _build_item(
                item_id=signals[0].topic_key,
                label=signals[0].topic_label,
                signals=signals,
                count=day_count + consultation_count,
                score=score,
                topic_key=signals[0].topic_key,
                summary=f"最近 {context.window_days} 天内，这类问题在 {child_count} 名儿童、{day_count} 个记录日和 {consultation_count} 次会诊中反复出现。",
                business_snapshot_source=context.current_repository.source,
                child_names=child_names,
            )
        )

    items.sort(key=lambda item: (-_safe_number(item.get("score")), -int(item.get("count", 0)), item.get("label", "")))
    return items[: context.limit_per_category]


async def build_demand_insight_engine(
    *,
    repositories: RepositoryBundle,
    app_snapshot: dict[str, Any] | None = None,
    institution_id: str | None = None,
    window_days: int = 14,
    limit_per_category: int = 5,
    consultation_limit: int = 40,
    today: str | None = None,
    include_weekly_signals: bool = True,
    brain_provider: str = "unknown",
) -> dict[str, Any]:
    settings = get_settings()
    current_repository = await ChildcareRepository.create(
        app_snapshot=app_snapshot,
        institution_id=institution_id,
        database_url=settings.resolved_mysql_url,
    )
    current_snapshot = current_repository.snapshot

    consultation_records, consultation_fallback_used = await _load_consultation_records(
        repositories=repositories,
        current_snapshot=current_snapshot,
        consultation_limit=consultation_limit,
        brain_provider=brain_provider,
    )
    weekly_report_records = (
        await _load_weekly_report_records(repositories=repositories, limit=12)
        if include_weekly_signals
        else []
    )
    consultation_snapshot_count = await _count_recent_snapshots(
        repositories=repositories,
        snapshot_type="consultation-result",
        limit=consultation_limit,
    )
    parent_follow_up_snapshot_count = await _count_recent_snapshots(
        repositories=repositories,
        snapshot_type="parent-follow-up-result",
        limit=12,
    )
    analysis_end_date = _resolve_analysis_end_date(
        today=today,
        current_snapshot=current_snapshot,
        consultation_records=consultation_records,
        weekly_report_records=weekly_report_records,
    )

    warnings: list[str] = []
    if current_repository.fallback:
        warnings.append("当前业务快照来自演示或兜底数据，分群、反馈与执行难点结果仅供演示参考，不代表机构真实运营洞察。")
    if consultation_fallback_used:
        warnings.append("当前会诊触发热度使用演示会诊推送补位，仅适合展示聚合结果形态。")
    if repositories.degraded:
        warnings.append(
            f"记忆后端已降级为 {repositories.backend}，近期链路记录与快照覆盖可能不完整。"
        )
    if current_repository.errors:
        warnings.extend(f"业务快照兜底异常：{error}" for error in current_repository.errors)
    if weekly_report_records:
        warnings.append("周报快照当前仅作为辅助聚合信号，不能视为真实运营周报洞察。")
    if parent_follow_up_snapshot_count:
        warnings.append("家长跟进快照当前仅纳入来源统计，未直接参与核心评分，且仍可能包含演示或契约兜底依赖。")

    context = DemandInsightContext(
        repositories=repositories,
        current_repository=current_repository,
        current_snapshot=current_snapshot,
        consultation_records=consultation_records,
        weekly_report_records=weekly_report_records,
        analysis_end_date=analysis_end_date,
        window_days=window_days,
        limit_per_category=limit_per_category,
        warnings=warnings,
        consultation_fallback_used=consultation_fallback_used,
    )

    top_concern_topics = _build_top_concern_topics(context)
    consultation_trigger_heat = _build_consultation_trigger_heat(context)
    action_difficulty_topics = _build_action_difficulty_topics(context)
    weak_feedback_segments = _build_weak_feedback_segments(context)
    recurring_issue_clusters = _build_recurring_issue_clusters(context)

    recent_feedback_records = _recent_snapshot_records(context, "feedback", "date")
    recent_growth_records = _recent_snapshot_records(context, "growth", "createdAt", "reviewDate")
    recent_health_records = _recent_snapshot_records(context, "health", "date")
    recent_meal_records = _recent_snapshot_records(context, "meals", "date")
    recent_task_check_ins = _recent_snapshot_records(context, "taskCheckIns", "date")
    recent_consultations = _recent_consultation_records(context)
    feedback_children = {
        _coerce_text(record.get("childId"))
        for record in recent_feedback_records
        if _coerce_text(record.get("childId"))
    }
    total_children = len(context.children_by_id)
    eligible_feedback_children = total_children
    feedback_coverage_ratio = len(feedback_children) / max(eligible_feedback_children, 1) if eligible_feedback_children else 0.0
    sparse = total_children == 0 or (
        len(feedback_children) < max(1, min(total_children, 2)) and len(recent_consultations) < 2
    )
    channels = [
        channel
        for channel, present in (
            ("children", bool(total_children)),
            ("guardian_feedback", bool(recent_feedback_records)),
            ("growth", bool(recent_growth_records)),
            ("health", bool(recent_health_records)),
            ("meals", bool(recent_meal_records)),
            ("task_check_ins", bool(recent_task_check_ins)),
            ("intervention_cards", bool(safe_list(current_snapshot.get("interventionCards")))),
            ("reminders", bool(safe_list(current_snapshot.get("reminders")))),
            ("consultation_result", bool(recent_consultations)),
            ("weekly_report", bool(weekly_report_records)),
            ("parent_follow_up", bool(parent_follow_up_snapshot_count)),
        )
        if present
    ]
    fallback_used = current_repository.fallback or consultation_fallback_used
    source_summary = {
        "businessSnapshotSource": current_repository.source,
        "consultationSnapshotCount": consultation_snapshot_count,
        "consultationFallbackUsed": consultation_fallback_used,
        "parentFollowUpSnapshotCount": parent_follow_up_snapshot_count,
        "weeklyReportSnapshotCount": len(weekly_report_records),
        "feedbackRecordCount": len(recent_feedback_records),
        "growthRecordCount": len(recent_growth_records),
        "healthRecordCount": len(recent_health_records),
        "mealRecordCount": len(recent_meal_records),
        "taskCheckInCount": len(recent_task_check_ins),
        "interventionCardCount": len(safe_list(current_snapshot.get("interventionCards"))),
        "reminderCount": len(safe_list(current_snapshot.get("reminders"))),
        "channels": channels,
        "degraded": repositories.degraded,
        "errors": [*current_repository.errors, *repositories.errors],
    }
    data_quality = {
        "totalChildren": total_children,
        "eligibleFeedbackChildren": eligible_feedback_children,
        "feedbackChildren": len(feedback_children),
        "feedbackCoverageRatio": _round_score(feedback_coverage_ratio),
        "consultationCount": len(recent_consultations),
        "sparse": sparse,
        "fallbackUsed": fallback_used,
        "demoOnly": current_repository.source == "demo_snapshot",
    }

    return {
        "schemaVersion": "v1-demand-insight",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "window": {
            "days": window_days,
            "startDate": context.start_date.isoformat(),
            "endDate": context.analysis_end_date.isoformat(),
        },
        "warnings": _unique_strings(context.warnings, limit=12),
        "topConcernTopics": top_concern_topics,
        "consultationTriggerHeat": consultation_trigger_heat,
        "actionDifficultyTopics": action_difficulty_topics,
        "weakFeedbackSegments": weak_feedback_segments,
        "recurringIssueClusters": recurring_issue_clusters,
        "sourceSummary": source_summary,
        "dataQuality": data_quality,
        "source": current_repository.source,
        "fallback": fallback_used,
    }
