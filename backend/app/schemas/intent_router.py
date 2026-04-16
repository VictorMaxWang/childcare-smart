from __future__ import annotations

from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


def _to_camel(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(part[:1].upper() + part[1:] for part in parts[1:])


JsonDict = dict[str, Any]
IntentRouterRoleHint = Literal["teacher", "parent", "admin"]
IntentRouterDetectedRole = Literal["teacher", "parent", "admin", "unknown"]
SupportedIntent = Literal[
    "record_observation",
    "query_trend",
    "start_consultation",
    "generate_parent_draft",
    "view_priority",
    "view_tonight_action",
    "ask_storybook",
    "ask_weekly_report",
]
IntentRouterIntent = Literal[
    "record_observation",
    "query_trend",
    "start_consultation",
    "generate_parent_draft",
    "view_priority",
    "view_tonight_action",
    "ask_storybook",
    "ask_weekly_report",
    "unknown",
]
IntentRouterConfidence = Literal["high", "medium", "low"]
OptionalPayloadKind = Literal[
    "teacher-react-run",
    "teacher-agent-run",
    "teacher-consultation-run",
    "parent-trend-query",
    "parent-agent-run",
    "parent-storybook-run",
    "admin-agent-run",
]


class IntentRouterModel(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True, extra="ignore")


class IntentRouterRequest(IntentRouterModel):
    message: str
    role_hint: IntentRouterRoleHint | None = Field(
        default=None,
        validation_alias=AliasChoices("roleHint", "role_hint"),
    )
    child_id: str | None = Field(default=None, validation_alias=AliasChoices("childId", "child_id"))
    institution_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("institutionId", "institution_id"),
    )
    source_page: str | None = Field(default=None, validation_alias=AliasChoices("sourcePage", "source_page"))
    debug: bool = False


class IntentRouterPreviewCard(IntentRouterModel):
    title: str
    summary: str
    cta_label: str
    badges: list[str] = Field(default_factory=list)


class IntentRouterOptionalPayload(IntentRouterModel):
    kind: OptionalPayloadKind
    workflow: str | None = None
    message: str
    child_id: str | None = Field(default=None, validation_alias=AliasChoices("childId", "child_id"))
    institution_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("institutionId", "institution_id"),
    )
    question: str | None = None
    task: str | None = None
    anchor: str | None = None


class IntentRouterResponse(IntentRouterModel):
    detected_role: IntentRouterDetectedRole
    intent: IntentRouterIntent
    target_workflow: str
    target_page: str
    deeplink: str
    preview_card: IntentRouterPreviewCard
    optional_payload: IntentRouterOptionalPayload | None = None
    rule_id: str
    confidence: IntentRouterConfidence
    matched_signals: list[str] = Field(default_factory=list)
