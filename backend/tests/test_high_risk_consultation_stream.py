from __future__ import annotations

import asyncio
import json

import app.providers.mock as mock_provider_module
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


def parse_sse(text: str) -> list[dict[str, object]]:
    events: list[dict[str, object]] = []
    for chunk in text.split("\n\n"):
        if not chunk.strip():
            continue
        event_name = ""
        data = ""
        for line in chunk.splitlines():
            if line.startswith("event: "):
                event_name = line.removeprefix("event: ").strip()
            elif line.startswith("data: "):
                data = line.removeprefix("data: ").strip()
        if event_name and data:
            events.append({"event": event_name, "data": json.loads(data)})
    return events


def build_payload() -> dict:
    return {
        "targetChildId": "child-1",
        "teacherNote": "today transition looked unstable and family feedback is incomplete",
        "currentUser": {"className": "Sunshine"},
        "visibleChildren": [{"id": "child-1", "name": "Xiaoming"}],
        "presentChildren": [{"id": "child-1", "name": "Xiaoming"}],
        "healthCheckRecords": [],
        "growthRecords": [],
        "guardianFeedbacks": [],
        "debugMemory": True,
    }


def seed_child_memory():
    memory = build_memory_service()
    asyncio.run(
        memory.upsert_child_profile_memory(
            "child-1",
            {
                "nickname": "Xiaoming",
                "temperament": "group transitions need calm reminders",
                "support_strategies": ["visual cue", "short check-in"],
            },
            source="teacher-agent",
        )
    )
    asyncio.run(
        memory.save_consultation_snapshot(
            child_id="child-1",
            session_id="consult-1",
            snapshot_type="consultation-result",
            input_summary="recent consultation",
            snapshot_json={
                "result": {
                    "summary": "watch hydration and separation anxiety again tonight",
                    "todayInSchoolActions": ["record transition behavior"],
                    "tonightAtHomeActions": ["record hydration and bedtime"],
                    "nextCheckpoints": ["review feedback tomorrow morning"],
                    "reviewIn48h": "re-check family feedback and classroom transition",
                }
            },
        )
    )
    asyncio.run(
        memory.save_agent_trace(
            trace_id="trace-seed-1",
            child_id="child-1",
            session_id="consult-1",
            node_name="teacher-agent",
            action_type="teacher-agent",
            input_summary="teacher note about risky transition",
            output_summary="flagged recent unstable transition behavior",
            status="succeeded",
            duration_ms=123,
            metadata_json={"task": "teacher-agent"},
        )
    )


def strip_dynamic_consultation_fields(result: dict) -> dict:
    stripped = json.loads(json.dumps(result))
    stripped["memoryMeta"]["matchedSnapshotIds"] = []
    stripped["memoryMeta"]["matchedTraceIds"] = []
    stripped["traceMeta"]["memory"]["matchedSnapshotIds"] = []
    stripped["traceMeta"]["memory"]["matchedTraceIds"] = []
    return stripped


def test_high_risk_consultation_stream_uses_memory_and_canonical_done(tmp_path, monkeypatch):
    sqlite_path = tmp_path / "consultation-stream.db"
    configure_memory_backend(monkeypatch, backend="sqlite", sqlite_path=str(sqlite_path))
    seed_child_memory()

    response = client.post(
        "/api/v1/agents/consultations/high-risk/stream",
        json=build_payload(),
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.text.startswith(": stream-open")

    events = parse_sse(response.text)
    assert [item["event"] for item in events[:3]] == ["status", "text", "ui"]

    status_stages = [item["data"]["stage"] for item in events if item["event"] == "status"]
    assert status_stages == ["long_term_profile", "recent_context", "current_recommendation"]

    ui_card_types = [item["data"]["cardType"] for item in events if item["event"] == "ui"]
    assert "ConsultationSummaryCard" in ui_card_types
    assert "FollowUp48hCard" in ui_card_types

    done_event = next(item for item in events if item["event"] == "done")
    done_data = done_event["data"]
    assert done_data["memoryMeta"]["memoryContextUsed"] is True
    assert "child_profile_memory" in done_data["memoryMeta"]["usedSources"]
    assert "agent_state_snapshots" in done_data["memoryMeta"]["usedSources"]
    assert done_data["providerTrace"]["source"] in {"mock", "vivo"}
    assert done_data["providerTrace"]["transport"] == "fastapi-brain"
    assert done_data["providerTrace"]["transportSource"] == "fastapi-brain"
    assert done_data["providerTrace"]["brainProvider"] in {"mock", "vivo"}
    assert done_data["result"]["traceMeta"]["memory"]["usedSources"]
    assert done_data["result"]["traceMeta"]["transport"] == "fastapi-brain"
    assert done_data["result"]["consultationId"]
    assert done_data["result"]["evidenceItems"]
    assert any(
        item["sourceType"] == "derived_explainability"
        and item["requiresHumanReview"] is True
        for item in done_data["result"]["evidenceItems"]
    )
    assert [item["label"] for item in done_data["result"]["explainability"][:3]] == [
        "Agent 参与",
        "关键发现",
        "协调结论",
    ]


def test_high_risk_consultation_json_route_supports_sse_accept_header():
    response = client.post(
        "/api/v1/agents/consultations/high-risk",
        headers={"Accept": "text/event-stream"},
        json=build_payload(),
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.text.startswith(": stream-open")
    assert "event: status" in response.text
    assert "event: done" in response.text


def test_high_risk_consultation_direct_json_matches_stream_done_result(tmp_path, monkeypatch):
    fixed_now = "2026-04-07T12:00:00+08:00"
    monkeypatch.setattr(mock_provider_module, "iso_now", lambda: fixed_now)

    direct_sqlite_path = tmp_path / "consultation-parity-direct.db"
    configure_memory_backend(monkeypatch, backend="sqlite", sqlite_path=str(direct_sqlite_path))
    seed_child_memory()

    direct_response = client.post(
        "/api/v1/agents/consultations/high-risk",
        json=build_payload(),
    )
    assert direct_response.status_code == 200
    direct_result = direct_response.json()

    stream_sqlite_path = tmp_path / "consultation-parity-stream.db"
    configure_memory_backend(monkeypatch, backend="sqlite", sqlite_path=str(stream_sqlite_path))
    seed_child_memory()

    stream_response = client.post(
        "/api/v1/agents/consultations/high-risk/stream",
        json=build_payload(),
    )
    assert stream_response.status_code == 200
    done_event = next(item for item in parse_sse(stream_response.text) if item["event"] == "done")
    stream_result = done_event["data"]["result"]

    assert strip_dynamic_consultation_fields(direct_result) == strip_dynamic_consultation_fields(stream_result)
