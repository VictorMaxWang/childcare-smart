"""历史智能体输出的展示/提示词投影；原始trace和快照始终留在持久层。"""
from __future__ import annotations

from datetime import datetime
import json
import re
from typing import Any


def business_summary_text(value: Any) -> str | None:
    """只接纳最终业务文本，不把对象强转字符串或把调试、推理、JSON片段当照护事实。"""
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text or re.search(r"```|(?:^|[:：])\s*[\[{]|<\/?(?:think|analysis)\b|reasoning_content|snapshot_json|providerTrace", text, re.I):
        return None
    return text[:360]


def final_business_summary(value: Any) -> str | None:
    if not isinstance(value, dict):
        return None
    for key in ("summary", "answer", "assistantAnswer", "parentMessageDraft", "title"):
        text = business_summary_text(value.get(key))
        if text:
            return text
    coordinator = value.get("coordinatorSummary")
    if isinstance(coordinator, dict):
        text = business_summary_text(coordinator.get("finalConclusion"))
        if text:
            return text
    # 仅沿明确的业务结果包装层读取，不遍历metadata、推理或任意嵌套对象。
    for key in ("result", "finalOutput"):
        nested = value.get(key)
        if isinstance(nested, dict) and nested is not value:
            for field in ("summary", "answer", "assistantAnswer", "parentMessageDraft", "title"):
                text = business_summary_text(nested.get(field))
                if text:
                    return text
    return None


def historical_advice(text: Any, source: str, created_at: Any) -> str | None:
    summary = business_summary_text(text)
    if not summary:
        return None
    date = created_at.isoformat() if isinstance(created_at, datetime) else created_at if isinstance(created_at, str) else ""
    date = date[:40] if re.match(r"^\d{4}-\d\d-\d\d", date) else "时间未记录"
    label = {"consultation-result": "历史会诊", "high-risk-consultation": "历史会诊", "parent-follow-up-result": "家长追问",
        "parent-follow-up": "家长追问", "teacher-agent-result": "教师建议", "teacher-agent": "教师建议",
        "health-file-bridge-writeback": "健康材料摘要", "guardian-feedback": "家庭反馈", "memory-search": "历史检索"}.get(source, "历史智能体输出")
    return f"历史建议（{label}；{date}；需人工确认）：{summary}"


def snapshot_history_summary(record: dict[str, Any]) -> str | None:
    raw = record.get("snapshot_json")
    if not isinstance(raw, dict):
        return None
    summary = final_business_summary(raw.get("result")) or final_business_summary(raw)
    return historical_advice(summary, str(record.get("snapshot_type") or ""), record.get("created_at"))


def trace_history_summary(record: dict[str, Any]) -> str | None:
    if record.get("status") in {"failed", "started"}:
        return None
    raw = record.get("output_summary")
    if not isinstance(raw, str):
        return None
    try:
        result = json.loads(raw)
    except (ValueError, TypeError):
        # 480字截断的整包JSON无法证明最终字段；不能退回input或截断推理片段。
        return None
    return historical_advice(final_business_summary(result), str(record.get("node_name") or ""), record.get("created_at"))
