from __future__ import annotations

from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


def _to_camel(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(part[:1].upper() + part[1:] for part in parts[1:])


JsonDict = dict[str, Any]
ParentStoryBookMode = Literal["storybook", "card"]
ParentStoryBookRequestMode = Literal["storybook", "card", "auto"]
ParentStoryBookResultSource = Literal["ai", "fallback", "mock", "rule", "vivo"]
ParentStoryBookMediaStatus = Literal["ready", "mock", "fallback", "empty"]
ParentStoryBookGenerationMode = Literal["child-personalized", "manual-theme", "hybrid"]
ParentStoryBookPageCount = Literal[4, 6, 8]
ParentStoryBookStylePreset = Literal["sunrise-watercolor", "moonlit-cutout", "forest-crayon"]
ParentStoryBookStyleMode = Literal["preset", "custom"]
ParentStoryBookImageSourceKind = Literal["real", "dynamic-fallback", "demo-art", "svg-fallback"]
ParentStoryBookHighlightKind = Literal[
    "todayGrowth",
    "warningSuggestion",
    "consultationSummary",
    "consultationAction",
    "guardianFeedback",
    "weeklyTrend",
    "manualTheme",
    "goalKeyword",
    "childTrait",
]


class ParentStoryBookModel(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True, extra="ignore")


class ParentStoryBookHighlightCandidate(ParentStoryBookModel):
    kind: ParentStoryBookHighlightKind
    title: str
    detail: str
    priority: int = 1
    source: str | None = None


class ParentStoryBookProviderMeta(ParentStoryBookModel):
    provider: str
    mode: str
    transport: str | None = None
    image_provider: str
    audio_provider: str
    image_delivery: Literal["real", "mixed", "dynamic-fallback", "demo-art", "svg-fallback"] | None = None
    audio_delivery: Literal["real", "mixed", "preview-only"] | None = None
    diagnostics: "ParentStoryBookDiagnostics | None" = None
    style_preset: ParentStoryBookStylePreset | None = None
    request_source: str | None = None
    fallback_reason: str | None = None
    real_provider: bool = False
    highlight_count: int = 0
    scene_count: int = 0
    cache_hit_count: int = 0
    cache_window_seconds: int | None = None


class ParentStoryBookDiagnosticsMedia(ParentStoryBookModel):
    requested_provider: str | None = None
    resolved_provider: str | None = None
    live_enabled: bool = False
    missing_config: list[str] = Field(default_factory=list)
    job_status: str | None = None
    pending_scene_count: int = 0
    ready_scene_count: int = 0
    error_scene_count: int = 0
    last_error_stage: str | None = None
    last_error_reason: str | None = None
    elapsed_ms: int | None = None


class ParentStoryBookDiagnosticsBrain(ParentStoryBookModel):
    reachable: bool = False
    fallback_reason: str | None = None
    upstream_host: str | None = None
    status_code: int | None = None
    retry_strategy: Literal["none", "normalized-base-retry"] | None = None
    elapsed_ms: int | None = None
    timeout_ms: int | None = None


class ParentStoryBookDiagnostics(ParentStoryBookModel):
    brain: ParentStoryBookDiagnosticsBrain = Field(default_factory=ParentStoryBookDiagnosticsBrain)
    image: ParentStoryBookDiagnosticsMedia = Field(default_factory=ParentStoryBookDiagnosticsMedia)
    audio: ParentStoryBookDiagnosticsMedia = Field(default_factory=ParentStoryBookDiagnosticsMedia)


class ParentStoryBookCaptionTiming(ParentStoryBookModel):
    mode: Literal["tts-cues", "speech-boundary", "duration-derived"]
    segment_texts: list[str] = Field(default_factory=list)
    segment_durations_ms: list[int] = Field(default_factory=list)


class ParentStoryBookScene(ParentStoryBookModel):
    scene_index: int
    scene_title: str
    scene_text: str
    image_prompt: str
    image_url: str | None = None
    asset_ref: str | None = None
    image_status: ParentStoryBookMediaStatus
    image_source_kind: ParentStoryBookImageSourceKind | None = None
    audio_url: str | None = None
    audio_ref: str | None = None
    audio_script: str
    audio_status: ParentStoryBookMediaStatus
    caption_timing: ParentStoryBookCaptionTiming | None = None
    voice_style: str
    engine_id: str | None = None
    voice_name: str | None = None
    highlight_source: str
    image_cache_hit: bool = False
    audio_cache_hit: bool = False


class ParentStoryBookRequest(ParentStoryBookModel):
    child_id: str | None = Field(default=None, validation_alias=AliasChoices("childId", "child_id"))
    story_mode: ParentStoryBookRequestMode | None = Field(
        default=None,
        validation_alias=AliasChoices("storyMode", "story_mode"),
    )
    generation_mode: ParentStoryBookGenerationMode | None = Field(
        default=None,
        validation_alias=AliasChoices("generationMode", "generation_mode"),
    )
    manual_theme: str | None = Field(
        default=None,
        validation_alias=AliasChoices("manualTheme", "manual_theme"),
    )
    manual_prompt: str | None = Field(
        default=None,
        validation_alias=AliasChoices("manualPrompt", "manual_prompt"),
    )
    page_count: ParentStoryBookPageCount | None = Field(
        default=None,
        validation_alias=AliasChoices("pageCount", "page_count"),
    )
    goal_keywords: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("goalKeywords", "goal_keywords"),
    )
    protagonist_archetype: str | None = Field(
        default=None,
        validation_alias=AliasChoices("protagonistArchetype", "protagonist_archetype"),
    )
    request_source: str | None = Field(
        default=None,
        validation_alias=AliasChoices("requestSource", "request_source"),
    )
    style_preset: ParentStoryBookStylePreset | None = Field(
        default=None,
        validation_alias=AliasChoices("stylePreset", "style_preset"),
    )
    style_mode: ParentStoryBookStyleMode | None = Field(
        default=None,
        validation_alias=AliasChoices("styleMode", "style_mode"),
    )
    custom_style_prompt: str | None = Field(
        default=None,
        validation_alias=AliasChoices("customStylePrompt", "custom_style_prompt"),
    )
    custom_style_negative_prompt: str | None = Field(
        default=None,
        validation_alias=AliasChoices("customStyleNegativePrompt", "custom_style_negative_prompt"),
    )
    style_prompt: str | None = Field(
        default=None,
        validation_alias=AliasChoices("stylePrompt", "style_prompt"),
    )
    snapshot: JsonDict
    highlight_candidates: list[ParentStoryBookHighlightCandidate] = Field(
        default_factory=list,
        validation_alias=AliasChoices("highlightCandidates", "highlight_candidates"),
    )
    latest_intervention_card: JsonDict | None = Field(
        default=None,
        validation_alias=AliasChoices("latestInterventionCard", "latest_intervention_card"),
    )
    latest_consultation: JsonDict | None = Field(
        default=None,
        validation_alias=AliasChoices("latestConsultation", "latest_consultation"),
    )
    trace_id: str | None = Field(default=None, validation_alias=AliasChoices("traceId", "trace_id"))
    debug_memory: bool = Field(default=False, validation_alias=AliasChoices("debugMemory", "debug_memory"))


class ParentStoryBookResponse(ParentStoryBookModel):
    story_id: str
    child_id: str
    mode: ParentStoryBookMode
    title: str
    summary: str
    moral: str
    parent_note: str
    source: ParentStoryBookResultSource
    fallback: bool = False
    fallback_reason: str | None = None
    generated_at: str
    style_preset: ParentStoryBookStylePreset | None = None
    provider_meta: ParentStoryBookProviderMeta
    scenes: list[ParentStoryBookScene] = Field(default_factory=list)
