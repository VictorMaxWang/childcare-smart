from __future__ import annotations

import asyncio
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
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


SQLITE_SCHEMA_STATEMENTS = (
    """
    create table if not exists child_profile_memory (
      id text not null primary key,
      child_id text not null unique,
      profile_json text not null,
      version integer not null default 1,
      source text not null,
      updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
    """,
    "create index if not exists idx_child_profile_memory_updated_at on child_profile_memory(updated_at desc)",
    """
    create table if not exists agent_state_snapshots (
      id text not null primary key,
      child_id text null,
      session_id text null,
      snapshot_type text not null,
      input_summary text null,
      snapshot_json text not null,
      created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      check (child_id is not null or session_id is not null)
    )
    """,
    "create index if not exists idx_agent_state_snapshots_child_created on agent_state_snapshots(child_id, created_at desc)",
    "create index if not exists idx_agent_state_snapshots_session_created on agent_state_snapshots(session_id, created_at desc)",
    "create index if not exists idx_agent_state_snapshots_type_created on agent_state_snapshots(snapshot_type, created_at desc)",
    """
    create table if not exists agent_trace_log (
      id text not null primary key,
      trace_id text not null,
      child_id text null,
      session_id text null,
      node_name text not null,
      action_type text not null,
      input_summary text null,
      output_summary text null,
      status text not null,
      duration_ms integer null,
      metadata_json text null,
      created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
    """,
    "create index if not exists idx_agent_trace_log_trace_created on agent_trace_log(trace_id, created_at desc)",
    "create index if not exists idx_agent_trace_log_child_created on agent_trace_log(child_id, created_at desc)",
    "create index if not exists idx_agent_trace_log_session_created on agent_trace_log(session_id, created_at desc)",
    "create index if not exists idx_agent_trace_log_node_created on agent_trace_log(node_name, created_at desc)",
)


def _create_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex}"


def _encode_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


def _decode_json(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, (bytes, bytearray)):
        value = value.decode("utf-8")
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return {}
        decoded = json.loads(stripped)
        return decoded if isinstance(decoded, dict) else {"value": decoded}
    if isinstance(value, dict):
        return value
    return {"value": value}


def _normalize_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        normalized = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc)


class SQLiteMemoryHubStore:
    def __init__(self, path: str) -> None:
        self.path = Path(path)
        self._schema_ready = False
        self._schema_lock = asyncio.Lock()

    def _connect(self) -> sqlite3.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.path, timeout=5)
        connection.row_factory = sqlite3.Row
        return connection

    def _ensure_schema_sync(self) -> None:
        with self._connect() as connection:
            for statement in SQLITE_SCHEMA_STATEMENTS:
                connection.execute(statement)
            connection.commit()

    async def ensure_schema(self) -> None:
        if self._schema_ready:
            return
        async with self._schema_lock:
            if self._schema_ready:
                return
            await asyncio.to_thread(self._ensure_schema_sync)
            self._schema_ready = True

    async def get_child_profile_memory(self, child_id: str) -> ChildProfileMemoryRecord | None:
        await self.ensure_schema()

        def _query() -> sqlite3.Row | None:
            with self._connect() as connection:
                row = connection.execute(
                    """
                    select id, child_id, profile_json, version, source, updated_at
                    from child_profile_memory
                    where child_id = ?
                    limit 1
                    """,
                    (child_id,),
                ).fetchone()
                return row

        row = await asyncio.to_thread(_query)
        if row is None:
            return None
        return ChildProfileMemoryRecord(
            id=str(row["id"]),
            child_id=str(row["child_id"]),
            profile_json=_decode_json(row["profile_json"]),
            version=int(row["version"]),
            source=str(row["source"]),
            updated_at=_normalize_datetime(row["updated_at"]),
        )

    async def upsert_child_profile_memory(self, payload: ChildProfileMemoryUpsert) -> ChildProfileMemoryRecord:
        await self.ensure_schema()

        def _write() -> None:
            with self._connect() as connection:
                connection.execute(
                    """
                    insert into child_profile_memory (id, child_id, profile_json, version, source)
                    values (?, ?, ?, 1, ?)
                    on conflict(child_id) do update set
                      profile_json = excluded.profile_json,
                      source = excluded.source,
                      version = child_profile_memory.version + 1,
                      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    """,
                    (_create_id("cpm"), payload.child_id, _encode_json(payload.profile_json), payload.source),
                )
                connection.commit()

        await asyncio.to_thread(_write)
        stored = await self.get_child_profile_memory(payload.child_id)
        if stored is None:
            raise RuntimeError("child profile upsert did not persist")
        return stored

    async def save_snapshot(self, payload: AgentStateSnapshotCreate) -> AgentStateSnapshotRecord:
        await self.ensure_schema()
        snapshot_id = _create_id("snapshot")

        def _write() -> None:
            with self._connect() as connection:
                connection.execute(
                    """
                    insert into agent_state_snapshots (
                      id,
                      child_id,
                      session_id,
                      snapshot_type,
                      input_summary,
                      snapshot_json
                    )
                    values (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        snapshot_id,
                        payload.child_id,
                        payload.session_id,
                        payload.snapshot_type,
                        payload.input_summary,
                        _encode_json(payload.snapshot_json),
                    ),
                )
                connection.commit()

        await asyncio.to_thread(_write)

        def _query() -> sqlite3.Row | None:
            with self._connect() as connection:
                return connection.execute(
                    """
                    select id, child_id, session_id, snapshot_type, input_summary, snapshot_json, created_at
                    from agent_state_snapshots
                    where id = ?
                    limit 1
                    """,
                    (snapshot_id,),
                ).fetchone()

        row = await asyncio.to_thread(_query)
        if row is None:
            raise RuntimeError("snapshot insert did not persist")
        return AgentStateSnapshotRecord(
            id=str(row["id"]),
            child_id=str(row["child_id"]) if row["child_id"] else None,
            session_id=str(row["session_id"]) if row["session_id"] else None,
            snapshot_type=str(row["snapshot_type"]),
            input_summary=str(row["input_summary"]) if row["input_summary"] is not None else None,
            snapshot_json=_decode_json(row["snapshot_json"]),
            created_at=_normalize_datetime(row["created_at"]),
        )

    async def list_recent_snapshots(
        self,
        limit: int = 20,
        *,
        child_id: str | None = None,
        session_id: str | None = None,
        snapshot_types: list[str] | None = None,
    ) -> list[AgentStateSnapshotRecord]:
        await self.ensure_schema()

        def _query() -> list[sqlite3.Row]:
            clauses: list[str] = []
            params: list[Any] = []
            if child_id:
                clauses.append("child_id = ?")
                params.append(child_id)
            if session_id:
                clauses.append("session_id = ?")
                params.append(session_id)
            if snapshot_types:
                placeholders = ", ".join("?" for _ in snapshot_types)
                clauses.append(f"snapshot_type in ({placeholders})")
                params.extend(snapshot_types)

            where_sql = f"where {' and '.join(clauses)}" if clauses else ""
            params.append(limit)

            with self._connect() as connection:
                rows = connection.execute(
                    f"""
                    select id, child_id, session_id, snapshot_type, input_summary, snapshot_json, created_at
                    from agent_state_snapshots
                    {where_sql}
                    order by created_at desc
                    limit ?
                    """,
                    tuple(params),
                ).fetchall()
                return list(rows)

        rows = await asyncio.to_thread(_query)
        return [
            AgentStateSnapshotRecord(
                id=str(row["id"]),
                child_id=str(row["child_id"]) if row["child_id"] else None,
                session_id=str(row["session_id"]) if row["session_id"] else None,
                snapshot_type=str(row["snapshot_type"]),
                input_summary=str(row["input_summary"]) if row["input_summary"] is not None else None,
                snapshot_json=_decode_json(row["snapshot_json"]),
                created_at=_normalize_datetime(row["created_at"]),
            )
            for row in rows
        ]

    async def save_trace(self, payload: AgentTraceLogCreate) -> AgentTraceLogRecord:
        await self.ensure_schema()
        record_id = _create_id("trace-log")

        def _write() -> None:
            with self._connect() as connection:
                connection.execute(
                    """
                    insert into agent_trace_log (
                      id,
                      trace_id,
                      child_id,
                      session_id,
                      node_name,
                      action_type,
                      input_summary,
                      output_summary,
                      status,
                      duration_ms,
                      metadata_json
                    )
                    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        record_id,
                        payload.trace_id,
                        payload.child_id,
                        payload.session_id,
                        payload.node_name,
                        payload.action_type,
                        payload.input_summary,
                        payload.output_summary,
                        payload.status,
                        payload.duration_ms,
                        _encode_json(payload.metadata_json) if payload.metadata_json is not None else None,
                    ),
                )
                connection.commit()

        await asyncio.to_thread(_write)

        def _query() -> sqlite3.Row | None:
            with self._connect() as connection:
                return connection.execute(
                    """
                    select
                      id,
                      trace_id,
                      child_id,
                      session_id,
                      node_name,
                      action_type,
                      input_summary,
                      output_summary,
                      status,
                      duration_ms,
                      metadata_json,
                      created_at
                    from agent_trace_log
                    where id = ?
                    limit 1
                    """,
                    (record_id,),
                ).fetchone()

        row = await asyncio.to_thread(_query)
        if row is None:
            raise RuntimeError("trace insert did not persist")
        return AgentTraceLogRecord(
            id=str(row["id"]),
            trace_id=str(row["trace_id"]),
            child_id=str(row["child_id"]) if row["child_id"] else None,
            session_id=str(row["session_id"]) if row["session_id"] else None,
            node_name=str(row["node_name"]),
            action_type=str(row["action_type"]),
            input_summary=str(row["input_summary"]) if row["input_summary"] is not None else None,
            output_summary=str(row["output_summary"]) if row["output_summary"] is not None else None,
            status=str(row["status"]),
            duration_ms=int(row["duration_ms"]) if row["duration_ms"] is not None else None,
            metadata_json=_decode_json(row["metadata_json"]) if row["metadata_json"] is not None else None,
            created_at=_normalize_datetime(row["created_at"]),
        )

    async def get_recent_traces(self, query: AgentTraceLogQuery) -> list[AgentTraceLogRecord]:
        await self.ensure_schema()

        def _query() -> list[sqlite3.Row]:
            clauses: list[str] = []
            params: list[Any] = []
            if query.trace_id:
                clauses.append("trace_id = ?")
                params.append(query.trace_id)
            if query.child_id:
                clauses.append("child_id = ?")
                params.append(query.child_id)
            if query.session_id:
                clauses.append("session_id = ?")
                params.append(query.session_id)

            where_sql = f"where {' and '.join(clauses)}" if clauses else ""
            params.append(query.limit)

            with self._connect() as connection:
                rows = connection.execute(
                    f"""
                    select
                      id,
                      trace_id,
                      child_id,
                      session_id,
                      node_name,
                      action_type,
                      input_summary,
                      output_summary,
                      status,
                      duration_ms,
                      metadata_json,
                      created_at
                    from agent_trace_log
                    {where_sql}
                    order by created_at desc
                    limit ?
                    """,
                    tuple(params),
                ).fetchall()
                return list(rows)

        rows = await asyncio.to_thread(_query)
        return [
            AgentTraceLogRecord(
                id=str(row["id"]),
                trace_id=str(row["trace_id"]),
                child_id=str(row["child_id"]) if row["child_id"] else None,
                session_id=str(row["session_id"]) if row["session_id"] else None,
                node_name=str(row["node_name"]),
                action_type=str(row["action_type"]),
                input_summary=str(row["input_summary"]) if row["input_summary"] is not None else None,
                output_summary=str(row["output_summary"]) if row["output_summary"] is not None else None,
                status=str(row["status"]),
                duration_ms=int(row["duration_ms"]) if row["duration_ms"] is not None else None,
                metadata_json=_decode_json(row["metadata_json"]) if row["metadata_json"] is not None else None,
                created_at=_normalize_datetime(row["created_at"]),
            )
            for row in rows
        ]
