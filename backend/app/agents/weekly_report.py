from __future__ import annotations

from typing import Any

from app.providers.mock import build_mock_weekly_report
from app.services.weekly_report_contract import resolve_weekly_report_role
from app.services.weekly_report_contract import build_actionized_weekly_report
from app.services.structured_text import generate_structured_text, normalize_structured_classification, raise_structured_validation, selected_live_text


async def run_weekly_report(payload: dict[str, Any]) -> dict[str, Any]:
    role = resolve_weekly_report_role(payload)
    if role is None:
        raise ValueError("weekly report role is required")
    if selected_live_text():
        generated = await generate_structured_text(payload, instruction=f"为{role}生成本周复盘。区分记录变化与判断，给出下周一项优先照护动作和需收集的反馈；输入没有记录时明确不足，不把统计零值写成发生过的事实。trendPrediction只能从up、stable、down中选择一个英文值，不得返回多个值、分隔符或解释文本。", shape={
            "summary": "本周记录与缺失信息", "highlights": ["有依据的变化"], "risks": ["需继续观察或缺少的记录"],
            "nextWeekActions": ["下周具体动作与回看点"], "trendPrediction": "stable",
        })
        generated["trendPrediction"] = normalize_structured_classification("trendPrediction", generated["trendPrediction"])
        if not generated["nextWeekActions"]:
            raise_structured_validation("empty-action-list", ["nextWeekActions"])
        report = build_actionized_weekly_report(role=role, snapshot=payload.get("snapshot") or {},
            summary=generated["summary"], highlights=generated["highlights"], risks=generated["risks"],
            next_week_actions=generated["nextWeekActions"], trend_prediction=generated["trendPrediction"],
            disclaimer=generated["disclaimer"], source="ai", model=generated["model"])
        return {**generated, **report}
    return build_mock_weekly_report({**payload, "role": role})
