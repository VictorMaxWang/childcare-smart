from __future__ import annotations

import asyncio

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.db.repositories import reset_repository_bundle_cache
from app.main import app
from app.providers.mock import build_mock_high_risk_bundle
from app.schemas.admin_quality_metrics import AdminQualityMetricsResponse
from app.services.high_risk_consultation_contract import normalize_high_risk_consultation_result
from app.services.orchestrator import build_memory_service, build_orchestrator, reset_orchestrator_runtime


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
            {"id": "c-1", "name": "Anan", "birthDate": "2022-10-01", "institutionId": "inst-test", "className": "Sunshine"},
            {"id": "c-2", "name": "Lele", "birthDate": "2022-06-01", "institutionId": "inst-test", "className": "Sunshine"},
            {"id": "c-3", "name": "Chenchen", "birthDate": "2021-05-01", "institutionId": "inst-test", "className": "Sunshine"},
        ],
        "attendance": [],
        "meals": [],
        "growth": [
            {
                "id": "g-1",
                "childId": "c-1",
                "createdAt": "2026-04-09T12:00:00+08:00",
                "description": "Nap transition still unstable and needs support.",
                "followUpAction": "Continue sleep transition observation.",
                "tags": ["sleep", "transition"],
                "needsAttention": True,
            },
            {
                "id": "g-2",
                "childId": "c-1",
                "createdAt": "2026-04-08T12:30:00+08:00",
                "description": "Nap settling remained slow for the second straight day.",
                "followUpAction": "Keep the 48h sleep review open.",
                "tags": ["sleep", "review"],
                "needsAttention": True,
            },
            {
                "id": "g-3",
                "childId": "c-2",
                "createdAt": "2026-04-09T15:00:00+08:00",
                "description": "Allergy follow-up still needs hydration reminders.",
                "followUpAction": "Observe allergy reaction and water intake tomorrow.",
                "tags": ["hydration", "allergy"],
                "needsAttention": True,
            },
        ],
        "feedback": [
            {
                "feedbackId": "fb-1",
                "id": "fb-1",
                "childId": "c-1",
                "date": "2026-04-10",
                "submittedAt": "2026-04-10T08:00:00+08:00",
                "status": "completed",
                "content": "Home sleep routine improved after following the task.",
                "notes": "Home sleep routine improved after following the task.",
                "sourceRole": "parent",
                "sourceChannel": "parent-agent",
                "relatedTaskId": "card-1",
                "executed": True,
                "executionStatus": "completed",
                "executorRole": "parent",
                "childReaction": "improved",
                "improved": True,
                "improvementStatus": "clear_improvement",
                "barriers": [],
                "attachments": {},
                "source": {"kind": "structured", "workflow": "parent-agent"},
                "fallback": {},
                "interventionCardId": "card-1",
                "sourceWorkflow": "parent-agent",
            },
            {
                "feedbackId": "fb-2",
                "id": "fb-2",
                "childId": "c-2",
                "date": "2026-04-10",
                "submittedAt": "2026-04-10T08:30:00+08:00",
                "status": "partial",
                "content": "Allergy and hydration action was only partially completed.",
                "notes": "Allergy and hydration action was only partially completed.",
                "sourceRole": "parent",
                "sourceChannel": "parent-agent",
                "relatedTaskId": "card-2",
                "executed": True,
                "executionStatus": "partial",
                "executorRole": "parent",
                "childReaction": "neutral",
                "improved": False,
                "improvementStatus": "no_change",
                "barriers": ["Needed more reminders"],
                "attachments": {},
                "source": {"kind": "structured", "workflow": "parent-agent"},
                "fallback": {},
                "interventionCardId": "card-2",
                "sourceWorkflow": "parent-agent",
            },
        ],
        "health": [
            {
                "id": "h-1",
                "childId": "c-1",
                "date": "2026-04-09",
                "isAbnormal": True,
                "remark": "Morning check flagged sleep distress and crying.",
            },
            {
                "id": "h-2",
                "childId": "c-2",
                "date": "2026-04-09",
                "isAbnormal": True,
                "remark": "Morning check flagged allergy concern, low hydration, and tiredness.",
            },
        ],
        "taskCheckIns": [],
        "interventionCards": [
            {
                "id": "card-1",
                "title": "Sleep support",
                "riskLevel": "high",
                "targetChildId": "c-1",
                "summary": "Keep the evening sleep loop stable.",
                "tonightHomeAction": "Keep the same sleep routine tonight.",
                "reviewIn48h": "Review sleep stability in 48 hours.",
                "createdAt": "2026-04-09T08:00:00+08:00",
                "updatedAt": "2026-04-09T08:00:00+08:00",
            },
            {
                "id": "card-2",
                "title": "Hydration support",
                "riskLevel": "medium",
                "targetChildId": "c-2",
                "summary": "Keep hydration prompts active.",
                "tonightHomeAction": "Prompt water intake after dinner.",
                "reviewIn48h": "Review hydration follow-up in 48 hours.",
                "createdAt": "2026-04-09T08:00:00+08:00",
                "updatedAt": "2026-04-09T08:00:00+08:00",
            },
        ],
        "consultations": [],
        "mobileDrafts": [
            {
                "draftId": "draft-1",
                "childId": "c-1",
                "draftType": "voice",
                "targetRole": "teacher",
                "content": "Teacher voice input for c-1",
                "structuredPayload": {
                    "kind": "teacher-voice-understanding",
                    "t5Seed": {
                        "transcript": "c-1 still had a rough nap transition",
                        "warnings": [],
                        "draft_items": [
                            {
                                "category": "SLEEP",
                                "summary": "Nap transition needs follow-up.",
                                "structured_fields": {},
                                "confidence": 0.55,
                                "suggested_actions": ["Add exact time and duration."],
                                "raw_excerpt": "rough nap transition",
                            },
                            {
                                "category": "EMOTION",
                                "summary": "Emotion note is clear enough.",
                                "structured_fields": {},
                                "confidence": 0.82,
                                "suggested_actions": [],
                                "raw_excerpt": "calmed after support",
                            },
                        ],
                    },
                    "understanding": {
                        "meta": {
                            "asr": {
                                "confidence": 0.9,
                            }
                        }
                    },
                },
                "syncStatus": "synced",
                "createdAt": "2026-04-10T09:00:00+08:00",
                "updatedAt": "2026-04-10T09:00:00+08:00",
            },
            {
                "draftId": "draft-2",
                "childId": "c-2",
                "draftType": "voice",
                "targetRole": "teacher",
                "content": "Teacher voice input for c-2",
                "structuredPayload": {
                    "kind": "teacher-voice-understanding",
                    "t5Seed": {
                        "transcript": "c-2 hydration follow-up looks clearer",
                        "warnings": [],
                        "draft_items": [
                            {
                                "category": "HEALTH",
                                "summary": "Hydration follow-up is clear.",
                                "structured_fields": {},
                                "confidence": 0.91,
                                "suggested_actions": [],
                                "raw_excerpt": "hydration follow-up",
                            }
                        ],
                    },
                    "understanding": {
                        "meta": {
                            "asr": {
                                "confidence": 0.95,
                            }
                        }
                    },
                },
                "syncStatus": "synced",
                "createdAt": "2026-04-10T09:10:00+08:00",
                "updatedAt": "2026-04-10T09:10:00+08:00",
            },
        ],
        "reminders": [],
        "tasks": [
            {
                "taskId": "task-parent-1",
                "taskType": "intervention",
                "childId": "c-1",
                "sourceType": "intervention_card",
                "sourceId": "card-1",
                "ownerRole": "parent",
                "title": "Sleep support",
                "description": "Keep the same sleep routine tonight.",
                "dueWindow": {"kind": "same_day", "label": "Today"},
                "dueAt": "2026-04-09T23:59:59+08:00",
                "status": "completed",
                "evidenceSubmissionMode": "guardian_feedback",
                "createdAt": "2026-04-09T08:00:00+08:00",
                "updatedAt": "2026-04-10T08:00:00+08:00",
                "completedAt": "2026-04-10T08:00:00+08:00",
                "lastEvidenceAt": "2026-04-10T08:00:00+08:00",
                "statusChangedAt": "2026-04-10T08:00:00+08:00",
            },
            {
                "taskId": "task-teacher-1",
                "taskType": "follow_up",
                "childId": "c-1",
                "sourceType": "intervention_card",
                "sourceId": "card-1",
                "ownerRole": "teacher",
                "title": "Sleep review",
                "description": "Review sleep stability in 48 hours.",
                "dueWindow": {"kind": "within_48h", "label": "Within 48 hours"},
                "dueAt": "2026-04-11T08:00:00+08:00",
                "status": "completed",
                "evidenceSubmissionMode": "task_checkin",
                "createdAt": "2026-04-09T08:00:00+08:00",
                "updatedAt": "2026-04-09T18:00:00+08:00",
                "completedAt": "2026-04-09T18:00:00+08:00",
                "lastEvidenceAt": "2026-04-09T18:00:00+08:00",
                "statusChangedAt": "2026-04-09T18:00:00+08:00",
            },
            {
                "taskId": "task-parent-2",
                "taskType": "intervention",
                "childId": "c-2",
                "sourceType": "intervention_card",
                "sourceId": "card-2",
                "ownerRole": "parent",
                "title": "Hydration support",
                "description": "Prompt water intake after dinner.",
                "dueWindow": {"kind": "same_day", "label": "Today"},
                "dueAt": "2026-04-09T23:59:59+08:00",
                "status": "pending",
                "evidenceSubmissionMode": "guardian_feedback",
                "createdAt": "2026-04-09T08:00:00+08:00",
                "updatedAt": "2026-04-09T08:00:00+08:00",
            },
            {
                "taskId": "task-teacher-2",
                "taskType": "follow_up",
                "childId": "c-2",
                "sourceType": "intervention_card",
                "sourceId": "card-2",
                "ownerRole": "teacher",
                "title": "Hydration review",
                "description": "Review hydration follow-up in 48 hours.",
                "dueWindow": {"kind": "within_48h", "label": "Within 48 hours"},
                "dueAt": "2026-04-11T08:00:00+08:00",
                "status": "pending",
                "evidenceSubmissionMode": "task_checkin",
                "createdAt": "2026-04-09T08:00:00+08:00",
                "updatedAt": "2026-04-09T08:00:00+08:00",
            },
            {
                "taskId": "task-admin-1",
                "taskType": "follow_up",
                "childId": "c-1",
                "sourceType": "consultation",
                "sourceId": "consultation-c-1",
                "ownerRole": "admin",
                "title": "Admin close-out",
                "description": "Confirm closure for c-1.",
                "dueWindow": {"kind": "deadline", "label": "Deadline"},
                "dueAt": "2026-04-10T12:00:00+08:00",
                "status": "completed",
                "evidenceSubmissionMode": "dispatch_status_update",
                "createdAt": "2026-04-09T18:00:00+08:00",
                "updatedAt": "2026-04-10T12:00:00+08:00",
                "completedAt": "2026-04-10T12:00:00+08:00",
                "lastEvidenceAt": "2026-04-10T12:00:00+08:00",
                "statusChangedAt": "2026-04-10T12:00:00+08:00",
                "legacyRefs": {"consultationId": "consultation-c-1"},
            },
        ],
        "updatedAt": "2026-04-10T23:00:00Z",
    }


def build_consultation_result(
    *,
    child_id: str,
    child_name: str,
    generated_at: str,
    risk_level: str,
    should_escalate: bool,
    owner_role: str,
    owner_name: str,
    status: str,
    trigger_reason: str,
) -> dict:
    payload = {
        "targetChildId": child_id,
        "currentUser": {"className": "Sunshine"},
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
    raw["consultationId"] = f"consultation-{child_id}"
    raw["generatedAt"] = generated_at
    raw["riskLevel"] = risk_level
    raw["summary"] = f"summary for {child_name}"
    raw["triggerReason"] = trigger_reason
    raw["triggerReasons"] = [trigger_reason]
    raw["keyFindings"] = [trigger_reason]
    raw["shouldEscalateToAdmin"] = should_escalate
    raw["todayInSchoolActions"] = ["School action stays open."]
    raw["tonightAtHomeActions"] = ["Home loop must return tonight."]
    raw["followUp48h"] = ["Review execution in 48 hours."]
    raw["coordinatorSummary"] = {
        **raw["coordinatorSummary"],
        "finalConclusion": f"coordination conclusion for {child_name}",
        "riskLevel": risk_level,
        "problemDefinition": f"problem definition for {child_name}",
        "reviewIn48h": f"review {child_name} in 48 hours",
        "shouldEscalateToAdmin": should_escalate,
    }
    raw["directorDecisionCard"] = {
        **raw["directorDecisionCard"],
        "recommendedOwnerRole": owner_role,
        "recommendedOwnerName": owner_name,
        "recommendedAt": generated_at,
        "status": status,
    }
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
    consultations = [
        ("c-1", "Anan", "2026-04-09T18:00:00+08:00", "high", True, "admin", "Director Wang", "completed", "Sleep transition remains unstable."),
        ("c-3", "Chenchen", "2026-04-10T09:00:00+08:00", "high", True, "admin", "Director Wang", "pending", "Allergy follow-up and family feedback loop is still open."),
    ]
    for index, spec in enumerate(consultations, start=1):
        result = build_consultation_result(
            child_id=spec[0],
            child_name=spec[1],
            generated_at=spec[2],
            risk_level=spec[3],
            should_escalate=spec[4],
            owner_role=spec[5],
            owner_name=spec[6],
            status=spec[7],
            trigger_reason=spec[8],
        )
        asyncio.run(
            memory.save_consultation_snapshot(
                child_id=spec[0],
                session_id=result["consultationId"],
                snapshot_type="consultation-result",
                input_summary=f"consultation {index}",
                snapshot_json={"task": "high-risk-consultation", "traceId": f"trace-metrics-{index}", "result": result},
            )
        )


def test_admin_quality_metrics_engine_aggregates_snapshot_and_memory(tmp_path, monkeypatch):
    sqlite_path = tmp_path / "admin-quality.db"
    configure_memory_backend(monkeypatch, backend="sqlite", sqlite_path=str(sqlite_path))
    seed_memory_records()

    orchestrator = build_orchestrator()
    result = asyncio.run(
        orchestrator.admin_quality_metrics(
            {
                "snapshot": build_app_snapshot(),
                "windowDays": 7,
                "today": "2026-04-10",
            }
        )
    )
    response = AdminQualityMetricsResponse.model_validate(result)
    body = response.model_dump(mode="json", by_alias=True)

    assert body["schemaVersion"] == "v1-admin-quality-metrics"
    assert body["sourceSummary"]["businessSnapshotSource"] == "request_snapshot"
    assert body["consultationClosureRate"]["value"] == 50.0
    assert body["followUp48hCompletionRate"]["value"] == 50.0
    assert body["guardianFeedbackRate"]["value"] == 66.7
    assert body["homeTaskExecutionRate"]["value"] == 50.0
    assert body["teacherLowConfidenceRate"]["value"] == 33.3
    assert body["morningCheckResponseLatency"]["value"] == 8.5
    assert body["suggestionEffectiveness"]["value"] == 50.0
    assert body["recurringIssueHeat"]["value"] > 0
    assert body["recurringIssueHeat"]["dataQuality"]["clusterCount"] >= 1
    assert body["teacherLowConfidenceRate"]["source"]["mode"] == "derived"
    assert body["suggestionEffectiveness"]["source"]["mode"] == "fallback"
    assert body["morningCheckResponseLatency"]["warnings"]


def test_admin_quality_metrics_engine_marks_demo_and_fallback_honestly(tmp_path, monkeypatch):
    sqlite_path = tmp_path / "admin-quality-demo.db"
    configure_memory_backend(monkeypatch, backend="sqlite", sqlite_path=str(sqlite_path))

    orchestrator = build_orchestrator()
    result = asyncio.run(orchestrator.admin_quality_metrics({"windowDays": 7, "today": "2026-04-10"}))
    response = AdminQualityMetricsResponse.model_validate(result)
    body = response.model_dump(mode="json", by_alias=True)

    assert body["fallback"] is True
    assert body["source"] == "demo_snapshot"
    assert body["consultationClosureRate"]["source"]["mode"] == "demo_only"
    assert body["teacherLowConfidenceRate"]["source"]["mode"] in {"fallback", "demo_only"}
    assert any("演示" in warning or "兜底" in warning for warning in body["warnings"])


def test_admin_quality_metrics_endpoint_returns_structured_payload(tmp_path, monkeypatch):
    sqlite_path = tmp_path / "admin-quality-endpoint.db"
    configure_memory_backend(monkeypatch, backend="sqlite", sqlite_path=str(sqlite_path))
    seed_memory_records()

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/agents/metrics/admin-quality",
            json={
                "snapshot": build_app_snapshot(),
                "windowDays": 7,
                "today": "2026-04-10",
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["schemaVersion"] == "v1-admin-quality-metrics"
    assert body["window"]["days"] == 7
    assert body["consultationClosureRate"]["id"] == "consultationClosureRate"
    assert body["followUp48hCompletionRate"]["coverage"]["eligibleCount"] >= 1
    assert body["sourceSummary"]["consultationSnapshotCount"] == 2
