import { formatAdminSourceLabel } from "@/lib/agent/admin-display-text";

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

const ADMIN_QUALITY_METRIC_LABELS: Record<AdminQualityMetricId, string> = {
  consultationClosureRate: "会诊闭环率",
  followUp48hCompletionRate: "48小时复查完成率",
  guardianFeedbackRate: "家长反馈提交率",
  homeTaskExecutionRate: "家庭任务执行率",
  teacherLowConfidenceRate: "教师记录待复核率",
  morningCheckResponseLatency: "晨检异常响应时长",
  recurringIssueHeat: "重复问题热度",
  suggestionEffectiveness: "干预建议有效率",
};

const ADMIN_QUALITY_METRIC_NOTES: Record<AdminQualityMetricId, string> = {
  consultationClosureRate: "优先以高风险会诊快照为主数据；任务与反馈信号仅作为保守的闭环补充依据。",
  followUp48hCompletionRate: "当标准任务快照可用时，优先按标准任务数据计算。",
  guardianFeedbackRate: "分母仅统计预期存在家庭闭环的儿童，不代表全部在园儿童。",
  homeTaskExecutionRate: "当标准家长任务可用时，优先按任务执行结果计算。",
  teacherLowConfidenceRate: "该指标优先统计可持久化的教师记录，缺失时才回退到会诊证据口径。",
  morningCheckResponseLatency: "该时长基于后续响应事件推导，并非专门的晨检响应时间线。",
  recurringIssueHeat: "重复问题热度沿用需求洞察聚类结果，仍以聚合口径为主。",
  suggestionEffectiveness: "该指标只统计已回传反馈的建议，不能据此直接判断干预因果。",
};

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

function localizeAdminQualityWarning(warning: string) {
  return warning
    .replace(
      /Business snapshot data is using demo or fallback content; governance metrics are shape-stable but not institution-factual\./gi,
      "业务快照当前使用演示或兜底内容；治理指标的结构稳定，但不代表机构真实经营数据。"
    )
    .replace(
      /High-risk consultation snapshots are the primary source; task and feedback signals only provide conservative closure support\./gi,
      "优先以高风险会诊快照为主数据；任务与反馈信号仅作为保守的闭环补充依据。"
    )
    .replace(
      /Computed from canonical tasks when snapshot\.tasks is available\./gi,
      "当标准任务快照可用时，优先按标准任务数据计算。"
    )
    .replace(
      /Computed from canonical parent intervention tasks when available\./gi,
      "当标准家长任务可用时，优先按任务执行结果计算。"
    )
    .replace(
      /Denominator is limited to children with an expected home loop, not all visible children\./gi,
      "分母仅统计预期存在家庭闭环的儿童，不代表全部在园儿童。"
    )
    .replace(
      /This metric only covers suggestions with returned feedback and cannot establish causality\./gi,
      "该指标只统计已回传反馈的建议，不能据此直接判断干预因果。"
    )
    .replace(
      /Consultation-derived metrics use demo consultation feed fallback because recent consultation snapshots were unavailable\./gi,
      "会诊相关指标当前使用演示会诊兜底，因为近期会诊快照暂不可用。"
    )
    .replace(
      /当前 childcare snapshot 来自 demo\/fallback，分群、反馈与执行难点结果不能夸大为真实机构运营洞察。/gi,
      "当前业务快照来自演示或兜底数据，分群、反馈与执行难点结果仅供演示参考，不代表机构真实运营洞察。"
    )
    .replace(
      /当前 consultationTriggerHeat 使用 demo consultation feed 补位，仅适合演示聚合 shape。/gi,
      "当前会诊触发热度使用演示会诊推送补位，仅适合展示聚合结果形态。"
    )
    .replace(
      /Canonical task data is missing from the snapshot, so follow-up and home-task metrics may rely on legacy projection\./gi,
      "当前快照缺少标准任务数据，因此复查与家庭任务指标可能改用历史投影。"
    )
    .replace(
      /Teacher low-confidence is likely to fall back to consultation evidence because mobile teacher draft telemetry is absent\./gi,
      "当前缺少教师移动草稿埋点，因此教师记录待复核率可能回退到会诊证据口径。"
    )
    .replace(
      /Demo business snapshot fallback was explicitly suppressed for this request\./gi,
      "当前请求已显式关闭演示业务快照兜底。"
    )
    .replace(
      /Recurring issue heat demo fallback was suppressed for this request\./gi,
      "重复问题热度的演示兜底已在当前请求中关闭。"
    )
    .replace(
      /Some closures are inferred from downstream task or feedback signals, not a dedicated closure event(?: table)?\./gi,
      "部分闭环是根据后续任务完成或家长反馈回流推导得出，并非直接来自专门的闭环事件。"
    )
    .replace(
      /current using demo consultation feed fallback because recent consultation snapshots were unavailable\./gi,
      "当前使用演示会诊兜底，因为近期会诊快照暂不可用。"
    )
    .replace(
      /This metric falls back to reminder\/growth\/task-check-in projection because snapshot\.tasks was unavailable\./gi,
      "当前因标准任务快照不可用，48 小时复查完成率改用提醒、成长记录和打卡信号推导。"
    )
    .replace(
      /Home task execution falls back to intervention-card and feedback evidence because snapshot\.tasks was unavailable\./gi,
      "当前因标准任务快照不可用，家庭任务执行率改用干预卡与反馈证据推导。"
    )
    .replace(
      /Feedback eligibility is inferred from returned feedback only because parent tasks\/intervention cards were unavailable\./gi,
      "当前因家长任务或干预卡缺失，反馈分母只能根据已回传的家长反馈反推。"
    )
    .replace(
      /Teacher low-confidence rate falls back to consultation evidence because mobile teacher draft telemetry is unavailable\./gi,
      "当前因教师移动草稿埋点缺失，教师记录待复核率改用会诊证据项兜底。"
    )
    .replace(
      /Morning-check response latency is a proxy metric derived from the first downstream signal after an abnormal health record\./gi,
      "晨检异常响应时长是根据异常健康记录之后的首个下游信号推导得出的代理指标。"
    )
    .replace(
      /Health records are often date-granular, so the latency is coarse and not a true response-event SLA\./gi,
      "健康记录通常只有日期粒度，因此该时长只能反映粗略响应节奏，不代表严格的响应时效承诺。"
    )
    .replace(
      /Suggestion effectiveness is a conservative proxy based on intervention-linked feedback and should not be read as causal effectiveness\./gi,
      "建议有效率只是基于关联反馈的保守代理指标，不能直接视为因果效果。"
    )
    .replace(
      /Memory backend is degraded to ([^;]+); recent traces and snapshots may be incomplete\./gi,
      (_match, backend) => `记忆后端已降级为 ${formatAdminSourceLabel(String(backend))}，近期链路记录与快照可能不完整。`
    )
    .replace(
      /memory backend 已降级到 ([^，;]+)，最近 trace\/snapshot 覆盖可能不完整。/gi,
      (_match, backend) => `记忆后端已降级为 ${formatAdminSourceLabel(String(backend))}，近期链路记录与快照覆盖可能不完整。`
    )
    .replace(
      /weekly report snapshots 当前仅作为辅助聚合信号，不能视为真实运营周报洞察。/gi,
      "周报快照当前仅作为辅助聚合信号，不能视为真实运营周报洞察。"
    )
    .replace(
      /parent follow-up snapshots 当前仅纳入来源统计，未直接参与核心评分，且仍可能包含 mock\/contract 依赖。/gi,
      "家长跟进快照当前仅纳入来源统计，未直接参与核心评分，且仍可能包含演示或契约兜底依赖。"
    )
    .replace(
      /^childcare snapshot fallback:.*$/gim,
      "业务快照兜底存在异常，当前页面已改用保守展示口径。"
    )
    .replace(
      /^业务快照兜底异常：.*$/gim,
      "业务快照兜底存在异常，当前页面已改用保守展示口径。"
    )
    .replace(
      /^childcare_snapshot:.*$/gim,
      "业务快照校验存在异常，当前页面已改用保守展示口径。"
    )
    .replace(/Metrics were filtered to class ids:/gi, "指标已按班级范围过滤：")
    .replace(/Memory backend is degraded to/gi, "记忆后端已降级为");
}

function buildLocalizedMetricSummary(metric: AdminQualityMetric) {
  const metricId = metric.id as AdminQualityMetricId;
  const eligible = metric.coverage.eligibleCount;
  const observed = metric.coverage.observedCount;
  const windowDays = metric.window?.days;

  switch (metricId) {
    case "consultationClosureRate":
      return eligible
        ? `近 ${windowDays ?? 7} 天共有 ${eligible} 条高风险会诊进入统计，其中 ${Math.round((metric.value / 100) * eligible)} 条已形成闭环。`
        : `近 ${windowDays ?? 7} 天未发现纳入统计的高风险会诊。`;
    case "followUp48hCompletionRate":
      return eligible
        ? `已完成 ${Math.round((metric.value / 100) * eligible)}/${eligible} 条 48 小时复查事项。`
        : `近 ${windowDays ?? 7} 天未发现可统计的 48 小时复查事项。`;
    case "guardianFeedbackRate":
      return eligible
        ? `预期需要家庭闭环的儿童中，已有 ${observed}/${eligible} 名提交家长反馈。`
        : `近 ${windowDays ?? 7} 天未识别出需要统计家长反馈的儿童。`;
    case "homeTaskExecutionRate":
      return eligible
        ? `已完成 ${Math.round((metric.value / 100) * eligible)}/${eligible} 条家庭任务。`
        : `近 ${windowDays ?? 7} 天未识别出可统计的家庭任务。`;
    case "teacherLowConfidenceRate":
      return eligible
        ? `共有 ${eligible} 条教师记录纳入统计，其中 ${Math.round((metric.value / 100) * eligible)} 条需要人工复核。`
        : "当前时间窗内未发现可统计的教师记录。";
    case "morningCheckResponseLatency":
      return observed
        ? `在 ${eligible} 条晨检异常中，已有 ${observed} 条出现后续响应信号，平均首次响应时长为 ${metric.value.toFixed(1)} 小时。`
        : eligible
          ? `近 ${windowDays ?? 7} 天记录了 ${eligible} 条晨检异常，但暂未推导出后续响应时间。`
          : `近 ${windowDays ?? 7} 天未发现晨检异常。`;
    case "recurringIssueHeat": {
      const topIssues = Array.isArray(metric.dataQuality.topIssues)
        ? (metric.dataQuality.topIssues as string[]).filter(Boolean)
        : [];
      return topIssues.length > 0
        ? `当前重复问题热度主要集中在 ${topIssues.join("、")}。`
        : `近 ${windowDays ?? 7} 天暂无重复问题簇超过当前聚合阈值。`;
    }
    case "suggestionEffectiveness":
      return eligible
        ? `在 ${eligible} 条已回传反馈的建议中，有 ${Math.round((metric.value / 100) * eligible)} 条呈现改善信号。`
        : "当前时间窗内暂无足够的建议反馈回流，无法估算建议有效率。";
    default:
      return metric.summary;
  }
}

function buildLocalizedMetricNote(metric: AdminQualityMetric) {
  const metricId = (metric.id as AdminQualityMetricId) in ADMIN_QUALITY_METRIC_NOTES
    ? (metric.id as AdminQualityMetricId)
    : null;
  if (metricId) return ADMIN_QUALITY_METRIC_NOTES[metricId];

  const existing = metric.source.note ? localizeAdminQualityWarning(metric.source.note) : "";
  if (existing) return existing;

  switch (metric.id as AdminQualityMetricId) {
    case "consultationClosureRate":
      return ADMIN_QUALITY_METRIC_NOTES.consultationClosureRate;
    case "followUp48hCompletionRate":
      return ADMIN_QUALITY_METRIC_NOTES.followUp48hCompletionRate;
    case "guardianFeedbackRate":
      return ADMIN_QUALITY_METRIC_NOTES.guardianFeedbackRate;
    case "homeTaskExecutionRate":
      return ADMIN_QUALITY_METRIC_NOTES.homeTaskExecutionRate;
    case "teacherLowConfidenceRate":
      return ADMIN_QUALITY_METRIC_NOTES.teacherLowConfidenceRate;
    case "morningCheckResponseLatency":
      return ADMIN_QUALITY_METRIC_NOTES.morningCheckResponseLatency;
    case "recurringIssueHeat":
      return ADMIN_QUALITY_METRIC_NOTES.recurringIssueHeat;
    case "suggestionEffectiveness":
      return ADMIN_QUALITY_METRIC_NOTES.suggestionEffectiveness;
    default:
      return metric.source.note;
  }
}

function localizeMetric(metric: AdminQualityMetric): AdminQualityMetric {
  const metricId = (metric.id as AdminQualityMetricId) in ADMIN_QUALITY_METRIC_LABELS
    ? (metric.id as AdminQualityMetricId)
    : null;

  return {
    ...metric,
    label: metricId ? ADMIN_QUALITY_METRIC_LABELS[metricId] : metric.label,
    summary: metricId ? buildLocalizedMetricSummary(metric) : localizeAdminQualityWarning(metric.summary),
    source: {
      ...metric.source,
      note: buildLocalizedMetricNote(metric),
    },
    warnings: metric.warnings.map((warning) => localizeAdminQualityWarning(warning)),
  };
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

  return localizeMetric({
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
  });
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
    warnings: asStringArray(value.warnings).map((warning) => localizeAdminQualityWarning(warning)),
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
  return formatAdminSourceLabel(value);
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
