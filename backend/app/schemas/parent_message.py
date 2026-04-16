from __future__ import annotations

from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator


def _to_camel(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(part[:1].upper() + part[1:] for part in parts[1:])


JsonDict = dict[str, Any]
ParentMessageStopReason = Literal[
    "passed",
    "max_iterations",
    "generator_fallback",
    "evaluator_fallback",
    "non_retryable_error",
    "same_failure_twice",
    "same_output_twice",
]
ParentMessageDecision = Literal["approve", "revise", "block"]


class ParentMessageRequestModel(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True, extra="allow")


class ParentMessageResponseModel(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True, extra="ignore")


class ParentMessageProviderResponseModel(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True, extra="forbid")


class ParentMessageReflexionRequest(ParentMessageRequestModel):
    target_child_id: str | None = Field(default=None, validation_alias=AliasChoices("targetChildId", "target_child_id"))
    child_id: str | None = Field(default=None, validation_alias=AliasChoices("childId", "child_id"))
    teacher_note: str | None = Field(default=None, validation_alias=AliasChoices("teacherNote", "teacher_note"))
    issue_summary: str | None = Field(default=None, validation_alias=AliasChoices("issueSummary", "issue_summary"))
    current_intervention_card: JsonDict | str | None = Field(
        default=None,
        validation_alias=AliasChoices("currentInterventionCard", "current_intervention_card"),
    )
    latest_guardian_feedback: JsonDict | str | None = Field(
        default=None,
        validation_alias=AliasChoices("latestGuardianFeedback", "latest_guardian_feedback"),
    )
    today_in_school_actions: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("todayInSchoolActions", "today_in_school_actions"),
    )
    tonight_home_actions: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("tonightHomeActions", "tonight_home_actions"),
    )
    snapshot: JsonDict | None = None
    visible_children: list[JsonDict] = Field(
        default_factory=list,
        validation_alias=AliasChoices("visibleChildren", "visible_children"),
    )
    session_id: str | None = Field(default=None, validation_alias=AliasChoices("sessionId", "session_id"))
    institution_id: str | None = Field(default=None, validation_alias=AliasChoices("institutionId", "institution_id"))
    trace_id: str | None = Field(default=None, validation_alias=AliasChoices("traceId", "trace_id"))
    debug_memory: bool = Field(default=False, validation_alias=AliasChoices("debugMemory", "debug_memory"))
    debug_loop: bool = Field(default=False, validation_alias=AliasChoices("debugLoop", "debug_loop"))


class ParentMessageEvaluationMeta(ParentMessageResponseModel):
    score: float = 0.0
    can_send: bool = False
    problems: list[str] = Field(default_factory=list)
    revision_suggestions: list[str] = Field(default_factory=list)
    iteration_scores: list[float] = Field(default_factory=list)
    approved_iteration: int | None = None
    stop_reason: ParentMessageStopReason = "max_iterations"
    fallback: bool = False
    provider: str | None = None
    model: str | None = None
    memory_context_used: bool = False
    decision: ParentMessageDecision = "revise"


class ParentMessageFinalOutput(ParentMessageResponseModel):
    title: str
    summary: str
    tonight_actions: list[str] = Field(default_factory=list)
    wording_for_parent: str
    why_this_matters: str
    estimated_time: str
    follow_up_window: str
    evaluation_meta: ParentMessageEvaluationMeta


class ParentMessageDraftOutput(ParentMessageResponseModel):
    title: str
    summary: str
    tonight_actions: list[str] = Field(default_factory=list)
    wording_for_parent: str
    why_this_matters: str
    estimated_time: str
    follow_up_window: str


def _normalize_provider_text_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        normalized = value.strip()
        return [normalized] if normalized else []
    if isinstance(value, (list, tuple, set)):
        return [str(item) for item in value if item is not None]
    return [str(value)]


class ParentMessageProviderDraftOutput(ParentMessageProviderResponseModel):
    title: str
    summary: str
    tonight_actions: list[str] = Field(default_factory=list)
    wording_for_parent: str
    why_this_matters: str
    estimated_time: str
    follow_up_window: str

    @field_validator("tonight_actions", mode="before")
    @classmethod
    def _normalize_tonight_actions(cls, value: Any) -> list[str]:
        return _normalize_provider_text_list(value)


class ParentMessageProviderEvaluatorOutput(ParentMessageProviderResponseModel):
    score: float
    problems: list[str] = Field(default_factory=list)
    revision_suggestions: list[str] = Field(default_factory=list)
    can_send: bool
    retryable: bool = True
    decision: ParentMessageDecision

    @field_validator("problems", "revision_suggestions", mode="before")
    @classmethod
    def _normalize_text_lists(cls, value: Any) -> list[str]:
        return _normalize_provider_text_list(value)

    @field_validator("decision", mode="before")
    @classmethod
    def _normalize_decision(cls, value: Any) -> Any:
        if isinstance(value, str):
            return value.strip().lower()
        return value


class ParentMessageDebugIteration(ParentMessageResponseModel):
    iteration: int
    source: str
    model: str | None = None
    fallback: bool = False
    revision_instructions: str | None = None
    candidate: ParentMessageFinalOutput
    evaluation: ParentMessageEvaluationMeta


class ParentMessageReflexionResponse(ParentMessageResponseModel):
    final_output: ParentMessageFinalOutput
    evaluation_meta: ParentMessageEvaluationMeta
    revision_count: int = 0
    source: str
    model: str | None = None
    fallback: bool = False
    continuity_notes: list[str] = Field(default_factory=list)
    memory_meta: JsonDict | None = None
    debug_iterations: list[ParentMessageDebugIteration] | None = None
