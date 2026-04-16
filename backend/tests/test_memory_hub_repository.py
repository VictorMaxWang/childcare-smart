import asyncio
import time

from app.core.config import get_settings
from app.db.repositories import build_repository_bundle, reset_repository_bundle_cache
from app.schemas.memory import MemoryContextBuildOptions
from app.services.orchestrator import build_memory_service, reset_orchestrator_runtime


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


def test_sqlite_repository_profile_snapshot_and_trace(tmp_path, monkeypatch):
    sqlite_path = tmp_path / "agent-memory.db"
    configure_memory_backend(monkeypatch, backend="sqlite", sqlite_path=str(sqlite_path))

    repository = build_repository_bundle()

    first_profile = asyncio.run(
        repository.upsert_child_profile_memory(
            "child-1",
            {"nickname": "child-one", "risk_level": "medium"},
            source="teacher-agent",
        )
    )
    second_profile = asyncio.run(
        repository.upsert_child_profile_memory(
            "child-1",
            {"nickname": "child-one", "risk_level": "high"},
            source="weekly-report",
        )
    )

    assert repository.backend == "sqlite"
    assert first_profile.version == 1
    assert second_profile.version == 2
    assert second_profile.profile_json["risk_level"] == "high"

    snapshot = asyncio.run(
        repository.save_consultation_snapshot(
            child_id="child-1",
            session_id="consult-1",
            snapshot_type="consultation-result",
            input_summary="teacher initiated consultation",
            snapshot_json={"summary": "follow up tonight"},
        )
    )

    assert snapshot.child_id == "child-1"
    assert snapshot.session_id == "consult-1"
    assert snapshot.snapshot_json["summary"] == "follow up tonight"

    first_trace = asyncio.run(
        repository.save_agent_trace(
            trace_id="trace-1",
            child_id="child-1",
            session_id="consult-1",
            node_name="high-risk-consultation",
            action_type="workflow",
            input_summary="payload",
            output_summary="first output",
            status="succeeded",
            duration_ms=12,
            metadata_json={"step": 1},
        )
    )
    time.sleep(0.01)
    second_trace = asyncio.run(
        repository.save_agent_trace(
            trace_id="trace-1",
            child_id="child-1",
            session_id="consult-1",
            node_name="evaluator",
            action_type="post-check",
            input_summary="trace input",
            output_summary="trace output",
            status="failed",
            duration_ms=25,
            metadata_json={"step": 2},
        )
    )

    traces = asyncio.run(repository.get_recent_traces(trace_id="trace-1", child_id="child-1", limit=10))

    assert len(traces) == 2
    assert traces[0].id == second_trace.id
    assert traces[1].id == first_trace.id
    assert traces[0].status == "failed"


def test_memory_backend_keeps_shared_state_between_repository_builds(monkeypatch):
    configure_memory_backend(monkeypatch, backend="memory")

    first_repository = build_repository_bundle()
    asyncio.run(
        first_repository.save_consultation_snapshot(
            session_id="session-shared",
            snapshot_type="agent-state",
            input_summary="shared state",
            snapshot_json={"status": "kept"},
        )
    )

    second_repository = build_repository_bundle()
    snapshots = asyncio.run(second_repository.list_recent_snapshots(limit=10))

    assert second_repository.backend == "memory"
    assert len(snapshots) == 1
    assert snapshots[0].session_id == "session-shared"


def test_repository_recent_snapshots_support_filters(tmp_path, monkeypatch):
    sqlite_path = tmp_path / "filtered-memory.db"
    configure_memory_backend(monkeypatch, backend="sqlite", sqlite_path=str(sqlite_path))

    repository = build_repository_bundle()
    asyncio.run(
        repository.save_consultation_snapshot(
            child_id="child-a",
            session_id="consult-a",
            snapshot_type="consultation-result",
            input_summary="first",
            snapshot_json={"result": {"summary": "first consultation"}},
        )
    )
    asyncio.run(
        repository.save_consultation_snapshot(
            child_id="child-b",
            session_id="consult-b",
            snapshot_type="teacher-agent-result",
            input_summary="second",
            snapshot_json={"result": {"summary": "teacher follow-up"}},
        )
    )

    snapshots = asyncio.run(
        repository.list_recent_snapshots(
            limit=10,
            child_id="child-a",
            snapshot_types=["consultation-result"],
        )
    )

    assert len(snapshots) == 1
    assert snapshots[0].child_id == "child-a"
    assert snapshots[0].snapshot_type == "consultation-result"


def test_build_memory_context_for_prompt_returns_non_empty_prompt_context(tmp_path, monkeypatch):
    sqlite_path = tmp_path / "prompt-memory.db"
    configure_memory_backend(monkeypatch, backend="sqlite", sqlite_path=str(sqlite_path))

    memory = build_memory_service()
    asyncio.run(
        memory.upsert_child_profile_memory(
            "child-1",
            {
                "nickname": "child-one",
                "temperament": "needs a calm transition before group play",
                "support_strategies": ["quiet company first", "then remind hydration"],
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
                    "summary": "last consultation asked for hydration and sleep follow-up",
                    "todayInSchoolActions": ["observe mood again before nap"],
                    "tonightAtHomeActions": ["record hydration and sleep tonight"],
                    "nextCheckpoints": ["check the sleep feedback tomorrow morning"],
                }
            },
        )
    )
    asyncio.run(
        memory.save_agent_trace(
            trace_id="trace-memory-1",
            child_id="child-1",
            session_id="consult-1",
            node_name="teacher-agent",
            action_type="teacher-agent",
            input_summary="teacher follow-up",
            output_summary="night feedback still needs to be watched for a second day",
            status="succeeded",
            duration_ms=12,
            metadata_json={"workflow": "teacher-agent"},
        )
    )

    context = asyncio.run(
        memory.build_memory_context_for_prompt(
            "child-1",
            "high-risk-consultation",
            MemoryContextBuildOptions(query="night feedback hydration sleep", limit=5, top_k=5),
        )
    )

    assert context.child_id == "child-1"
    assert context.child_profile is not None
    assert context.prompt_context.long_term_traits
    assert context.prompt_context.last_consultation_takeaways
    assert context.prompt_context.open_loops
    assert "child_profile_memory" in context.meta.used_sources
