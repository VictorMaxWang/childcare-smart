from __future__ import annotations

import asyncio
import copy
import json
from datetime import UTC, datetime

import pytest

from app.agents import parent_agent
from app.core.config import Settings
from app.providers.base import ProviderResponseError, ProviderTextResult
from app.services import structured_text
from app.services.parent_follow_up_context import build_parent_follow_up_context


def _large_follow_up():
    # 复现真实模式：同一会诊同时在snapshots和consultations中，各自包含旧模型的整包上下文。
    snapshots = [{"id": f"snapshot-{index}", "child_id": "child-a", "snapshot_type": "consultation-result",
        "created_at": "2026-10-31T09:00:00Z", "snapshot_json": {"result": {
            "summary": f"历史照护建议{index}，不能当作儿童事实。",
            "memory_context": {"oldSnapshot": "recursive-agent-payload" * 3_000}}}} for index in range(5)]
    return {"question": "今晚如何调整照护动作？", "suggestionTitle": "已有照护方案", "snapshot": {
        "child": {"id": "child-a", "name": "合成儿童", "allergies": ["鸡蛋"], "ageBandContext": {"ageMonths": 8}},
        "summary": {"feedback": {"count": 20}},
        "recentDetails": {"feedback": [{"id": "feedback-current", "childId": "child-a", "submittedAt": "2026-10-30T23:00:00Z", "notes": "今晚拒绝新食物，已改用少量尝试。"}], "growth": [{"id": "growth-current", "createdAt": "2026-10-31T01:00:00Z", "description": "教师记录了合成幼儿的进餐情况。"}]}},
        "latestFeedback": {"id": "feedback-current", "notes": "今晚拒绝新食物，已改用少量尝试。"},
        "memory_context": {"child_id": "child-a", "recent_snapshots": snapshots, "recent_consultations": snapshots,
            "relevant_traces": [{"id": "trace-a", "child_id": "child-a", "trace_id": "source-trace", "metadata_json": {"raw": "raw-private-trace" * 20_000}}],
            "prompt_context": {"open_loops": ["明早回传接受情况。"]},
            "meta": {"matched_snapshot_ids": ["snapshot-0"], "matched_trace_ids": ["source-trace"]}}}


def test_compact_context_deduplicates_recursive_memory_and_keeps_facts_and_references():
    payload = _large_follow_up()
    before = copy.deepcopy(payload)
    assert len(json.dumps(payload, ensure_ascii=False)) > 235_000
    result = build_parent_follow_up_context(payload, now=datetime(2026, 10, 31, 3, tzinfo=UTC))
    wire = json.dumps(result, ensure_ascii=False)
    assert len(wire) < 20_000
    assert "recursive-agent-payload" not in wire and "raw-private-trace" not in wire
    assert "snapshot_json" not in wire and "metadata_json" not in wire
    assert result["snapshot"]["child"]["allergies"] == ["鸡蛋"]
    assert result["snapshot"]["recentDetails"]["feedback"][0]["id"] == "feedback-current"
    assert result["latestFeedback"]["notes"] == "今晚拒绝新食物，已改用少量尝试。"
    evidence = result["memory_context"]
    assert len(evidence["historicalSuggestions"]) == 5
    assert evidence["sourceReferences"]["matched_snapshot_ids"] == ["snapshot-0"]
    assert evidence["sourceReferences"]["matched_trace_ids"] == ["source-trace"]
    assert evidence["historicalSuggestions"][0]["kind"] == "historical-agent-output"
    assert evidence["prompt_context"]["open_loops"] == ["明早回传接受情况。"]
    assert payload == before, "prompt投影不能修改既有业务或记忆记录"


def test_recent_facts_use_seven_business_days_exclude_future_and_other_children_and_keep_last_history():
    payload = _large_follow_up()
    payload["snapshot"]["recentDetails"]["feedback"] = [
        {"id": "old", "date": "2000-01-01", "notes": "过时情况"},
        {"id": "day-eight", "date": "2026-10-24", "notes": "窗口外"},
        {"id": "first-day", "date": "2026-10-24T16:00:00Z", "notes": "第一业务日"},
        {"id": "last-day", "date": "2026-10-31", "notes": "当前业务日"},
        {"id": "future", "date": "2026-10-31T16:00:00Z", "notes": "未来业务日"},
        {"id": "foreign", "childId": "child-b", "date": "2026-10-31", "notes": "外部儿童"},
    ]
    payload["history"] = [{"role": "user", "content": f"历史追问{index}"} for index in range(10)]
    result = build_parent_follow_up_context(payload, now=datetime(2026, 10, 30, 23, tzinfo=UTC))
    assert {item["id"] for item in result["snapshot"]["recentDetails"]["feedback"]} == {"first-day", "last-day"}
    assert [item["content"] for item in result["history"]] == [f"历史追问{index}" for index in range(4, 10)]
    assert result["evidenceWindow"] == {"startDate": "2026-10-25", "endDate": "2026-10-31", "timeZone": "UTC+08:00", "maxRecordsPerKind": 7}


def test_follow_up_generates_once_with_compacted_context_and_json_contract(monkeypatch):
    monkeypatch.setattr(parent_agent, "selected_live_text", lambda: True)
    monkeypatch.setattr(structured_text, "get_settings", lambda: Settings(ai_provider="maas", ai_api_key="test-only"))
    calls = []
    output = {"answer": "先采用少量尝试。", "keyPoints": ["依据家长反馈"], "nextSteps": ["明早回传"],
        "tonightTopAction": "少量尝试", "whyNow": "记录提示需要观察", "homeSteps": ["不强迫进餐"],
        "observationPoints": ["观察接受情况"], "teacherObservation": "明早核对", "reviewIn48h": "48小时回看", "recommendedQuestions": ["接受情况如何？"]}

    async def answer(_provider, *, prompt, fallback, json_output):
        calls.append(prompt)
        assert json_output is True
        return ProviderTextResult(text=json.dumps(output, ensure_ascii=False), source="ai", provider="maas-llm", model="test-text-model", request_id="test-request")

    monkeypatch.setattr(structured_text, "summarize_async", answer)
    result = asyncio.run(parent_agent.run_parent_follow_up(_large_follow_up()))
    assert len(calls) == 1 and len(calls[0]) < 25_000
    assert "recursive-agent-payload" not in calls[0]
    assert "历史模型摘要仅是过往建议" in calls[0]
    assert result["realProvider"] is True and result["providerTrace"]["requestId"] == "test-request"


def test_existing_structured_request_size_guard_still_stops_before_provider(monkeypatch):
    calls = []

    async def unexpected(*args, **kwargs):
        calls.append(True)
        raise AssertionError("provider must not be reached")

    monkeypatch.setattr(structured_text, "summarize_async", unexpected)
    with pytest.raises(ProviderResponseError, match="context-size-limit"):
        asyncio.run(structured_text.generate_structured_text({"question": "x" * 101_000}, instruction="JSON", shape={"answer": "回答"}))
    assert calls == []


def test_large_individual_fields_and_legacy_nontext_summaries_cannot_expand_prompt_again():
    payload = _large_follow_up()
    huge_text = "很长的业务备注" * 10_000
    huge_value = {f"field-{index}": [huge_text] * 10 for index in range(20)}
    for snapshot in payload["memory_context"]["recent_snapshots"]:
        snapshot["snapshot_json"]["result"]["summary"] = huge_value
    for field in ("health", "meals", "growth", "feedback"):
        payload["snapshot"]["recentDetails"][field] = [{
            "id": f"{field}-{index}", "childId": "child-a", "date": "2026-10-31", "createdAt": "2026-10-31T01:00:00Z",
            "remark": huge_text, "notes": huge_text, "foods": huge_value, "description": huge_text,
        } for index in range(30)]
    payload["snapshot"]["summary"] = {field: huge_value for field in ("health", "meals", "growth", "feedback")}
    result = build_parent_follow_up_context(payload, now=datetime(2026, 10, 31, 3, tzinfo=UTC))
    assert len(json.dumps(result, ensure_ascii=False)) < 50_000
    assert all(item["summary"] is None for item in result["memory_context"]["historicalSuggestions"])
    assert all(0 < len(result["snapshot"]["recentDetails"][field]) <= 7 for field in ("health", "meals", "growth", "feedback"))
