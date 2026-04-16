import type { ParentAgentChildContext, ParentAgentResult } from "@/lib/agent/parent-agent";
import { buildConsultationEvidencePanelModel } from "../consultation/evidence-display";
import type {
  ConsultationEvidenceItem,
  ConsultationResult,
  MemoryContextMeta,
  ParentTrendDataQuality,
  ParentTrendQueryResponse,
  WeeklyReportResponse,
} from "@/lib/ai/types";

export type ParentTransparencyBadgeVariant =
  | "success"
  | "warning"
  | "info"
  | "secondary"
  | "outline";

export interface ParentTransparencyBadge {
  id: string;
  label: string;
  variant: ParentTransparencyBadgeVariant;
}

export interface ParentTransparencyViewModel {
  summarySentence: string;
  sourceBadges: ParentTransparencyBadge[];
  reliabilityText: string;
  coverageText?: string;
  warnings: string[];
  boundaryNotes: string[];
  closureStatus: string;
  evidenceBullets: string[];
  defaultExpanded: boolean;
}

export interface BuildParentHomeTransparencyInput {
  context: ParentAgentChildContext;
  suggestionResult: ParentAgentResult | null;
  weeklyReport: WeeklyReportResponse | null;
  weeklyReportError?: string | null;
  latestConsultation?: ConsultationResult | null;
  pendingFeedback?: boolean;
}

export interface BuildParentAgentTransparencyInput {
  context: ParentAgentChildContext;
  currentResult: ParentAgentResult | null;
  consultation?: ConsultationResult | null;
  trendResult?: ParentTrendQueryResponse | null;
  pendingFeedback?: boolean;
}

type SourceHint = {
  source?: string | null;
  fallback?: boolean;
};

type SourceMode = "loading" | "live" | "mixed" | "fallback" | "demo";

function uniqueTexts(items: Array<string | null | undefined>, limit = 6) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = item?.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) break;
  }

  return result;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function isFallbackLikeSource(source?: string | null) {
  return source === "fallback" || source === "rule";
}

function isDemoLikeSource(source?: string | null) {
  return source === "mock" || source === "demo_snapshot";
}

function isLiveLikeSource(source?: string | null) {
  return (
    source === "ai" ||
    source === "vivo" ||
    source === "request_snapshot" ||
    source === "remote_snapshot"
  );
}

function hasDegradedMemory(memoryMeta?: MemoryContextMeta | Record<string, unknown> | null) {
  if (!memoryMeta || typeof memoryMeta !== "object") return false;
  return Boolean((memoryMeta as Record<string, unknown>).degraded);
}

function getConsultation(result?: ParentAgentResult | null, consultation?: ConsultationResult | null) {
  return consultation ?? result?.consultation ?? null;
}

function resolveSourceMode(hints: SourceHint[]) {
  const activeHints = hints.filter((item) => item.source || item.fallback);
  if (activeHints.length === 0) return "loading" as const;

  const hasDemo = activeHints.some(
    (item) => isDemoLikeSource(item.source) || item.source === "next-json-fallback"
  );
  if (hasDemo) return "demo" as const;

  const hasFallback = activeHints.some(
    (item) => item.fallback || isFallbackLikeSource(item.source)
  );
  const hasLive = activeHints.some((item) => isLiveLikeSource(item.source));

  if (hasFallback && hasLive) return "mixed" as const;
  if (hasFallback) return "fallback" as const;
  return "live" as const;
}

function buildPageLevelCoverage(context: ParentAgentChildContext) {
  const observedDays = new Set<string>();

  context.weeklyHealthChecks.forEach((item) => observedDays.add(item.date));
  context.weeklyMeals.forEach((item) => observedDays.add(item.date));
  context.weeklyGrowthRecords.forEach((item) => observedDays.add(item.createdAt.slice(0, 10)));
  context.weeklyFeedbacks.forEach((item) => observedDays.add(item.date));

  const observed = observedDays.size;
  const total = 7;
  const ratio = observed / total;

  return {
    observedDays: observed,
    totalDays: total,
    coverageRatio: ratio,
    sparse: observed < 4,
    badgeLabel: `覆盖 ${observed}/${total} 天`,
    text:
      observed > 0
        ? `最近 ${observed}/${total} 天有可用记录，覆盖率约 ${formatPercent(ratio)}。`
        : "当前最近记录较少，系统会先给出更保守的说明。",
  };
}

function buildCoverageFromTrend(dataQuality: ParentTrendDataQuality, windowDays: number) {
  return {
    observedDays: dataQuality.observedDays,
    totalDays: windowDays,
    coverageRatio: dataQuality.coverageRatio,
    sparse: dataQuality.sparse,
    badgeLabel: `覆盖 ${dataQuality.observedDays}/${windowDays} 天`,
    text: `最近 ${dataQuality.observedDays}/${windowDays} 天有可用记录，覆盖率约 ${formatPercent(
      dataQuality.coverageRatio
    )}。`,
  };
}

function buildSourceBadges(params: {
  context: ParentAgentChildContext;
  consultation?: ConsultationResult | null;
  weeklyReport?: WeeklyReportResponse | null;
  sourceMode: SourceMode;
  coverageBadge?: string;
}) {
  const badges: ParentTransparencyBadge[] = [];

  if (
    params.context.weeklyHealthChecks.length > 0 ||
    params.context.weeklyMeals.length > 0 ||
    params.context.weeklyGrowthRecords.length > 0
  ) {
    badges.push({
      id: "child-records",
      label: "孩子记录",
      variant: "success",
    });
  }

  if (params.context.weeklyFeedbacks.length > 0) {
    badges.push({
      id: "parent-feedback",
      label: "家长反馈",
      variant: "success",
    });
  }

  if (params.context.smartInsights.length > 0 || params.consultation) {
    badges.push({
      id: "teacher-observation",
      label: "老师观察",
      variant: "info",
    });
  }

  if (
    (params.consultation?.followUp48h?.length ?? 0) > 0 ||
    params.context.weeklyFeedbacks.some(
      (item) => Boolean(item.relatedTaskId) || Boolean(item.relatedConsultationId)
    )
  ) {
    badges.push({
      id: "follow-up",
      label: "跟进反馈",
      variant: "secondary",
    });
  }

  if (
    (params.consultation?.continuityNotes?.length ?? 0) > 0 ||
    (params.weeklyReport?.continuityNotes?.length ?? 0) > 0
  ) {
    badges.push({
      id: "continuity",
      label: "延续上周观察",
      variant: "secondary",
    });
  }

  if (params.sourceMode === "fallback" || params.sourceMode === "mixed") {
    badges.push({
      id: "fallback",
      label: "记录待补充",
      variant: "warning",
    });
  } else if (params.sourceMode === "demo") {
    badges.push({
      id: "demo",
      label: "参考示例",
      variant: "warning",
    });
  }

  if (params.coverageBadge) {
    badges.push({
      id: "coverage",
      label: params.coverageBadge,
      variant: "outline",
    });
  }

  return badges.slice(0, 6);
}

function buildSummarySentence(params: {
  sourceMode: SourceMode;
  hasParentFeedback: boolean;
  isLoading: boolean;
}) {
  if (params.sourceMode === "demo") {
    return "当前结果包含演示样例或补位信息，适合先看流程，不代表完整实时判断。";
  }

  if (params.sourceMode === "fallback" || params.sourceMode === "mixed") {
    return params.hasParentFeedback
      ? "当前建议主要依据真实记录，并参考最近一次家庭反馈与跟进情况。"
      : "当前建议主要依据已加载记录，并用保守补位方式补齐说明。";
  }

  if (params.isLoading) {
    return "系统会先看最近 7 天的孩子记录、家长反馈和老师观察，再整理今晚建议。";
  }

  return "当前建议主要依据孩子近 7 天的园内记录、家长反馈和最近观察整理。";
}

function buildReliabilityText(params: {
  sourceMode: SourceMode;
  sparse: boolean;
  needsHumanReview: boolean;
  isLoading: boolean;
}) {
  if (params.isLoading) {
    return "当前说明基于页面已加载的记录，完整建议生成后会补充更具体依据。";
  }

  if (params.sourceMode === "demo") {
    return "当前结果更适合先看流程，不代表完整实时判断。";
  }

  if (params.sparse || params.sourceMode === "fallback" || params.sourceMode === "mixed" || params.needsHumanReview) {
    return "当前记录能支持初步建议，但仍需继续观察确认。";
  }

  return "主要基于真实记录，可作为今晚行动参考。";
}

function buildBoundaryNotes(params: {
  pendingFeedback: boolean;
  sourceMode: SourceMode;
}) {
  return [
    "这里提供的是照护建议，不是医疗诊断。",
    params.pendingFeedback ? "持续反馈越完整，下一轮判断会更稳。" : "系统会持续结合后续反馈更新判断。",
    params.sourceMode === "demo" || params.sourceMode === "fallback" || params.sourceMode === "mixed"
      ? "如果当前结果还在补充阶段，请结合老师和孩子的实际状态一起判断。"
      : "如孩子持续不适或症状明显，请优先联系老师或专业医生。",
  ];
}

function buildClosureStatus(params: {
  consultation?: ConsultationResult | null;
  latestFeedback?: ParentAgentChildContext["latestFeedback"];
  pendingFeedback: boolean;
}) {
  if (params.consultation?.shouldEscalateToAdmin) {
    return "已升级为机构关注，后续会按会诊节奏继续跟进。";
  }

  if (params.consultation && params.pendingFeedback) {
    return "老师侧已给出动作，等待今晚反馈补齐闭环。";
  }

  if (
    params.latestFeedback &&
    ((params.consultation?.followUp48h?.length ?? 0) > 0 || Boolean(params.consultation?.reviewIn48h))
  ) {
    return "已进入 48 小时复查，老师会继续观察相关变化。";
  }

  if (params.consultation) {
    return "当前已有会诊建议，正在按日常跟进节奏推进。";
  }

  return "当前以日常建议为主，尚未进入完整会诊闭环。";
}

function buildReasonBullet(params: {
  whyNow?: string | null;
  focusReason?: string | null;
  topAction?: string | null;
}) {
  if (params.whyNow?.trim()) {
    return `不是凭空生成。${params.whyNow.trim()}`;
  }

  if (params.focusReason?.trim() && params.topAction?.trim()) {
    return `因为最近几天在“${params.focusReason.trim()}”上反复出现信号，所以今晚先做“${params.topAction.trim()}”。`;
  }

  return "不是凭空生成。系统会先看最近几天的记录，再给出今晚最值得先做的一步。";
}

function formatEvidenceLead(item: ConsultationEvidenceItem) {
  const leadLabel = item.sourceLabel?.trim() || "最近观察";
  const detail = item.summary?.trim() || item.excerpt?.trim();
  if (!detail) return null;
  return `${leadLabel}：${detail}`;
}

function buildEvidenceBullets(params: {
  consultation?: ConsultationResult | null;
  whyNow?: string | null;
  focusReason?: string | null;
  topAction?: string | null;
  latestFeedback?: ParentAgentChildContext["latestFeedback"];
}) {
  const consultationEvidenceModel = buildConsultationEvidencePanelModel({
    evidenceItems: params.consultation?.evidenceItems ?? [],
    explainability: params.consultation?.explainability ?? [],
    leadLimit: 2,
  });

  const evidenceLeads =
    consultationEvidenceModel.mode === "structured"
      ? consultationEvidenceModel.leadItems.map((item) => formatEvidenceLead(item.item))
      : consultationEvidenceModel.fallbackItems.map((item) => item.detail);

  return uniqueTexts(
    [
      buildReasonBullet({
        whyNow: params.whyNow,
        focusReason: params.focusReason,
        topAction: params.topAction,
      }),
      params.consultation?.continuityNotes?.[0]
        ? `这次判断也延续了上一次跟进：${params.consultation.continuityNotes[0]}`
        : null,
      ...evidenceLeads,
      params.latestFeedback ? "最近一次家长反馈也被纳入这次判断。" : null,
    ],
    4
  );
}

function buildWarnings(params: {
  trendResult?: ParentTrendQueryResponse | null;
  weeklyReportError?: string | null;
  resultSource?: string | null;
  consultation?: ConsultationResult | null;
  weeklyReport?: WeeklyReportResponse | null;
  pageCoverageSparse: boolean;
  isLoading: boolean;
}) {
  return uniqueTexts([
    ...(params.trendResult?.warnings ?? []),
    params.pageCoverageSparse && !params.trendResult
      ? "最近记录还不够连续，建议继续反馈 2-3 次后再看趋势。"
      : null,
    params.weeklyReportError ? "本周报告暂未成功刷新，当前说明以最近一次可用结果为准。" : null,
    params.resultSource && isFallbackLikeSource(params.resultSource)
      ? "当前建议含保守补位信息，请不要把它当作完整实时结论。"
      : null,
    params.consultation?.fallback
      ? "当前会诊结论含补位信息，仍需老师继续观察确认。"
      : null,
    (params.consultation?.evidenceItems ?? []).some((item) => item.requiresHumanReview)
      ? "部分依据仍需人工观察确认。"
      : null,
    hasDegradedMemory(params.consultation?.memoryMeta) || hasDegradedMemory(params.weeklyReport?.memoryMeta)
      ? "当前延续记录不完整，这次说明会更保守。"
      : null,
    params.isLoading ? "建议仍在整理中，完整说明会随着结果更新。" : null,
  ]);
}

function buildModel(params: {
  context: ParentAgentChildContext;
  result: ParentAgentResult | null;
  weeklyReport?: WeeklyReportResponse | null;
  weeklyReportError?: string | null;
  consultation?: ConsultationResult | null;
  trendResult?: ParentTrendQueryResponse | null;
  pendingFeedback: boolean;
}) {
  const consultation = getConsultation(params.result, params.consultation);
  const pageCoverage = params.trendResult
    ? buildCoverageFromTrend(params.trendResult.dataQuality, params.trendResult.windowDays)
    : buildPageLevelCoverage(params.context);

  const sourceMode = resolveSourceMode([
    { source: params.result?.source },
    {
      source: consultation?.source,
      fallback: consultation?.fallback,
    },
    { source: params.weeklyReport?.source },
    {
      source: params.trendResult?.source,
      fallback: params.trendResult?.fallback || params.trendResult?.dataQuality.fallbackUsed,
    },
  ]);

  const needsHumanReview = Boolean(
    (consultation?.evidenceItems ?? []).some((item) => item.requiresHumanReview)
  );
  const warnings = buildWarnings({
    trendResult: params.trendResult,
    weeklyReportError: params.weeklyReportError,
    resultSource: params.result?.source,
    consultation,
    weeklyReport: params.weeklyReport,
    pageCoverageSparse: pageCoverage.sparse,
    isLoading: !params.result,
  });

  return {
    summarySentence: buildSummarySentence({
      sourceMode,
      hasParentFeedback: params.context.weeklyFeedbacks.length > 0,
      isLoading: !params.result,
    }),
    sourceBadges: buildSourceBadges({
      context: params.context,
      consultation,
      weeklyReport: params.weeklyReport,
      sourceMode,
      coverageBadge: pageCoverage.badgeLabel,
    }),
    reliabilityText: buildReliabilityText({
      sourceMode,
      sparse: pageCoverage.sparse,
      needsHumanReview,
      isLoading: !params.result,
    }),
    coverageText: pageCoverage.text,
    warnings,
    boundaryNotes: buildBoundaryNotes({
      pendingFeedback: params.pendingFeedback,
      sourceMode,
    }),
    closureStatus: buildClosureStatus({
      consultation,
      latestFeedback: params.context.latestFeedback,
      pendingFeedback: params.pendingFeedback,
    }),
    evidenceBullets: buildEvidenceBullets({
      consultation,
      whyNow: params.result?.whyNow,
      focusReason: params.context.focusReasons[0],
      topAction: params.result?.tonightTopAction ?? params.context.task.description,
      latestFeedback: params.context.latestFeedback,
    }),
    defaultExpanded: warnings.length > 0 || sourceMode !== "live",
  } satisfies ParentTransparencyViewModel;
}

export function buildParentHomeTransparencyModel(
  params: BuildParentHomeTransparencyInput
) {
  const model = buildModel({
    context: params.context,
    result: params.suggestionResult,
    weeklyReport: params.weeklyReport,
    weeklyReportError: params.weeklyReportError,
    consultation: params.latestConsultation ?? params.suggestionResult?.consultation ?? null,
    pendingFeedback: Boolean(params.pendingFeedback),
  });

  return {
    ...model,
    defaultExpanded: true,
  };
}

export function buildParentAgentTransparencyModel(
  params: BuildParentAgentTransparencyInput
) {
  return buildModel({
    context: params.context,
    result: params.currentResult,
    consultation: params.consultation ?? params.currentResult?.consultation ?? null,
    trendResult: params.trendResult,
    pendingFeedback: Boolean(params.pendingFeedback),
  });
}
