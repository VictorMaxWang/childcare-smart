import type {
  AnalyticsMetric,
  ApiAdminClassStat,
  ApiAdminQualityMetrics,
  ApiAdminSummary,
  ApiAnalyticsTrend,
  ApiDataQuality,
  ApiExtendedSnapshot,
  ReportScopeType,
} from "@/lib/api/types";
import type { SessionUser } from "@/lib/auth/accounts";
import { canAccessChild, canViewFeedback } from "@/lib/server/scope";

type AnyRecord = Record<string, unknown>;
type DateWindow = { start: string; end: string };
type TrendOptions = {
  metric?: AnalyticsMetric;
  timeRange?: string;
  windowDays?: number;
  classId?: string;
  childId?: string;
  referenceDate?: string;
  periodStart?: string;
  periodEnd?: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const METRIC_LABELS: Record<AnalyticsMetric, string> = {
  records: "records",
  health: "health",
  "health-abnormal": "health abnormal",
  meal: "meal",
  growth: "growth",
  feedback: "feedback",
  consultation: "consultation",
  "high-risk-consultation": "high risk consultation",
  reminder: "reminder",
};

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function readBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function dateKeyFrom(value: unknown) {
  if (typeof value !== "string" || value.length < 10) return "";
  const direct = value.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function dateToUtc(key: string) {
  return new Date(`${key}T00:00:00.000Z`).getTime();
}

function addDays(key: string, days: number) {
  return new Date(dateToUtc(key) + days * DAY_MS).toISOString().slice(0, 10);
}

function daysBetweenInclusive(start: string, end: string) {
  const days = Math.floor((dateToUtc(end) - dateToUtc(start)) / DAY_MS) + 1;
  return Math.max(1, days);
}

function rangeKeys(start: string, end: string) {
  return Array.from({ length: daysBetweenInclusive(start, end) }, (_, index) => addDays(start, index));
}

function normalizeWindowDays(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(90, Math.max(1, Math.floor(value))) : fallback;
}

function isNotArchived(item: unknown) {
  return !isRecord(item) || !readString(item.archivedAt);
}

function recordId(item: unknown) {
  if (!isRecord(item)) return "";
  return (
    readString(item.id) ||
    readString(item.recordId) ||
    readString(item.feedbackId) ||
    readString(item.consultationId) ||
    readString(item.reminderId) ||
    readString(item.messageId) ||
    readString(item.materialId) ||
    readString(item.attachmentId)
  );
}

function recordDate(item: unknown) {
  if (!isRecord(item)) return "";
  return (
    dateKeyFrom(item.date) ||
    dateKeyFrom(item.createdAt) ||
    dateKeyFrom(item.updatedAt) ||
    dateKeyFrom(item.generatedAt) ||
    dateKeyFrom(item.submittedAt) ||
    dateKeyFrom(item.scheduledAt)
  );
}

function childIdOf(item: unknown) {
  if (!isRecord(item)) return "";
  return readString(item.childId) || readString(item.targetChildId) || readString(item.targetId);
}

function statusOf(item: unknown) {
  if (!isRecord(item)) return "";
  return [
    readString(item.status),
    readString(item.executionStatus),
    readString(item.workflowStatus),
    readString(item.reviewStatus),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isResolved(item: unknown) {
  const status = statusOf(item);
  return ["handled", "resolved", "closed", "completed", "done", "read"].some((token) => status.includes(token));
}

function isHighRiskConsultation(item: unknown) {
  if (!isRecord(item)) return false;
  return readString(item.riskLevel).toLowerCase() === "high" || readBoolean(item.shouldEscalateToAdmin);
}

function isHealthAbnormal(item: unknown) {
  if (!isRecord(item)) return false;
  return readBoolean(item.isAbnormal) || readString(item.handMouthEye).toLowerCase().includes("abnormal");
}

function referenceDate(snapshot: ApiExtendedSnapshot) {
  const candidates = [
    ...snapshot.attendance.map(recordDate),
    ...snapshot.health.map(recordDate),
    ...snapshot.meals.map(recordDate),
    ...snapshot.growth.map(recordDate),
    ...snapshot.feedback.map(recordDate),
    ...snapshot.consultations.map(recordDate),
    ...snapshot.reminders.map(recordDate),
    dateKeyFrom(snapshot.updatedAt),
    new Date().toISOString().slice(0, 10),
  ].filter(Boolean);
  return candidates.sort().at(-1) ?? new Date().toISOString().slice(0, 10);
}

function startOfWeek(end: string) {
  const date = new Date(`${end}T00:00:00.000Z`);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(end, offset);
}

function resolveWindow(snapshot: ApiExtendedSnapshot, options: TrendOptions = {}): DateWindow {
  if (options.periodStart && options.periodEnd) {
    return { start: options.periodStart, end: options.periodEnd };
  }
  const end = options.referenceDate ?? referenceDate(snapshot);
  const timeRange = options.timeRange ?? "7d";
  if (timeRange === "week" || timeRange === "this-week") return { start: startOfWeek(end), end };
  const matchedDays = /^(\d+)d$/.exec(timeRange);
  const fallbackDays = matchedDays ? Number(matchedDays[1]) : timeRange === "30d" ? 30 : 7;
  const days = normalizeWindowDays(options.windowDays, fallbackDays);
  return { start: addDays(end, 1 - days), end };
}

function visibleChildren(snapshot: ApiExtendedSnapshot, session: SessionUser, options: Pick<TrendOptions, "classId" | "childId"> = {}) {
  return snapshot.children
    .filter((child) => child.institutionId === session.institutionId)
    .filter((child) => isNotArchived(child))
    .filter((child) => canAccessChild(session, child))
    .filter((child) => !options.classId || child.className === options.classId)
    .filter((child) => !options.childId || child.id === options.childId);
}

function childSet(snapshot: ApiExtendedSnapshot, session: SessionUser, options: Pick<TrendOptions, "classId" | "childId"> = {}) {
  return new Set(visibleChildren(snapshot, session, options).map((child) => child.id));
}

function withinWindow(item: unknown, window: DateWindow) {
  const key = recordDate(item);
  return Boolean(key && key >= window.start && key <= window.end);
}

function inChildScope(item: unknown, ids: Set<string>) {
  const childId = childIdOf(item);
  return Boolean(childId && ids.has(childId));
}

function sourceItems(snapshot: ApiExtendedSnapshot, session: SessionUser, options: TrendOptions = {}) {
  const ids = childSet(snapshot, session, options);
  const health = snapshot.health.filter((item) => isNotArchived(item) && inChildScope(item, ids));
  const meals = snapshot.meals.filter((item) => isNotArchived(item) && inChildScope(item, ids));
  const growth = snapshot.growth.filter((item) => isNotArchived(item) && inChildScope(item, ids));
  const attendance = snapshot.attendance.filter((item) => isNotArchived(item) && inChildScope(item, ids));
  const feedback = snapshot.feedback.filter((item) => canViewFeedback(session, snapshot, item) && inChildScope(item, ids));
  const consultations = snapshot.consultations.filter((item) => inChildScope(item, ids));
  const reminders = snapshot.reminders.filter((item) => inChildScope(item, ids));

  return {
    ids,
    children: visibleChildren(snapshot, session, options),
    health,
    meals,
    growth,
    attendance,
    feedback,
    consultations,
    reminders,
    records: [...attendance, ...health, ...meals, ...growth],
  };
}

function itemsForMetric(snapshot: ApiExtendedSnapshot, session: SessionUser, options: TrendOptions = {}) {
  const sources = sourceItems(snapshot, session, options);
  const metric = options.metric ?? "records";
  if (metric === "health") return sources.health;
  if (metric === "health-abnormal") return sources.health.filter(isHealthAbnormal);
  if (metric === "meal") return sources.meals;
  if (metric === "growth") return sources.growth;
  if (metric === "feedback") return sources.feedback;
  if (metric === "consultation") return sources.consultations;
  if (metric === "high-risk-consultation") return sources.consultations.filter(isHighRiskConsultation);
  if (metric === "reminder") return sources.reminders;
  return sources.records;
}

function buildDataQuality(
  seriesDates: string[],
  sourceRecordIds: string[],
  notePrefix: string,
  observedDates: string[] = []
): ApiDataQuality {
  const observedDays = new Set(sourceRecordIds.length > 0 ? observedDates.filter(Boolean) : []).size;
  const coverageRatio = seriesDates.length === 0 ? 0 : observedDays / seriesDates.length;
  const sparse = sourceRecordIds.length === 0 || coverageRatio < 0.34;
  return {
    source: "app-data-service",
    sparse,
    fallback: false,
    observedDays,
    coverageRatio: Number(coverageRatio.toFixed(2)),
    note: sparse ? `${notePrefix}: sparse or empty real records.` : `${notePrefix}: real records aggregated.`,
  };
}

export function buildTrend(snapshot: ApiExtendedSnapshot, session: SessionUser, options: TrendOptions = {}): ApiAnalyticsTrend {
  const metric = options.metric ?? "records";
  const window = resolveWindow(snapshot, options);
  const dates = rangeKeys(window.start, window.end);
  const scopedItems = itemsForMetric(snapshot, session, options).filter((item) => withinWindow(item, window));
  const sourceRecordIds = scopedItems.map(recordId).filter(Boolean);
  const counts = new Map<string, number>();
  for (const item of scopedItems) {
    const date = recordDate(item);
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  const observedSeriesDates = dates.filter((date) => (counts.get(date) ?? 0) > 0);
  const dataQuality = buildDataQuality(dates, sourceRecordIds, METRIC_LABELS[metric], observedSeriesDates);
  return {
    metric,
    timeRange: options.timeRange ?? (options.periodStart && options.periodEnd ? "custom" : "7d"),
    classId: options.classId,
    childId: options.childId,
    series: dates.map((date) => {
      const value = counts.get(date) ?? 0;
      return { date, label: date.slice(5), value, rawCount: value, missing: value === 0 };
    }),
    sourceRecordIds,
    generatedAt: new Date().toISOString(),
    dataQuality,
    emptyReason: sourceRecordIds.length === 0 ? "No real records matched the current scope and time range." : undefined,
  };
}

function uniqueSourceIds(...groups: unknown[][]) {
  return Array.from(new Set(groups.flat().map(recordId).filter(Boolean)));
}

function classStats(snapshot: ApiExtendedSnapshot, session: SessionUser, today: string): ApiAdminClassStat[] {
  const classes = Array.from(new Set(visibleChildren(snapshot, session).map((child) => child.className).filter(Boolean))).sort();
  return classes.map((classId) => {
    const sources = sourceItems(snapshot, session, { classId });
    const todayRecords = sources.records.filter((item) => recordDate(item) === today);
    return {
      classId,
      childCount: sources.children.length,
      teacherCount: snapshot.teachers.filter(
        (teacher) => teacher.institutionId === session.institutionId && teacher.className === classId && !teacher.archivedAt
      ).length,
      todayRecordCount: todayRecords.length,
      healthAbnormalCount: sources.health.filter(isHealthAbnormal).length,
      mealRecordCount: sources.meals.length,
      growthRecordCount: sources.growth.length,
      unresolvedFeedbackCount: sources.feedback.filter((item) => !isResolved(item)).length,
      highRiskConsultationCount: sources.consultations.filter((item) => isHighRiskConsultation(item) && !isResolved(item)).length,
      reminderCount: sources.reminders.filter((item) => !isResolved(item)).length,
    };
  });
}

export function buildAdminSummary(snapshot: ApiExtendedSnapshot, session: SessionUser): ApiAdminSummary {
  const today = referenceDate(snapshot);
  const sources = sourceItems(snapshot, session);
  const todayRecords = sources.records.filter((item) => recordDate(item) === today);
  const recent7DayTrend = buildTrend(snapshot, session, { metric: "records", timeRange: "7d", referenceDate: today });
  const currentWeekTrend = buildTrend(snapshot, session, { metric: "records", timeRange: "this-week", referenceDate: today });
  const sourceRecordIds = uniqueSourceIds(
    sources.records,
    sources.feedback,
    sources.consultations,
    sources.reminders,
    snapshot.attachments.filter((item) => item.institutionId === session.institutionId)
  );

  return {
    childCount: sources.children.length,
    teacherCount: snapshot.teachers.filter((teacher) => teacher.institutionId === session.institutionId && !teacher.archivedAt).length,
    todayRecordCount: todayRecords.length,
    healthAbnormalCount: sources.health.filter(isHealthAbnormal).length,
    mealRecordCount: sources.meals.length,
    growthRecordCount: sources.growth.length,
    unresolvedFeedbackCount: sources.feedback.filter((item) => !isResolved(item)).length,
    highRiskConsultationCount: sources.consultations.filter((item) => isHighRiskConsultation(item) && !isResolved(item)).length,
    reminderCount: sources.reminders.filter((item) => !isResolved(item)).length,
    feedbackCount: sources.feedback.length,
    activeConsultationCount: sources.consultations.filter((item) => !isResolved(item)).length,
    attachmentCount: snapshot.attachments.filter((item) => item.institutionId === session.institutionId).length,
    recordCounts: {
      attendance: sources.attendance.length,
      health: sources.health.length,
      meal: sources.meals.length,
      growth: sources.growth.length,
    },
    classStats: classStats(snapshot, session, today),
    recent7DayTrend,
    currentWeekTrend,
    sourceRecordIds,
    generatedAt: new Date().toISOString(),
    updatedAt: snapshot.updatedAt,
    dataQuality: {
      ...recent7DayTrend.dataQuality,
      note:
        sourceRecordIds.length === 0
          ? "Admin summary is a real empty state; no scoped records were found."
          : "Admin summary is calculated from scoped app-data-service records.",
    },
  };
}

export function buildAdminQualityMetrics(snapshot: ApiExtendedSnapshot, session: SessionUser): ApiAdminQualityMetrics {
  const today = referenceDate(snapshot);
  const sources = sourceItems(snapshot, session);
  const last7 = { start: addDays(today, -6), end: today };
  const feedbackResolved = sources.feedback.filter(isResolved);
  const mealChildDays = new Set(sources.meals.filter((item) => withinWindow(item, last7)).map((item) => `${childIdOf(item)}:${recordDate(item)}`));
  const growthChildren = new Set(sources.growth.filter((item) => withinWindow(item, last7)).map(childIdOf));
  const childDays = Math.max(1, sources.children.length * 7);
  const childCount = Math.max(1, sources.children.length);
  const feedbackRate = sources.feedback.length === 0 ? 0 : Math.round((feedbackResolved.length / sources.feedback.length) * 100);
  const dietCoverage = Math.round((mealChildDays.size / childDays) * 100);
  const growthCoverage = Math.round((growthChildren.size / childCount) * 100);
  const highRiskOpen = sources.consultations.filter((item) => isHighRiskConsultation(item) && !isResolved(item));
  const abnormalHealth = sources.health.filter(isHealthAbnormal);

  return {
    generatedAt: new Date().toISOString(),
    metrics: [
      {
        key: "feedback_response_rate",
        label: "Feedback response rate",
        value: feedbackRate,
        unit: "%",
        level: feedbackRate < 50 && sources.feedback.length > 0 ? "warning" : "normal",
        sourceRecordIds: sources.feedback.map(recordId).filter(Boolean),
      },
      {
        key: "diet_coverage_7d",
        label: "7-day diet coverage",
        value: dietCoverage,
        unit: "%",
        level: dietCoverage < 40 && sources.children.length > 0 ? "warning" : "normal",
        sourceRecordIds: sources.meals.map(recordId).filter(Boolean),
      },
      {
        key: "growth_coverage_7d",
        label: "7-day growth coverage",
        value: growthCoverage,
        unit: "%",
        level: growthCoverage < 30 && sources.children.length > 0 ? "warning" : "normal",
        sourceRecordIds: sources.growth.map(recordId).filter(Boolean),
      },
      {
        key: "health_abnormal_count",
        label: "Health abnormal records",
        value: abnormalHealth.length,
        unit: "items",
        level: abnormalHealth.length > 0 ? "warning" : "normal",
        sourceRecordIds: abnormalHealth.map(recordId).filter(Boolean),
      },
      {
        key: "open_high_risk_consultations",
        label: "Open high-risk consultations",
        value: highRiskOpen.length,
        unit: "items",
        level: highRiskOpen.length > 0 ? "risk" : "normal",
        sourceRecordIds: highRiskOpen.map(recordId).filter(Boolean),
      },
    ],
    dataQuality: buildTrend(snapshot, session, { metric: "records", timeRange: "7d", referenceDate: today }).dataQuality,
  };
}

function scopeToTrendOptions(scopeType: ReportScopeType, scopeId: string): Pick<TrendOptions, "classId" | "childId"> {
  if (scopeType === "class") return { classId: scopeId };
  if (scopeType === "child") return { childId: scopeId };
  return {};
}

export function buildWeeklyReportPayload(
  snapshot: ApiExtendedSnapshot,
  session: SessionUser,
  input: { scopeType: ReportScopeType; scopeId: string; periodStart: string; periodEnd: string }
) {
  const scopeOptions = scopeToTrendOptions(input.scopeType, input.scopeId);
  const period = { start: input.periodStart, end: input.periodEnd };
  const sources = sourceItems(snapshot, session, scopeOptions);
  const records = sources.records.filter((item) => withinWindow(item, period));
  const health = sources.health.filter((item) => withinWindow(item, period));
  const meals = sources.meals.filter((item) => withinWindow(item, period));
  const growth = sources.growth.filter((item) => withinWindow(item, period));
  const feedback = sources.feedback.filter((item) => withinWindow(item, period));
  const consultations = sources.consultations.filter((item) => withinWindow(item, period));
  const reminders = sources.reminders.filter((item) => withinWindow(item, period));
  const healthAbnormal = health.filter(isHealthAbnormal);
  const highRisk = consultations.filter(isHighRiskConsultation);
  const periodSourceRecordIds = uniqueSourceIds(records, feedback, consultations, reminders);
  const scopedSourceRecordIds = uniqueSourceIds(sources.records, sources.feedback, sources.consultations, sources.reminders);
  const sourceRecordIds = periodSourceRecordIds.length > 0 ? periodSourceRecordIds : scopedSourceRecordIds;
  const trend = buildTrend(snapshot, session, {
    metric: "records",
    timeRange: "custom",
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    ...scopeOptions,
  });
  const highlights = [
    `${records.length} daily records were captured in the selected weekly period.`,
    `${healthAbnormal.length} abnormal health records and ${highRisk.length} high-risk consultations require review.`,
    `${feedback.filter((item) => !isResolved(item)).length} feedback items remain unresolved.`,
  ];

  return {
    period: { start: input.periodStart, end: input.periodEnd },
    scope: { type: input.scopeType, id: input.scopeId },
    summary: {
      childCount: sources.children.length,
      recordCount: records.length,
      healthCount: health.length,
      healthAbnormalCount: healthAbnormal.length,
      mealCount: meals.length,
      growthCount: growth.length,
      feedbackCount: feedback.length,
      unresolvedFeedbackCount: feedback.filter((item) => !isResolved(item)).length,
      consultationCount: consultations.length,
      highRiskConsultationCount: highRisk.length,
      reminderCount: reminders.length,
    },
    classStats: input.scopeType === "institution" ? classStats(snapshot, session, input.periodEnd) : [],
    trend,
    highlights,
    sourceRecordIds,
    generatedAt: new Date().toISOString(),
    dataQuality: trend.dataQuality,
    recentRecords: {
      health: health.slice(-5).map((item) => pickRecordDetail(item)),
      meals: meals.slice(-5).map((item) => pickRecordDetail(item)),
      growth: growth.slice(-5).map((item) => pickRecordDetail(item)),
      feedback: feedback.slice(-5).map((item) => pickRecordDetail(item)),
      consultations: consultations.slice(-5).map((item) => pickRecordDetail(item)),
    },
  };
}

function pickRecordDetail(item: unknown) {
  if (!isRecord(item)) return {};
  return {
    id: recordId(item),
    childId: childIdOf(item),
    date: recordDate(item),
    status: statusOf(item),
    summary: readString(item.summary) || readString(item.description) || readString(item.content) || readString(item.remark),
  };
}

export type AnalyticsTrendOptions = TrendOptions;
