from __future__ import annotations

import asyncio

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.db.repositories import reset_repository_bundle_cache
from app.main import app
from app.providers.mock import build_mock_high_risk_bundle
from app.schemas.demand_insight import DemandInsightResponse
from app.services.high_risk_consultation_contract import normalize_high_risk_consultation_result
from app.services.orchestrator import build_memory_service, build_orchestrator, reset_orchestrator_runtime
from app.services.weekly_report_contract import build_actionized_weekly_report


def configure_memory_backend(monkeypatch, *, backend: str, sqlite_path: str | None = None):
    monkeypatch.setenv("BRAIN_MEMORY_BACKEND", backend)
    if sqlite_path is not None:
        monkeypatch.setenv("BRAIN_MEMORY_SQLITE_PATH", sqlite_path)
    else:
        monkeypatch.delenv("BRAIN_MEMORY_SQLITE_PATH", raising=False)

    monkeypatch.delenv("MYSQL_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)

    get_settings.cache_clear()
    reset_repository_bundle_cache()
    reset_orchestrator_runtime()


def build_app_snapshot() -> dict:
    return {
        "children": [
            {"id": "c-1", "name": "安安", "birthDate": "2023-10-01", "institutionId": "inst-test", "className": "向阳班"},
            {"id": "c-2", "name": "乐乐", "birthDate": "2023-06-01", "institutionId": "inst-test", "className": "向阳班"},
            {"id": "c-3", "name": "晨晨", "birthDate": "2021-05-01", "institutionId": "inst-test", "className": "星河班"},
            {"id": "c-4", "name": "朵朵", "birthDate": "2021-08-01", "institutionId": "inst-test", "className": "星河班"},
        ],
        "attendance": [],
        "meals": [],
        "growth": [
            {
                "id": "g-1",
                "childId": "c-1",
                "createdAt": "2026-04-09T12:10:00+08:00",
                "description": "午睡前哭闹，需要安抚",
                "followUpAction": "继续观察午睡过渡",
                "tags": ["午睡", "哭闹"],
                "needsAttention": True,
            },
            {
                "id": "g-2",
                "childId": "c-1",
                "createdAt": "2026-04-07T12:10:00+08:00",
                "description": "入睡前仍有分离焦虑",
                "followUpAction": "午睡前固定安抚",
                "tags": ["入睡", "焦虑"],
                "needsAttention": True,
            },
            {
                "id": "g-3",
                "childId": "c-2",
                "createdAt": "2026-04-08T12:10:00+08:00",
                "description": "午餐继续挑食，补水动作难坚持",
                "followUpAction": "鼓励补水和尝试蔬菜",
                "tags": ["挑食", "补水"],
                "needsAttention": True,
            },
        ],
        "feedback": [
            {
                "feedbackId": "fb-1",
                "id": "fb-1",
                "childId": "c-1",
                "date": "2026-04-09",
                "submittedAt": "2026-04-09T20:00:00+08:00",
                "status": "partial",
                "content": "Sleep settling still needed repeated soothing.",
                "notes": "Sleep settling still needed repeated soothing.",
                "sourceRole": "parent",
                "sourceChannel": "manual",
                "executed": True,
                "executionStatus": "partial",
                "executorRole": "parent",
                "improved": False,
                "improvementStatus": "no_change",
                "childReaction": "resisted",
                "barriers": ["Need repeated soothing"],
                "attachments": {},
                "source": {"kind": "structured", "workflow": "manual"},
                "fallback": {},
                "freeNote": "Need to keep recording the bedtime transition.",
            },
            {
                "feedbackId": "fb-2",
                "id": "fb-2",
                "childId": "c-1",
                "date": "2026-04-08",
                "submittedAt": "2026-04-08T20:00:00+08:00",
                "status": "partial",
                "content": "Bedtime was still slow and anxious.",
                "notes": "Bedtime was still slow and anxious.",
                "sourceRole": "parent",
                "sourceChannel": "manual",
                "executed": True,
                "executionStatus": "partial",
                "executorRole": "parent",
                "improved": "unknown",
                "improvementStatus": "unknown",
                "childReaction": "neutral",
                "barriers": [],
                "attachments": {},
                "source": {"kind": "structured", "workflow": "manual"},
                "fallback": {},
                "freeNote": "Keep tracking both nap and bedtime.",
            },
            {
                "feedbackId": "fb-3",
                "id": "fb-3",
                "childId": "c-2",
                "date": "2026-04-09",
                "submittedAt": "2026-04-09T21:00:00+08:00",
                "status": "partial",
                "content": "Picky eating and hydration follow-through remained weak.",
                "notes": "Picky eating and hydration follow-through remained weak.",
                "sourceRole": "parent",
                "sourceChannel": "manual",
                "relatedTaskId": "card-c-2",
                "executed": False,
                "executionStatus": "unable_to_execute",
                "executorRole": "parent",
                "improved": False,
                "improvementStatus": "worse",
                "childReaction": "resisted",
                "barriers": ["Hydration prompts were hard to sustain"],
                "attachments": {},
                "source": {"kind": "structured", "workflow": "manual"},
                "fallback": {},
                "freeNote": "Hydration prompts were hard to sustain.",
                "interventionCardId": "card-c-2",
            },
        ],
        "health": [
            {
                "id": "h-1",
                "childId": "c-1",
                "date": "2026-04-09",
                "isAbnormal": False,
                "remark": "午睡前情绪紧张",
                "mood": "午睡前哭闹",
            },
            {
                "id": "h-2",
                "childId": "c-2",
                "date": "2026-04-08",
                "isAbnormal": True,
                "remark": "晨检后仍需复查饮水与食欲",
                "mood": "精神一般",
                "temperature": 37.4,
            },
        ],
        "taskCheckIns": [],
        "interventionCards": [
            {
                "id": "card-c-2",
                "title": "乐乐干预卡",
                "riskLevel": "medium",
                "targetChildId": "c-2",
                "triggerReason": "挑食与补水偏低",
                "summary": "今晚继续补水并记录蔬菜尝试",
                "todayInSchoolAction": "继续鼓励喝水",
                "tonightHomeAction": "晚饭前后各提醒一次喝水",
                "homeSteps": [],
                "observationPoints": [],
                "tomorrowObservationPoint": "",
                "reviewIn48h": "",
                "parentMessageDraft": "",
                "teacherFollowupDraft": "",
                "source": "mock",
            }
        ],
        "consultations": [],
        "mobileDrafts": [],
        "reminders": [],
        "updatedAt": "2026-04-10T00:00:00Z",
    }


def build_consultation_result(
    *,
    child_id: str,
    child_name: str,
    generated_at: str,
    risk_level: str,
    trigger_reason: str,
) -> dict:
    payload = {
        "targetChildId": child_id,
        "currentUser": {"className": "向阳班"},
        "visibleChildren": [{"id": child_id, "name": child_name}],
        "presentChildren": [{"id": child_id, "name": child_name}],
        "healthCheckRecords": [],
        "growthRecords": [],
        "guardianFeedbacks": [],
        "debugMemory": True,
        "_memory_trace_meta": {
            "memory_context_used": True,
            "memory_context_count": 1,
            "memory_context_backend": "sqlite",
            "memory_context_degraded": False,
            "memory_used_sources": ["agent_state_snapshots", "agent_trace_log"],
        },
    }
    raw = build_mock_high_risk_bundle(payload)
    raw["generatedAt"] = generated_at
    raw["riskLevel"] = risk_level
    raw["summary"] = f"{child_name} 的会诊摘要"
    raw["triggerReason"] = trigger_reason
    raw["triggerReasons"] = [trigger_reason]
    raw["keyFindings"] = [trigger_reason]
    raw["tonightAtHomeActions"] = [trigger_reason, "今晚把家长反馈补齐"]
    raw["todayInSchoolActions"] = ["今天先补齐园内观察记录"]
    raw["followUp48h"] = ["48 小时后复查执行结果"]
    raw["providerTrace"] = {
        **raw["providerTrace"],
        "provider": "mock-brain",
        "source": "mock",
        "model": "mock-high-risk-v1",
        "requestId": f"req-{child_id}",
        "transport": "fastapi-brain",
        "transportSource": "fastapi-brain",
        "consultationSource": "mock",
        "fallbackReason": "mock-provider",
        "brainProvider": "mock",
        "realProvider": False,
        "fallback": True,
    }

    return normalize_high_risk_consultation_result(
        raw,
        payload=payload,
        brain_provider="mock",
        default_transport="fastapi-brain",
        default_transport_source="fastapi-brain",
        default_consultation_source="mock",
        default_fallback_reason="mock-provider",
    )


def seed_memory_records():
    memory = build_memory_service()
    consultation_specs = [
        ("c-1", "安安", "2026-04-09T18:00:00+08:00", "high", "午睡前哭闹与入睡困难反复出现"),
        ("c-3", "晨晨", "2026-04-08T18:00:00+08:00", "high", "午睡与情绪安抚问题再次触发会诊"),
        ("c-2", "乐乐", "2026-04-08T10:00:00+08:00", "medium", "挑食与补水偏低继续触发会诊"),
    ]

    for index, (child_id, child_name, generated_at, risk_level, trigger_reason) in enumerate(consultation_specs, start=1):
        result = build_consultation_result(
            child_id=child_id,
            child_name=child_name,
            generated_at=generated_at,
            risk_level=risk_level,
            trigger_reason=trigger_reason,
        )
        asyncio.run(
            memory.save_consultation_snapshot(
                child_id=child_id,
                session_id=result["consultationId"],
                snapshot_type="consultation-result",
                input_summary=f"consultation {index}",
                snapshot_json={
                    "task": "high-risk-consultation",
                    "traceId": f"trace-demand-{index}",
                    "result": result,
                },
            )
        )

    weekly_report = build_actionized_weekly_report(
        role="admin",
        snapshot={"overview": {"feedbackCount": 2, "pendingReviewCount": 1, "healthAbnormalCount": 1}},
        summary="本周午睡与反馈闭环仍是治理重点",
        highlights=["午睡问题反复出现"],
        risks=["午睡与入睡过渡仍反复出现"],
        next_week_actions=["优先看午睡与反馈闭环"],
        trend_prediction="stable",
        disclaimer="test only",
        source="mock",
        model="mock-weekly-v2",
    )
    asyncio.run(
        memory.save_consultation_snapshot(
            child_id="c-1",
            session_id="weekly-demand-1",
            snapshot_type="weekly-report-result",
            input_summary="weekly demand insight seed",
            snapshot_json={"task": "weekly-report", "result": weekly_report},
        )
    )


def test_demand_insight_engine_aggregates_request_snapshot_and_memory(tmp_path, monkeypatch):
    sqlite_path = tmp_path / "demand-insight.db"
    configure_memory_backend(monkeypatch, backend="sqlite", sqlite_path=str(sqlite_path))
    seed_memory_records()

    orchestrator = build_orchestrator()
    result = asyncio.run(
        orchestrator.demand_insights(
            {
                "appSnapshot": build_app_snapshot(),
                "windowDays": 14,
                "limitPerCategory": 4,
                "today": "2026-04-10",
            }
        )
    )
    response = DemandInsightResponse.model_validate(result)
    body = response.model_dump(mode="json", by_alias=True)

    assert body["schemaVersion"] == "v1-demand-insight"
    assert body["window"]["days"] == 14
    assert body["sourceSummary"]["businessSnapshotSource"] == "request_snapshot"
    assert body["sourceSummary"]["consultationSnapshotCount"] == 3
    assert body["dataQuality"]["fallbackUsed"] is False
    assert body["topConcernTopics"]
    assert any(item["label"] == "睡眠与午睡过渡" for item in body["topConcernTopics"])
    assert any(item["source"]["businessSnapshotSource"] == "request_snapshot" for item in body["topConcernTopics"])
    assert body["consultationTriggerHeat"]
    assert any(item["label"] == "睡眠与午睡过渡" for item in body["consultationTriggerHeat"])
    assert body["actionDifficultyTopics"]
    assert any(item["label"] == "睡眠与午睡过渡" for item in body["actionDifficultyTopics"])
    assert any(
        item["label"] == "班级：星河班" and item["segmentType"] == "class"
        for item in body["weakFeedbackSegments"]
    )
    assert any(item["label"] == "睡眠与午睡过渡" for item in body["recurringIssueClusters"])
    assert any(item["coverage"]["records"] >= 1 for item in body["topConcernTopics"])


def test_demand_insight_engine_marks_demo_fallback_when_snapshot_and_memory_are_empty(tmp_path, monkeypatch):
    sqlite_path = tmp_path / "demand-insight-demo.db"
    configure_memory_backend(monkeypatch, backend="sqlite", sqlite_path=str(sqlite_path))

    orchestrator = build_orchestrator()
    result = asyncio.run(
        orchestrator.demand_insights(
            {
                "windowDays": 14,
                "limitPerCategory": 2,
                "today": "2026-04-10",
            }
        )
    )
    response = DemandInsightResponse.model_validate(result)
    body = response.model_dump(mode="json", by_alias=True)

    assert body["fallback"] is True
    assert body["source"] == "demo_snapshot"
    assert body["sourceSummary"]["businessSnapshotSource"] == "demo_snapshot"
    assert body["consultationTriggerHeat"]
    assert all(item["source"]["demoOnly"] for item in body["consultationTriggerHeat"])
    assert body["dataQuality"]["demoOnly"] is True
    assert any("demo" in warning or "fallback" in warning for warning in body["warnings"])


def test_demand_insight_endpoint_returns_structured_payload(tmp_path, monkeypatch):
    sqlite_path = tmp_path / "demand-insight-endpoint.db"
    configure_memory_backend(monkeypatch, backend="sqlite", sqlite_path=str(sqlite_path))
    seed_memory_records()

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/agents/insights/demand",
            json={
                "appSnapshot": build_app_snapshot(),
                "windowDays": 14,
                "limitPerCategory": 3,
                "today": "2026-04-10",
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["schemaVersion"] == "v1-demand-insight"
    assert body["window"]["days"] == 14
    assert body["sourceSummary"]["businessSnapshotSource"] == "request_snapshot"
    assert body["dataQuality"]["consultationCount"] == 3
    assert body["topConcernTopics"]
