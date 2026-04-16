from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from app.schemas.common import FlexibleModel


class ParentSuggestionRequest(FlexibleModel):
    pass


class ParentFollowUpRequest(FlexibleModel):
    pass


class TeacherAgentRequest(FlexibleModel):
    pass


class AdminAgentRequest(FlexibleModel):
    pass


class WeeklyReportOverview(FlexibleModel):
    visibleChildren: int = 0
    attendanceRate: float = 0
    mealRecordCount: int = 0
    healthAbnormalCount: int = 0
    growthAttentionCount: int = 0
    pendingReviewCount: int = 0
    feedbackCount: int = 0


class WeeklyReportDiet(FlexibleModel):
    balancedRate: float = 0
    hydrationAvg: float = 0
    monotonyDays: int = 0
    vegetableDays: int = 0
    proteinDays: int = 0


class WeeklyReportAttentionChild(FlexibleModel):
    childName: str = ""
    attentionCount: int = 0
    hydrationAvg: float = 0
    vegetableDays: int = 0


class WeeklyReportSnapshot(FlexibleModel):
    institutionName: str = ""
    periodLabel: str = ""
    role: str | None = None
    ageBandContext: dict[str, Any] | None = None
    overview: WeeklyReportOverview = Field(default_factory=WeeklyReportOverview)
    diet: WeeklyReportDiet = Field(default_factory=WeeklyReportDiet)
    topAttentionChildren: list[WeeklyReportAttentionChild] = Field(default_factory=list)
    highlights: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    memoryContext: dict[str, Any] | None = None
    continuityNotes: list[str] = Field(default_factory=list)


class WeeklyReportRequest(FlexibleModel):
    role: Literal["teacher", "admin", "parent"] | None = None
    snapshot: WeeklyReportSnapshot | None = None


class WeeklyReportSectionItem(FlexibleModel):
    label: str
    detail: str


class WeeklyReportSection(FlexibleModel):
    id: str
    title: str
    summary: str
    items: list[WeeklyReportSectionItem] = Field(default_factory=list)


class WeeklyReportPrimaryAction(FlexibleModel):
    title: str
    detail: str
    ownerRole: Literal["teacher", "admin", "parent"]
    dueWindow: str


class WeeklyReportResponse(FlexibleModel):
    schemaVersion: Literal["v2-actionized"]
    role: Literal["teacher", "admin", "parent"]
    summary: str
    highlights: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    nextWeekActions: list[str] = Field(default_factory=list)
    trendPrediction: Literal["up", "stable", "down"]
    sections: list[WeeklyReportSection] = Field(default_factory=list)
    primaryAction: WeeklyReportPrimaryAction | None = None
    continuityNotes: list[str] = Field(default_factory=list)
    memoryMeta: dict[str, Any] | None = None
    disclaimer: str
    source: Literal["ai", "fallback", "mock"]
    model: str | None = None


class HighRiskConsultationRequest(FlexibleModel):
    pass


class StreamAgentRequest(FlexibleModel):
    prompt: str | None = None
