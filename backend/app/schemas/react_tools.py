from __future__ import annotations

from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


def _to_camel(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(part[:1].upper() + part[1:] for part in parts[1:])


JsonDict = dict[str, Any]

ToolErrorCode = Literal[
    "validation_error",
    "target_child_not_found",
    "snapshot_unavailable",
    "tool_execution_failed",
    "unsupported_task",
]
ReactStatus = Literal["succeeded", "failed"]
TracePhase = Literal["Thought", "Act", "Observe", "Final"]
TraceStepStatus = Literal["started", "succeeded", "failed", "fallback"]


class ReactModel(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True, extra="ignore")


class ToolError(ReactModel):
    code: ToolErrorCode | str
    message: str
    retryable: bool = False
    details: JsonDict | None = None


class ToolCallResult(ReactModel):
    ok: bool
    tool: str
    call_id: str
    source: str
    fallback: bool = False
    data: Any = None
    error: ToolError | None = None


class ReactRunOptions(ReactModel):
    include_trace: bool = True


class ReactTargetChild(ReactModel):
    child_id: str
    name: str
    nickname: str | None = None
    class_name: str | None = None
    institution_id: str | None = None


class ReactTraceStep(ReactModel):
    step_index: int
    phase: TracePhase
    message: str
    tool: str | None = None
    status: TraceStepStatus = "succeeded"
    payload: Any = None
    created_at: str


class ReactTrace(ReactModel):
    steps: list[ReactTraceStep] = Field(default_factory=list)


class ReactPersistence(ReactModel):
    trace_backend: str
    business_data_source: str
    business_data_persisted: bool = False
    trace_saved: bool = True
    result_snapshot_saved: bool = True
    errors: list[str] = Field(default_factory=list)


class ReactRunRequest(ReactModel):
    task: str
    role: str
    child_id: str | None = Field(default=None, validation_alias=AliasChoices("childId", "child_id"))
    institution_id: str | None = Field(default=None, validation_alias=AliasChoices("institutionId", "institution_id"))
    app_snapshot: JsonDict | None = Field(default=None, validation_alias=AliasChoices("appSnapshot", "app_snapshot"))
    trace_id: str | None = Field(default=None, validation_alias=AliasChoices("traceId", "trace_id"))
    options: ReactRunOptions = Field(default_factory=ReactRunOptions)


class ReactRunResponse(ReactModel):
    trace_id: str
    status: ReactStatus
    scenario: str
    target_child: ReactTargetChild | None = None
    action_summary: str
    final: JsonDict
    tool_calls: list[ToolCallResult] = Field(default_factory=list)
    trace: ReactTrace | None = None
    persistence: ReactPersistence
    fallback: bool = False
