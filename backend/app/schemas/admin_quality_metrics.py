from __future__ import annotations

from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


def _to_camel(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(part[:1].upper() + part[1:] for part in parts[1:])


JsonDict = dict[str, Any]
MetricSourceMode = Literal["aggregated", "derived", "fallback", "demo_only"]


class AdminQualityMetricsModel(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True, extra="ignore")


class AdminQualityMetricsRequest(AdminQualityMetricsModel):
    window_days: int | None = Field(default=None, validation_alias=AliasChoices("windowDays", "window_days"))
    app_snapshot: JsonDict | None = Field(
        default=None,
        validation_alias=AliasChoices("snapshot", "appSnapshot", "app_snapshot"),
    )
    institution_id: str | None = Field(default=None, validation_alias=AliasChoices("institutionId", "institution_id"))
    class_id: str | None = Field(default=None, validation_alias=AliasChoices("classId", "class_id"))
    class_ids: list[str] | None = Field(default=None, validation_alias=AliasChoices("classIds", "class_ids"))
    include_demo_fallback: bool | None = Field(
        default=None,
        validation_alias=AliasChoices("includeDemoFallback", "include_demo_fallback"),
    )
    today: str | None = None


class AdminQualityMetricsWindow(AdminQualityMetricsModel):
    days: int
    start_date: str
    end_date: str


class AdminQualityMetricSource(AdminQualityMetricsModel):
    mode: MetricSourceMode
    channels: list[str] = Field(default_factory=list)
    business_snapshot_source: str
    fallback_used: bool = False
    demo_only: bool = False
    note: str | None = None


class AdminQualityMetricCoverage(AdminQualityMetricsModel):
    eligible_count: int = 0
    observed_count: int = 0
    coverage_ratio: float = 0.0


class AdminQualityMetric(AdminQualityMetricsModel):
    id: str
    label: str
    value: float
    unit: str
    summary: str
    source: AdminQualityMetricSource
    fallback: bool = False
    confidence: float = Field(ge=0.0, le=1.0)
    coverage: AdminQualityMetricCoverage
    warnings: list[str] = Field(default_factory=list)
    data_quality: JsonDict = Field(default_factory=dict)
    window: AdminQualityMetricsWindow | None = None


class AdminQualityMetricsResponse(AdminQualityMetricsModel):
    schema_version: Literal["v1-admin-quality-metrics"]
    generated_at: str
    window: AdminQualityMetricsWindow
    consultation_closure_rate: AdminQualityMetric
    follow_up48h_completion_rate: AdminQualityMetric
    guardian_feedback_rate: AdminQualityMetric
    home_task_execution_rate: AdminQualityMetric
    teacher_low_confidence_rate: AdminQualityMetric
    morning_check_response_latency: AdminQualityMetric
    recurring_issue_heat: AdminQualityMetric
    suggestion_effectiveness: AdminQualityMetric
    source_summary: JsonDict = Field(default_factory=dict)
    data_quality: JsonDict = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    source: str
    fallback: bool = False
