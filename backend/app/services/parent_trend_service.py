from __future__ import annotations

from datetime import date, datetime, timedelta
from statistics import mean, pstdev
from typing import Any

from app.core.config import get_settings
from app.db.childcare_repository import ChildcareRepository
from app.services.age_band_policy import get_age_band_label, resolve_age_band_context


SUPPORTED_WINDOWS = (7, 14, 30)
WINDOW_KEYWORDS = {
    30: ("最近一个月", "近30天"),
    14: ("最近两周", "半个月", "近14天"),
    7: ("这周", "最近一周", "近7天", "这几天"),
}
INTENT_KEYWORDS = {
    "emotion": ("分离焦虑", "情绪", "哭闹", "安抚", "想妈妈", "拒园"),
    "diet": ("饮食", "吃饭", "喝水", "挑食", "蔬菜", "蛋白"),
    "sleep": ("午睡", "入睡", "夜醒", "睡眠"),
    "health": ("发热", "体温", "晨检", "健康"),
}
INTENT_METRICS = {
    "emotion": "emotion_calm_score",
    "diet": "diet_quality_score",
    "sleep": "sleep_stability_score",
    "health": "health_stability_score",
    "growth_overall": "overall_growth_score",
}
INTENT_LABELS = {
    "emotion": "情绪状态",
    "diet": "饮食情况",
    "sleep": "睡眠稳定度",
    "health": "健康状态",
    "growth_overall": "综合成长状态",
}
FOLLOW_UP_HINTS = {
    "emotion": "接下来可以继续看入园分离、午睡前情绪和安抚时间是否持续缩短。",
    "diet": "接下来可以继续看进餐完成度、补水状态和对蔬菜、蛋白的接受度是否更稳定。",
    "sleep": "接下来可以继续看入睡时长、午睡前波动和夜间睡眠反馈是否连续平稳。",
    "health": "接下来可以继续看晨检异常、体温波动和身体不适描述是否继续减少。",
    "growth_overall": "接下来可以继续看情绪、饮食、睡眠和健康四个维度是否一起保持稳定。",
}
SERIES_LABELS = {
    "emotion_calm_score": ("情绪平稳度", "score", "line"),
    "distress_signals": ("波动信号", "count", "bar"),
    "diet_quality_score": ("饮食质量", "score", "line"),
    "hydration_ml": ("补水趋势", "ml", "bar"),
    "picky_signals": ("挑食信号", "count", "bar"),
    "sleep_stability_score": ("睡眠稳定度", "score", "line"),
    "sleep_distress_signals": ("睡眠波动信号", "count", "bar"),
    "health_stability_score": ("健康稳定度", "score", "line"),
    "abnormal_checks": ("异常晨检", "count", "bar"),
    "max_temperature_c": ("最高体温", "celsius", "line"),
    "overall_growth_score": ("综合成长", "score", "line"),
}
OVERALL_COMPONENTS = {
    "emotion_calm_score": 0.35,
    "diet_quality_score": 0.25,
    "sleep_stability_score": 0.20,
    "health_stability_score": 0.20,
}
EMOTION_NEGATIVE_KEYWORDS = ("分离焦虑", "哭", "哭闹", "想妈妈", "想家", "安抚", "紧张", "焦虑", "拒园", "不安", "黏人")
EMOTION_POSITIVE_KEYWORDS = ("平静", "稳定", "主动", "适应", "缓解", "放松", "愉快", "顺利")
SLEEP_NEGATIVE_KEYWORDS = ("午睡", "入睡", "夜醒", "哭", "哭闹", "安抚", "睡前", "难睡", "不睡")
SLEEP_POSITIVE_KEYWORDS = ("入睡顺利", "睡得安稳", "安稳", "睡眠平稳", "很快入睡", "睡得好")
HEALTH_NEGATIVE_KEYWORDS = ("发热", "咳", "流涕", "腹泻", "呕吐", "不适", "精神差", "皮疹", "异常", "咽痛")
PICKY_KEYWORDS = ("挑食", "不吃", "未动", "只吃", "回避", "蔬菜", "蛋白", "拒绝", "剩余明显")


FEEDBACK_EXECUTION_LABELS = {
    "not_started": "尚未开始执行",
    "partial": "只完成了一部分",
    "completed": "已经完成执行",
    "unable_to_execute": "暂时无法执行",
}
FEEDBACK_IMPROVEMENT_LABELS = {
    "no_change": "还没有看到明显改善",
    "slight_improvement": "已经出现轻微改善",
    "clear_improvement": "已经出现明确改善",
    "worse": "当前状态比之前更吃力",
    "unknown": "效果暂时还不明确",
}
FEEDBACK_REACTION_LABELS = {
    "resisted": "孩子明显抗拒",
    "neutral": "孩子反应一般",
    "accepted": "孩子愿意配合",
    "improved": "孩子反应比之前更顺",
}


def _payload_get(payload: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in payload:
            return payload.get(key)
    return None


def _age_band_focus_text(age_band_context: dict[str, Any] | None) -> str | None:
    if not isinstance(age_band_context, dict):
        return None

    policy = age_band_context.get("policy")
    if not isinstance(policy, dict):
        return None

    weekly_focus = [
        text
        for text in (_coerce_string(item) for item in policy.get("weeklyReportFocus") or [])
        if text
    ]
    if not weekly_focus:
        return None
    return "、".join(weekly_focus[:2])


def _build_age_band_explanation(age_band_context: dict[str, Any] | None) -> str | None:
    focus_text = _age_band_focus_text(age_band_context)
    label = get_age_band_label(age_band_context)
    if not focus_text or not label:
        return None
    return f"结合{label}阶段的照护重点，当前更适合把变化放在{focus_text}这些托育线索上连续观察。"


def _build_age_band_supporting_signal(age_band_context: dict[str, Any] | None) -> dict[str, Any] | None:
    focus_text = _age_band_focus_text(age_band_context)
    label = get_age_band_label(age_band_context)
    if not focus_text or not label:
        return None
    return {
        "sourceType": "age_band_policy",
        "summary": f"{label}阶段优先看{focus_text}这些照护线索的连续变化。",
    }


def _build_age_band_warning(age_band_context: dict[str, Any] | None) -> str | None:
    if not isinstance(age_band_context, dict):
        return None

    policy = age_band_context.get("policy")
    if not isinstance(policy, dict):
        return None

    reminders = [
        text
        for text in (_coerce_string(item) for item in policy.get("doNotOverstateSignals") or [])
        if text
    ]
    if not reminders:
        return None
    return f"年龄分层提醒：{reminders[0]}"


def _coerce_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _coerce_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_date(value: Any) -> date | None:
    text = _coerce_string(value)
    if not text:
        return None
    normalized = text.replace("Z", "+00:00")
    try:
        if "T" in normalized:
            return datetime.fromisoformat(normalized).date()
        return date.fromisoformat(normalized)
    except ValueError:
        return None


def _format_day(value: date) -> str:
    return value.isoformat()


def _day_label(value: date) -> str:
    return value.strftime("%m/%d")


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def _round_number(value: float | None, digits: int = 1) -> float | None:
    if value is None:
        return None
    return round(float(value), digits)


def _contains_any(text: str, keywords: tuple[str, ...]) -> bool:
    return any(keyword in text for keyword in keywords)


def _extract_strings(value: Any) -> list[str]:
    if isinstance(value, list):
        result: list[str] = []
        for entry in value:
            text = _coerce_string(entry)
            if text:
                result.append(text)
        return result
    text = _coerce_string(value)
    return [text] if text else []


def _record_date(record: dict[str, Any], *keys: str) -> date | None:
    for key in keys:
        parsed = _parse_date(record.get(key))
        if parsed is not None:
            return parsed
    return None


def _default_score_from_meal(record: dict[str, Any]) -> float:
    intake_level = (_coerce_string(record.get("intakeLevel")) or "").lower()
    preference = (_coerce_string(record.get("preference")) or "").lower()
    intake_score = {"high": 86.0, "good": 82.0, "medium": 72.0, "neutral": 70.0, "low": 56.0, "poor": 48.0}.get(
        intake_level,
        68.0,
    )
    if any(flag in preference for flag in ("like", "accept")):
        intake_score += 4.0
    if any(flag in preference for flag in ("dislike", "refuse", "low")):
        intake_score -= 6.0
    return intake_score


def _is_picky_eating(record: dict[str, Any]) -> bool:
    preference = (_coerce_string(record.get("preference")) or "").lower()
    intake_level = (_coerce_string(record.get("intakeLevel")) or "").lower()
    summary = _coerce_string((record.get("aiEvaluation") or {}).get("summary")) or ""
    foods_text = " ".join(_extract_strings(record.get("foods")))
    return (
        any(flag in preference for flag in ("dislike", "refuse", "low"))
        or intake_level in {"low", "poor"}
        or _contains_any(f"{summary} {foods_text}", PICKY_KEYWORDS)
    )


def _resolve_window_days(question: str, requested_window_days: Any) -> tuple[int, int | None, list[str]]:
    warnings: list[str] = []
    requested_value: int | None = None
    if requested_window_days is not None:
        try:
            requested_value = int(requested_window_days)
        except (TypeError, ValueError):
            warnings.append("时间窗未能识别，已使用系统默认的 7 天视角。")

    if requested_value in SUPPORTED_WINDOWS:
        return requested_value, requested_value, warnings
    if requested_value is not None and requested_value not in SUPPORTED_WINDOWS:
        resolved = min(SUPPORTED_WINDOWS, key=lambda item: abs(item - requested_value))
        warnings.append(f"时间窗仅支持 7、14、30 天，已自动换算为 {resolved} 天。")
        return resolved, requested_value, warnings

    for window_days, keywords in WINDOW_KEYWORDS.items():
        if any(keyword in question for keyword in keywords):
            return window_days, None, warnings
    return 7, None, warnings


def _resolve_intent(question: str) -> str:
    for intent, keywords in INTENT_KEYWORDS.items():
        if any(keyword in question for keyword in keywords):
            return intent
    return "growth_overall"


def _resolve_child(repository: ChildcareRepository, question: str, explicit_child_id: str | None) -> dict[str, Any]:
    if explicit_child_id:
        child = repository.get_child_by_id(explicit_child_id)
        if child:
            return child
        raise ValueError("未找到对应的 childId，请确认前端传入的 childId 是否有效。")

    matched = repository.find_child_from_task(question)
    if matched:
        return matched

    children = [child for child in repository.snapshot.get("children", []) if isinstance(child, dict)]
    if len(children) == 1:
        return children[0]

    raise ValueError("未能从问题中识别到孩子，请补充 childId 或在问题里带上孩子姓名。")


def _candidate_end_date(repository: ChildcareRepository, history: dict[str, Any]) -> date:
    candidates: list[date] = []
    updated_at = _parse_date(repository.snapshot.get("updatedAt"))
    if updated_at is not None:
        candidates.append(updated_at)

    for record in history.get("meals", []):
        parsed = _record_date(record, "date")
        if parsed is not None:
            candidates.append(parsed)
    for record in history.get("health", []):
        parsed = _record_date(record, "date")
        if parsed is not None:
            candidates.append(parsed)
    for record in history.get("feedback", []):
        parsed = _record_date(record, "date")
        if parsed is not None:
            candidates.append(parsed)
    for record in history.get("growth", []):
        parsed = _record_date(record, "createdAt", "reviewDate")
        if parsed is not None:
            candidates.append(parsed)

    return max(candidates) if candidates else datetime.now().date()


def _bucket_history(history: dict[str, Any], start_date: date, end_date: date) -> dict[str, dict[str, list[dict[str, Any]]]]:
    buckets: dict[str, dict[str, list[dict[str, Any]]]] = {
        _format_day(start_date + timedelta(days=offset)): {"meals": [], "health": [], "growth": [], "feedback": []}
        for offset in range((end_date - start_date).days + 1)
    }

    def _append(records: list[dict[str, Any]], bucket_name: str, *keys: str) -> None:
        for record in records:
            parsed = _record_date(record, *keys)
            if parsed is None or parsed < start_date or parsed > end_date:
                continue
            buckets[_format_day(parsed)][bucket_name].append(record)

    _append(history.get("meals", []), "meals", "date")
    _append(history.get("health", []), "health", "date")
    _append(history.get("growth", []), "growth", "createdAt", "reviewDate")
    _append(history.get("feedback", []), "feedback", "date")
    return buckets


def _build_point(day: date, *, value: float | int | None, raw_count: int, missing: bool) -> dict[str, Any]:
    return {
        "date": _format_day(day),
        "label": _day_label(day),
        "value": _round_number(value) if isinstance(value, float) else value,
        "rawCount": raw_count,
        "missing": missing,
    }


def _append_signal(signals: list[dict[str, Any]], *, source_type: str, date_value: str | None, summary: str | None) -> None:
    text = _coerce_string(summary)
    if not text:
        return
    signals.append({"sourceType": source_type, "date": date_value, "summary": text})


def _unique_signals(signals: list[dict[str, Any]], limit: int = 6) -> list[dict[str, Any]]:
    sorted_signals = sorted(
        signals,
        key=lambda item: (_parse_date(item.get("date")) or date.min, _coerce_string(item.get("summary")) or ""),
        reverse=True,
    )
    result: list[dict[str, Any]] = []
    seen: set[tuple[str | None, str]] = set()
    for signal in sorted_signals:
        summary = _coerce_string(signal.get("summary"))
        if not summary:
            continue
        key = (_coerce_string(signal.get("date")), summary)
        if key in seen:
            continue
        seen.add(key)
        result.append(signal)
        if len(result) >= limit:
            break
    return result


def _texts_for_emotion(record: dict[str, Any], source_type: str) -> str:
    parts: list[str] = []
    if source_type == "growth":
        parts.extend(_extract_strings(record.get("tags")))
        parts.extend(_extract_strings(record.get("selectedIndicators")))
        parts.extend(_extract_strings(record.get("description")))
        parts.extend(_extract_strings(record.get("followUpAction")))
    elif source_type == "health":
        parts.extend(_extract_strings(record.get("mood")))
        parts.extend(_extract_strings(record.get("remark")))
    elif source_type == "feedback":
        parts.extend(_extract_strings(record.get("content")))
        parts.extend(_extract_strings(record.get("childReaction")))
        parts.extend(_extract_strings(record.get("freeNote")))
        parts.extend(_extract_strings(record.get("improved")))
    return " ".join(parts)


def _texts_for_sleep(record: dict[str, Any], source_type: str) -> str:
    return _texts_for_emotion(record, source_type)


def _feedback_binding(record: dict[str, Any]) -> str | None:
    parts = [
        f"任务 {_coerce_string(record.get('relatedTaskId'))}" if _coerce_string(record.get("relatedTaskId")) else None,
        f"会诊 {_coerce_string(record.get('relatedConsultationId'))}"
        if _coerce_string(record.get("relatedConsultationId"))
        else None,
    ]
    rendered = " / ".join(part for part in parts if part)
    return rendered or None


def _feedback_signal_summary(record: dict[str, Any]) -> str | None:
    execution_status = _coerce_string(record.get("executionStatus")) or "not_started"
    improvement_status = _coerce_string(record.get("improvementStatus")) or "unknown"
    child_reaction = _coerce_string(record.get("childReaction")) or "neutral"
    barriers = _extract_strings(record.get("barriers"))
    notes = _coerce_string(record.get("notes")) or _coerce_string(record.get("content"))
    binding = _feedback_binding(record)

    parts = [
        f"家长结构化反馈显示家庭动作{FEEDBACK_EXECUTION_LABELS.get(execution_status, execution_status)}。",
        f"孩子表现为“{FEEDBACK_REACTION_LABELS.get(child_reaction, child_reaction)}”。",
        f"当前判断是“{FEEDBACK_IMPROVEMENT_LABELS.get(improvement_status, improvement_status)}”。",
        f"这条反馈绑定到{binding}。"
        if binding
        else None,
        f"主要阻碍：{barriers[0]}。"
        if barriers
        else None,
        f"家长补充：{notes}"
        if notes
        else None,
    ]

    rendered = " ".join(part for part in parts if part)
    return rendered or None


def _build_feedback_signal_bundle(feedback_records: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], str | None, list[str]]:
    ordered = sorted(
        [record for record in feedback_records if isinstance(record, dict)],
        key=lambda item: _record_date(item, "submittedAt", "date") or date.min,
        reverse=True,
    )
    signals: list[dict[str, Any]] = []
    warnings: list[str] = []
    explanation: str | None = None

    for record in ordered[:2]:
        summary = _feedback_signal_summary(record)
        if summary:
            _append_signal(
                signals,
                source_type="feedback",
                date_value=_coerce_string(record.get("submittedAt")) or _coerce_string(record.get("date")),
                summary=summary,
            )
            if explanation is None:
                explanation = summary

        execution_status = _coerce_string(record.get("executionStatus")) or "unknown"
        improvement_status = _coerce_string(record.get("improvementStatus")) or "unknown"
        barriers = _extract_strings(record.get("barriers"))

        if execution_status in {"not_started", "partial", "unable_to_execute"}:
            warnings.append(
                f"家长最近反馈提示家庭动作{FEEDBACK_EXECUTION_LABELS.get(execution_status, execution_status)}。"
            )
        if improvement_status in {"no_change", "worse"}:
            warnings.append(
                f"家长最近反馈提示当前效果为“{FEEDBACK_IMPROVEMENT_LABELS.get(improvement_status, improvement_status)}”。"
            )
        if barriers:
            warnings.append(f"家长最近反馈提到执行阻碍：{barriers[0]}。")

    return _unique_signals(signals, limit=2), explanation, warnings[:3]


def _series_from_points(series_id: str, points: list[dict[str, Any]]) -> dict[str, Any]:
    label, unit, kind = SERIES_LABELS[series_id]
    return {"id": series_id, "label": label, "unit": unit, "kind": kind, "data": points}


def _build_emotion_metrics(day_range: list[date], buckets: dict[str, dict[str, list[dict[str, Any]]]]) -> dict[str, Any]:
    score_points: list[dict[str, Any]] = []
    distress_points: list[dict[str, Any]] = []
    signals: list[dict[str, Any]] = []

    for day in day_range:
        bucket = buckets[_format_day(day)]
        relevant_records: list[tuple[str, dict[str, Any], str]] = []
        distress_count = 0
        positive_count = 0
        attention_penalty = 0

        for source_type in ("growth", "health", "feedback"):
            for record in bucket[source_type]:
                text = _texts_for_emotion(record, source_type)
                if not text:
                    continue
                is_relevant = _contains_any(text, EMOTION_NEGATIVE_KEYWORDS) or _contains_any(text, EMOTION_POSITIVE_KEYWORDS)
                if source_type == "growth":
                    tags = " ".join(_extract_strings(record.get("tags")))
                    is_relevant = is_relevant or _contains_any(tags, EMOTION_NEGATIVE_KEYWORDS)
                if not is_relevant:
                    continue
                relevant_records.append((source_type, record, text))
                if _contains_any(text, EMOTION_NEGATIVE_KEYWORDS):
                    distress_count += 1
                if _contains_any(text, EMOTION_POSITIVE_KEYWORDS):
                    positive_count += 1
                if bool(record.get("needsAttention")):
                    attention_penalty += 1

        if not relevant_records:
            score_points.append(_build_point(day, value=None, raw_count=0, missing=True))
            distress_points.append(_build_point(day, value=None, raw_count=0, missing=True))
            continue

        score = _clamp(88.0 - distress_count * 18.0 - attention_penalty * 6.0 + positive_count * 6.0, 18.0, 98.0)
        score_points.append(_build_point(day, value=score, raw_count=len(relevant_records), missing=False))
        distress_points.append(_build_point(day, value=distress_count, raw_count=len(relevant_records), missing=False))

        for source_type, record, text in relevant_records[:2]:
            summary = _coerce_string(record.get("description")) or _coerce_string(record.get("remark")) or _coerce_string(record.get("content")) or text
            _append_signal(signals, source_type=source_type, date_value=_format_day(day), summary=summary)

    return {
        "metric": "emotion_calm_score",
        "primaryPoints": score_points,
        "series": [
            _series_from_points("emotion_calm_score", score_points),
            _series_from_points("distress_signals", distress_points),
        ],
        "signals": _unique_signals(signals),
    }


def _build_diet_metrics(day_range: list[date], buckets: dict[str, dict[str, list[dict[str, Any]]]]) -> dict[str, Any]:
    score_points: list[dict[str, Any]] = []
    hydration_points: list[dict[str, Any]] = []
    picky_points: list[dict[str, Any]] = []
    signals: list[dict[str, Any]] = []

    for day in day_range:
        meals = buckets[_format_day(day)]["meals"]
        if not meals:
            score_points.append(_build_point(day, value=None, raw_count=0, missing=True))
            hydration_points.append(_build_point(day, value=None, raw_count=0, missing=True))
            picky_points.append(_build_point(day, value=None, raw_count=0, missing=True))
            continue

        nutrition_scores = [_coerce_float(record.get("nutritionScore")) for record in meals]
        normalized_scores = [score for score in nutrition_scores if score is not None]
        if not normalized_scores:
            normalized_scores = [_default_score_from_meal(record) for record in meals]

        hydration = sum(_coerce_float(record.get("waterMl")) or 0.0 for record in meals)
        picky_count = sum(1 for record in meals if _is_picky_eating(record))
        hydration_bonus = 4.0 if hydration >= 180 else 2.0 if hydration >= 120 else 0.0
        score = _clamp(mean(normalized_scores) - picky_count * 6.0 + hydration_bonus, 18.0, 98.0)

        score_points.append(_build_point(day, value=score, raw_count=len(meals), missing=False))
        hydration_points.append(_build_point(day, value=hydration, raw_count=len(meals), missing=False))
        picky_points.append(_build_point(day, value=picky_count, raw_count=len(meals), missing=False))

        for record in meals:
            if not _is_picky_eating(record):
                continue
            summary = _coerce_string((record.get("aiEvaluation") or {}).get("summary"))
            foods = "、".join(_extract_strings(record.get("foods"))[:3])
            _append_signal(
                signals,
                source_type="meal",
                date_value=_format_day(day),
                summary=summary or f"当日饮食记录显示对 {foods or '当前餐食'} 的接受度偏低。",
            )

    return {
        "metric": "diet_quality_score",
        "primaryPoints": score_points,
        "series": [
            _series_from_points("diet_quality_score", score_points),
            _series_from_points("hydration_ml", hydration_points),
            _series_from_points("picky_signals", picky_points),
        ],
        "signals": _unique_signals(signals),
    }


def _build_sleep_metrics(day_range: list[date], buckets: dict[str, dict[str, list[dict[str, Any]]]]) -> dict[str, Any]:
    score_points: list[dict[str, Any]] = []
    distress_points: list[dict[str, Any]] = []
    signals: list[dict[str, Any]] = []

    for day in day_range:
        bucket = buckets[_format_day(day)]
        relevant_records: list[tuple[str, dict[str, Any], str]] = []
        distress_count = 0
        positive_count = 0
        attention_penalty = 0

        for source_type in ("growth", "health", "feedback"):
            for record in bucket[source_type]:
                text = _texts_for_sleep(record, source_type)
                if not text:
                    continue
                if not (_contains_any(text, SLEEP_NEGATIVE_KEYWORDS) or _contains_any(text, SLEEP_POSITIVE_KEYWORDS)):
                    continue
                relevant_records.append((source_type, record, text))
                if _contains_any(text, SLEEP_NEGATIVE_KEYWORDS):
                    distress_count += 1
                if _contains_any(text, SLEEP_POSITIVE_KEYWORDS):
                    positive_count += 1
                if bool(record.get("needsAttention")):
                    attention_penalty += 1

        if not relevant_records:
            score_points.append(_build_point(day, value=None, raw_count=0, missing=True))
            distress_points.append(_build_point(day, value=None, raw_count=0, missing=True))
            continue

        score = _clamp(88.0 - distress_count * 16.0 - attention_penalty * 6.0 + positive_count * 5.0, 18.0, 98.0)
        score_points.append(_build_point(day, value=score, raw_count=len(relevant_records), missing=False))
        distress_points.append(_build_point(day, value=distress_count, raw_count=len(relevant_records), missing=False))

        for source_type, record, text in relevant_records[:2]:
            summary = _coerce_string(record.get("description")) or _coerce_string(record.get("remark")) or _coerce_string(record.get("content")) or text
            _append_signal(signals, source_type=source_type, date_value=_format_day(day), summary=summary)

    return {
        "metric": "sleep_stability_score",
        "primaryPoints": score_points,
        "series": [
            _series_from_points("sleep_stability_score", score_points),
            _series_from_points("sleep_distress_signals", distress_points),
        ],
        "signals": _unique_signals(signals),
    }


def _build_health_metrics(day_range: list[date], buckets: dict[str, dict[str, list[dict[str, Any]]]]) -> dict[str, Any]:
    score_points: list[dict[str, Any]] = []
    abnormal_points: list[dict[str, Any]] = []
    temperature_points: list[dict[str, Any]] = []
    signals: list[dict[str, Any]] = []

    for day in day_range:
        records = buckets[_format_day(day)]["health"]
        if not records:
            score_points.append(_build_point(day, value=None, raw_count=0, missing=True))
            abnormal_points.append(_build_point(day, value=None, raw_count=0, missing=True))
            temperature_points.append(_build_point(day, value=None, raw_count=0, missing=True))
            continue

        abnormal_checks = sum(1 for record in records if bool(record.get("isAbnormal")))
        temperatures: list[float] = []
        for record in records:
            temperature = _coerce_float(record.get("temperature"))
            if temperature is not None:
                temperatures.append(temperature)
        max_temperature = max(temperatures) if temperatures else None
        remarks_text = " ".join(
            part
            for record in records
            for part in (_coerce_string(record.get("remark")), _coerce_string(record.get("mood")))
            if part
        )
        negative_hits = 1 if remarks_text and _contains_any(remarks_text, HEALTH_NEGATIVE_KEYWORDS) else 0
        fever_penalty = 0.0
        if max_temperature is not None and max_temperature >= 38.0:
            fever_penalty = 26.0
        elif max_temperature is not None and max_temperature >= 37.3:
            fever_penalty = 12.0

        score = _clamp(92.0 - abnormal_checks * 25.0 - fever_penalty - negative_hits * 6.0, 10.0, 98.0)
        score_points.append(_build_point(day, value=score, raw_count=len(records), missing=False))
        abnormal_points.append(_build_point(day, value=abnormal_checks, raw_count=len(records), missing=False))
        temperature_points.append(_build_point(day, value=max_temperature, raw_count=len(records), missing=max_temperature is None))

        for record in records[:2]:
            summary = _coerce_string(record.get("remark")) or _coerce_string(record.get("mood"))
            if summary or bool(record.get("isAbnormal")) or max_temperature is not None:
                rendered = summary or f"当日晨检最高体温 {max_temperature:.1f}℃。"
                _append_signal(signals, source_type="health", date_value=_format_day(day), summary=rendered)

    return {
        "metric": "health_stability_score",
        "primaryPoints": score_points,
        "series": [
            _series_from_points("health_stability_score", score_points),
            _series_from_points("abnormal_checks", abnormal_points),
            _series_from_points("max_temperature_c", temperature_points),
        ],
        "signals": _unique_signals(signals),
    }


def _build_overall_metrics(day_range: list[date], component_metrics: dict[str, dict[str, Any]]) -> dict[str, Any]:
    overall_points: list[dict[str, Any]] = []
    signals: list[dict[str, Any]] = []

    component_point_maps: dict[str, dict[str, dict[str, Any]]] = {}
    for metric_id, metric_payload in component_metrics.items():
        component_point_maps[metric_id] = {point["date"]: point for point in metric_payload["primaryPoints"]}
        signals.extend(metric_payload["signals"])

    for day in day_range:
        date_key = _format_day(day)
        weighted_total = 0.0
        total_weight = 0.0
        observed_components = 0
        for metric_id, weight in OVERALL_COMPONENTS.items():
            point = component_point_maps[metric_id][date_key]
            value = point.get("value")
            if value is None:
                continue
            weighted_total += float(value) * weight
            total_weight += weight
            observed_components += 1

        if not observed_components or total_weight <= 0:
            overall_points.append(_build_point(day, value=None, raw_count=0, missing=True))
            continue

        overall_points.append(
            _build_point(
                day,
                value=weighted_total / total_weight,
                raw_count=observed_components,
                missing=False,
            )
        )

    return {
        "metric": "overall_growth_score",
        "primaryPoints": overall_points,
        "series": [
            _series_from_points("overall_growth_score", overall_points),
            _series_from_points("emotion_calm_score", component_metrics["emotion_calm_score"]["primaryPoints"]),
            _series_from_points("diet_quality_score", component_metrics["diet_quality_score"]["primaryPoints"]),
            _series_from_points("sleep_stability_score", component_metrics["sleep_stability_score"]["primaryPoints"]),
            _series_from_points("health_stability_score", component_metrics["health_stability_score"]["primaryPoints"]),
        ],
        "signals": _unique_signals(signals),
    }


def _split_for_comparison(points: list[dict[str, Any]]) -> tuple[list[float], list[float]]:
    midpoint = max(1, len(points) // 2)
    baseline = [float(point["value"]) for point in points[:midpoint] if point.get("value") is not None]
    recent = [float(point["value"]) for point in points[midpoint:] if point.get("value") is not None]
    if baseline and recent:
        return baseline, recent

    observed = [float(point["value"]) for point in points if point.get("value") is not None]
    if len(observed) >= 2:
        observed_midpoint = max(1, len(observed) // 2)
        return observed[:observed_midpoint], observed[observed_midpoint:]
    return observed, observed


def _build_comparison(points: list[dict[str, Any]]) -> tuple[dict[str, Any], str, float]:
    values = [float(point["value"]) for point in points if point.get("value") is not None]
    if not values:
        return {"baselineAvg": None, "recentAvg": None, "deltaPct": None, "direction": "insufficient"}, "需关注", 0.0

    baseline_values, recent_values = _split_for_comparison(points)
    baseline_avg = mean(baseline_values) if baseline_values else None
    recent_avg = mean(recent_values) if recent_values else None
    delta = (recent_avg - baseline_avg) if baseline_avg is not None and recent_avg is not None else None
    delta_pct = None
    direction = "insufficient"
    if delta is not None and baseline_avg and abs(baseline_avg) > 1e-6:
        delta_pct = (delta / baseline_avg) * 100.0
    if delta is not None:
        if delta >= 2.0:
            direction = "up"
        elif delta <= -2.0:
            direction = "down"
        else:
            direction = "flat"

    volatility = pstdev(values) if len(values) > 1 else 0.0
    last_three = [float(point["value"]) for point in points[-3:] if point.get("value") is not None]

    if baseline_avg is None or recent_avg is None:
        trend_label = "波动" if volatility >= 12.0 else "稳定"
    elif delta >= 8.0 and last_three and all(value >= baseline_avg - 3.0 for value in last_three):
        trend_label = "改善"
    elif delta <= -8.0 or sum(1 for value in last_three if value < 55.0) >= 2:
        trend_label = "需关注"
    elif abs(delta) < 6.0 and volatility >= 12.0:
        trend_label = "波动"
    else:
        trend_label = "稳定"

    return (
        {
            "baselineAvg": _round_number(baseline_avg),
            "recentAvg": _round_number(recent_avg if recent_avg is not None else mean(values)),
            "deltaPct": _round_number(delta_pct),
            "direction": direction,
        },
        trend_label,
        _round_number(recent_avg if recent_avg is not None else mean(values)) or 0.0,
    )


def _trend_conclusion(intent: str, child_name: str | None, window_days: int, trend_label: str) -> str:
    child_prefix = f"{child_name}的" if child_name else ""
    metric_label = INTENT_LABELS[intent]
    if trend_label == "改善":
        return f"最近 {window_days} 天，{child_prefix}{metric_label}整体在往更好的方向走。"
    if trend_label == "波动":
        return f"最近 {window_days} 天，{child_prefix}{metric_label}有一些起伏，暂时更适合看连续变化。"
    if trend_label == "稳定":
        return f"最近 {window_days} 天，{child_prefix}{metric_label}整体比较稳定。"
    return f"最近 {window_days} 天，{child_prefix}{metric_label}出现了一些需要继续留意的信号。"


def _comparison_sentence(comparison: dict[str, Any], observed_days: int, window_days: int) -> str:
    recent_avg = comparison.get("recentAvg")
    baseline_avg = comparison.get("baselineAvg")
    delta_pct = comparison.get("deltaPct")
    if recent_avg is None or baseline_avg is None:
        return f"当前时间窗内有效记录覆盖 {observed_days}/{window_days} 天，趋势判断仍以连续补充记录为主。"
    if delta_pct is None:
        return f"后半段和前半段的平均水平接近，当前有效记录覆盖 {observed_days}/{window_days} 天。"

    direction = "高了" if delta_pct >= 0 else "低了"
    return (
        f"和前半段相比，后半段的平均表现{direction} {abs(delta_pct):.1f}%，"
        f"当前有效记录覆盖 {observed_days}/{window_days} 天。"
    )


def _maybe_extend_with_memory(
    signals: list[dict[str, Any]],
    payload: dict[str, Any],
) -> tuple[list[dict[str, Any]], str | None, dict[str, Any] | None]:
    memory_context = payload.get("memory_context")
    if not isinstance(memory_context, dict):
        return signals, None, None

    prompt_context = memory_context.get("prompt_context")
    meta = memory_context.get("meta") if isinstance(memory_context.get("meta"), dict) else None
    continuity_note: str | None = None
    continuity_signals: list[dict[str, Any]] = []

    if isinstance(prompt_context, dict):
        recent_signals = prompt_context.get("recent_continuity_signals")
        if isinstance(recent_signals, list):
            for item in recent_signals[:2]:
                text = _coerce_string(item)
                if text:
                    continuity_signals.append({"sourceType": "memory", "date": None, "summary": text})

        open_loops = prompt_context.get("open_loops")
        if isinstance(open_loops, list):
            open_loop = next((_coerce_string(item) for item in open_loops if _coerce_string(item)), None)
            if open_loop:
                continuity_note = f"也可以结合之前的跟进重点“{open_loop}”继续观察。"

    return _unique_signals([*signals, *continuity_signals]), continuity_note, meta


async def run_parent_trend_query(payload: dict[str, Any]) -> dict[str, Any]:
    question = _coerce_string(_payload_get(payload, "question"))
    if not question:
        raise ValueError("question 不能为空。")

    window_days, requested_window_days, warnings = _resolve_window_days(
        question,
        _payload_get(payload, "windowDays", "window_days"),
    )
    intent = _resolve_intent(question)

    settings = get_settings()
    repository = await ChildcareRepository.create(
        app_snapshot=_payload_get(payload, "appSnapshot", "app_snapshot"),
        institution_id=_coerce_string(_payload_get(payload, "institutionId", "institution_id")),
        database_url=settings.resolved_mysql_url,
    )

    explicit_child_id = _coerce_string(_payload_get(payload, "childId", "child_id"))
    child = _resolve_child(repository, question, explicit_child_id)
    child_id = _coerce_string(child.get("id"))
    if not child_id:
        raise ValueError("孩子信息缺少 id，无法计算趋势。")

    history = repository.get_child_history(child_id, window_days)
    end_date = _candidate_end_date(repository, history)
    start_date = end_date - timedelta(days=window_days - 1)
    day_range = [start_date + timedelta(days=offset) for offset in range(window_days)]
    buckets = _bucket_history(history, start_date, end_date)

    emotion_metrics = _build_emotion_metrics(day_range, buckets)
    diet_metrics = _build_diet_metrics(day_range, buckets)
    sleep_metrics = _build_sleep_metrics(day_range, buckets)
    health_metrics = _build_health_metrics(day_range, buckets)
    overall_metrics = _build_overall_metrics(
        day_range,
        {
            "emotion_calm_score": emotion_metrics,
            "diet_quality_score": diet_metrics,
            "sleep_stability_score": sleep_metrics,
            "health_stability_score": health_metrics,
        },
    )

    metric_lookup = {
        "emotion": emotion_metrics,
        "diet": diet_metrics,
        "sleep": sleep_metrics,
        "health": health_metrics,
        "growth_overall": overall_metrics,
    }
    selected_metrics = metric_lookup[intent]
    primary_points = selected_metrics["primaryPoints"]
    observed_days = sum(1 for point in primary_points if point.get("value") is not None)
    coverage_ratio = observed_days / window_days if window_days else 0.0
    sparse = observed_days == 0 or coverage_ratio < 0.4 or observed_days < min(3, window_days)

    comparison, trend_label, trend_score = _build_comparison(primary_points)
    if observed_days == 0:
        trend_label = "需关注"
        trend_score = 0.0
        warnings.append("当前时间窗内数据不足，暂时无法形成稳定趋势判断。")
    elif sparse:
        warnings.append("当前时间窗内有效记录较少，图表更适合作为参考，不建议单独作为判断依据。")

    if repository.fallback:
        warnings.append("当前使用的是演示数据或回退数据，请以真实班级记录为准。")
    if repository.errors:
        warnings.extend("数据源回退：" + error for error in repository.errors)

    feedback_signals, feedback_explanation, feedback_warnings = _build_feedback_signal_bundle(
        history.get("feedback", [])
    )
    age_band_context = resolve_age_band_context(
        {
            "birthDate": _coerce_string(child.get("birthDate")),
            "ageBand": _coerce_string(child.get("ageBand")),
            "asOfDate": end_date.isoformat(),
        }
    )
    warnings.extend(feedback_warnings)
    supporting_signals, continuity_note, memory_meta = _maybe_extend_with_memory(
        [*selected_metrics["signals"], *feedback_signals],
        payload,
    )
    age_band_supporting_signal = _build_age_band_supporting_signal(age_band_context)
    if age_band_supporting_signal is not None:
        supporting_signals = _unique_signals([age_band_supporting_signal, *supporting_signals])

    age_band_warning = _build_age_band_warning(age_band_context)
    if age_band_warning:
        warnings.append(age_band_warning)

    deduped_warnings: list[str] = []
    seen_warnings: set[str] = set()
    for warning in warnings:
        text = _coerce_string(warning)
        if not text or text in seen_warnings:
            continue
        seen_warnings.add(text)
        deduped_warnings.append(text)

    age_band_explanation = _build_age_band_explanation(age_band_context)
    explanation = " ".join(
        part
        for part in (
            _trend_conclusion(intent, _coerce_string(child.get("name")), window_days, trend_label),
            _comparison_sentence(comparison, observed_days, window_days),
            feedback_explanation,
            age_band_explanation,
            FOLLOW_UP_HINTS[intent],
            continuity_note,
        )
        if part
    )

    child_summary = repository.child_summary(child)
    response: dict[str, Any] = {
        "query": {
            "question": question,
            "requestedWindowDays": requested_window_days,
            "resolvedWindowDays": window_days,
            "childId": child_summary.get("childId"),
            "childName": child_summary.get("name"),
        },
        "intent": intent,
        "metric": INTENT_METRICS[intent],
        "child": child_summary,
        "windowDays": window_days,
        "range": {
            "startDate": _format_day(start_date),
            "endDate": _format_day(end_date),
        },
        "labels": [_format_day(day) for day in day_range],
        "xAxis": [_day_label(day) for day in day_range],
        "series": selected_metrics["series"],
        "trendLabel": trend_label,
        "trendScore": trend_score,
        "comparison": comparison,
        "explanation": explanation,
        "supportingSignals": supporting_signals,
        "dataQuality": {
            "observedDays": observed_days,
            "coverageRatio": _round_number(coverage_ratio, 2) or 0.0,
            "sparse": sparse,
            "fallbackUsed": repository.fallback,
            "source": repository.source,
        },
        "warnings": deduped_warnings,
        "source": repository.source,
        "fallback": repository.fallback,
    }
    if payload.get("debugMemory") and memory_meta is not None:
        response["memoryMeta"] = {
            "backend": _coerce_string(memory_meta.get("backend")) or "memory",
            "degraded": bool(memory_meta.get("degraded")),
            "usedSources": list(memory_meta.get("used_sources") or []),
        }
    return response
