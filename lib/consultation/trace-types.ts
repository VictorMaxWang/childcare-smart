import type { InterventionCard } from "@/lib/agent/intervention-card";
import type {
  ConsultationEvidenceItem,
  ExplainabilityItem,
  HighRiskConsultationResult,
  MemoryContextMeta,
} from "@/lib/ai/types";
import { isConsultationEvidenceItem } from "@/lib/consultation/evidence";

export type ConsultationStageKey =
  | "long_term_profile"
  | "recent_context"
  | "current_recommendation";

export type ConsultationTraceMode = "demo" | "debug";

export type ConsultationTraceOverallStatus =
  | "idle"
  | "loading"
  | "streaming"
  | "partial"
  | "error"
  | "done";

export type ConsultationTraceProviderState =
  | "unknown"
  | "real"
  | "fallback";

export type ConsultationTraceMemoryState =
  | "unknown"
  | "empty"
  | "ready"
  | "degraded";

export type ConsultationTraceResultState =
  | "pending"
  | "ready"
  | "invalid";

export type ConsultationTraceCase =
  | "empty-memory"
  | "fallback"
  | "error"
  | "partial"
  | "invalid-result";

export interface ConsultationProviderTrace {
  provider?: string;
  source?: string;
  model?: string;
  requestId?: string;
  transport?: string;
  transportSource?: string;
  consultationSource?: string;
  fallbackReason?: string;
  brainProvider?: string;
  realProvider?: boolean;
  fallback?: boolean;
  [key: string]: unknown;
}

export type ConsultationApiResult = HighRiskConsultationResult & {
  interventionCard: InterventionCard;
  providerTrace: ConsultationProviderTrace;
  memoryMeta: MemoryContextMeta | Record<string, unknown>;
  traceMeta: Record<string, unknown>;
};

export interface ConsultationStageStatusEvent {
  stage: ConsultationStageKey;
  title: string;
  message: string;
  traceId?: string;
  providerTrace?: ConsultationProviderTrace;
  memory?: MemoryContextMeta | Record<string, unknown>;
}

export interface ConsultationStageTextEvent {
  stage: ConsultationStageKey;
  title: string;
  text: string;
  items: string[];
  source: string;
}

export interface ConsultationSummaryCardData {
  stage?: string;
  title: string;
  summary?: string;
  content?: string;
  items?: string[];
  providerTrace?: ConsultationProviderTrace;
  memoryMeta?: MemoryContextMeta | Record<string, unknown>;
}

export interface FollowUp48hCardData {
  title: string;
  items: string[];
  reviewIn48h: string;
  providerTrace?: ConsultationProviderTrace;
}

export interface ConsultationStageUiCards {
  summaryCard?: ConsultationSummaryCardData;
  followUpCard?: FollowUp48hCardData;
}

export type ConsultationStageUiMap = Partial<
  Record<ConsultationStageKey, ConsultationStageUiCards>
>;

export interface ConsultationTraceCallout {
  tone: "info" | "warning" | "error" | "success";
  title: string;
  description: string;
}

export interface ConsultationTraceState {
  mode: ConsultationTraceMode;
  activeStage: ConsultationStageKey | null;
  isStreaming: boolean;
  streamMessage: string;
  streamError: string | null;
  traceId: string | null;
  providerTrace: ConsultationProviderTrace | null;
  memoryMeta: MemoryContextMeta | Record<string, unknown> | null;
  stageNotes: ConsultationStageTextEvent[];
  stageStatuses: Partial<Record<ConsultationStageKey, ConsultationStageStatusEvent>>;
  stageUi: ConsultationStageUiMap;
  result: HighRiskConsultationResult | null;
  receivedAnyEvent?: boolean;
  receivedDone?: boolean;
  streamEndedUnexpectedly?: boolean;
  invalidResultReason?: string | null;
}

export interface ConsultationTraceEvidence {
  label: string;
  detail: string;
}

export interface ConsultationStageView {
  key: ConsultationStageKey;
  label: string;
  shortLabel: string;
  description: string;
  status: "pending" | "active" | "completed";
  title: string;
  summary: string;
  items: string[];
  emptyState: string;
  providerTrace?: ConsultationProviderTrace | null;
  memoryMeta?: MemoryContextMeta | Record<string, unknown> | null;
  source?: string;
  summaryCard?: ConsultationSummaryCardData;
  followUpCard?: FollowUp48hCardData;
  evidenceItems: ConsultationEvidenceItem[];
  evidence: ConsultationTraceEvidence[];
  callout?: ConsultationTraceCallout | null;
  expandedByDefault: boolean;
}

export interface ConsultationTraceViewModel {
  mode: ConsultationTraceMode;
  activeStage: ConsultationStageKey | null;
  overallStatus: ConsultationTraceOverallStatus;
  overallStatusLabel: string;
  providerState: ConsultationTraceProviderState;
  memoryState: ConsultationTraceMemoryState;
  resultState: ConsultationTraceResultState;
  progressValue: number;
  streamMessage: string;
  streamError: string | null;
  traceId: string | null;
  providerTrace: ConsultationProviderTrace | null;
  memoryMeta: MemoryContextMeta | Record<string, unknown> | null;
  traceMemoryMeta: Record<string, unknown> | null;
  evidenceItems: ConsultationEvidenceItem[];
  stages: ConsultationStageView[];
  callouts: ConsultationTraceCallout[];
  syncTargets: string[];
  hasContent: boolean;
  rawStageInfo: {
    statuses: Partial<Record<ConsultationStageKey, ConsultationStageStatusEvent>>;
    notes: ConsultationStageTextEvent[];
    ui: ConsultationStageUiMap;
  };
}

export const CONSULTATION_STAGE_ORDER: ConsultationStageKey[] = [
  "long_term_profile",
  "recent_context",
  "current_recommendation",
];

const TRACE_CASES: ConsultationTraceCase[] = [
  "empty-memory",
  "fallback",
  "error",
  "partial",
  "invalid-result",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isExplainabilityArray(value: unknown): value is ExplainabilityItem[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        isNonEmptyString(item.label) &&
        isNonEmptyString(item.detail)
    )
  );
}

function isEvidenceItemArray(value: unknown): value is ConsultationEvidenceItem[] {
  return Array.isArray(value) && value.every((item) => isConsultationEvidenceItem(item));
}

function isProviderTraceLike(value: unknown) {
  if (!isRecord(value)) return false;

  return (
    isNonEmptyString(value.provider) &&
    isNonEmptyString(value.source) &&
    isNonEmptyString(value.transport) &&
    isNonEmptyString(value.transportSource) &&
    isNonEmptyString(value.consultationSource) &&
    isBoolean(value.realProvider) &&
    isBoolean(value.fallback)
  );
}

function isMemoryMetaLike(value: unknown) {
  if (!isRecord(value)) return false;

  return (
    isNonEmptyString(value.backend) &&
    isBoolean(value.degraded) &&
    isStringArray(value.usedSources) &&
    isStringArray(value.errors) &&
    isStringArray(value.matchedSnapshotIds) &&
    isStringArray(value.matchedTraceIds)
  );
}

function isTraceMetaLike(value: unknown) {
  if (!isRecord(value)) return false;
  return isMemoryMetaLike(value.memory);
}

function isInterventionCardLike(value: unknown): value is InterventionCard {
  if (!isRecord(value)) return false;

  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.title) &&
    isNonEmptyString(value.targetChildId) &&
    isNonEmptyString(value.triggerReason) &&
    isNonEmptyString(value.summary) &&
    isNonEmptyString(value.todayInSchoolAction) &&
    isNonEmptyString(value.tonightHomeAction) &&
    isStringArray(value.homeSteps) &&
    isStringArray(value.observationPoints) &&
    isNonEmptyString(value.tomorrowObservationPoint) &&
    isNonEmptyString(value.reviewIn48h) &&
    isNonEmptyString(value.parentMessageDraft) &&
    isNonEmptyString(value.teacherFollowupDraft) &&
    isNonEmptyString(value.source) &&
    ["low", "medium", "high"].includes(String(value.riskLevel))
  );
}

function isDirectorDecisionCardLike(value: unknown) {
  if (!isRecord(value)) return false;

  return (
    isNonEmptyString(value.reason) &&
    isNonEmptyString(value.recommendedOwnerName) &&
    isNonEmptyString(value.recommendedAt) &&
    ["pending", "in_progress", "completed"].includes(String(value.status))
  );
}

function isCoordinatorSummaryLike(value: unknown) {
  if (!isRecord(value)) return false;

  return (
    isNonEmptyString(value.finalConclusion) &&
    isBoolean(value.shouldEscalateToAdmin)
  );
}

export function getConsultationStageLabel(stage: ConsultationStageKey) {
  switch (stage) {
    case "long_term_profile":
      return "长期画像";
    case "recent_context":
      return "最近会诊 / 最近快照";
    case "current_recommendation":
      return "当前建议";
    default:
      return stage;
  }
}

export function getConsultationStageShortLabel(stage: ConsultationStageKey) {
  switch (stage) {
    case "long_term_profile":
      return "长期画像";
    case "recent_context":
      return "最近快照";
    case "current_recommendation":
      return "当前建议";
    default:
      return stage;
  }
}

export function getConsultationStageDescription(stage: ConsultationStageKey) {
  switch (stage) {
    case "long_term_profile":
      return "系统先读取长期画像和记忆上下文，判断这次会诊要基于什么底色。";
    case "recent_context":
      return "系统回看最近会诊、快照和连续性信号，确认问题不是孤立事件。";
    case "current_recommendation":
      return "系统生成当前建议，把园内动作、家庭任务和 48 小时复查串成闭环。";
    default:
      return "";
  }
}

export function getConsultationStageStatusLabel(
  status: ConsultationStageView["status"]
) {
  switch (status) {
    case "completed":
      return "已完成";
    case "active":
      return "进行中";
    default:
      return "待开始";
  }
}

export function getConsultationTraceOverallStatusLabel(
  status: ConsultationTraceOverallStatus
) {
  switch (status) {
    case "idle":
      return "待启动";
    case "loading":
      return "连接中";
    case "streaming":
      return "会诊进行中";
    case "partial":
      return "部分结果";
    case "error":
      return "请求失败";
    case "done":
      return "已完成";
    default:
      return status;
  }
}

export function isConsultationStageKey(
  value: string
): value is ConsultationStageKey {
  return CONSULTATION_STAGE_ORDER.includes(value as ConsultationStageKey);
}

export function isConsultationTraceCase(
  value: string
): value is ConsultationTraceCase {
  return TRACE_CASES.includes(value as ConsultationTraceCase);
}

export function asTraceStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item)).filter(Boolean)
    : [];
}

export function pickTraceMemoryMeta(
  result: HighRiskConsultationResult | null
): Record<string, unknown> | null {
  if (!result?.traceMeta || typeof result.traceMeta !== "object") {
    return null;
  }

  const traceMeta = result.traceMeta as Record<string, unknown>;
  if (!traceMeta.memory || typeof traceMeta.memory !== "object") {
    return null;
  }

  return traceMeta.memory as Record<string, unknown>;
}

export function buildExplainabilityEvidence(
  items: ExplainabilityItem[] | undefined,
  limit = 3
) {
  return (items ?? [])
    .filter((item) => item.label || item.detail)
    .slice(0, limit)
    .map((item) => ({
      label: item.label || "来源依据",
      detail: item.detail,
    }));
}

export function getConsultationResultIssues(value: unknown) {
  if (!isRecord(value)) {
    return ["result 对象"];
  }

  const issues: string[] = [];

  if (!isNonEmptyString(value.consultationId)) issues.push("consultationId");
  if (!isNonEmptyString(value.childId)) issues.push("childId");
  if (!isNonEmptyString(value.summary)) issues.push("summary");
  if (!isNonEmptyString(value.source)) issues.push("source");
  if (!isNonEmptyString(value.generatedAt)) issues.push("generatedAt");
  if (!isNonEmptyString(value.parentMessageDraft)) issues.push("parentMessageDraft");
  if (!isNonEmptyString(value.reviewIn48h)) issues.push("reviewIn48h");
  if (!isStringArray(value.triggerReasons)) issues.push("triggerReasons");
  if (!isStringArray(value.keyFindings)) issues.push("keyFindings");
  if (!isStringArray(value.nextCheckpoints)) issues.push("nextCheckpoints");
  if (!isStringArray(value.todayInSchoolActions)) issues.push("todayInSchoolActions");
  if (!isStringArray(value.tonightAtHomeActions)) issues.push("tonightAtHomeActions");
  if (!isStringArray(value.followUp48h)) issues.push("followUp48h");
  if (!isExplainabilityArray(value.explainability)) issues.push("explainability");
  if (!isEvidenceItemArray(value.evidenceItems)) issues.push("evidenceItems");
  if (!isBoolean(value.shouldEscalateToAdmin)) issues.push("shouldEscalateToAdmin");
  if (!isCoordinatorSummaryLike(value.coordinatorSummary)) issues.push("coordinatorSummary");
  if (!isDirectorDecisionCardLike(value.directorDecisionCard)) issues.push("directorDecisionCard");
  if (!isInterventionCardLike(value.interventionCard)) issues.push("interventionCard");
  if (!isProviderTraceLike(value.providerTrace)) issues.push("providerTrace");
  if (!isMemoryMetaLike(value.memoryMeta)) issues.push("memoryMeta");
  if (!isTraceMetaLike(value.traceMeta)) issues.push("traceMeta");

  return issues;
}

export function describeConsultationResultIssues(value: unknown) {
  const issues = getConsultationResultIssues(value);
  if (issues.length === 0) return "";
  return `done.result 缺少关键字段：${issues.join("、")}`;
}

export function isRenderableConsultationApiResult(
  value: unknown
): value is ConsultationApiResult {
  return getConsultationResultIssues(value).length === 0;
}
