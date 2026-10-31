import asyncio
import copy
from datetime import UTC, datetime
import json
from types import SimpleNamespace

from app.agents.high_risk_consultation import _memory_sections
from app.providers.mock import build_mock_high_risk_bundle
from app.schemas.memory import AgentStateSnapshotRecord, AgentTraceLogRecord
from app.services.high_risk_consultation_contract import normalize_high_risk_consultation_result
from app.services.memory_service import MemoryService, _snapshot_summary, _trace_signals


WHEN = datetime(2026, 10, 31, 12, 0, tzinfo=UTC)


def snapshot(result=None, **overrides):
    return AgentStateSnapshotRecord(id="snapshot-a", child_id="child-a", snapshot_type="consultation-result", created_at=WHEN,
        input_summary='{"PRIVATE_INPUT":"must not become a child fact"}', snapshot_json={"result": result or {}}, **overrides)


def trace(output):
    return AgentTraceLogRecord(id="trace-a", trace_id="trace-source", child_id="child-a", node_name="teacher-agent", action_type="teacher-agent",
        status="succeeded", created_at=WHEN, input_summary='{"PRIVATE_INPUT":"untrusted input"}', output_summary=output)


def test_trace_signal_uses_final_business_field_not_serialized_result_reasoning_or_metadata():
    record = trace(json.dumps({"source": "ai", "summary": "今晚记录补水，明早与教师核对。", "reasoning_content": "PRIVATE_REASONING", "metadata": {"key": "PRIVATE_METADATA"}}, ensure_ascii=False))
    before = record.model_dump()
    signals = _trace_signals([record])
    assert len(signals) == 1
    assert "今晚记录补水" in signals[0]
    assert "2026-10-31" in signals[0] and "需人工确认" in signals[0]
    assert all(value not in signals[0] for value in ["PRIVATE_REASONING", "PRIVATE_METADATA", '"source"', "PRIVATE_INPUT"])
    assert record.model_dump() == before


def test_snapshot_and_truncated_trace_cannot_fall_back_to_input_json_or_reasoning():
    record = snapshot({"reasoning_content": "PRIVATE_REASONING", "metadata": {"summary": "not a final answer"}})
    assert _snapshot_summary(record) is None
    truncated = json.dumps({"reasoning_content": "PRIVATE_REASONING" * 100, "summary": "never reached"})[:477] + "..."
    assert _trace_signals([trace(truncated)]) == []


def test_real_consultation_prompt_sections_cannot_bypass_safe_memory_summaries():
    raw = trace('{"source":"ai","reasoning_content":"PRIVATE_REASONING","snapshot_json":').model_dump(mode="json")
    good = snapshot({"summary": "已有历史建议是少量尝试食物。"}).model_dump(mode="json")
    sections = _memory_sections({"memory_context": {"recent_snapshots": [good], "relevant_traces": [raw], "prompt_context": {"recent_continuity_signals": ['结合近期：{"PRIVATE_METADATA":true}']}}}, {})
    wire = json.dumps(sections, ensure_ascii=False)
    assert "已有历史建议是少量尝试食物" in wire
    assert "PRIVATE_REASONING" not in wire and "PRIVATE_METADATA" not in wire and "snapshot_json" not in wire


def test_generated_history_evidence_requires_review_even_if_old_payload_claimed_false():
    body = {**build_mock_high_risk_bundle({"targetChildId": "child-a", "visibleChildren": [{"id": "child-a", "name": "合成儿童"}]}),
        "consultationId": "consult-a", "childId": "child-a", "summary": "本轮根据已有记录继续观察。", "continuityNotes": ["历史生成建议（需人工确认）：今晚记录补水。"],
        "evidenceItems": [{"id": "legacy-history", "sourceType": "consultation_history", "summary": "旧模型建议，不是当前儿童事实。", "requiresHumanReview": False},
            {"id": "legacy-json", "sourceType": "consultation_history", "summary": '{"PRIVATE_METADATA":true}', "requiresHumanReview": False}]}
    before = copy.deepcopy(body)
    result = normalize_high_risk_consultation_result(body)
    history = [item for item in result["evidenceItems"] if item["sourceType"] == "consultation_history"]
    assert history and all(item["requiresHumanReview"] is True for item in history)
    assert "PRIVATE_METADATA" not in json.dumps(result["evidenceItems"], ensure_ascii=False)
    assert body == before


def test_search_does_not_reintroduce_raw_vector_copy_or_trace_json_as_continuity():
    good = snapshot({"summary": "今晚记录饮水，明早核对。"})
    bad = trace('{"reasoning_content":"PRIVATE_REASONING","metadata":')
    async def profile(_child): return None
    async def snapshots(**_kwargs): return [good]
    async def traces(**_kwargs): return [bad]
    repositories = SimpleNamespace(get_child_profile_memory=profile, list_recent_snapshots=snapshots, get_recent_traces=traces)
    vectors = SimpleNamespace(search=lambda *_args, **_kwargs: [{"text": '{"snapshot_json":{"PRIVATE_VECTOR":true}}', "score": 1,
        "metadata": {"child_id": "child-a", "source_type": "snapshot", "source_id": "snapshot-a"}}])
    service = MemoryService(repositories, None, vectors)
    hits = asyncio.run(service.search_memory_context("child-a", query="饮水", top_k=5))
    wire = json.dumps([item.model_dump(mode="json") for item in hits], ensure_ascii=False)
    assert hits and "今晚记录饮水" in wire
    assert "PRIVATE_VECTOR" not in wire and "PRIVATE_REASONING" not in wire
