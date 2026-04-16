from __future__ import annotations

from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


TeacherVoiceCategory = Literal["DIET", "EMOTION", "HEALTH", "SLEEP", "LEAVE", "MIXED"]


class TeacherVoiceModel(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)


class TeacherVoiceUnderstandRequest(TeacherVoiceModel):
    transcript: str | None = None
    fallback_text: str | None = Field(default=None, validation_alias=AliasChoices("fallbackText", "fallback_text"))
    child_id: str | None = Field(default=None, validation_alias=AliasChoices("childId", "child_id"))
    child_name: str | None = Field(default=None, validation_alias=AliasChoices("childName", "child_name"))
    attachment_name: str | None = Field(
        default=None, validation_alias=AliasChoices("attachmentName", "attachment_name")
    )
    mime_type: str | None = Field(default=None, validation_alias=AliasChoices("mimeType", "mime_type"))
    duration_ms: int | None = Field(default=None, validation_alias=AliasChoices("durationMs", "duration_ms"))
    scene: str | None = None
    trace_id: str | None = Field(default=None, validation_alias=AliasChoices("traceId", "trace_id"))


class TeacherVoiceTranscriptPayload(TeacherVoiceModel):
    text: str
    source: str
    confidence: float | None = None
    provider: str
    mode: str
    fallback: bool = False
    raw: dict[str, Any] = Field(default_factory=dict)
    meta: dict[str, Any] = Field(default_factory=dict)


class TeacherVoiceRouterTask(TeacherVoiceModel):
    task_id: str
    category: TeacherVoiceCategory
    child_ref: str | None = None
    child_name: str | None = None
    raw_excerpt: str
    confidence: float
    meta: dict[str, Any] = Field(default_factory=dict)


class TeacherVoiceRouterResult(TeacherVoiceModel):
    is_multi_child: bool = False
    is_multi_event: bool = False
    primary_category: TeacherVoiceCategory
    tasks: list[TeacherVoiceRouterTask] = Field(default_factory=list)


class TeacherVoiceDraftItem(TeacherVoiceModel):
    child_ref: str | None = None
    child_name: str | None = None
    category: Literal["DIET", "EMOTION", "HEALTH", "SLEEP", "LEAVE"]
    summary: str
    structured_fields: dict[str, Any] = Field(default_factory=dict)
    confidence: float
    suggested_actions: list[str] = Field(default_factory=list)
    raw_excerpt: str
    source: str = "rule"


class TeacherVoiceRecordCompletionHint(TeacherVoiceModel):
    label: str
    reason: str
    suggested_prompt: str


class TeacherVoiceMicroTrainingSOP(TeacherVoiceModel):
    title: str
    steps: list[str] = Field(default_factory=list)
    duration_text: str
    scenario_tag: Literal["health", "sleep", "diet", "emotion", "separation_anxiety"]


class TeacherVoiceParentCommunicationScript(TeacherVoiceModel):
    short_message: str = ""
    calm_explanation: str = ""
    follow_up_reminder: str = ""


class TeacherVoiceCompatCopilotHint(TeacherVoiceModel):
    id: str | None = None
    title: str
    detail: str | None = None
    tone: Literal["info", "warning"] | None = None
    tags: list[str] = Field(default_factory=list)


class TeacherVoiceCompatCopilotStep(TeacherVoiceModel):
    title: str
    detail: str | None = None


class TeacherVoiceCompatCopilotSOP(TeacherVoiceModel):
    title: str
    summary: str | None = None
    durationLabel: str | None = None
    steps: list[TeacherVoiceCompatCopilotStep] = Field(default_factory=list)


class TeacherVoiceCompatCommunicationScript(TeacherVoiceModel):
    title: str = "家长沟通话术卡"
    opening: str | None = None
    situation: str | None = None
    ask: str | None = None
    closing: str | None = None
    bullets: list[str] = Field(default_factory=list)


class TeacherVoiceCompatPayload(TeacherVoiceModel):
    recordCompletionHints: list[TeacherVoiceCompatCopilotHint] = Field(default_factory=list)
    microTrainingSOP: TeacherVoiceCompatCopilotSOP | None = None
    parentCommunicationScript: TeacherVoiceCompatCommunicationScript | None = None


class TeacherVoiceSourceInfo(TeacherVoiceModel):
    asr: str
    router: str
    chaining: str


class TeacherVoiceModelInfo(TeacherVoiceModel):
    asr: str | None = None
    router: str
    chaining: str


class TeacherVoiceTrace(TeacherVoiceModel):
    request_id: str
    trace_id: str | None = None
    fallback: bool = False
    input_mode: Literal["json", "multipart"]
    stages: list[str] = Field(default_factory=list)


class TeacherVoiceMeta(TeacherVoiceModel):
    scene: str | None = None
    attachment_name: str | None = None
    mime_type: str | None = None
    duration_ms: int | None = None
    asr: dict[str, Any] = Field(default_factory=dict)


class TeacherVoiceUnderstandResponse(TeacherVoiceModel):
    transcript: TeacherVoiceTranscriptPayload
    router_result: TeacherVoiceRouterResult
    draft_items: list[TeacherVoiceDraftItem] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    record_completion_hints: list[TeacherVoiceRecordCompletionHint] = Field(default_factory=list)
    micro_training_sop: list[TeacherVoiceMicroTrainingSOP] = Field(default_factory=list)
    parent_communication_script: TeacherVoiceParentCommunicationScript = Field(
        default_factory=TeacherVoiceParentCommunicationScript
    )
    copilot: TeacherVoiceCompatPayload | None = None
    recordCompletionHints: list[TeacherVoiceCompatCopilotHint] = Field(default_factory=list)
    microTrainingSOP: TeacherVoiceCompatCopilotSOP | None = None
    parentCommunicationScript: TeacherVoiceCompatCommunicationScript | None = None
    source: TeacherVoiceSourceInfo
    model: TeacherVoiceModelInfo
    generated_at: str
    trace: TeacherVoiceTrace
    meta: TeacherVoiceMeta
