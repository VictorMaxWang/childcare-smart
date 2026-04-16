from __future__ import annotations

from typing import Any, Literal

from app.tools.summary_tools import unique_texts

WeeklyReportRole = Literal["teacher", "admin", "parent"]
WeeklyReportSectionId = Literal[
    "weeklyAnomalies",
    "makeUpItems",
    "nextWeekObservationFocus",
    "highRiskClosureRate",
    "parentFeedbackRate",
    "classIssueHeat",
    "nextWeekGovernanceFocus",
    "weeklyChanges",
    "topHomeAction",
    "feedbackNeeded",
]


def normalize_weekly_report_role(value: Any) -> WeeklyReportRole | None:
    raw = str(value or "").strip()
    if not raw:
        return None

    normalized = raw.lower().replace("_", "").replace("-", "").replace(" ", "")
    if normalized == "teacher" or "teacher" in normalized or "教师" in raw:
        return "teacher"
    if normalized == "admin" or "admin" in normalized or any(token in raw for token in ("管理员", "园长", "机构")):
        return "admin"
    if normalized == "parent" or "parent" in normalized or any(token in raw for token in ("家长", "家庭")):
        return "parent"
    return None


def resolve_weekly_report_role(payload: dict[str, Any]) -> WeeklyReportRole | None:
    snapshot = payload.get("snapshot")
    snapshot_role = snapshot.get("role") if isinstance(snapshot, dict) else None
    return normalize_weekly_report_role(payload.get("role")) or normalize_weekly_report_role(snapshot_role)


def _item(label: str, detail: str) -> dict[str, str]:
    return {
        "label": label,
        "detail": detail,
    }


def _items_from_strings(items: list[str], prefix: str) -> list[dict[str, str]]:
    return [_item(f"{prefix}{index}", detail) for index, detail in enumerate(unique_texts(items, limit=4), start=1)]


def _teacher_sections(
    snapshot: dict[str, Any],
    highlights: list[str],
    risks: list[str],
    next_week_actions: list[str],
) -> list[dict[str, Any]]:
    overview = snapshot.get("overview") if isinstance(snapshot.get("overview"), dict) else {}
    top_attention_children = snapshot.get("topAttentionChildren") if isinstance(snapshot.get("topAttentionChildren"), list) else []
    anomaly_items = unique_texts(
        risks
        + [
            (
                f"本周累计 {overview.get('healthAbnormalCount', 0)} 条健康异常，需要在班级周复盘中点名。"
                if int(overview.get("healthAbnormalCount", 0) or 0) > 0
                else "本周未出现集中健康异常，但仍需保留晨检异常复盘位。"
            ),
            (
                f"{top_attention_children[0].get('childName', '重点儿童')} 仍在重点观察名单中，建议周初先复查。"
                if top_attention_children and isinstance(top_attention_children[0], dict)
                else ""
            ),
        ]
    )
    make_up_items = unique_texts(
        [
            (
                f"优先补齐 {overview.get('pendingReviewCount', 0)} 项待复查记录，避免周初继续积压。"
                if int(overview.get("pendingReviewCount", 0) or 0) > 0
                else "待复查项目已基本清空，下周继续保持补录节奏。"
            ),
            (
                f"核对本周 {overview.get('feedbackCount', 0)} 条家园反馈是否都已回填到班级记录。"
                if int(overview.get("feedbackCount", 0) or 0) > 0
                else "家园反馈量偏少，下周固定一次反馈回流检查。"
            ),
            highlights[0] if highlights else "",
        ],
        limit=3,
    )
    observation_items = next_week_actions or ["下周固定一次周初重点儿童复盘。"]

    return [
        {
            "id": "weeklyAnomalies",
            "title": "本周异常",
            "summary": anomaly_items[0] if anomaly_items else "本周无集中异常，但仍需保留异常复盘入口。",
            "items": _items_from_strings(anomaly_items, "异常项"),
        },
        {
            "id": "makeUpItems",
            "title": "补录项",
            "summary": make_up_items[0] if make_up_items else "下周先清空待复查与家园反馈补录空档。",
            "items": _items_from_strings(make_up_items, "补录项"),
        },
        {
            "id": "nextWeekObservationFocus",
            "title": "下周重点观察",
            "summary": observation_items[0],
            "items": _items_from_strings(observation_items, "观察点"),
        },
    ]


def _admin_sections(
    snapshot: dict[str, Any],
    highlights: list[str],
    risks: list[str],
    next_week_actions: list[str],
) -> list[dict[str, Any]]:
    overview = snapshot.get("overview") if isinstance(snapshot.get("overview"), dict) else {}
    top_attention_children = snapshot.get("topAttentionChildren") if isinstance(snapshot.get("topAttentionChildren"), list) else []
    closure_summary = (
        f"当前仍有 {overview.get('pendingReviewCount', 0)} 项待复查，周初要先追闭环率再扩展新动作。"
        if int(overview.get("pendingReviewCount", 0) or 0) > 0
        else "高风险闭环项已基本清空，可把治理重心转向连续追踪。"
    )
    feedback_summary = (
        f"本周已沉淀 {overview.get('feedbackCount', 0)} 条家园反馈，下一步要看是否形成有效回流。"
        if int(overview.get("feedbackCount", 0) or 0) > 0
        else "家长反馈覆盖仍偏薄，需在下周治理动作中单独追踪。"
    )
    heat_items = unique_texts(
        risks
        + [
            (
                f"{child.get('childName', '重点儿童')} 本周被点名 {child.get('attentionCount', 0)} 次，可作为班级问题热力入口。"
                if isinstance(child, dict)
                else ""
            )
            for child in top_attention_children[:2]
        ]
        + ([highlights[0]] if highlights else []),
        limit=4,
    )

    return [
        {
            "id": "highRiskClosureRate",
            "title": "高风险闭环率",
            "summary": closure_summary,
            "items": _items_from_strings(
                [
                    closure_summary,
                    (
                        f"把 {overview.get('healthAbnormalCount', 0)} 条健康异常与待复查任务对齐，避免重复派单。"
                        if int(overview.get("healthAbnormalCount", 0) or 0) > 0
                        else "下周保留一次高风险复盘，确认无新增积压。"
                    ),
                ],
                "闭环动作",
            ),
        },
        {
            "id": "parentFeedbackRate",
            "title": "家长反馈率",
            "summary": feedback_summary,
            "items": _items_from_strings(
                [feedback_summary, next_week_actions[1] if len(next_week_actions) > 1 else "把家长反馈完成率列为固定治理指标。"],
                "反馈动作",
            ),
        },
        {
            "id": "classIssueHeat",
            "title": "班级问题热力",
            "summary": heat_items[0] if heat_items else "当前未见明显班级热区，但仍需保留重点班级热力回看。",
            "items": _items_from_strings(heat_items or ["周初先点名复盘高风险班级热区。"], "热区"),
        },
        {
            "id": "nextWeekGovernanceFocus",
            "title": "下周治理重点",
            "summary": next_week_actions[0] if next_week_actions else "下周先收敛治理重点，再安排班级与家园闭环动作。",
            "items": _items_from_strings(next_week_actions or ["下周优先处理高风险闭环和家长反馈回流。"], "治理动作"),
        },
    ]


def _parent_sections(
    snapshot: dict[str, Any],
    highlights: list[str],
    risks: list[str],
    next_week_actions: list[str],
    trend_prediction: str,
) -> list[dict[str, Any]]:
    overview = snapshot.get("overview") if isinstance(snapshot.get("overview"), dict) else {}
    change_summary = highlights[0] if highlights else f"本周主要变化集中在出勤 {overview.get('attendanceRate', 0)}% 和重点观察项是否继续增加。"
    home_action = next_week_actions[0] if next_week_actions else "下周只保留一个最重要的家庭配合动作，并在执行后回传结果。"
    feedback_items = unique_texts(
        [
            risks[0] if risks else "",
            (
                f"请补充本周 {overview.get('feedbackCount', 0)} 次家园互动里最关键的一次家庭反馈。"
                if int(overview.get("feedbackCount", 0) or 0) > 0
                else "请补充一次家庭侧观察，帮助老师判断本周变化是否持续。"
            ),
            "如果你观察到问题在加重，请在周初第一天直接反馈给老师。"
            if trend_prediction == "up"
            else "如果你观察到问题已改善，也请回传给老师，方便调整下周重点。",
        ],
        limit=3,
    )

    return [
        {
            "id": "weeklyChanges",
            "title": "本周变化",
            "summary": change_summary,
            "items": _items_from_strings(
                [
                    change_summary,
                    highlights[1] if len(highlights) > 1 else f"本周共记录 {overview.get('mealRecordCount', 0)} 条饮食相关信息。",
                ],
                "变化",
            ),
        },
        {
            "id": "topHomeAction",
            "title": "一个最重要家庭行动",
            "summary": home_action,
            "items": _items_from_strings([home_action], "家庭行动"),
        },
        {
            "id": "feedbackNeeded",
            "title": "需反馈问题",
            "summary": feedback_items[0] if feedback_items else "请补充一次家庭反馈，帮助老师判断下周是否需要继续重点观察。",
            "items": _items_from_strings(feedback_items or ["请补充一次家庭反馈。"], "反馈问题"),
        },
    ]


def build_weekly_report_sections(
    *,
    role: WeeklyReportRole,
    snapshot: dict[str, Any],
    highlights: list[str],
    risks: list[str],
    next_week_actions: list[str],
    trend_prediction: str,
) -> list[dict[str, Any]]:
    if role == "teacher":
        return _teacher_sections(snapshot, highlights, risks, next_week_actions)
    if role == "admin":
        return _admin_sections(snapshot, highlights, risks, next_week_actions)
    return _parent_sections(snapshot, highlights, risks, next_week_actions, trend_prediction)


def build_weekly_report_primary_action(
    *,
    role: WeeklyReportRole,
    next_week_actions: list[str],
    sections: list[dict[str, Any]],
) -> dict[str, Any] | None:
    detail = next_week_actions[0] if next_week_actions else None
    if detail is None and sections:
        last_section = sections[-1]
        items = last_section.get("items") if isinstance(last_section, dict) else []
        if isinstance(items, list) and items and isinstance(items[0], dict):
            detail = str(items[0].get("detail") or "").strip() or None

    if not detail:
        return None

    return {
        "title": (
            "下周班级第一动作"
            if role == "teacher"
            else "下周治理第一动作"
            if role == "admin"
            else "下周家庭第一动作"
        ),
        "detail": detail,
        "ownerRole": role,
        "dueWindow": "下周第一天反馈" if role == "parent" else "下周优先处理",
    }


def build_actionized_weekly_report(
    *,
    role: WeeklyReportRole,
    snapshot: dict[str, Any],
    summary: str,
    highlights: list[str],
    risks: list[str],
    next_week_actions: list[str],
    trend_prediction: str,
    disclaimer: str,
    source: str,
    model: str | None = None,
    continuity_notes: list[str] | None = None,
    memory_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    sections = build_weekly_report_sections(
        role=role,
        snapshot=snapshot,
        highlights=highlights,
        risks=risks,
        next_week_actions=next_week_actions,
        trend_prediction=trend_prediction,
    )

    result = {
        "schemaVersion": "v2-actionized",
        "role": role,
        "summary": summary,
        "highlights": highlights,
        "risks": risks,
        "nextWeekActions": next_week_actions,
        "trendPrediction": trend_prediction,
        "sections": sections,
        "primaryAction": build_weekly_report_primary_action(
            role=role,
            next_week_actions=next_week_actions,
            sections=sections,
        ),
        "disclaimer": disclaimer,
        "source": source,
    }
    if model:
        result["model"] = model
    if continuity_notes:
        result["continuityNotes"] = continuity_notes
    if memory_meta is not None:
        result["memoryMeta"] = memory_meta
    return result
