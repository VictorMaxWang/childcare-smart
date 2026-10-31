from __future__ import annotations

from typing import Any

from app.providers.mock import build_mock_follow_up, build_mock_suggestion
from app.services.parent_follow_up_context import build_parent_follow_up_context
from app.services.structured_text import generate_structured_text, normalize_structured_classification, raise_structured_validation, selected_live_text


async def run_parent_suggestions(payload: dict[str, Any]) -> dict[str, Any]:
    if selected_live_text():
        result = await generate_structured_text(payload, instruction="生成家长个性化照护方案。summary说明依据哪些近期记录，actions和actionPlan说明今晚如何做、明早看什么、48小时后何时回看。riskLevel只能从low、medium、high中选择一个英文值；trendPrediction只能从up、stable、down中选择一个英文值，不能返回多个值、分隔符或解释文本。", shape={
            "riskLevel": "low", "summary": "记录依据与缺失信息", "highlights": ["有依据的变化"],
            "concerns": ["需补充的信息或需留意的情况"], "actions": ["具体照护动作"],
            "actionPlan": {"schoolActions": ["园内动作"], "familyActions": ["家庭动作"], "reviewActions": ["回看时间和观察点"]},
            "trendPrediction": "stable",
        })
        result["riskLevel"] = normalize_structured_classification("riskLevel", result["riskLevel"])
        result["trendPrediction"] = normalize_structured_classification("trendPrediction", result["trendPrediction"])
        if not result["actions"]:
            raise_structured_validation("empty-action-list", ["actions"])
        if not result["actionPlan"]["familyActions"]:
            raise_structured_validation("empty-action-list", ["actionPlan.familyActions"])
        return result
    return build_mock_suggestion({**payload, "workflow": str(payload.get("workflow") or "parent-suggestions")})


async def run_parent_follow_up(payload: dict[str, Any]) -> dict[str, Any]:
    if selected_live_text():
        return await generate_structured_text(build_parent_follow_up_context(payload), instruction="回答家长追问，结合既有方案、最新家庭反馈与教师记录调整一个优先动作。明确哪些信息不足，避免重复没有依据的旧建议。历史模型摘要仅是过往建议，不能当作儿童事实；事实依据以当前授权近期记录及其日期、来源引用为准。记录投影有数量和时间边界，不能把未提供的日期推断为没有发生。", shape={
            "answer": "回答", "keyPoints": ["要点"], "nextSteps": ["下一步"], "tonightTopAction": "今晚优先动作",
            "whyNow": "记录依据", "homeSteps": ["家庭步骤"], "observationPoints": ["观察点"],
            "teacherObservation": "教师明早观察点", "reviewIn48h": "48小时回看", "recommendedQuestions": ["可继续追问"],
        })
    return build_mock_follow_up({**payload, "workflow": str(payload.get("workflow") or "parent-follow-up")})
