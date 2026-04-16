from __future__ import annotations

import asyncio
import json
import ssl
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import parse_qs, unquote, urlsplit
from uuid import uuid4

import aiomysql

from app.schemas.memory import (
    AgentStateSnapshotCreate,
    AgentStateSnapshotRecord,
    AgentTraceLogCreate,
    AgentTraceLogQuery,
    AgentTraceLogRecord,
    ChildProfileMemoryRecord,
    ChildProfileMemoryUpsert,
)


MYSQL_SCHEMA_STATEMENTS = (
    """
    create table if not exists child_profile_memory (
      id varchar(191) not null,
      child_id varchar(191) not null,
      profile_json json not null,
      version int not null default 1,
      source varchar(64) not null,
      updated_at datetime(3) not null default current_timestamp(3) on update current_timestamp(3),
      primary key (id),
      unique key uq_child_profile_memory_child_id (child_id),
      key idx_child_profile_memory_updated_at (updated_at)
    ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci
    """,
    """
    create table if not exists agent_state_snapshots (
      id varchar(191) not null,
      child_id varchar(191) null,
      session_id varchar(191) null,
      snapshot_type varchar(64) not null,
      input_summary text null,
      snapshot_json json not null,
      created_at datetime(3) not null default current_timestamp(3),
      primary key (id),
      key idx_agent_state_snapshots_child_created (child_id, created_at),
      key idx_agent_state_snapshots_session_created (session_id, created_at),
      key idx_agent_state_snapshots_type_created (snapshot_type, created_at)
    ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci
    """,
    """
    create table if not exists agent_trace_log (
      id varchar(191) not null,
      trace_id varchar(191) not null,
      child_id varchar(191) null,
      session_id varchar(191) null,
      node_name varchar(128) not null,
      action_type varchar(64) not null,
      input_summary text null,
      output_summary text null,
      status varchar(32) not null,
      duration_ms int null,
      metadata_json json null,
      created_at datetime(3) not null default current_timestamp(3),
      primary key (id),
      key idx_agent_trace_log_trace_created (trace_id, created_at),
      key idx_agent_trace_log_child_created (child_id, created_at),
      key idx_agent_trace_log_session_created (session_id, created_at),
      key idx_agent_trace_log_node_created (node_name, created_at)
    ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci
    """,
)


def _create_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex}"


def encode_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


def decode_json(value: Any) -> dict[str, Any]:
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


def normalize_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)

    if isinstance(value, str):
        normalized = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)

    return datetime.now(timezone.utc)


@dataclass(slots=True)
class MySQLSettings:
    url: str


def _build_pool_kwargs(settings: MySQLSettings) -> dict[str, Any]:
    parsed = urlsplit(settings.url)
    if parsed.scheme not in {"mysql", "mysqls"}:
        raise ValueError("MYSQL_URL must use mysql:// or mysqls://")

    database = parsed.path.lstrip("/")
    if not database:
        raise ValueError("MYSQL_URL must include a database name")

    query = parse_qs(parsed.query)
    ssl_enabled = parsed.scheme == "mysqls" or query.get("ssl", ["false"])[0].lower() in {"1", "true", "yes", "required"}
    ssl_value = None
    if ssl_enabled:
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        ssl_value = context

    return {
        "host": parsed.hostname or "127.0.0.1",
        "port": parsed.port or 3306,
        "user": unquote(parsed.username or ""),
        "password": unquote(parsed.password or ""),
        "db": database,
        "charset": "utf8mb4",
        "autocommit": True,
        "minsize": 1,
        "maxsize": 3,
        "connect_timeout": 5,
        "cursorclass": aiomysql.DictCursor,
        "ssl": ssl_value,
    }


class MySQLMemoryHubStore:
    def __init__(self, settings: MySQLSettings) -> None:
        self.settings = settings
        self._pool: aiomysql.Pool | None = None
        self._schema_ready = False
        self._pool_lock = asyncio.Lock()
        self._schema_lock = asyncio.Lock()

    async def _get_pool(self) -> aiomysql.Pool:
        if self._pool is None:
            async with self._pool_lock:
                if self._pool is None:
                    self._pool = await aiomysql.create_pool(**_build_pool_kwargs(self.settings))
        return self._pool

    async def close(self) -> None:
        pool = self._pool
        if pool is None:
            return

        self._pool = None
        self._schema_ready = False
        pool.close()
        await pool.wait_closed()

    async def ensure_schema(self) -> None:
        if self._schema_ready:
            return

        async with self._schema_lock:
            if self._schema_ready:
                return

            pool = await self._get_pool()
            async with pool.acquire() as connection:
                async with connection.cursor() as cursor:
                    for statement in MYSQL_SCHEMA_STATEMENTS:
                        await cursor.execute(statement)
            self._schema_ready = True

    async def _fetchone(self, query: str, params: tuple[Any, ...]) -> dict[str, Any] | None:
        await self.ensure_schema()
        pool = await self._get_pool()
        async with pool.acquire() as connection:
            async with connection.cursor() as cursor:
                await cursor.execute(query, params)
                row = await cursor.fetchone()
                return row if isinstance(row, dict) else None

    async def _fetchall(self, query: str, params: tuple[Any, ...]) -> list[dict[str, Any]]:
        await self.ensure_schema()
        pool = await self._get_pool()
        async with pool.acquire() as connection:
            async with connection.cursor() as cursor:
                await cursor.execute(query, params)
                rows = await cursor.fetchall()
                return [row for row in rows if isinstance(row, dict)]

    async def _execute(self, query: str, params: tuple[Any, ...]) -> None:
        await self.ensure_schema()
        pool = await self._get_pool()
        async with pool.acquire() as connection:
            async with connection.cursor() as cursor:
                await cursor.execute(query, params)

    async def get_child_profile_memory(self, child_id: str) -> ChildProfileMemoryRecord | None:
        row = await self._fetchone(
            """
            select id, child_id, profile_json, version, source, updated_at
            from child_profile_memory
            where child_id = %s
            limit 1
            """,
            (child_id,),
        )
        if not row:
            return None
        return ChildProfileMemoryRecord(
            id=str(row["id"]),
            child_id=str(row["child_id"]),
            profile_json=decode_json(row["profile_json"]),
            version=int(row["version"]),
            source=str(row["source"]),
            updated_at=normalize_datetime(row["updated_at"]),
        )

    async def upsert_child_profile_memory(self, payload: ChildProfileMemoryUpsert) -> ChildProfileMemoryRecord:
        await self._execute(
            """
            insert into child_profile_memory (id, child_id, profile_json, version, source)
            values (%s, %s, %s, 1, %s)
            on duplicate key update
              profile_json = values(profile_json),
              source = values(source),
              version = version + 1,
              updated_at = current_timestamp(3)
            """,
            (_create_id("cpm"), payload.child_id, encode_json(payload.profile_json), payload.source),
        )
        stored = await self.get_child_profile_memory(payload.child_id)
        if stored is None:
            raise RuntimeError("child profile upsert did not persist")
        return stored

    async def save_snapshot(self, payload: AgentStateSnapshotCreate) -> AgentStateSnapshotRecord:
        snapshot_id = _create_id("snapshot")
        await self._execute(
            """
            insert into agent_state_snapshots (
              id,
              child_id,
              session_id,
              snapshot_type,
              input_summary,
              snapshot_json
            )
            values (%s, %s, %s, %s, %s, %s)
            """,
            (
                snapshot_id,
                payload.child_id,
                payload.session_id,
                payload.snapshot_type,
                payload.input_summary,
                encode_json(payload.snapshot_json),
            ),
        )
        row = await self._fetchone(
            """
            select id, child_id, session_id, snapshot_type, input_summary, snapshot_json, created_at
            from agent_state_snapshots
            where id = %s
            limit 1
            """,
            (snapshot_id,),
        )
        if not row:
            raise RuntimeError("snapshot insert did not persist")
        return AgentStateSnapshotRecord(
            id=str(row["id"]),
            child_id=str(row["child_id"]) if row["child_id"] else None,
            session_id=str(row["session_id"]) if row["session_id"] else None,
            snapshot_type=str(row["snapshot_type"]),
            input_summary=str(row["input_summary"]) if row["input_summary"] is not None else None,
            snapshot_json=decode_json(row["snapshot_json"]),
            created_at=normalize_datetime(row["created_at"]),
        )

    async def list_recent_snapshots(
        self,
        limit: int = 20,
        *,
        child_id: str | None = None,
        session_id: str | None = None,
        snapshot_types: list[str] | None = None,
    ) -> list[AgentStateSnapshotRecord]:
        clauses: list[str] = []
        params: list[Any] = []
        if child_id:
            clauses.append("child_id = %s")
            params.append(child_id)
        if session_id:
            clauses.append("session_id = %s")
            params.append(session_id)
        if snapshot_types:
            placeholders = ", ".join(["%s"] * len(snapshot_types))
            clauses.append(f"snapshot_type in ({placeholders})")
            params.extend(snapshot_types)

        where_sql = f"where {' and '.join(clauses)}" if clauses else ""
        rows = await self._fetchall(
            f"""
            select id, child_id, session_id, snapshot_type, input_summary, snapshot_json, created_at
            from agent_state_snapshots
            {where_sql}
            order by created_at desc
            limit %s
            """,
            tuple([*params, limit]),
        )
        return [
            AgentStateSnapshotRecord(
                id=str(row["id"]),
                child_id=str(row["child_id"]) if row["child_id"] else None,
                session_id=str(row["session_id"]) if row["session_id"] else None,
                snapshot_type=str(row["snapshot_type"]),
                input_summary=str(row["input_summary"]) if row["input_summary"] is not None else None,
                snapshot_json=decode_json(row["snapshot_json"]),
                created_at=normalize_datetime(row["created_at"]),
            )
            for row in rows
        ]

    async def save_trace(self, payload: AgentTraceLogCreate) -> AgentTraceLogRecord:
        trace_id = _create_id("trace-log")
        await self._execute(
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
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                trace_id,
                payload.trace_id,
                payload.child_id,
                payload.session_id,
                payload.node_name,
                payload.action_type,
                payload.input_summary,
                payload.output_summary,
                payload.status,
                payload.duration_ms,
                encode_json(payload.metadata_json) if payload.metadata_json is not None else None,
            ),
        )
        row = await self._fetchone(
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
            where id = %s
            limit 1
            """,
            (trace_id,),
        )
        if not row:
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
            metadata_json=decode_json(row["metadata_json"]) if row["metadata_json"] is not None else None,
            created_at=normalize_datetime(row["created_at"]),
        )

    async def get_recent_traces(self, query: AgentTraceLogQuery) -> list[AgentTraceLogRecord]:
        clauses: list[str] = []
        params: list[Any] = []

        if query.trace_id:
            clauses.append("trace_id = %s")
            params.append(query.trace_id)
        if query.child_id:
            clauses.append("child_id = %s")
            params.append(query.child_id)
        if query.session_id:
            clauses.append("session_id = %s")
            params.append(query.session_id)

        where_sql = f"where {' and '.join(clauses)}" if clauses else ""
        rows = await self._fetchall(
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
            limit %s
            """,
            tuple([*params, query.limit]),
        )
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
                metadata_json=decode_json(row["metadata_json"]) if row["metadata_json"] is not None else None,
                created_at=normalize_datetime(row["created_at"]),
            )
            for row in rows
        ]
