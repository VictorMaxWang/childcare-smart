from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from uuid import uuid4

from app.schemas.memory import (
    AgentStateSnapshotCreate,
    AgentStateSnapshotRecord,
    AgentTraceLogCreate,
    AgentTraceLogQuery,
    AgentTraceLogRecord,
    ChildProfileMemoryRecord,
    ChildProfileMemoryUpsert,
)


def _create_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex}"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class InMemoryRecordStore:
    child_profiles: dict[str, ChildProfileMemoryRecord] = field(default_factory=dict)
    snapshots: list[AgentStateSnapshotRecord] = field(default_factory=list)
    traces: list[AgentTraceLogRecord] = field(default_factory=list)

    def get_child_profile_memory(self, child_id: str) -> ChildProfileMemoryRecord | None:
        record = self.child_profiles.get(child_id)
        return record.model_copy(deep=True) if record else None

    def upsert_child_profile_memory(self, payload: ChildProfileMemoryUpsert) -> ChildProfileMemoryRecord:
        current = self.child_profiles.get(payload.child_id)
        record = ChildProfileMemoryRecord(
            id=current.id if current else _create_id("cpm"),
            child_id=payload.child_id,
            profile_json=dict(payload.profile_json),
            version=(current.version + 1) if current else 1,
            source=payload.source,
            updated_at=_utc_now(),
        )
        self.child_profiles[payload.child_id] = record
        return record.model_copy(deep=True)

    def save_snapshot(self, payload: AgentStateSnapshotCreate) -> AgentStateSnapshotRecord:
        record = AgentStateSnapshotRecord(
            id=_create_id("snapshot"),
            child_id=payload.child_id,
            session_id=payload.session_id,
            snapshot_type=payload.snapshot_type,
            input_summary=payload.input_summary,
            snapshot_json=dict(payload.snapshot_json),
            created_at=_utc_now(),
        )
        self.snapshots.append(record)
        return record.model_copy(deep=True)

    def list_recent_snapshots(
        self,
        limit: int = 20,
        *,
        child_id: str | None = None,
        session_id: str | None = None,
        snapshot_types: list[str] | None = None,
    ) -> list[AgentStateSnapshotRecord]:
        items = self.snapshots
        if child_id:
            items = [item for item in items if item.child_id == child_id]
        if session_id:
            items = [item for item in items if item.session_id == session_id]
        if snapshot_types:
            snapshot_type_set = set(snapshot_types)
            items = [item for item in items if item.snapshot_type in snapshot_type_set]

        ordered = sorted(items, key=lambda item: item.created_at, reverse=True)
        return [item.model_copy(deep=True) for item in ordered[:limit]]

    def save_trace(self, payload: AgentTraceLogCreate) -> AgentTraceLogRecord:
        record = AgentTraceLogRecord(
            id=_create_id("trace-log"),
            trace_id=payload.trace_id,
            child_id=payload.child_id,
            session_id=payload.session_id,
            node_name=payload.node_name,
            action_type=payload.action_type,
            input_summary=payload.input_summary,
            output_summary=payload.output_summary,
            status=payload.status,
            duration_ms=payload.duration_ms,
            metadata_json=dict(payload.metadata_json) if payload.metadata_json is not None else None,
            created_at=_utc_now(),
        )
        self.traces.append(record)
        return record.model_copy(deep=True)

    def get_recent_traces(self, query: AgentTraceLogQuery) -> list[AgentTraceLogRecord]:
        items = self.traces
        if query.trace_id:
            items = [item for item in items if item.trace_id == query.trace_id]
        if query.child_id:
            items = [item for item in items if item.child_id == query.child_id]
        if query.session_id:
            items = [item for item in items if item.session_id == query.session_id]

        ordered = sorted(items, key=lambda item: item.created_at, reverse=True)
        return [item.model_copy(deep=True) for item in ordered[: query.limit]]
