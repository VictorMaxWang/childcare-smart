import asyncio

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.db.repositories import reset_repository_bundle_cache
from app.main import app
from app.services.orchestrator import build_memory_service, reset_orchestrator_runtime


client = TestClient(app)


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


def test_memory_context_endpoint_returns_prompt_context(tmp_path, monkeypatch):
    sqlite_path = tmp_path / "memory-endpoint.db"
    configure_memory_backend(monkeypatch, backend="sqlite", sqlite_path=str(sqlite_path))

    memory = build_memory_service()
    asyncio.run(
        memory.upsert_child_profile_memory(
            "child-1",
            {
                "nickname": "child-one",
                "temperament": "needs calm transitions before group play",
            },
            source="teacher-agent",
        )
    )
    asyncio.run(
        memory.save_consultation_snapshot(
            child_id="child-1",
            session_id="consult-1",
            snapshot_type="consultation-result",
            input_summary="high risk consultation",
            snapshot_json={
                "result": {
                    "summary": "watch hydration again tonight",
                    "tonightAtHomeActions": ["record hydration tonight"],
                    "nextCheckpoints": ["check the feedback tomorrow morning"],
                }
            },
        )
    )

    response = client.post(
        "/api/v1/memory/context",
        json={
            "child_id": "child-1",
            "workflow_type": "high-risk-consultation",
            "options": {"query": "hydration tonight", "limit": 5, "top_k": 5},
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["child_id"] == "child-1"
    assert body["prompt_context"]["long_term_traits"]
    assert body["prompt_context"]["open_loops"]


def test_health_file_bridge_writeback_endpoint_persists_snapshot(tmp_path, monkeypatch):
    sqlite_path = tmp_path / "memory-bridge-writeback.db"
    configure_memory_backend(monkeypatch, backend="sqlite", sqlite_path=str(sqlite_path))

    response = client.post(
        "/api/v1/memory/health-file-bridge-writeback",
        json={
            "childId": "child-bridge-1",
            "traceId": "trace-bridge-1",
            "bridgeWriteback": {
                "childScopedArtifacts": [
                    {
                        "artifactType": "health-file-bridge",
                        "childId": "child-bridge-1",
                        "fileKind": "health-note",
                        "fileType": "pdf",
                        "summary": "Bridge artifact summary",
                        "extractedFacts": [],
                        "riskItems": [],
                        "contraindications": [],
                        "followUpHints": [],
                        "generatedAt": "2026-04-11T00:00:00Z",
                    }
                ],
                "memoryCandidate": {
                    "title": "Bridge follow-up seed",
                    "summary": "Bridge summary for parent follow-up",
                    "continuitySignals": ["Bridge summary for parent follow-up"],
                    "openLoops": ["Review the file again within 48 hours"],
                    "sourceRefs": ["pytest-memory-endpoint"],
                },
                "followUpSeed": {
                    "suggestionTitle": "Bridge follow-up seed",
                    "suggestionDescription": "Use the bridge output as a follow-up seed.",
                    "tonightHomeAction": "Share a factual status update tonight.",
                    "observationPoints": ["Watch temperature tonight"],
                    "tomorrowObservationPoint": "Check the child's status at the next arrival.",
                    "reviewIn48h": "Review the bridge signals again within 48 hours.",
                    "teacherSuggestionSummary": "Carry the bridge wording into the next handoff.",
                    "familyTask": {
                        "title": "Share a status update tonight",
                        "description": "Confirm the latest temperature and sleep status.",
                    },
                },
                "weeklyReportSeed": None,
                "provenance": {
                    "bridgeOrigin": "health-file-bridge",
                    "sourceRole": "parent",
                    "requestSource": "pytest-memory-endpoint",
                    "traceId": "trace-bridge-1",
                    "fileKind": "health-note",
                    "fileType": "pdf",
                    "source": "next-local-extractor",
                    "fallback": True,
                    "mock": True,
                    "liveReadyButNotVerified": True,
                    "provider": "pytest-provider",
                    "model": "pytest-model",
                    "generatedAt": "2026-04-11T00:00:00Z",
                },
            },
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["child_id"] == "child-bridge-1"
    assert body["snapshot_type"] == "health-file-bridge-writeback"
    assert body["snapshot_json"]["bridgeWriteback"]["provenance"]["source"] == "next-local-extractor"
    assert (
        body["snapshot_json"]["bridgeWriteback"]["followUpSeed"]["reviewIn48h"]
        == "Review the bridge signals again within 48 hours."
    )


def test_parent_follow_up_memory_context_consumes_bridge_writeback(tmp_path, monkeypatch):
    sqlite_path = tmp_path / "memory-bridge-follow-up.db"
    configure_memory_backend(monkeypatch, backend="sqlite", sqlite_path=str(sqlite_path))

    memory = build_memory_service()
    asyncio.run(
        memory.save_health_file_bridge_writeback(
            child_id="child-bridge-2",
            trace_id="trace-bridge-2",
            bridge_writeback={
                "childScopedArtifacts": [
                    {
                        "artifactType": "health-file-bridge",
                        "childId": "child-bridge-2",
                        "fileKind": "health-note",
                        "fileType": "pdf",
                        "summary": "Bridge artifact summary",
                        "extractedFacts": [],
                        "riskItems": [],
                        "contraindications": [],
                        "followUpHints": [],
                        "generatedAt": "2026-04-11T00:00:00Z",
                    }
                ],
                "memoryCandidate": {
                    "title": "Bridge follow-up seed",
                    "summary": "Bridge summary for parent follow-up",
                    "continuitySignals": ["Bridge summary for parent follow-up"],
                    "openLoops": ["Review the file again within 48 hours"],
                    "sourceRefs": ["pytest-memory-context"],
                },
                "followUpSeed": {
                    "suggestionTitle": "Bridge follow-up seed",
                    "suggestionDescription": "Use the bridge output as a follow-up seed.",
                    "tonightHomeAction": "Share a factual status update tonight.",
                    "observationPoints": ["Watch temperature tonight"],
                    "tomorrowObservationPoint": "Check the child's status at the next arrival.",
                    "reviewIn48h": "Review the bridge signals again within 48 hours.",
                    "teacherSuggestionSummary": "Carry the bridge wording into the next handoff.",
                    "familyTask": {
                        "title": "Share a status update tonight",
                        "description": "Confirm the latest temperature and sleep status.",
                    },
                },
                "weeklyReportSeed": None,
                "provenance": {
                    "bridgeOrigin": "health-file-bridge",
                    "sourceRole": "teacher",
                    "requestSource": "pytest-memory-context",
                    "traceId": "trace-bridge-2",
                    "fileKind": "health-note",
                    "fileType": "pdf",
                    "source": "next-local-extractor",
                    "fallback": True,
                    "mock": True,
                    "liveReadyButNotVerified": True,
                    "provider": "pytest-provider",
                    "model": "pytest-model",
                    "generatedAt": "2026-04-11T00:00:00Z",
                },
            },
        )
    )

    response = client.post(
        "/api/v1/memory/context",
        json={
            "child_id": "child-bridge-2",
            "workflow_type": "parent-follow-up",
            "options": {"query": "follow-up seed", "limit": 5, "top_k": 5},
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert any(
        "Bridge summary for parent follow-up" in item
        for item in body["prompt_context"]["recent_continuity_signals"]
    )
    assert any(
        "Review the bridge signals again within 48 hours." in item
        for item in body["prompt_context"]["open_loops"]
    )
    assert any(
        "Check the child's status at the next arrival." in item
        for item in body["prompt_context"]["open_loops"]
    )


def test_parent_follow_up_memory_context_extracts_structured_feedback_signals(tmp_path, monkeypatch):
    sqlite_path = tmp_path / "memory-structured-feedback.db"
    configure_memory_backend(monkeypatch, backend="sqlite", sqlite_path=str(sqlite_path))

    memory = build_memory_service()
    asyncio.run(
        memory.save_consultation_snapshot(
            child_id="child-feedback-1",
            session_id="follow-up-structured-1",
            snapshot_type="parent-follow-up-result",
            input_summary="parent follow-up structured feedback",
            snapshot_json={
                "result": {
                    "latestFeedback": {
                        "feedbackId": "fb-structured-1",
                        "childId": "child-feedback-1",
                        "sourceRole": "parent",
                        "sourceChannel": "manual",
                        "relatedTaskId": "task-parent-1",
                        "relatedConsultationId": "consult-structured-1",
                        "executionStatus": "unable_to_execute",
                        "executorRole": "parent",
                        "childReaction": "resisted",
                        "improvementStatus": "worse",
                        "barriers": ["Child had a fever"],
                        "notes": "The family could not execute the task tonight.",
                        "attachments": {},
                        "submittedAt": "2026-04-11T08:00:00Z",
                        "source": {"kind": "structured", "workflow": "manual"},
                        "fallback": {},
                    },
                    "recentDetails": {
                        "feedback": [
                            {
                                "feedbackId": "fb-structured-1",
                                "childId": "child-feedback-1",
                                "sourceRole": "parent",
                                "sourceChannel": "manual",
                                "relatedTaskId": "task-parent-1",
                                "relatedConsultationId": "consult-structured-1",
                                "executionStatus": "unable_to_execute",
                                "executorRole": "parent",
                                "childReaction": "resisted",
                                "improvementStatus": "worse",
                                "barriers": ["Child had a fever"],
                                "notes": "The family could not execute the task tonight.",
                                "attachments": {},
                                "submittedAt": "2026-04-11T08:00:00Z",
                                "source": {"kind": "structured", "workflow": "manual"},
                                "fallback": {},
                            }
                        ]
                    },
                }
            },
        )
    )

    response = client.post(
        "/api/v1/memory/context",
        json={
            "child_id": "child-feedback-1",
            "workflow_type": "parent-follow-up",
            "options": {"query": "structured feedback", "limit": 5, "top_k": 5},
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert any(
        "Parent feedback:" in item
        for item in body["prompt_context"]["recent_continuity_signals"]
    )
    assert any(
        "task-parent-1" in item or "consult-structured-1" in item
        for item in body["prompt_context"]["recent_continuity_signals"]
    )
    assert any(
        "could not execute the task tonight" in item.lower()
        for item in body["prompt_context"]["open_loops"]
    )
    assert any(
        "Child had a fever" in item
        for item in body["prompt_context"]["open_loops"]
    )
