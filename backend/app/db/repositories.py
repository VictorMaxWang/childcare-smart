from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Protocol
from uuid import uuid4

from app.core.config import get_settings
from app.db.memory_store import InMemoryRecordStore
from app.db.mysql import MySQLMemoryHubStore, MySQLSettings
from app.db.sqlite import SQLiteMemoryHubStore
from app.schemas.memory import (
    AgentStateSnapshotCreate,
    AgentStateSnapshotRecord,
    AgentTraceLogCreate,
    AgentTraceLogQuery,
    AgentTraceLogRecord,
    ChildProfileMemoryRecord,
    ChildProfileMemoryUpsert,
)


class RepositoryError(RuntimeError):
    def __init__(self, message: str, *, backend: str, operation: str, code: str) -> None:
        super().__init__(message)
        self.backend = backend
        self.operation = operation
        self.code = code


class RepositoryConfigError(RepositoryError):
    pass


class RepositoryOperationError(RepositoryError):
    pass


class MemoryHubBackend(Protocol):
    async def get_child_profile_memory(self, child_id: str) -> ChildProfileMemoryRecord | None: ...

    async def upsert_child_profile_memory(self, payload: ChildProfileMemoryUpsert) -> ChildProfileMemoryRecord: ...

    async def save_snapshot(self, payload: AgentStateSnapshotCreate) -> AgentStateSnapshotRecord: ...

    async def list_recent_snapshots(
        self,
        limit: int = 20,
        *,
        child_id: str | None = None,
        session_id: str | None = None,
        snapshot_types: list[str] | None = None,
    ) -> list[AgentStateSnapshotRecord]: ...

    async def save_trace(self, payload: AgentTraceLogCreate) -> AgentTraceLogRecord: ...

    async def get_recent_traces(self, query: AgentTraceLogQuery) -> list[AgentTraceLogRecord]: ...


class InMemoryMemoryHubBackend:
    def __init__(self, store: InMemoryRecordStore) -> None:
        self.store = store

    async def get_child_profile_memory(self, child_id: str) -> ChildProfileMemoryRecord | None:
        return self.store.get_child_profile_memory(child_id)

    async def upsert_child_profile_memory(self, payload: ChildProfileMemoryUpsert) -> ChildProfileMemoryRecord:
        return self.store.upsert_child_profile_memory(payload)

    async def save_snapshot(self, payload: AgentStateSnapshotCreate) -> AgentStateSnapshotRecord:
        return self.store.save_snapshot(payload)

    async def list_recent_snapshots(
        self,
        limit: int = 20,
        *,
        child_id: str | None = None,
        session_id: str | None = None,
        snapshot_types: list[str] | None = None,
    ) -> list[AgentStateSnapshotRecord]:
        return self.store.list_recent_snapshots(
            limit=limit,
            child_id=child_id,
            session_id=session_id,
            snapshot_types=snapshot_types,
        )

    async def save_trace(self, payload: AgentTraceLogCreate) -> AgentTraceLogRecord:
        return self.store.save_trace(payload)

    async def get_recent_traces(self, query: AgentTraceLogQuery) -> list[AgentTraceLogRecord]:
        return self.store.get_recent_traces(query)


def _create_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex}"


def _coerce_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _summarize_value(value: Any, limit: int = 480) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        text = value.strip()
    else:
        text = json.dumps(value, ensure_ascii=False, default=str)
    if not text:
        return None
    return text if len(text) <= limit else f"{text[: limit - 3]}..."


def _extract_session_id(value: dict[str, Any]) -> str | None:
    return (
        _coerce_string(value.get("session_id"))
        or _coerce_string(value.get("sessionId"))
        or _coerce_string(value.get("consultationId"))
        or _coerce_string(value.get("consultation_id"))
        or _coerce_string(value.get("relatedConsultationId"))
        or _coerce_string(value.get("related_consultation_id"))
        or _coerce_string(value.get("trace_id"))
        or _coerce_string(value.get("traceId"))
    )


def _extract_child_id(value: dict[str, Any]) -> str | None:
    return (
        _coerce_string(value.get("child_id"))
        or _coerce_string(value.get("childId"))
        or _coerce_string(value.get("targetChildId"))
        or _coerce_string(value.get("target_child_id"))
    )


@dataclass
class RepositoryBundle:
    backend: str
    adapter: MemoryHubBackend
    configured_backend: str
    degraded: bool = False
    errors: tuple[str, ...] = ()

    async def close(self) -> None:
        close = getattr(self.adapter, "close", None)
        if callable(close):
            await close()

    async def _run(self, operation: str, factory):
        try:
            return await factory()
        except RepositoryError:
            raise
        except Exception as error:
            raise RepositoryOperationError(
                f"{operation} failed on backend '{self.backend}'",
                backend=self.backend,
                operation=operation,
                code="repository_operation_failed",
            ) from error

    async def get_child_profile_memory(self, child_id: str) -> ChildProfileMemoryRecord | None:
        return await self._run(
            "get_child_profile_memory",
            lambda: self.adapter.get_child_profile_memory(child_id),
        )

    async def upsert_child_profile_memory(
        self,
        child_id: str,
        payload: dict[str, Any],
        source: str = "agent",
    ) -> ChildProfileMemoryRecord:
        upsert = ChildProfileMemoryUpsert(child_id=child_id, profile_json=dict(payload), source=source)
        return await self._run(
            "upsert_child_profile_memory",
            lambda: self.adapter.upsert_child_profile_memory(upsert),
        )

    async def save_consultation_snapshot(
        self,
        *,
        child_id: str | None = None,
        session_id: str | None = None,
        snapshot_type: str,
        input_summary: str | None = None,
        snapshot_json: dict[str, Any],
    ) -> AgentStateSnapshotRecord:
        create = AgentStateSnapshotCreate(
            child_id=child_id,
            session_id=session_id,
            snapshot_type=snapshot_type,
            input_summary=input_summary,
            snapshot_json=dict(snapshot_json),
        )
        return await self._run("save_consultation_snapshot", lambda: self.adapter.save_snapshot(create))

    async def save_agent_trace(
        self,
        *,
        trace_id: str,
        child_id: str | None = None,
        session_id: str | None = None,
        node_name: str,
        action_type: str,
        input_summary: str | None = None,
        output_summary: str | None = None,
        status: str,
        duration_ms: int | None = None,
        metadata_json: dict[str, Any] | None = None,
    ) -> AgentTraceLogRecord:
        create = AgentTraceLogCreate(
            trace_id=trace_id,
            child_id=child_id,
            session_id=session_id,
            node_name=node_name,
            action_type=action_type,
            input_summary=input_summary,
            output_summary=output_summary,
            status=status,
            duration_ms=duration_ms,
            metadata_json=dict(metadata_json) if metadata_json is not None else None,
        )
        return await self._run("save_agent_trace", lambda: self.adapter.save_trace(create))

    async def get_recent_traces(
        self,
        *,
        limit: int = 20,
        trace_id: str | None = None,
        child_id: str | None = None,
        session_id: str | None = None,
    ) -> list[AgentTraceLogRecord]:
        query = AgentTraceLogQuery(limit=limit, trace_id=trace_id, child_id=child_id, session_id=session_id)
        return await self._run("get_recent_traces", lambda: self.adapter.get_recent_traces(query))

    async def list_recent_snapshots(
        self,
        limit: int = 20,
        *,
        child_id: str | None = None,
        session_id: str | None = None,
        snapshot_types: list[str] | None = None,
    ) -> list[AgentStateSnapshotRecord]:
        return await self._run(
            "list_recent_snapshots",
            lambda: self.adapter.list_recent_snapshots(
                limit,
                child_id=child_id,
                session_id=session_id,
                snapshot_types=snapshot_types,
            ),
        )

    async def save_agent_run(self, record: dict[str, Any]) -> dict[str, Any]:
        trace = await self.save_agent_trace(
            trace_id=_coerce_string(record.get("trace_id")) or _coerce_string(record.get("traceId")) or _create_id("trace"),
            child_id=_extract_child_id(record),
            session_id=_extract_session_id(record),
            node_name=_coerce_string(record.get("node_name")) or _coerce_string(record.get("task")) or "agent-run",
            action_type=_coerce_string(record.get("action_type")) or _coerce_string(record.get("task")) or "workflow",
            input_summary=_summarize_value(record.get("payload")),
            output_summary=_summarize_value(record.get("result")),
            status=_coerce_string(record.get("status")) or "succeeded",
            duration_ms=int(record["duration_ms"]) if record.get("duration_ms") is not None else None,
            metadata_json={
                "task": _coerce_string(record.get("task")),
                "source": "compat-save_agent_run",
            },
        )
        return trace.model_dump(mode="json")

    async def list_agent_runs(self, limit: int = 20) -> list[dict[str, Any]]:
        traces = await self.get_recent_traces(limit=limit)
        return [item.model_dump(mode="json") for item in traces]

    async def save_memory(self, record: dict[str, Any]) -> dict[str, Any]:
        child_id = _extract_child_id(record)
        session_id = _extract_session_id(record) or _create_id("session")
        snapshot = await self.save_consultation_snapshot(
            child_id=child_id,
            session_id=session_id,
            snapshot_type=_coerce_string(record.get("snapshot_type")) or _coerce_string(record.get("kind")) or "memory-item",
            input_summary=_summarize_value(record.get("message") or record),
            snapshot_json=dict(record),
        )
        return snapshot.model_dump(mode="json")

    async def list_memory(self, limit: int = 20) -> list[dict[str, Any]]:
        snapshots = await self.list_recent_snapshots(limit=limit)
        return [item.model_dump(mode="json") for item in snapshots]


def _build_adapter(backend: str, mysql_url: str | None, sqlite_path: str) -> MemoryHubBackend:
    if backend == "mysql":
        if not mysql_url:
            raise RepositoryConfigError(
                "MYSQL_URL or DATABASE_URL is required when BRAIN_MEMORY_BACKEND=mysql",
                backend=backend,
                operation="build_repository_bundle",
                code="missing_mysql_url",
            )
        return MySQLMemoryHubStore(MySQLSettings(url=mysql_url))

    if backend == "sqlite":
        return SQLiteMemoryHubStore(sqlite_path)

    if backend == "memory":
        return InMemoryMemoryHubBackend(InMemoryRecordStore())

    raise RepositoryConfigError(
        f"Unsupported BRAIN_MEMORY_BACKEND '{backend}'",
        backend=backend,
        operation="build_repository_bundle",
        code="unsupported_backend",
    )


def _fallback_candidates(configured_backend: str) -> list[str]:
    normalized = configured_backend.strip().lower() or "memory"
    candidates: list[str] = [normalized]

    if normalized != "sqlite":
        candidates.append("sqlite")
    if normalized != "memory":
        candidates.append("memory")

    deduped: list[str] = []
    for candidate in candidates:
        if candidate not in deduped:
            deduped.append(candidate)
    return deduped


@lru_cache(maxsize=8)
def _build_repository_bundle_cached(
    backend: str,
    mysql_url: str | None,
    sqlite_path: str,
) -> RepositoryBundle:
    errors: list[str] = []
    last_error: RepositoryError | None = None

    for candidate in _fallback_candidates(backend):
        try:
            return RepositoryBundle(
                backend=candidate,
                adapter=_build_adapter(backend=candidate, mysql_url=mysql_url, sqlite_path=sqlite_path),
                configured_backend=backend,
                degraded=bool(errors) or candidate != backend,
                errors=tuple(errors),
            )
        except RepositoryError as error:
            last_error = error
            errors.append(f"{candidate}:{error.code}")

    if last_error is not None:
        raise last_error

    raise RepositoryConfigError(
        "Unable to build repository backend",
        backend=backend,
        operation="build_repository_bundle",
        code="repository_init_failed",
    )


def build_repository_bundle() -> RepositoryBundle:
    settings = get_settings()
    return _build_repository_bundle_cached(
        settings.brain_memory_backend,
        settings.resolved_mysql_url,
        settings.resolved_brain_memory_sqlite_path,
    )


async def close_repository_bundle() -> None:
    bundle = build_repository_bundle()
    await bundle.close()


def reset_repository_bundle_cache() -> None:
    _build_repository_bundle_cached.cache_clear()
