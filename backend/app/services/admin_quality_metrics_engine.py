from __future__ import annotations

import copy
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from statistics import mean
from typing import Any

from app.core.config import get_settings
from app.db.childcare_repository import ChildcareRepository, DEFAULT_SNAPSHOT_KEYS
from app.db.demo_snapshot import build_demo_consultation_feed_items
from app.db.repositories import RepositoryBundle
from app.services.demand_insight_engine import build_demand_insight_engine
from app.services.high_risk_consultation_contract import normalize_high_risk_consultation_result
from app.tools.summary_tools import safe_dict, safe_list, unique_texts


DEFAULT_WINDOW_DAYS = 7
DEFAULT_CONSULTATION_LIMIT = 40
LOW_CONFIDENCE_THRESHOLD = 0.68


def _coerce_text(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def _safe_number(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _round_value(value: float, digits: int = 1) -> float:
    return round(float(value), digits)


def _round_ratio(value: float) -> float:
    return round(float(value), 3)


def _parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)

    text = _coerce_text(value)
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


def _empty_snapshot(*, updated_at: str) -> dict[str, Any]:
    snapshot: dict[str, Any] = {key: [] for key in DEFAULT_SNAPSHOT_KEYS}
    snapshot["updatedAt"] = updated_at
    return snapshot


def _unique_strings(values: list[str], *, limit: int = 12) -> list[str]:
    return unique_texts([_coerce_text(item) for item in values], limit=limit)


def _confidence_from_mode(
    *,
    mode: str,
    coverage_ratio: float,
    data_points: int,
    proxy: bool = False,
    sparse: bool = False,
) -> float:
    base = {
        "aggregated": 0.9,
        "derived": 0.76,
        "fallback": 0.58,
        "demo_only": 0.42,
    }.get(mode, 0.5)
    ratio = min(max(coverage_ratio, 0.0), 1.0)
    score = base * (0.55 + ratio * 0.45)
    if proxy:
        score -= 0.12
    if sparse:
        score -= 0.08
    if data_points <= 0:
        score -= 0.12
    elif data_points >= 4:
        score += 0.04
    return round(min(max(score, 0.08), 0.99), 2)


def _coverage(eligible_count: int, observed_count: int) -> dict[str, Any]:
    ratio = observed_count / eligible_count if eligible_count else 0.0
    return {
        "eligibleCount": int(eligible_count),
        "observedCount": int(observed_count),
        "coverageRatio": _round_ratio(ratio),
    }


def _metric_source(
    *,
    mode: str,
    channels: list[str],
    business_snapshot_source: str,
    note: str | None = None,
) -> dict[str, Any]:
    return {
        "mode": mode,
        "channels": _unique_strings(channels, limit=8),
        "businessSnapshotSource": business_snapshot_source,
        "fallbackUsed": mode in {"fallback", "demo_only"},
        "demoOnly": mode == "demo_only",
        "note": note,
    }


def _record_child_id(record: dict[str, Any]) -> str | None:
    return _coerce_text(record.get("childId") or record.get("targetChildId") or record.get("targetId")) or None


def _filter_snapshot_by_class(snapshot: dict[str, Any], class_ids: set[str]) -> dict[str, Any]:
    if not class_ids:
        return copy.deepcopy(snapshot)

    filtered = copy.deepcopy(snapshot)
    children = [
        child
        for child in safe_list(snapshot.get("children"))
        if safe_dict(child) and _coerce_text(safe_dict(child).get("className")) in class_ids
    ]
    allowed_child_ids = {
        _coerce_text(safe_dict(child).get("id"))
        for child in children
        if _coerce_text(safe_dict(child).get("id"))
    }
    filtered["children"] = children

    for bucket in ("attendance", "meals", "growth", "feedback", "health", "taskCheckIns", "consultations", "mobileDrafts", "tasks"):
        filtered[bucket] = [
            item
            for item in safe_list(snapshot.get(bucket))
            if safe_dict(item) and _record_child_id(safe_dict(item)) in allowed_child_ids
        ]

    filtered["interventionCards"] = [
        item
        for item in safe_list(snapshot.get("interventionCards"))
        if safe_dict(item) and _coerce_text(safe_dict(item).get("targetChildId")) in allowed_child_ids
    ]
    filtered["reminders"] = [
        item
        for item in safe_list(snapshot.get("reminders"))
        if safe_dict(item)
        and (
            _record_child_id(safe_dict(item)) in allowed_child_ids
            or _coerce_text(safe_dict(item).get("childId")) in allowed_child_ids
        )
    ]
    return filtered


def _consultation_record_from_demo_item(item: dict[str, Any]) -> dict[str, Any]:
    explainability = safe_dict(item.get("explainabilitySummary"))
    return {
        "consultationId": _coerce_text(item.get("consultationId")),
        "childId": _coerce_text(item.get("childId")),
        "generatedAt": _coerce_text(item.get("generatedAt")),
        "riskLevel": _coerce_text(item.get("riskLevel")),
        "triggerReason": _coerce_text(item.get("triggerReason")),
        "triggerReasons": [text for text in safe_list(item.get("triggerReasons")) if _coerce_text(text)],
        "keyFindings": [text for text in safe_list(explainability.get("keyFindings")) if _coerce_text(text)],
        "todayInSchoolActions": [text for text in safe_list(item.get("todayInSchoolActions")) if _coerce_text(text)],
        "tonightAtHomeActions": [text for text in safe_list(item.get("tonightAtHomeActions")) if _coerce_text(text)],
        "followUp48h": [text for text in safe_list(item.get("followUp48h")) if _coerce_text(text)],
        "status": _coerce_text(item.get("status")) or "pending",
        "ownerRole": _coerce_text(item.get("ownerRole")),
        "ownerName": _coerce_text(item.get("ownerName")),
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
    include_demo_fallback: bool,
    allowed_child_ids: set[str] | None,
    business_fallback: bool,
) -> tuple[list[dict[str, Any]], bool, int]:
    records: list[dict[str, Any]] = []
    seen_consultation_ids: set[str] = set()

    snapshot_records = await repositories.list_recent_snapshots(
        limit=consultation_limit,
        snapshot_types=["consultation-result"],
    )
    for snapshot in snapshot_records:
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

        child_id = _coerce_text(normalized.get("childId"))
        if allowed_child_ids and child_id not in allowed_child_ids:
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

        child_id = _coerce_text(normalized.get("childId"))
        if allowed_child_ids and child_id not in allowed_child_ids:
            continue

        consultation_id = _coerce_text(normalized.get("consultationId"))
        if not consultation_id or consultation_id in seen_consultation_ids:
            continue
        seen_consultation_ids.add(consultation_id)
        normalized["_sourceChain"] = "current_snapshot.consultations"
        normalized["_fallback"] = bool(safe_dict(normalized.get("providerTrace")).get("fallback"))
        records.append(normalized)

    if records:
        return records, False, len(records)

    if include_demo_fallback and business_fallback:
        demo_records = [_consultation_record_from_demo_item(item) for item in build_demo_consultation_feed_items()]
        if allowed_child_ids:
            demo_records = [record for record in demo_records if _coerce_text(record.get("childId")) in allowed_child_ids]
        return demo_records, bool(demo_records), len(demo_records)

    return [], False, 0


def _resolve_analysis_end_date(
    *,
    today: str | None,
    snapshot: dict[str, Any],
    consultation_records: list[dict[str, Any]],
) -> date:
    candidates: list[date] = []
    explicit_today = _parse_date(today)
    if explicit_today is not None:
        candidates.append(explicit_today)

    updated_at = _parse_date(snapshot.get("updatedAt"))
    if updated_at is not None:
        candidates.append(updated_at)

    for bucket, keys in (
        ("feedback", ("date",)),
        ("growth", ("createdAt", "reviewDate")),
        ("health", ("date",)),
        ("taskCheckIns", ("date",)),
        ("interventionCards", ("createdAt", "updatedAt")),
        ("mobileDrafts", ("createdAt", "updatedAt")),
        ("tasks", ("dueAt", "createdAt", "completedAt", "lastEvidenceAt", "statusChangedAt")),
    ):
        for raw in safe_list(snapshot.get(bucket)):
            record = safe_dict(raw)
            for key in keys:
                parsed = _parse_date(record.get(key))
                if parsed is not None:
                    candidates.append(parsed)
                    break

    for record in consultation_records:
        parsed = _parse_date(record.get("generatedAt"))
        if parsed is not None:
            candidates.append(parsed)

    return max(candidates) if candidates else datetime.now(timezone.utc).date()


def _recent_snapshot_records(snapshot: dict[str, Any], start_date: date, end_date: date, bucket: str, *keys: str) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for raw in safe_list(snapshot.get(bucket)):
        record = safe_dict(raw)
        if not record:
            continue
        for key in keys:
            if _date_in_window(record.get(key), start_date=start_date, end_date=end_date):
                results.append(record)
                break
    return results


def _recent_consultations(records: list[dict[str, Any]], start_date: date, end_date: date) -> list[dict[str, Any]]:
    return [
        record
        for record in records
        if _date_in_window(record.get("generatedAt"), start_date=start_date, end_date=end_date)
    ]


def _task_in_window(task: dict[str, Any], *, start_date: date, end_date: date) -> bool:
    for key in ("dueAt", "createdAt", "completedAt", "lastEvidenceAt", "statusChangedAt"):
        if _date_in_window(task.get(key), start_date=start_date, end_date=end_date):
            return True
    return False


def _task_action_time(task: dict[str, Any]) -> datetime | None:
    for key in ("completedAt", "lastEvidenceAt", "statusChangedAt"):
        parsed = _parse_datetime(task.get(key))
        if parsed is not None:
            return parsed
    return None


def _feedback_completion_state(record: dict[str, Any]) -> str:
    execution_status = _coerce_text(record.get("executionStatus")).lower()
    if execution_status == "completed" or record.get("executed") is True:
        return "completed"
    if execution_status == "partial":
        return "in_progress"
    return "pending"


def _build_metric(
    *,
    metric_id: str,
    label: str,
    value: float,
    unit: str,
    summary: str,
    mode: str,
    channels: list[str],
    business_snapshot_source: str,
    coverage: dict[str, Any],
    warnings: list[str],
    data_quality: dict[str, Any],
    proxy: bool = False,
    note: str | None = None,
    window: dict[str, Any] | None = None,
) -> dict[str, Any]:
    sparse = bool(data_quality.get("sparse"))
    return {
        "id": metric_id,
        "label": label,
        "value": _round_value(value, 1),
        "unit": unit,
        "summary": summary,
        "source": _metric_source(
            mode=mode,
            channels=channels,
            business_snapshot_source=business_snapshot_source,
            note=note,
        ),
        "fallback": mode in {"fallback", "demo_only"},
        "confidence": _confidence_from_mode(
            mode=mode,
            coverage_ratio=_safe_number(coverage.get("coverageRatio")),
            data_points=max(int(coverage.get("eligibleCount", 0)), int(coverage.get("observedCount", 0))),
            proxy=proxy,
            sparse=sparse,
        ),
        "coverage": coverage,
        "warnings": _unique_strings(warnings, limit=8),
        "dataQuality": data_quality,
        "window": window,
    }


@dataclass(slots=True)
class AdminQualityMetricsContext:
    repositories: RepositoryBundle
    repository: ChildcareRepository
    current_source: str
    snapshot: dict[str, Any]
    consultation_records: list[dict[str, Any]]
    consultation_fallback_used: bool
    analysis_end_date: date
    window_days: int
    demand_insight_result: dict[str, Any]
    warnings: list[str]

    @property
    def start_date(self) -> date:
        return self.analysis_end_date - timedelta(days=self.window_days - 1)

    @property
    def children_by_id(self) -> dict[str, dict[str, Any]]:
        return {
            _coerce_text(safe_dict(child).get("id")): safe_dict(child)
            for child in safe_list(self.snapshot.get("children"))
            if safe_dict(child) and _coerce_text(safe_dict(child).get("id"))
        }

    @property
    def recent_feedbacks(self) -> list[dict[str, Any]]:
        return _recent_snapshot_records(self.snapshot, self.start_date, self.analysis_end_date, "feedback", "date")

    @property
    def recent_growth_records(self) -> list[dict[str, Any]]:
        return _recent_snapshot_records(self.snapshot, self.start_date, self.analysis_end_date, "growth", "createdAt", "reviewDate")

    @property
    def recent_health_records(self) -> list[dict[str, Any]]:
        return _recent_snapshot_records(self.snapshot, self.start_date, self.analysis_end_date, "health", "date")

    @property
    def recent_task_check_ins(self) -> list[dict[str, Any]]:
        return _recent_snapshot_records(self.snapshot, self.start_date, self.analysis_end_date, "taskCheckIns", "date")

    @property
    def recent_intervention_cards(self) -> list[dict[str, Any]]:
        return _recent_snapshot_records(self.snapshot, self.start_date, self.analysis_end_date, "interventionCards", "createdAt", "updatedAt")

    @property
    def recent_reminders(self) -> list[dict[str, Any]]:
        return _recent_snapshot_records(self.snapshot, self.start_date, self.analysis_end_date, "reminders", "scheduledAt")

    @property
    def recent_mobile_drafts(self) -> list[dict[str, Any]]:
        return _recent_snapshot_records(self.snapshot, self.start_date, self.analysis_end_date, "mobileDrafts", "createdAt", "updatedAt")

    @property
    def recent_tasks(self) -> list[dict[str, Any]]:
        return [
            record
            for raw in safe_list(self.snapshot.get("tasks"))
            if (record := safe_dict(raw)) and _task_in_window(record, start_date=self.start_date, end_date=self.analysis_end_date)
        ]

    @property
    def recent_consultations(self) -> list[dict[str, Any]]:
        return _recent_consultations(self.consultation_records, self.start_date, self.analysis_end_date)


def _consultation_closure_metric(context: AdminQualityMetricsContext, window: dict[str, Any]) -> dict[str, Any]:
    eligible = [
        record
        for record in context.recent_consultations
        if _coerce_text(record.get("riskLevel")).lower() == "high" or bool(record.get("shouldEscalateToAdmin"))
    ]
    tasks = context.recent_tasks
    feedbacks = context.recent_feedbacks
    closed_explicit = 0
    closed_derived = 0
    for record in eligible:
        status = _coerce_text(record.get("status") or safe_dict(record.get("directorDecisionCard")).get("status")).lower()
        if status == "completed":
            closed_explicit += 1
            continue

        consultation_id = _coerce_text(record.get("consultationId"))
        child_id = _coerce_text(record.get("childId"))
        generated_at = _parse_datetime(record.get("generatedAt"))
        admin_task_completed = any(
            _coerce_text(task.get("status")).lower() == "completed"
            and _coerce_text(task.get("ownerRole")).lower() == "admin"
            and (
                _coerce_text(task.get("sourceId")) == consultation_id
                or _coerce_text(safe_dict(task.get("legacyRefs")).get("consultationId")) == consultation_id
            )
            for task in tasks
        )
        has_follow_up_completion = any(
            _coerce_text(task.get("status")).lower() == "completed"
            and _coerce_text(task.get("childId")) == child_id
            and _coerce_text(task.get("taskType")).lower() == "follow_up"
            and (_task_action_time(task) is not None)
            and (generated_at is None or _task_action_time(task) >= generated_at)
            for task in tasks
        )
        has_guardian_feedback_after = any(
            _coerce_text(feedback.get("childId")) == child_id
            and (_parse_datetime(feedback.get("date")) is not None)
            and (generated_at is None or _parse_datetime(feedback.get("date")) >= generated_at)
            for feedback in feedbacks
        )
        if admin_task_completed or (has_follow_up_completion and has_guardian_feedback_after):
            closed_derived += 1

    closed_total = closed_explicit + closed_derived
    coverage = _coverage(len(eligible), len(eligible))
    mode = "demo_only" if context.consultation_fallback_used and context.repository.fallback else "derived" if closed_derived else "aggregated"
    if not eligible and not context.consultation_fallback_used:
        mode = "fallback" if context.repository.fallback else "aggregated"
    summary = (
        f"近 {context.window_days} 天共有 {len(eligible)} 条高风险会诊进入统计，其中 {closed_total} 条已形成闭环。"
        if eligible
        else f"近 {context.window_days} 天未发现纳入统计的高风险会诊。"
    )
    warnings: list[str] = []
    if closed_derived:
        warnings.append("部分闭环是根据后续任务完成或家长反馈回流推导得出，并非直接来自专门的闭环事件。")
    if context.consultation_fallback_used:
        warnings.append("会诊闭环率当前使用演示会诊兜底，因为近期会诊快照暂不可用。")

    return _build_metric(
        metric_id="consultationClosureRate",
        label="会诊闭环率",
        value=(closed_total / len(eligible) * 100.0) if eligible else 0.0,
        unit="%",
        summary=summary,
        mode=mode,
        channels=["consultation_result", "tasks", "guardian_feedback"],
        business_snapshot_source=context.current_source,
        coverage=coverage,
        warnings=warnings,
        data_quality={
            "eligibleConsultationCount": len(eligible),
            "explicitClosedCount": closed_explicit,
            "derivedClosedCount": closed_derived,
            "sparse": len(eligible) < 2,
        },
        note="优先以高风险会诊快照为主数据；任务与反馈信号仅作为保守的闭环补充依据。",
        window=window,
    )


def _follow_up_48h_metric(context: AdminQualityMetricsContext, window: dict[str, Any]) -> dict[str, Any]:
    canonical_tasks = [
        task
        for task in context.recent_tasks
        if _coerce_text(task.get("ownerRole")).lower() == "teacher"
        and _coerce_text(task.get("taskType")).lower() == "follow_up"
        and _coerce_text(safe_dict(task.get("dueWindow")).get("kind")) == "within_48h"
    ]
    if canonical_tasks:
        completed_count = sum(1 for task in canonical_tasks if _coerce_text(task.get("status")).lower() == "completed")
        in_progress_count = sum(1 for task in canonical_tasks if _coerce_text(task.get("status")).lower() == "in_progress")
        return _build_metric(
            metric_id="followUp48hCompletionRate",
            label="48小时复查完成率",
            value=(completed_count / len(canonical_tasks) * 100.0) if canonical_tasks else 0.0,
            unit="%",
            summary=f"已完成 {completed_count}/{len(canonical_tasks)} 条教师 48 小时复查任务。",
            mode="aggregated" if not context.repository.fallback else "demo_only",
            channels=["tasks"],
            business_snapshot_source=context.current_source,
            coverage=_coverage(len(canonical_tasks), len(canonical_tasks)),
            warnings=[],
            data_quality={
                "taskCount": len(canonical_tasks),
                "inProgressCount": in_progress_count,
                "sparse": len(canonical_tasks) < 2,
                "usedCanonicalTasks": True,
            },
            note="当标准任务快照可用时，优先按标准任务数据计算。",
            window=window,
        )

    legacy_items: list[tuple[str, bool]] = []
    for reminder in context.recent_reminders:
        if _coerce_text(reminder.get("reminderType")) != "review-48h":
            continue
        completed = _coerce_text(reminder.get("status")).lower() == "done"
        legacy_items.append((_coerce_text(reminder.get("reminderId")), completed))

    if not legacy_items:
        check_ins = context.recent_task_check_ins
        for record in context.recent_growth_records:
            if not bool(record.get("needsAttention")) and not _coerce_text(record.get("reviewDate")):
                continue
            record_id = _coerce_text(record.get("id"))
            child_id = _coerce_text(record.get("childId"))
            created_at = _parse_datetime(record.get("createdAt") or record.get("reviewDate"))
            completed = _coerce_text(record.get("reviewStatus")).lower() in {"completed", "done"} or any(
                _coerce_text(check_in.get("childId")) == child_id
                and (_parse_datetime(check_in.get("date")) is not None)
                and (created_at is None or _parse_datetime(check_in.get("date")) >= created_at)
                for check_in in check_ins
            )
            legacy_items.append((record_id or f"growth-{child_id}", completed))

    completed_count = sum(1 for _, completed in legacy_items if completed)
    return _build_metric(
        metric_id="followUp48hCompletionRate",
        label="48小时复查完成率",
        value=(completed_count / len(legacy_items) * 100.0) if legacy_items else 0.0,
        unit="%",
        summary=(
            f"通过提醒、成长记录和打卡信号，已完成 {completed_count}/{len(legacy_items)} 条 48 小时复查事项。"
            if legacy_items
            else f"近 {context.window_days} 天未发现标准 48 小时复查任务，也未发现可用于兜底统计的历史复查事项。"
        ),
        mode="fallback" if context.repository.fallback else "derived",
        channels=["reminders", "growth", "task_check_ins"],
        business_snapshot_source=context.current_source,
        coverage=_coverage(len(legacy_items), len(legacy_items)),
        warnings=["当前因标准任务快照不可用，48 小时复查完成率改用提醒、成长记录和打卡信号推导。"],
        data_quality={
            "itemCount": len(legacy_items),
            "usedCanonicalTasks": False,
            "sparse": len(legacy_items) < 2,
        },
        note="历史投影仅用于兜底估算，口径相对保守。",
        window=window,
    )


def _guardian_feedback_metric(context: AdminQualityMetricsContext, window: dict[str, Any]) -> dict[str, Any]:
    feedbacks = context.recent_feedbacks
    parent_tasks = [
        task
        for task in context.recent_tasks
        if _coerce_text(task.get("ownerRole")).lower() == "parent"
        and _coerce_text(task.get("taskType")).lower() == "intervention"
    ]
    task_children = {
        _coerce_text(task.get("childId"))
        for task in parent_tasks
        if _coerce_text(task.get("childId"))
    }
    intervention_children = {
        _coerce_text(card.get("targetChildId"))
        for card in context.recent_intervention_cards
        if _coerce_text(card.get("targetChildId"))
    }
    consultation_children = {
        _coerce_text(record.get("childId"))
        for record in context.recent_consultations
        if _coerce_text(record.get("childId")) and safe_list(record.get("tonightAtHomeActions"))
    }
    eligible_children = {child_id for child_id in {*task_children, *intervention_children, *consultation_children} if child_id}
    eligibility_mode = "composite_home_loop"
    if not eligible_children and feedbacks:
        eligible_children = {
            _coerce_text(record.get("childId"))
            for record in feedbacks
            if _coerce_text(record.get("childId"))
        }
        eligibility_mode = "feedback_inferred"

    observed_children = {
        _coerce_text(record.get("childId"))
        for record in feedbacks
        if _coerce_text(record.get("childId")) in eligible_children
    }
    mode = "derived" if eligibility_mode == "feedback_inferred" else "aggregated"
    if context.repository.fallback:
        mode = "demo_only"

    warnings: list[str] = []
    if eligibility_mode == "feedback_inferred":
        warnings.append("当前因家长任务或干预卡缺失，反馈分母只能根据已回传的家长反馈反推。")

    return _build_metric(
        metric_id="guardianFeedbackRate",
        label="家长反馈提交率",
        value=(len(observed_children) / len(eligible_children) * 100.0) if eligible_children else 0.0,
        unit="%",
        summary=(
            f"预期需要家庭闭环的儿童中，已有 {len(observed_children)}/{len(eligible_children)} 名提交家长反馈。"
            if eligible_children
            else f"近 {context.window_days} 天未识别出需要统计家长反馈的儿童。"
        ),
        mode=mode,
        channels=[
            "guardian_feedback",
            "tasks" if task_children else "",
            "intervention_cards" if intervention_children else "",
            "consultation_result" if consultation_children else "",
            eligibility_mode,
        ],
        business_snapshot_source=context.current_source,
        coverage=_coverage(len(eligible_children), len(observed_children)),
        warnings=warnings,
        data_quality={
            "feedbackRecordCount": len(feedbacks),
            "eligibilityMode": eligibility_mode,
            "sparse": len(eligible_children) < 2,
        },
        note="分母仅统计预期存在家庭闭环的儿童，不代表全部在园儿童。",
        window=window,
    )


def _home_task_execution_metric(context: AdminQualityMetricsContext, window: dict[str, Any]) -> dict[str, Any]:
    parent_tasks = [
        task
        for task in context.recent_tasks
        if _coerce_text(task.get("ownerRole")).lower() == "parent"
        and _coerce_text(task.get("taskType")).lower() == "intervention"
    ]
    if parent_tasks:
        completed_count = sum(1 for task in parent_tasks if _coerce_text(task.get("status")).lower() == "completed")
        in_progress_count = sum(1 for task in parent_tasks if _coerce_text(task.get("status")).lower() == "in_progress")
        return _build_metric(
            metric_id="homeTaskExecutionRate",
            label="家庭任务执行率",
            value=(completed_count / len(parent_tasks) * 100.0) if parent_tasks else 0.0,
            unit="%",
            summary=f"已完成 {completed_count}/{len(parent_tasks)} 条家庭任务。",
            mode="aggregated" if not context.repository.fallback else "demo_only",
            channels=["tasks"],
            business_snapshot_source=context.current_source,
            coverage=_coverage(len(parent_tasks), len(parent_tasks)),
            warnings=[],
            data_quality={
                "taskCount": len(parent_tasks),
                "inProgressCount": in_progress_count,
                "usedCanonicalTasks": True,
                "sparse": len(parent_tasks) < 2,
            },
            note="当标准家长任务可用时，优先按任务执行结果计算。",
            window=window,
        )

    eligible_card_ids = {
        _coerce_text(card.get("id"))
        for card in context.recent_intervention_cards
        if _coerce_text(card.get("id"))
    }
    if not eligible_card_ids:
        eligible_card_ids = {
            _coerce_text(record.get("interventionCardId"))
            for record in context.recent_feedbacks
            if _coerce_text(record.get("interventionCardId"))
        }

    completed_card_ids: set[str] = set()
    observed_card_ids: set[str] = set()
    for feedback in context.recent_feedbacks:
        card_id = _coerce_text(feedback.get("interventionCardId"))
        if not card_id or card_id not in eligible_card_ids:
            continue
        observed_card_ids.add(card_id)
        if _feedback_completion_state(feedback) == "completed":
            completed_card_ids.add(card_id)

    for check_in in context.recent_task_check_ins:
        task_id = _coerce_text(check_in.get("taskId"))
        if task_id and task_id in eligible_card_ids:
            observed_card_ids.add(task_id)
            completed_card_ids.add(task_id)

    return _build_metric(
        metric_id="homeTaskExecutionRate",
        label="家庭任务执行率",
        value=(len(completed_card_ids) / len(eligible_card_ids) * 100.0) if eligible_card_ids else 0.0,
        unit="%",
        summary=(
            f"根据反馈回传与打卡证据，已完成 {len(completed_card_ids)}/{len(eligible_card_ids)} 条家庭任务。"
            if eligible_card_ids
            else f"近 {context.window_days} 天未识别出可统计的家庭任务。"
        ),
        mode="fallback" if context.repository.fallback else "derived",
        channels=["intervention_cards", "guardian_feedback", "task_check_ins"],
        business_snapshot_source=context.current_source,
        coverage=_coverage(len(eligible_card_ids), len(observed_card_ids)),
        warnings=["当前因标准任务快照不可用，家庭任务执行率改用干预卡与反馈证据推导。"],
        data_quality={
            "itemCount": len(eligible_card_ids),
            "completedItemCount": len(completed_card_ids),
            "usedCanonicalTasks": False,
            "sparse": len(eligible_card_ids) < 2,
        },
        note="该兜底口径基于干预卡关联证据，不等同于完整的任务生命周期记录。",
        window=window,
    )


def _teacher_low_confidence_metric(context: AdminQualityMetricsContext, window: dict[str, Any]) -> dict[str, Any]:
    draft_item_count = 0
    low_confidence_count = 0
    asr_low_count = 0
    for draft in context.recent_mobile_drafts:
        payload = safe_dict(draft.get("structuredPayload"))
        if _coerce_text(payload.get("kind")) != "teacher-voice-understanding":
            continue
        seed = safe_dict(payload.get("t5Seed"))
        warnings = {_coerce_text(item) for item in safe_list(seed.get("warnings")) if _coerce_text(item)}
        understanding = safe_dict(payload.get("understanding"))
        understanding_meta = safe_dict(understanding.get("meta"))
        asr = safe_dict(understanding_meta.get("asr"))
        asr_confidence = _safe_number(asr.get("confidence"))
        is_asr_low = asr_confidence > 0 and asr_confidence < LOW_CONFIDENCE_THRESHOLD
        if is_asr_low:
            asr_low_count += 1
        for item in safe_list(seed.get("draft_items")):
            draft_item = safe_dict(item)
            confidence = _safe_number(draft_item.get("confidence"))
            draft_item_count += 1
            if confidence < LOW_CONFIDENCE_THRESHOLD or "router_low_confidence" in warnings or is_asr_low:
                low_confidence_count += 1

    if draft_item_count:
        return _build_metric(
            metric_id="teacherLowConfidenceRate",
            label="教师记录待复核率",
            value=(low_confidence_count / draft_item_count * 100.0) if draft_item_count else 0.0,
            unit="%",
            summary=f"共有 {draft_item_count} 条教师记录纳入统计，其中 {low_confidence_count} 条低于待复核阈值（{LOW_CONFIDENCE_THRESHOLD:.2f}）。",
            mode="derived" if not context.repository.fallback else "demo_only",
            channels=["mobile_drafts", "teacher_voice"],
            business_snapshot_source=context.current_source,
            coverage=_coverage(draft_item_count, draft_item_count),
            warnings=[],
            data_quality={
                "lowConfidenceThreshold": LOW_CONFIDENCE_THRESHOLD,
                "draftItemCount": draft_item_count,
                "asrLowCount": asr_low_count,
                "sparse": draft_item_count < 3,
            },
            note="目前仅统计可持久化的移动端草稿数据，教师语音接口返回还不是稳定的后台埋点来源。",
            window=window,
        )

    evidence_items = []
    for consultation in context.recent_consultations:
        for raw_item in safe_list(consultation.get("evidenceItems")):
            item = safe_dict(raw_item)
            source_type = _coerce_text(item.get("sourceType"))
            if source_type not in {"teacher_voice", "teacher_note"}:
                continue
            evidence_items.append(item)

    low_count = sum(
        1
        for item in evidence_items
        if _coerce_text(item.get("confidence")).lower() == "low" or bool(item.get("requiresHumanReview"))
    )
    warnings = ["当前因教师移动草稿埋点缺失，教师记录待复核率改用会诊证据项兜底。"]
    return _build_metric(
        metric_id="teacherLowConfidenceRate",
        label="教师记录待复核率",
        value=(low_count / len(evidence_items) * 100.0) if evidence_items else 0.0,
        unit="%",
        summary=(
            f"共有 {len(evidence_items)} 条教师证据项纳入统计，其中 {low_count} 条需要人工复核。"
            if evidence_items
            else "当前时间窗内未发现可持久化的教师草稿或可兜底的会诊证据。"
        ),
        mode="demo_only" if context.repository.fallback and context.consultation_fallback_used else "fallback",
        channels=["consultation_result"],
        business_snapshot_source=context.current_source,
        coverage=_coverage(len(evidence_items), len(evidence_items)),
        warnings=warnings,
        data_quality={
            "evidenceItemCount": len(evidence_items),
            "lowConfidenceThreshold": LOW_CONFIDENCE_THRESHOLD,
            "sparse": len(evidence_items) < 3,
        },
        proxy=True,
        note="该指标为兜底代理，只反映会诊证据中的待复核信号，不能代表全机构教师记录质量。",
        window=window,
    )


def _morning_check_response_latency_metric(context: AdminQualityMetricsContext, window: dict[str, Any]) -> dict[str, Any]:
    abnormal_records = [record for record in context.recent_health_records if bool(record.get("isAbnormal"))]
    growth_records = context.recent_growth_records
    feedbacks = context.recent_feedbacks
    reminders = context.recent_reminders
    tasks = context.recent_tasks
    check_ins = context.recent_task_check_ins

    latencies: list[float] = []
    response_channels: list[str] = []
    for record in abnormal_records:
        child_id = _coerce_text(record.get("childId"))
        observed_at = _parse_datetime(record.get("date"))
        if observed_at is None:
            continue
        consultation_candidates: list[tuple[datetime, str]] = []
        task_candidates: list[tuple[datetime, str]] = []
        reminder_candidates: list[tuple[datetime, str]] = []
        growth_feedback_candidates: list[tuple[datetime, str]] = []
        for consultation in context.recent_consultations:
            if _coerce_text(consultation.get("childId")) != child_id:
                continue
            generated_at = _parse_datetime(consultation.get("generatedAt"))
            if generated_at is not None and generated_at >= observed_at:
                consultation_candidates.append((generated_at, "consultation_result"))
        for task in tasks:
            if _coerce_text(task.get("childId")) != child_id:
                continue
            action_time = _task_action_time(task)
            if action_time is not None and action_time >= observed_at:
                task_candidates.append((action_time, "tasks"))
        for check_in in check_ins:
            if _coerce_text(check_in.get("childId")) != child_id:
                continue
            check_in_at = _parse_datetime(check_in.get("date"))
            if check_in_at is not None and check_in_at >= observed_at:
                task_candidates.append((check_in_at, "task_check_ins"))
        for reminder in reminders:
            if _record_child_id(reminder) != child_id:
                continue
            scheduled_at = _parse_datetime(reminder.get("scheduledAt"))
            if scheduled_at is not None and scheduled_at >= observed_at:
                reminder_candidates.append((scheduled_at, "reminders"))
        for growth in growth_records:
            if _coerce_text(growth.get("childId")) != child_id:
                continue
            growth_at = _parse_datetime(growth.get("createdAt") or growth.get("reviewDate"))
            if growth_at is not None and growth_at >= observed_at:
                growth_feedback_candidates.append((growth_at, "growth"))
        for feedback in feedbacks:
            if _coerce_text(feedback.get("childId")) != child_id:
                continue
            feedback_at = _parse_datetime(feedback.get("date"))
            if feedback_at is not None and feedback_at >= observed_at:
                growth_feedback_candidates.append((feedback_at, "guardian_feedback"))
        candidates = (
            consultation_candidates
            or task_candidates
            or reminder_candidates
            or growth_feedback_candidates
        )
        if not candidates:
            continue
        first_response_at, channel = sorted(candidates, key=lambda item: item[0])[0]
        latencies.append(max((first_response_at - observed_at).total_seconds() / 3600.0, 0.0))
        response_channels.append(channel)

    coverage = _coverage(len(abnormal_records), len(latencies))
    mode = "demo_only" if context.repository.fallback else "derived" if latencies else "fallback"
    warnings = [
        "晨检异常响应时长是根据异常健康记录之后的首个下游信号推导得出的代理指标。",
        "健康记录通常只有日期粒度，因此该时长只能反映粗略响应节奏，不代表严格的响应时效承诺。",
    ]
    summary = (
        f"在 {len(abnormal_records)} 条晨检异常中，已有 {len(latencies)} 条出现后续响应信号，平均首次响应时长为 {_round_value(mean(latencies), 1)} 小时。"
        if latencies
        else (
            f"近 {context.window_days} 天记录了 {len(abnormal_records)} 条晨检异常，但暂未推导出后续响应时间。"
            if abnormal_records
            else f"近 {context.window_days} 天未发现晨检异常。"
        )
    )
    return _build_metric(
        metric_id="morningCheckResponseLatency",
        label="晨检异常响应时长",
        value=_round_value(mean(latencies), 1) if latencies else 0.0,
        unit="hours",
        summary=summary,
        mode=mode,
        channels=response_channels or ["health"],
        business_snapshot_source=context.current_source,
        coverage=coverage,
        warnings=warnings,
        data_quality={
            "abnormalCount": len(abnormal_records),
            "respondedCount": len(latencies),
            "proxy": True,
            "coarseTimestamps": True,
            "sparse": len(abnormal_records) < 2,
        },
        proxy=True,
        note="该时长基于后续响应事件推导，并非专门的晨检响应时间线。",
        window=window,
    )


def _recurring_issue_heat_metric(context: AdminQualityMetricsContext, window: dict[str, Any]) -> dict[str, Any]:
    clusters = safe_list(context.demand_insight_result.get("recurringIssueClusters"))
    total_children = len(context.children_by_id)
    if clusters:
        top_cluster = safe_dict(clusters[0])
        peak_value = _safe_number(top_cluster.get("score"))
        top_labels = [_coerce_text(safe_dict(cluster).get("label")) for cluster in clusters[:3] if _coerce_text(safe_dict(cluster).get("label"))]
        cluster_source = safe_dict(top_cluster.get("source"))
        cluster_coverage = safe_dict(top_cluster.get("coverage"))
        mode = "aggregated"
        if bool(cluster_source.get("demoOnly")):
            mode = "demo_only"
        elif bool(cluster_source.get("fallbackUsed")) or _coerce_text(top_cluster.get("confidence")).lower() == "low":
            mode = "derived"
        return _build_metric(
            metric_id="recurringIssueHeat",
            label="重复问题热度",
            value=peak_value,
            unit="score",
            summary=f"当前重复问题热度主要集中在 {', '.join(top_labels)}。" if top_labels else "已识别到重复问题热度信号。",
            mode=mode,
            channels=[_coerce_text(item) for item in safe_list(cluster_source.get("channels")) if _coerce_text(item)],
            business_snapshot_source=context.current_source,
            coverage=_coverage(
                total_children,
                int(cluster_coverage.get("children", 0)),
            ),
            warnings=[warning for warning in safe_list(context.demand_insight_result.get("warnings")) if _coerce_text(warning)],
            data_quality={
                "clusterCount": len(clusters),
                "topIssues": top_labels,
                "peakScore": peak_value,
                "sparse": len(clusters) < 2,
            },
            note="重复问题热度沿用需求洞察聚类结果，仍以聚合口径为主。",
            window=window,
        )

    return _build_metric(
        metric_id="recurringIssueHeat",
        label="重复问题热度",
        value=0.0,
        unit="score",
        summary=f"近 {context.window_days} 天暂无重复问题簇超过当前聚合阈值。",
        mode="fallback" if context.repository.fallback else "derived",
        channels=["growth", "health", "guardian_feedback", "consultation_result"],
        business_snapshot_source=context.current_source,
        coverage=_coverage(total_children, 0),
        warnings=[warning for warning in safe_list(context.demand_insight_result.get("warnings")) if _coerce_text(warning)],
        data_quality={"clusterCount": 0, "sparse": True},
        note="当前没有重复问题簇达到聚合阈值。",
        window=window,
    )


def _suggestion_effectiveness_metric(context: AdminQualityMetricsContext, window: dict[str, Any]) -> dict[str, Any]:
    feedbacks = context.recent_feedbacks
    candidate_status_by_id: dict[str, dict[str, bool]] = {}
    for feedback in feedbacks:
        suggestion_id = _coerce_text(feedback.get("interventionCardId"))
        if not suggestion_id:
            source_workflow = _coerce_text(feedback.get("sourceWorkflow"))
            if source_workflow not in {"parent-agent", "teacher-agent"}:
                continue
            suggestion_id = _coerce_text(feedback.get("id"))
        if not suggestion_id:
            continue
        record = candidate_status_by_id.setdefault(suggestion_id, {"improved": False, "returned": False})
        record["returned"] = True
        if feedback.get("improved") is True:
            record["improved"] = True

    eligible_count = len(candidate_status_by_id)
    improved_count = sum(1 for record in candidate_status_by_id.values() if record["improved"])
    return _build_metric(
        metric_id="suggestionEffectiveness",
        label="干预建议有效率",
        value=(improved_count / eligible_count * 100.0) if eligible_count else 0.0,
        unit="%",
        summary=(
            f"在 {eligible_count} 条已回传反馈的建议中，有 {improved_count} 条呈现改善信号。"
            if eligible_count
            else "当前时间窗内暂无足够的建议反馈回流，无法估算建议有效率。"
        ),
        mode="demo_only" if context.repository.fallback else "fallback",
        channels=["guardian_feedback", "intervention_cards"],
        business_snapshot_source=context.current_source,
        coverage=_coverage(eligible_count, eligible_count),
        warnings=["建议有效率只是基于关联反馈的保守代理指标，不能直接视为因果效果。"],
        data_quality={
            "eligibleSuggestionCount": eligible_count,
            "improvedSuggestionCount": improved_count,
            "proxy": True,
            "sparse": eligible_count < 2,
        },
        proxy=True,
        note="该指标只统计已回传反馈的建议，不能据此直接判断干预因果。",
        window=window,
    )


async def build_admin_quality_metrics_engine(
    *,
    repositories: RepositoryBundle,
    app_snapshot: dict[str, Any] | None = None,
    institution_id: str | None = None,
    class_id: str | None = None,
    class_ids: list[str] | None = None,
    window_days: int = DEFAULT_WINDOW_DAYS,
    include_demo_fallback: bool = True,
    today: str | None = None,
    brain_provider: str = "unknown",
) -> dict[str, Any]:
    settings = get_settings()
    base_repository = await ChildcareRepository.create(
        app_snapshot=app_snapshot,
        institution_id=institution_id,
        database_url=settings.resolved_mysql_url,
    )
    current_source = base_repository.source
    current_snapshot = copy.deepcopy(base_repository.snapshot)
    warnings: list[str] = []

    resolved_class_ids = set(class_ids or [])
    if _coerce_text(class_id):
        resolved_class_ids.add(_coerce_text(class_id))
    if resolved_class_ids:
        current_snapshot = _filter_snapshot_by_class(current_snapshot, resolved_class_ids)
        warnings.append(
            f"指标已按班级范围过滤：{', '.join(sorted(resolved_class_ids))}。"
        )

    if base_repository.fallback and not include_demo_fallback:
        current_snapshot = _empty_snapshot(updated_at=datetime.now(timezone.utc).isoformat())
        current_source = "demo_suppressed"
        warnings.append("当前请求已显式关闭演示业务快照兜底。")

    current_repository = ChildcareRepository(
        snapshot=current_snapshot,
        source=current_source,
        institution_id=base_repository.institution_id,
        database_url=base_repository.database_url,
        errors=list(base_repository.errors),
        business_data_persisted=base_repository.business_data_persisted,
    )

    allowed_child_ids = {
        _coerce_text(safe_dict(child).get("id"))
        for child in safe_list(current_snapshot.get("children"))
        if safe_dict(child) and _coerce_text(safe_dict(child).get("id"))
    }
    consultation_records, consultation_fallback_used, consultation_snapshot_count = await _load_consultation_records(
        repositories=repositories,
        current_snapshot=current_snapshot,
        consultation_limit=DEFAULT_CONSULTATION_LIMIT,
        brain_provider=brain_provider,
        include_demo_fallback=include_demo_fallback,
        allowed_child_ids=allowed_child_ids or None,
        business_fallback=base_repository.fallback,
    )
    analysis_end_date = _resolve_analysis_end_date(
        today=today,
        snapshot=current_snapshot,
        consultation_records=consultation_records,
    )
    if current_source == "demo_suppressed":
        demand_insight_result = {
            "recurringIssueClusters": [],
            "warnings": ["重复问题热度的演示兜底已在当前请求中关闭。"],
            "sourceSummary": {},
        }
    else:
        demand_insight_result = await build_demand_insight_engine(
            repositories=repositories,
            app_snapshot=current_snapshot,
            institution_id=None,
            window_days=window_days,
            limit_per_category=5,
            consultation_limit=DEFAULT_CONSULTATION_LIMIT,
            today=today,
            include_weekly_signals=True,
            brain_provider=brain_provider,
        )

    if current_repository.fallback:
        warnings.append("业务快照当前使用演示或兜底内容；治理指标的结构稳定，但不代表机构真实经营数据。")
    if consultation_fallback_used:
        warnings.append("会诊相关指标当前使用演示会诊兜底，因为近期会诊快照暂不可用。")
    if not safe_list(current_snapshot.get("tasks")):
        warnings.append("当前快照缺少标准任务数据，因此复查与家庭任务指标可能改用历史投影。")
    if not safe_list(current_snapshot.get("mobileDrafts")):
        warnings.append("当前缺少教师移动草稿埋点，因此教师记录待复核率可能回退到会诊证据口径。")
    warnings.extend([warning for warning in safe_list(demand_insight_result.get("warnings")) if _coerce_text(warning)])
    if repositories.degraded:
        warnings.append(f"记忆后端已降级为 {repositories.backend}，近期链路记录与快照可能不完整。")
    warnings.extend([f"childcare_snapshot:{error}" for error in current_repository.errors])

    context = AdminQualityMetricsContext(
        repositories=repositories,
        repository=current_repository,
        current_source=current_source,
        snapshot=current_snapshot,
        consultation_records=consultation_records,
        consultation_fallback_used=consultation_fallback_used,
        analysis_end_date=analysis_end_date,
        window_days=window_days,
        demand_insight_result=demand_insight_result,
        warnings=warnings,
    )

    window = {
        "days": window_days,
        "startDate": context.start_date.isoformat(),
        "endDate": context.analysis_end_date.isoformat(),
    }

    consultation_metric = _consultation_closure_metric(context, window)
    follow_up_metric = _follow_up_48h_metric(context, window)
    guardian_metric = _guardian_feedback_metric(context, window)
    home_task_metric = _home_task_execution_metric(context, window)
    teacher_confidence_metric = _teacher_low_confidence_metric(context, window)
    morning_latency_metric = _morning_check_response_latency_metric(context, window)
    recurring_metric = _recurring_issue_heat_metric(context, window)
    suggestion_metric = _suggestion_effectiveness_metric(context, window)

    children_count = len(context.children_by_id)
    feedback_children = {
        _coerce_text(record.get("childId"))
        for record in context.recent_feedbacks
        if _coerce_text(record.get("childId"))
    }
    mobile_draft_children = {
        _coerce_text(record.get("childId"))
        for record in context.recent_mobile_drafts
        if _coerce_text(record.get("childId"))
    }

    source_summary = {
        "businessSnapshotSource": current_source,
        "consultationSnapshotCount": consultation_snapshot_count,
        "consultationFallbackUsed": consultation_fallback_used,
        "consultationRecordCount": len(context.recent_consultations),
        "feedbackRecordCount": len(context.recent_feedbacks),
        "growthRecordCount": len(context.recent_growth_records),
        "healthRecordCount": len(context.recent_health_records),
        "taskCheckInCount": len(context.recent_task_check_ins),
        "interventionCardCount": len(context.recent_intervention_cards),
        "reminderCount": len(context.recent_reminders),
        "taskCount": len(context.recent_tasks),
        "mobileDraftCount": len(context.recent_mobile_drafts),
        "weeklyReportSnapshotCount": int(safe_dict(demand_insight_result.get("sourceSummary")).get("weeklyReportSnapshotCount") or 0),
        "channels": _unique_strings(
            [
                "children" if children_count else "",
                "consultation_result" if context.recent_consultations else "",
                "guardian_feedback" if context.recent_feedbacks else "",
                "growth" if context.recent_growth_records else "",
                "health" if context.recent_health_records else "",
                "task_check_ins" if context.recent_task_check_ins else "",
                "intervention_cards" if context.recent_intervention_cards else "",
                "reminders" if context.recent_reminders else "",
                "tasks" if context.recent_tasks else "",
                "mobile_drafts" if context.recent_mobile_drafts else "",
            ],
            limit=12,
        ),
        "degraded": repositories.degraded,
        "errors": [*current_repository.errors, *repositories.errors],
    }

    data_quality = {
        "totalChildren": children_count,
        "feedbackChildren": len(feedback_children),
        "feedbackCoverageRatio": _round_ratio(len(feedback_children) / children_count) if children_count else 0.0,
        "mobileDraftChildren": len(mobile_draft_children),
        "mobileDraftCoverageRatio": _round_ratio(len(mobile_draft_children) / children_count) if children_count else 0.0,
        "consultationCount": len(context.recent_consultations),
        "taskCount": len(context.recent_tasks),
        "sparse": children_count == 0 or (len(context.recent_feedbacks) < 2 and len(context.recent_consultations) < 2),
        "fallbackUsed": bool(
            current_repository.fallback
            or consultation_fallback_used
            or any(metric.get("fallback") for metric in (
                consultation_metric,
                follow_up_metric,
                guardian_metric,
                home_task_metric,
                teacher_confidence_metric,
                morning_latency_metric,
                recurring_metric,
                suggestion_metric,
            ))
        ),
        "demoOnly": current_repository.fallback,
    }

    return {
        "schemaVersion": "v1-admin-quality-metrics",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "window": window,
        "consultationClosureRate": consultation_metric,
        "followUp48hCompletionRate": follow_up_metric,
        "guardianFeedbackRate": guardian_metric,
        "homeTaskExecutionRate": home_task_metric,
        "teacherLowConfidenceRate": teacher_confidence_metric,
        "morningCheckResponseLatency": morning_latency_metric,
        "recurringIssueHeat": recurring_metric,
        "suggestionEffectiveness": suggestion_metric,
        "sourceSummary": source_summary,
        "dataQuality": data_quality,
        "warnings": _unique_strings(context.warnings, limit=16),
        "source": current_source,
        "fallback": bool(data_quality["fallbackUsed"]),
    }
