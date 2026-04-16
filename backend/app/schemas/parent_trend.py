from __future__ import annotations

from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


def _to_camel(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(part[:1].upper() + part[1:] for part in parts[1:])


JsonDict = dict[str, Any]
ParentTrendIntent = Literal["emotion", "diet", "sleep", "health", "growth_overall"]
ParentTrendLabel = Literal["改善", "波动", "稳定", "需关注"]
ParentTrendDirection = Literal["up", "down", "flat", "insufficient"]
SeriesKind = Literal["line", "bar"]


class ParentTrendModel(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True, extra="ignore")


class ParentTrendQueryRequest(ParentTrendModel):
    question: str
    child_id: str | None = Field(default=None, validation_alias=AliasChoices("childId", "child_id"))
    window_days: int | None = Field(default=None, validation_alias=AliasChoices("windowDays", "window_days"))
    app_snapshot: JsonDict | None = Field(default=None, validation_alias=AliasChoices("appSnapshot", "app_snapshot"))
    institution_id: str | None = Field(default=None, validation_alias=AliasChoices("institutionId", "institution_id"))
    trace_id: str | None = Field(default=None, validation_alias=AliasChoices("traceId", "trace_id"))
    debug_memory: bool = Field(default=False, validation_alias=AliasChoices("debugMemory", "debug_memory"))


class ParentTrendChild(ParentTrendModel):
    child_id: str | None = None
    name: str | None = None
    nickname: str | None = None
    class_name: str | None = None
    institution_id: str | None = None
    birth_date: str | None = None
    age_band: str | None = None
    normalized_age_band: str | None = None
    age_band_source: str | None = None


class ParentTrendQuerySummary(ParentTrendModel):
    question: str
    requested_window_days: int | None = None
    resolved_window_days: int
    child_id: str | None = None
    child_name: str | None = None


class ParentTrendRange(ParentTrendModel):
    start_date: str
    end_date: str


class ParentTrendSeriesPoint(ParentTrendModel):
    date: str
    label: str
    value: float | int | None = None
    raw_count: int = 0
    missing: bool = False


class ParentTrendSeries(ParentTrendModel):
    id: str
    label: str
    unit: str
    kind: SeriesKind = "line"
    data: list[ParentTrendSeriesPoint] = Field(default_factory=list)


class ParentTrendComparison(ParentTrendModel):
    baseline_avg: float | None = None
    recent_avg: float | None = None
    delta_pct: float | None = None
    direction: ParentTrendDirection = "insufficient"


class ParentTrendSupportingSignal(ParentTrendModel):
    source_type: str
    date: str | None = None
    summary: str


class ParentTrendDataQuality(ParentTrendModel):
    observed_days: int = 0
    coverage_ratio: float = 0.0
    sparse: bool = False
    fallback_used: bool = False
    source: str


class ParentTrendQueryResponse(ParentTrendModel):
    query: ParentTrendQuerySummary
    intent: ParentTrendIntent
    metric: str
    child: ParentTrendChild
    window_days: int
    range: ParentTrendRange
    labels: list[str] = Field(default_factory=list)
    x_axis: list[str] = Field(default_factory=list)
    series: list[ParentTrendSeries] = Field(default_factory=list)
    trend_label: ParentTrendLabel
    trend_score: float = 0.0
    comparison: ParentTrendComparison
    explanation: str
    supporting_signals: list[ParentTrendSupportingSignal] = Field(default_factory=list)
    data_quality: ParentTrendDataQuality
    warnings: list[str] = Field(default_factory=list)
    memory_meta: JsonDict | None = None
    source: str
    fallback: bool = False
