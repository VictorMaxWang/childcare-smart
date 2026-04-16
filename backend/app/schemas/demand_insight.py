from __future__ import annotations

from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


def _to_camel(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(part[:1].upper() + part[1:] for part in parts[1:])


JsonDict = dict[str, Any]
InsightConfidence = Literal["low", "medium", "high"]


class DemandInsightModel(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True, extra="ignore")


class DemandInsightRequest(DemandInsightModel):
    window_days: int | None = Field(default=None, validation_alias=AliasChoices("windowDays", "window_days"))
    limit_per_category: int | None = Field(
        default=None,
        validation_alias=AliasChoices("limitPerCategory", "limit_per_category", "limit"),
    )
    consultation_limit: int | None = Field(
        default=None,
        validation_alias=AliasChoices("consultationLimit", "consultation_limit"),
    )
    app_snapshot: JsonDict | None = Field(default=None, validation_alias=AliasChoices("appSnapshot", "app_snapshot"))
    institution_id: str | None = Field(default=None, validation_alias=AliasChoices("institutionId", "institution_id"))
    include_weekly_signals: bool | None = Field(
        default=None,
        validation_alias=AliasChoices("includeWeeklySignals", "include_weekly_signals"),
    )
    today: str | None = None


class DemandInsightWindow(DemandInsightModel):
    days: int
    start_date: str
    end_date: str


class DemandInsightEvidence(DemandInsightModel):
    source_type: str
    label: str
    summary: str
    source_id: str | None = None
    timestamp: str | None = None
    child_id: str | None = None
    child_name: str | None = None


class DemandInsightItemSource(DemandInsightModel):
    channels: list[str] = Field(default_factory=list)
    business_snapshot_source: str
    fallback_used: bool = False
    demo_only: bool = False


class DemandInsightCoverage(DemandInsightModel):
    records: int = 0
    children: int = 0
    observed_days: int = 0
    ratio: float | None = None


class DemandInsightItem(DemandInsightModel):
    id: str
    label: str
    topic_key: str | None = None
    segment_type: str | None = None
    segment_key: str | None = None
    count: int = 0
    score: float = 0.0
    summary: str
    evidence: list[DemandInsightEvidence] = Field(default_factory=list)
    source: DemandInsightItemSource
    coverage: DemandInsightCoverage | None = None
    confidence: InsightConfidence = "low"


class DemandInsightSourceSummary(DemandInsightModel):
    business_snapshot_source: str
    consultation_snapshot_count: int = 0
    consultation_fallback_used: bool = False
    parent_follow_up_snapshot_count: int = 0
    weekly_report_snapshot_count: int = 0
    feedback_record_count: int = 0
    growth_record_count: int = 0
    health_record_count: int = 0
    meal_record_count: int = 0
    task_check_in_count: int = 0
    intervention_card_count: int = 0
    reminder_count: int = 0
    channels: list[str] = Field(default_factory=list)
    degraded: bool = False
    errors: list[str] = Field(default_factory=list)


class DemandInsightDataQuality(DemandInsightModel):
    total_children: int = 0
    eligible_feedback_children: int = 0
    feedback_children: int = 0
    feedback_coverage_ratio: float = 0.0
    consultation_count: int = 0
    sparse: bool = False
    fallback_used: bool = False
    demo_only: bool = False


class DemandInsightResponse(DemandInsightModel):
    schema_version: Literal["v1-demand-insight"]
    generated_at: str
    window: DemandInsightWindow
    top_concern_topics: list[DemandInsightItem] = Field(default_factory=list)
    consultation_trigger_heat: list[DemandInsightItem] = Field(default_factory=list)
    action_difficulty_topics: list[DemandInsightItem] = Field(default_factory=list)
    weak_feedback_segments: list[DemandInsightItem] = Field(default_factory=list)
    recurring_issue_clusters: list[DemandInsightItem] = Field(default_factory=list)
    source_summary: DemandInsightSourceSummary
    data_quality: DemandInsightDataQuality
    warnings: list[str] = Field(default_factory=list)
    source: str
    fallback: bool = False
