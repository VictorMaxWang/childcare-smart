from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


JsonObject = dict[str, Any]

TraceStatus = Literal["started", "succeeded", "failed", "fallback"]
MemorySearchSourceType = Literal["profile", "snapshot", "trace", "vector"]


class MemoryHubModel(BaseModel):
    model_config = ConfigDict(extra="ignore")


class ChildProfileMemoryUpsert(MemoryHubModel):
    child_id: str
    profile_json: JsonObject = Field(default_factory=dict)
    source: str = "agent"


class ChildProfileMemoryRecord(MemoryHubModel):
    id: str
    child_id: str
    profile_json: JsonObject = Field(default_factory=dict)
    version: int = 1
    source: str = "agent"
    updated_at: datetime


class AgentStateSnapshotCreate(MemoryHubModel):
    child_id: str | None = None
    session_id: str | None = None
    snapshot_type: str
    input_summary: str | None = None
    snapshot_json: JsonObject = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_context(self) -> "AgentStateSnapshotCreate":
        if not self.child_id and not self.session_id:
            raise ValueError("child_id or session_id is required")
        return self


class AgentStateSnapshotRecord(MemoryHubModel):
    id: str
    child_id: str | None = None
    session_id: str | None = None
    snapshot_type: str
    input_summary: str | None = None
    snapshot_json: JsonObject = Field(default_factory=dict)
    created_at: datetime


class AgentTraceLogCreate(MemoryHubModel):
    trace_id: str
    child_id: str | None = None
    session_id: str | None = None
    node_name: str
    action_type: str
    input_summary: str | None = None
    output_summary: str | None = None
    status: TraceStatus = "succeeded"
    duration_ms: int | None = None
    metadata_json: JsonObject | None = None


class AgentTraceLogQuery(MemoryHubModel):
    child_id: str | None = None
    session_id: str | None = None
    trace_id: str | None = None
    limit: int = 20


class AgentTraceLogRecord(MemoryHubModel):
    id: str
    trace_id: str
    child_id: str | None = None
    session_id: str | None = None
    node_name: str
    action_type: str
    input_summary: str | None = None
    output_summary: str | None = None
    status: TraceStatus = "succeeded"
    duration_ms: int | None = None
    metadata_json: JsonObject | None = None
    created_at: datetime


class MemorySearchHit(MemoryHubModel):
    source_type: MemorySearchSourceType
    source_id: str
    score: float = 0.0
    summary: str
    excerpt: str | None = None
    metadata: JsonObject = Field(default_factory=dict)


class MemoryPromptContext(MemoryHubModel):
    long_term_traits: list[str] = Field(default_factory=list)
    recent_continuity_signals: list[str] = Field(default_factory=list)
    last_consultation_takeaways: list[str] = Field(default_factory=list)
    open_loops: list[str] = Field(default_factory=list)


class MemoryContextMeta(MemoryHubModel):
    backend: str = "memory"
    degraded: bool = False
    used_sources: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    matched_snapshot_ids: list[str] = Field(default_factory=list)
    matched_trace_ids: list[str] = Field(default_factory=list)
    matched_search_sources: list[str] = Field(default_factory=list)


class MemoryContextBuildOptions(MemoryHubModel):
    limit: int = 5
    top_k: int = 5
    query: str | None = None
    session_id: str | None = None
    snapshot_types: list[str] = Field(default_factory=list)


class MemoryContextBuildRequest(MemoryHubModel):
    child_id: str
    workflow_type: str
    options: MemoryContextBuildOptions = Field(default_factory=MemoryContextBuildOptions)


class MemoryContextEnvelope(MemoryHubModel):
    child_id: str
    workflow_type: str
    child_profile: ChildProfileMemoryRecord | None = None
    recent_snapshots: list[AgentStateSnapshotRecord] = Field(default_factory=list)
    recent_consultations: list[AgentStateSnapshotRecord] = Field(default_factory=list)
    relevant_traces: list[AgentTraceLogRecord] = Field(default_factory=list)
    prompt_context: MemoryPromptContext = Field(default_factory=MemoryPromptContext)
    meta: MemoryContextMeta = Field(default_factory=MemoryContextMeta)
