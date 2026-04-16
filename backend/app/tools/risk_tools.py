from typing import Any

from app.tools.summary_tools import safe_dict, safe_list


def compute_risk_level(score: int) -> str:
    if score >= 75:
        return "high"
    if score >= 40:
        return "medium"
    return "low"


def compute_priority_level(score: int) -> str:
    if score >= 85:
        return "P1"
    if score >= 55:
        return "P2"
    return "P3"


def score_snapshot(summary: dict[str, Any]) -> int:
    health = safe_dict(summary.get("health"))
    growth = safe_dict(summary.get("growth"))
    meals = safe_dict(summary.get("meals"))
    feedback = safe_dict(summary.get("feedback"))

    return min(
        int(health.get("abnormalCount", 0)) * 20
        + int(growth.get("attentionCount", 0)) * 16
        + int(growth.get("pendingReviewCount", 0)) * 14
        + int(meals.get("allergyRiskCount", 0)) * 18
        + max(0, 3 - int(feedback.get("count", 0))) * 6,
        100,
    )


def pick_target_child(payload: dict[str, Any]) -> dict[str, Any]:
    children = safe_list(payload.get("visibleChildren"))
    target_child_id = payload.get("targetChildId")

    if target_child_id:
        for child in children:
            child_dict = safe_dict(child)
            if child_dict.get("id") == target_child_id:
                return child_dict

    return safe_dict(children[0]) if children else {}


def group_children_by_class(children: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for child in children:
        class_name = str(child.get("className") or "未分班")
        grouped.setdefault(class_name, []).append(child)
    return grouped
