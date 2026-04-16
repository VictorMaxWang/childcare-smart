export const ADMIN_QUALITY_METRIC_IDS = [
  "consultationClosureRate",
  "followUp48hCompletionRate",
  "guardianFeedbackRate",
  "homeTaskExecutionRate",
  "teacherLowConfidenceRate",
  "morningCheckResponseLatency",
  "recurringIssueHeat",
  "suggestionEffectiveness",
] as const;

export type AdminQualityMetricId = (typeof ADMIN_QUALITY_METRIC_IDS)[number];
export type AdminQualityMetricGroupId = "execution" | "collaboration" | "governance";
export type AdminQualityMetricSourceMode = "aggregated" | "derived" | "fallback" | "demo_only";

export interface AdminQualityMetricsWindow {
  days: number;
  startDate: string;
  endDate: string;
}

export interface AdminQualityMetricSource {
  mode: AdminQualityMetricSourceMode;
  channels: string[];
  businessSnapshotSource: string;
  fallbackUsed: boolean;
  demoOnly: boolean;
  note?: string;
}

export interface AdminQualityMetricCoverage {
  eligibleCount: number;
  observedCount: number;
  coverageRatio: number;
}

export interface AdminQualityMetric {
  id: string;
  label: string;
  value: number;
  unit: string;
  summary: string;
  source: AdminQualityMetricSource;
  fallback: boolean;
  confidence: number;
  coverage: AdminQualityMetricCoverage;
  warnings: string[];
  dataQuality: Record<string, unknown>;
  window?: AdminQualityMetricsWindow;
}

export interface AdminQualityMetricsResponse {
  schemaVersion: string;
  generatedAt: string;
  window: AdminQualityMetricsWindow;
  consultationClosureRate: AdminQualityMetric;
  followUp48hCompletionRate: AdminQualityMetric;
  guardianFeedbackRate: AdminQualityMetric;
  homeTaskExecutionRate: AdminQualityMetric;
  teacherLowConfidenceRate: AdminQualityMetric;
  morningCheckResponseLatency: AdminQualityMetric;
  recurringIssueHeat: AdminQualityMetric;
  suggestionEffectiveness: AdminQualityMetric;
  sourceSummary: Record<string, unknown>;
  dataQuality: Record<string, unknown>;
  warnings: string[];
  source: string;
  fallback: boolean;
}

export interface AdminQualityMetricGroup {
  id: AdminQualityMetricGroupId;
  title: string;
  description: string;
  metricIds: AdminQualityMetricId[];
  metrics: AdminQualityMetric[];
}

const ADMIN_QUALITY_GROUPS: Array<{
  id: AdminQualityMetricGroupId;
  title: string;
  description: string;
  metricIds: AdminQualityMetricId[];
}> = [
  {
    id: "execution",
    title: "闭环执行",
    description: "看会诊转闭环、48 小时复查和家庭任务落地情况。",
    metricIds: [
      "consultationClosureRate",
      "followUp48hCompletionRate",
      "homeTaskExecutionRate",
    ],
  },
  {
    id: "collaboration",
    title: "家园协同",
    description: "看家长反馈回收和建议带来的后续改善信号。",
    metricIds: ["guardianFeedbackRate", "suggestionEffectiveness"],
  },
  {
    id: "governance",
    title: "治理信号",
    description: "看教师记录质量、晨检响应和复发问题热度。",
    metricIds: [
      "teacherLowConfidenceRate",
      "morningCheckResponseLatency",
      "recurringIssueHeat",
    ],
  },
];

type BadgeVariant = "success" | "info" | "warning" | "outline";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asText(item))
    .filter((item): item is string => Boolean(item));
}

function normalizeWindow(value: unknown): AdminQualityMetricsWindow | undefined {
  if (!isRecord(value)) return undefined;
  const days = asNumber(value.days);
  const startDate = asText(value.startDate);
  const endDate = asText(value.endDate);
  if (days === undefined || !startDate || !endDate) return undefined;
  return { days, startDate, endDate };
}

function normalizeMetricSource(value: unknown): AdminQualityMetricSource | undefined {
  if (!isRecord(value)) return undefined;
  const mode = asText(value.mode);
  const businessSnapshotSource = asText(value.businessSnapshotSource);
  if (!mode || !businessSnapshotSource) return undefined;
  return {
    mode: (mode as AdminQualityMetricSourceMode) ?? "fallback",
    channels: asStringArray(value.channels),
    businessSnapshotSource,
    fallbackUsed: asBoolean(value.fallbackUsed) ?? false,
    demoOnly: asBoolean(value.demoOnly) ?? false,
    note: asText(value.note),
  };
}

function normalizeMetricCoverage(value: unknown): AdminQualityMetricCoverage | undefined {
  if (!isRecord(value)) return undefined;
  const eligibleCount = asNumber(value.eligibleCount);
  const observedCount = asNumber(value.observedCount);
  const coverageRatio = asNumber(value.coverageRatio);
  if (eligibleCount === undefined || observedCount === undefined || coverageRatio === undefined) return undefined;
  return {
    eligibleCount,
    observedCount,
    coverageRatio,
  };
}

function normalizeMetric(value: unknown, fallbackId: AdminQualityMetricId): AdminQualityMetric | undefined {
  if (!isRecord(value)) return undefined;
  const label = asText(value.label);
  const metricValue = asNumber(value.value);
  const unit = asText(value.unit);
  const summary = asText(value.summary);
  const source = normalizeMetricSource(value.source);
  const coverage = normalizeMetricCoverage(value.coverage);
  if (!label || metricValue === undefined || !unit || !summary || !source || !coverage) {
    return undefined;
  }

  return {
    id: asText(value.id) ?? fallbackId,
    label,
    value: metricValue,
    unit,
    summary,
    source,
    fallback: asBoolean(value.fallback) ?? false,
    confidence: asNumber(value.confidence) ?? 0,
    coverage,
    warnings: asStringArray(value.warnings),
    dataQuality: isRecord(value.dataQuality) ? value.dataQuality : {},
    window: normalizeWindow(value.window),
  };
}

export function normalizeAdminQualityMetricsResponse(
  value: unknown
): AdminQualityMetricsResponse | undefined {
  if (!isRecord(value)) return undefined;
  const schemaVersion = asText(value.schemaVersion);
  const generatedAt = asText(value.generatedAt);
  const window = normalizeWindow(value.window);
  if (!schemaVersion || !generatedAt || !window) return undefined;

  const metrics = Object.fromEntries(
    ADMIN_QUALITY_METRIC_IDS.map((metricId) => [metricId, normalizeMetric(value[metricId], metricId)])
  ) as Record<AdminQualityMetricId, AdminQualityMetric | undefined>;

  if (ADMIN_QUALITY_METRIC_IDS.some((metricId) => !metrics[metricId])) {
    return undefined;
  }

  return {
    schemaVersion,
    generatedAt,
    window,
    consultationClosureRate: metrics.consultationClosureRate!,
    followUp48hCompletionRate: metrics.followUp48hCompletionRate!,
    guardianFeedbackRate: metrics.guardianFeedbackRate!,
    homeTaskExecutionRate: metrics.homeTaskExecutionRate!,
    teacherLowConfidenceRate: metrics.teacherLowConfidenceRate!,
    morningCheckResponseLatency: metrics.morningCheckResponseLatency!,
    recurringIssueHeat: metrics.recurringIssueHeat!,
    suggestionEffectiveness: metrics.suggestionEffectiveness!,
    sourceSummary: isRecord(value.sourceSummary) ? value.sourceSummary : {},
    dataQuality: isRecord(value.dataQuality) ? value.dataQuality : {},
    warnings: asStringArray(value.warnings),
    source: asText(value.source) ?? "unknown",
    fallback: asBoolean(value.fallback) ?? false,
  };
}

export function buildAdminQualityMetricGroups(
  response: AdminQualityMetricsResponse
): AdminQualityMetricGroup[] {
  return ADMIN_QUALITY_GROUPS.map((group) => ({
    ...group,
    metrics: group.metricIds.map((metricId) => response[metricId]),
  }));
}

export function formatAdminQualitySource(value: string) {
  const normalized = value
    .replace(/backend/gi, "系统")
    .replace(/fallback/gi, "本地兜底")
    .replace(/demo/gi, "演示")
    .replace(/unknown/gi, "未说明")
    .replace(/[_-]+/g, " ")
    .trim();

  return normalized || "未说明";
}

export function formatMetricSourceMode(mode: AdminQualityMetricSourceMode) {
  switch (mode) {
    case "aggregated":
      return "聚合";
    case "derived":
      return "推导";
    case "fallback":
      return "本地兜底";
    case "demo_only":
      return "演示";
    default:
      return mode;
  }
}

export function formatMetricUnit(unit: string) {
  if (unit === "hours") return "小时";
  if (unit === "score") return "分";
  return unit;
}

export function formatMetricPrimaryValue(metric: AdminQualityMetric) {
  const decimals = metric.unit === "%" || metric.unit === "hours" || metric.unit === "score"
    ? 1
    : Number.isInteger(metric.value)
      ? 0
      : 1;

  return {
    value: metric.value.toFixed(decimals),
    unit: formatMetricUnit(metric.unit),
  };
}

export function formatRatio(value: number) {
  return `${Math.round(Math.max(0, Math.min(value, 1)) * 100)}%`;
}

export function formatConfidence(value: number) {
  return `${Math.round(Math.max(0, Math.min(value, 1)) * 100)}%`;
}

export function getBusinessSnapshotSource(
  response: AdminQualityMetricsResponse
) {
  return asText(response.sourceSummary.businessSnapshotSource) ?? response.source;
}

export function getModeBadgeVariant(mode: AdminQualityMetricSourceMode): BadgeVariant {
  if (mode === "aggregated") return "success";
  if (mode === "derived") return "info";
  if (mode === "fallback") return "warning";
  return "outline";
}

export function getConfidenceBadgeVariant(confidence: number): BadgeVariant {
  if (confidence >= 0.8) return "success";
  if (confidence >= 0.55) return "info";
  return "warning";
}

export function getCoverageBadgeVariant(ratio: number): BadgeVariant {
  if (ratio >= 0.75) return "success";
  if (ratio >= 0.4) return "info";
  return "warning";
}
