import type {
  ConsultationEvidenceItem,
  ConsultationResult,
  ExplainabilityItem,
} from "@/lib/ai/types";
import type {
  AdminDispatchCreatePayload,
  AdminDispatchEvent,
  AdminOwnerRole,
  InstitutionPriorityEvidence,
} from "@/lib/agent/admin-types";
import {
  normalizeTaskEscalationSuggestion,
  pickHighestPriorityEscalation,
} from "@/lib/tasks/escalation-rules";
import type { TaskEscalationSuggestion } from "@/lib/tasks/types";
import {
  buildConsultationEvidenceHighlights,
  normalizeConsultationEvidenceItems,
} from "@/lib/consultation/evidence";
import { buildConsultationResultTraceViewModel } from "@/lib/consultation/trace-view-model";
import {
  formatAdminDateTimeLabel,
  resolveAdminVisibleText,
  sanitizeAdminVisibleText,
} from "@/lib/agent/admin-display-text";
import type {
  ConsultationProviderTrace,
  ConsultationTraceMemoryState,
  ConsultationTraceProviderState,
} from "@/lib/consultation/trace-types";

export interface AdminConsultationChildMeta {
  id: string;
  name: string;
  className: string;
}

export interface AdminConsultationDecisionViewModel {
  consultationId: string;
  childId: string;
  childName: string;
  className: string;
  riskLevel: ConsultationResult["riskLevel"];
  riskLabel: string;
  priorityLabel: "P1" | "P2" | "P3";
  status: "pending" | "in_progress" | "completed";
  statusLabel: string;
  statusSource: "consultation" | "dispatch";
  summary: string;
  whyHighPriority: string;
  recommendedOwnerName: string;
  recommendedAt: string;
  recommendedAtLabel: string;
  generatedAtLabel: string;
  triggerReasons: string[];
  keyFindings: string[];
  schoolActions: string[];
  homeActions: string[];
  followUpActions: string[];
}

export interface AdminConsultationTraceViewModel {
  participants: string[];
  keyFindings: string[];
  collaborationSummary: string;
  explainability: ExplainabilityItem[];
  evidenceItems: ConsultationEvidenceItem[];
  providerState: ConsultationTraceProviderState;
  providerStateLabel: string;
  providerLabel: string | null;
  memoryState: ConsultationTraceMemoryState;
  memoryStateLabel: string;
  memoryDetail: string | null;
  syncTargets: string[];
  evidenceHighlights: string[];
  providerTrace: ConsultationProviderTrace | null;
}

export interface AdminConsultationFeedDirectorDecisionCard {
  status?: AdminConsultationDecisionViewModel["status"];
  reason?: string;
  recommendedOwnerName?: string;
  recommendedOwnerRole?: AdminOwnerRole;
  recommendedAt?: string;
  [key: string]: unknown;
}

export interface AdminConsultationFeedExplainabilitySummary {
  agentParticipants: string[];
  keyFindings: string[];
  coordinationConclusion: string;
  evidenceHighlights: string[];
}

export interface AdminConsultationFeedProviderTraceSummary {
  traceId?: string;
  status?: string;
  provider?: string;
  source?: string;
  model?: string;
  transport?: string;
  transportSource?: string;
  consultationSource?: string;
  fallbackReason?: string;
  brainProvider?: string;
  realProvider?: boolean;
  fallback?: boolean;
}

export interface AdminConsultationFeedMemoryMetaSummary {
  backend?: string;
  degraded?: boolean;
  usedSources: string[];
  errors: string[];
  matchedSnapshotIds: string[];
  matchedTraceIds: string[];
}

export interface AdminConsultationFeedItem {
  consultationId: string;
  childId: string;
  generatedAt: string;
  riskLevel: ConsultationResult["riskLevel"];
  triggerReason: string;
  triggerReasons: string[];
  summary: string;
  directorDecisionCard: AdminConsultationFeedDirectorDecisionCard;
  status?: AdminConsultationDecisionViewModel["status"];
  ownerName?: string;
  ownerRole?: AdminOwnerRole;
  dueAt?: string;
  whyHighPriority?: string;
  todayInSchoolActions: string[];
  tonightAtHomeActions: string[];
  followUp48h: string[];
  syncTargets: string[];
  shouldEscalateToAdmin: boolean;
  evidenceItems: ConsultationEvidenceItem[];
  taskEscalations?: TaskEscalationSuggestion[];
  activeEscalation?: TaskEscalationSuggestion;
  explainabilitySummary?: AdminConsultationFeedExplainabilitySummary;
  providerTraceSummary?: AdminConsultationFeedProviderTraceSummary;
  memoryMetaSummary?: AdminConsultationFeedMemoryMetaSummary;
}

export interface AdminConsultationPriorityItem {
  consultationId: string;
  childId: string;
  riskLevel: ConsultationResult["riskLevel"];
  generatedAt: string;
  shouldEscalateToAdmin: boolean;
  decision: AdminConsultationDecisionViewModel;
  trace: AdminConsultationTraceViewModel;
  recommendedOwnerRole: AdminOwnerRole;
  activeEscalation?: TaskEscalationSuggestion;
  dispatchEvent?: AdminDispatchEvent;
  dispatchBindingScope?: AdminConsultationDispatchBindingScope;
  notificationPayload?: AdminDispatchCreatePayload;
}

export type AdminConsultationDispatchBindingScope =
  | "priority"
  | "consultation"
  | "child";

const RISK_ORDER: Record<ConsultationResult["riskLevel"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const STATUS_ORDER: Record<AdminConsultationDecisionViewModel["status"], number> = {
  pending: 0,
  in_progress: 1,
  completed: 2,
};

const CONSULTATION_PRIORITY_SCORE: Record<ConsultationResult["riskLevel"], number> = {
  high: 90,
  medium: 70,
  low: 50,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNonEmptyText(value: unknown) {
  const text = asText(value);
  return text.length > 0 ? text : null;
}

function takeUnique(items: Array<string | undefined | null>, limit = 4) {
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

function asStringArray(value: unknown, limit = 8) {
  if (!Array.isArray(value)) return [];
  return takeUnique(
    value.map((item) => (typeof item === "string" ? item : undefined)),
    limit
  );
}

function buildEvidenceHighlightsFromItems(items: ConsultationEvidenceItem[], limit = 4) {
  return buildConsultationEvidenceHighlights(items, limit);
}

export function pickFirstText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) return normalized;
  }
  return "";
}

export function sanitizeAdminWhyHighPriorityText(value: string | null | undefined) {
  return sanitizeAdminVisibleText(value);
}

export function resolveAdminWhyHighPriorityText(
  ...values: Array<string | null | undefined>
) {
  return resolveAdminVisibleText(...values);
}

function pickFirstStringList(
  values: Array<string[] | null | undefined>,
  limit = 4
) {
  for (const value of values) {
    if (!Array.isArray(value) || value.length === 0) continue;
    const normalized = takeUnique(value, limit);
    if (normalized.length > 0) return normalized;
  }
  return [];
}

function asDecisionStatus(
  value: unknown
): AdminConsultationDecisionViewModel["status"] | undefined {
  const text = asText(value);
  if (text === "pending" || text === "in_progress" || text === "completed") {
    return text;
  }
  return undefined;
}

function asRiskLevel(value: unknown): ConsultationResult["riskLevel"] | null {
  const text = asText(value);
  if (text === "high" || text === "medium" || text === "low") {
    return text;
  }
  return null;
}

function asOwnerRole(value: unknown): AdminOwnerRole | undefined {
  const text = asText(value);
  if (text === "teacher" || text === "parent" || text === "admin") {
    return text;
  }
  return undefined;
}

function formatDateTimeLabel(value: string) {
  return formatAdminDateTimeLabel(value);
}

function getRiskLabel(riskLevel: ConsultationResult["riskLevel"]) {
  if (riskLevel === "high") return "高风险预警";
  if (riskLevel === "medium") return "重点跟进";
  return "持续观察";
}

function getPriorityLabel(riskLevel: ConsultationResult["riskLevel"]): "P1" | "P2" | "P3" {
  if (riskLevel === "high") return "P1";
  if (riskLevel === "medium") return "P2";
  return "P3";
}

function getStatusLabel(status: AdminConsultationDecisionViewModel["status"]) {
  if (status === "completed") return "已完成";
  if (status === "in_progress") return "处理中";
  return "待分派";
}

function getProviderStateLabel(state: ConsultationTraceProviderState) {
  if (state === "real") return "已接入智能判断";
  if (state === "fallback") return "本地兜底";
  return "来源未说明";
}

function getMemoryStateLabel(state: ConsultationTraceMemoryState) {
  if (state === "ready") return "已命中参考资料";
  if (state === "empty") return "暂无参考资料";
  if (state === "degraded") return "参考资料降级";
  return "参考状态未说明";
}

function getOwnerFallbackLabel(role?: AdminOwnerRole) {
  if (role === "admin") return "园长待分派";
  if (role === "parent") return "家园协同";
  return "班级老师";
}

function buildEscalationOwnerLabel(
  escalation: TaskEscalationSuggestion | undefined,
  fallbackRole?: AdminOwnerRole
) {
  if (!escalation) {
    return getOwnerFallbackLabel(fallbackRole);
  }

  if (escalation.ownerRole === "admin") return "园长跟进";
  if (escalation.ownerRole === "parent") return "家长跟进";
  return "教师复核";
}

function buildProviderLabel(providerTrace: ConsultationProviderTrace | null) {
  if (!providerTrace) return null;

  const provider = asText(providerTrace.provider ?? providerTrace.source);
  const providerText = provider === "unknown" ? "" : provider;
  const model = asText(providerTrace.model);

  if (providerText && model) return `${providerText} / ${model}`;
  if (providerText) return providerText;
  if (model) return model;
  return null;
}

function buildMemoryDetailFromConsultation(consultation: ConsultationResult) {
  const usedSources = Array.isArray(consultation.memoryMeta?.usedSources)
    ? consultation.memoryMeta.usedSources
    : [];
  const matchedSnapshots = Array.isArray(consultation.memoryMeta?.matchedSnapshotIds)
    ? consultation.memoryMeta.matchedSnapshotIds
    : [];

  if (usedSources.length > 0) {
    return `参考了 ${usedSources.length} 份历史资料`;
  }

  if (matchedSnapshots.length > 0) {
    return `关联了 ${matchedSnapshots.length} 条历史快照`;
  }

  return null;
}

function buildLocalTraceViewModel(consultation: ConsultationResult): AdminConsultationTraceViewModel {
  const traceViewModel = buildConsultationResultTraceViewModel({
    result: consultation,
    mode: "demo",
    streamMessage: "会诊已完成，以下为园长侧决策依据摘要。",
  });
  const providerLabel = buildProviderLabel(traceViewModel.providerTrace);
  const evidenceHighlights =
    traceViewModel.evidenceItems.length > 0
      ? buildEvidenceHighlightsFromItems(traceViewModel.evidenceItems)
      : takeUnique(
          traceViewModel.stages.flatMap((stage) =>
            stage.evidence.map((item) => `${item.label}: ${item.detail}`)
          ),
          4
        );

  return {
    participants: takeUnique(consultation.participants.map((item) => item.label), 5),
    keyFindings: takeUnique(consultation.keyFindings, 4),
    collaborationSummary:
      consultation.coordinatorSummary.finalConclusion || consultation.summary,
    explainability: consultation.explainability.slice(0, 3),
    evidenceItems: traceViewModel.evidenceItems,
    providerState: traceViewModel.providerState,
    providerStateLabel: getProviderStateLabel(traceViewModel.providerState),
    providerLabel,
    memoryState: traceViewModel.memoryState,
    memoryStateLabel: getMemoryStateLabel(traceViewModel.memoryState),
    memoryDetail: buildMemoryDetailFromConsultation(consultation),
    syncTargets: traceViewModel.syncTargets,
    evidenceHighlights,
    providerTrace: traceViewModel.providerTrace,
  };
}

function matchesConsultationSource(
  event: AdminDispatchEvent,
  consultationId: string
) {
  return (
    event.source?.consultationId === consultationId ||
    event.source?.relatedConsultationIds?.includes(consultationId)
  );
}

function matchesChildLevelSource(
  event: AdminDispatchEvent,
  childId: string
) {
  return (
    (event.targetType === "child" && event.targetId === childId) ||
    Boolean(event.source?.relatedChildIds?.includes(childId))
  );
}

function resolveDispatchBinding(params: {
  consultationId: string;
  childId: string;
  notificationEvents: AdminDispatchEvent[];
  visibleConsultationCountForChild: number;
}) {
  const {
    consultationId,
    childId,
    notificationEvents,
    visibleConsultationCountForChild,
  } = params;

  const priorityMatch = notificationEvents.find(
    (event) => event.priorityItemId === consultationId
  );
  if (priorityMatch) {
    return {
      event: priorityMatch,
      scope: "priority" as const,
    };
  }

  const consultationSourceMatch = notificationEvents.find((event) =>
    matchesConsultationSource(event, consultationId)
  );
  if (consultationSourceMatch) {
    return {
      event: consultationSourceMatch,
      scope: "consultation" as const,
    };
  }

  if (visibleConsultationCountForChild !== 1) {
    return undefined;
  }

  const childLevelMatch = notificationEvents.find((event) =>
    matchesChildLevelSource(event, childId)
  );

  if (!childLevelMatch) return undefined;

  return {
    event: childLevelMatch,
    scope: "child" as const,
  };
}

function resolveDecisionStatus(params: {
  dispatchEvent?: AdminDispatchEvent;
  feedStatus?: AdminConsultationDecisionViewModel["status"];
  directorDecisionStatus?: AdminConsultationDecisionViewModel["status"];
}) {
  if (params.dispatchEvent) {
    return {
      status: params.dispatchEvent.status,
      statusSource: "dispatch" as const,
    };
  }

  return {
    status: params.feedStatus ?? params.directorDecisionStatus ?? "pending",
    statusSource: "consultation" as const,
  };
}

function normalizeDirectorDecisionCard(
  value: unknown
): AdminConsultationFeedDirectorDecisionCard {
  const record = asRecord(value);

  return {
    status: asDecisionStatus(record.status),
    reason: asText(record.reason) || undefined,
    recommendedOwnerName:
      asNonEmptyText(record.recommendedOwnerName) ?? undefined,
    recommendedOwnerRole: asOwnerRole(record.recommendedOwnerRole),
    recommendedAt: asText(record.recommendedAt) || undefined,
  };
}

function normalizeExplainabilitySummary(
  value: unknown
): AdminConsultationFeedExplainabilitySummary | undefined {
  const record = asRecord(value);

  if (Object.keys(record).length === 0) return undefined;

  return {
    agentParticipants: asStringArray(record.agentParticipants, 5),
    keyFindings: asStringArray(record.keyFindings, 4),
    coordinationConclusion: asText(record.coordinationConclusion),
    evidenceHighlights: asStringArray(record.evidenceHighlights, 4),
  };
}

function normalizeProviderTraceSummary(
  value: unknown
): AdminConsultationFeedProviderTraceSummary | undefined {
  const record = asRecord(value);

  if (Object.keys(record).length === 0) return undefined;

  return {
    traceId: asText(record.traceId) || undefined,
    status: asText(record.status) || undefined,
    provider: asText(record.provider) || undefined,
    source: asText(record.source) || undefined,
    model: asText(record.model) || undefined,
    transport: asText(record.transport) || undefined,
    transportSource: asText(record.transportSource) || undefined,
    consultationSource: asText(record.consultationSource) || undefined,
    fallbackReason: asText(record.fallbackReason) || undefined,
    brainProvider: asText(record.brainProvider) || undefined,
    realProvider: typeof record.realProvider === "boolean" ? record.realProvider : undefined,
    fallback: typeof record.fallback === "boolean" ? record.fallback : undefined,
  };
}

function normalizeMemoryMetaSummary(
  value: unknown
): AdminConsultationFeedMemoryMetaSummary | undefined {
  const record = asRecord(value);

  if (Object.keys(record).length === 0) return undefined;

  return {
    backend: asText(record.backend) || undefined,
    degraded: typeof record.degraded === "boolean" ? record.degraded : undefined,
    usedSources: asStringArray(record.usedSources, 4),
    errors: asStringArray(record.errors, 4),
    matchedSnapshotIds: asStringArray(record.matchedSnapshotIds, 4),
    matchedTraceIds: asStringArray(record.matchedTraceIds, 4),
  };
}

function normalizeEscalationList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeTaskEscalationSuggestion(item))
    .flatMap((item) => (item ? [item] : []));
}

function normalizeFeedEvidenceItems(value: unknown) {
  return normalizeConsultationEvidenceItems(value);
}

export function normalizeAdminConsultationFeedItem(
  value: unknown
): AdminConsultationFeedItem | null {
  const record = asRecord(value);
  const consultationId = asNonEmptyText(record.consultationId);
  const childId = asNonEmptyText(record.childId);
  const riskLevel = asRiskLevel(record.riskLevel);

  if (!consultationId || !childId || !riskLevel) {
    return null;
  }

  return {
    consultationId,
    childId,
    generatedAt: asText(record.generatedAt),
    riskLevel,
    triggerReason: asText(record.triggerReason),
    triggerReasons: asStringArray(record.triggerReasons, 6),
    summary: asText(record.summary),
    directorDecisionCard: normalizeDirectorDecisionCard(record.directorDecisionCard),
    status: asDecisionStatus(record.status),
    ownerName: asNonEmptyText(record.ownerName) ?? undefined,
    ownerRole: asOwnerRole(record.ownerRole),
    dueAt: asText(record.dueAt) || undefined,
    whyHighPriority: asNonEmptyText(record.whyHighPriority) ?? undefined,
    todayInSchoolActions: asStringArray(record.todayInSchoolActions, 4),
    tonightAtHomeActions: asStringArray(record.tonightAtHomeActions, 4),
    followUp48h: asStringArray(record.followUp48h, 4),
    syncTargets: asStringArray(record.syncTargets, 4),
    shouldEscalateToAdmin: Boolean(record.shouldEscalateToAdmin),
    evidenceItems: normalizeFeedEvidenceItems(record.evidenceItems),
    taskEscalations: normalizeEscalationList(record.taskEscalations),
    activeEscalation:
      normalizeTaskEscalationSuggestion(record.activeEscalation) ?? undefined,
    explainabilitySummary: normalizeExplainabilitySummary(record.explainabilitySummary),
    providerTraceSummary: normalizeProviderTraceSummary(record.providerTraceSummary),
    memoryMetaSummary: normalizeMemoryMetaSummary(record.memoryMetaSummary),
  };
}

function buildLocalDecisionViewModel(params: {
  consultation: ConsultationResult;
  child?: AdminConsultationChildMeta;
  dispatchEvent?: AdminDispatchEvent;
}): AdminConsultationDecisionViewModel {
  const { consultation, child, dispatchEvent } = params;
  const resolvedEscalation =
    normalizeTaskEscalationSuggestion(dispatchEvent?.source?.escalation) ??
    consultation.activeEscalation ??
    pickHighestPriorityEscalation(consultation.taskEscalations);
  const resolvedStatus = resolveDecisionStatus({
    dispatchEvent,
    directorDecisionStatus: consultation.directorDecisionCard.status,
  });
  const recommendedAt =
    dispatchEvent?.recommendedDeadline ||
    consultation.directorDecisionCard.recommendedAt ||
    "";

  return {
    consultationId: consultation.consultationId,
    childId: consultation.childId,
    childName: child?.name ?? consultation.childId,
    className:
      child?.className ??
      dispatchEvent?.source?.relatedClassNames?.[0] ??
      "当前班级",
    riskLevel: consultation.riskLevel,
    riskLabel: getRiskLabel(consultation.riskLevel),
    priorityLabel: getPriorityLabel(consultation.riskLevel),
    status: resolvedStatus.status,
    statusLabel: getStatusLabel(resolvedStatus.status),
    statusSource: resolvedStatus.statusSource,
    summary: consultation.summary,
    whyHighPriority: resolveAdminWhyHighPriorityText(
      resolvedEscalation?.escalationReason,
      consultation.directorDecisionCard.reason,
      consultation.triggerReasons[0],
      consultation.keyFindings[0],
      consultation.summary
    ),
    recommendedOwnerName:
      dispatchEvent?.recommendedOwnerName ||
      consultation.directorDecisionCard.recommendedOwnerName ||
      buildEscalationOwnerLabel(
        resolvedEscalation,
        consultation.directorDecisionCard.recommendedOwnerRole
      ),
    recommendedAt,
    recommendedAtLabel: formatDateTimeLabel(recommendedAt),
    generatedAtLabel: formatDateTimeLabel(consultation.generatedAt),
    triggerReasons: takeUnique(consultation.triggerReasons, 3),
    keyFindings: takeUnique(consultation.keyFindings, 3),
    schoolActions: takeUnique(consultation.todayInSchoolActions, 2),
    homeActions: takeUnique(consultation.tonightAtHomeActions, 2),
    followUpActions: takeUnique(consultation.followUp48h, 2),
  };
}

function buildExplainabilityItemsFromFeed(
  summary: AdminConsultationFeedExplainabilitySummary | undefined,
  fallbackItems: ExplainabilityItem[]
) {
  if (!summary) return fallbackItems;

  const items: ExplainabilityItem[] = [];

  if (summary.agentParticipants.length > 0) {
    items.push({
      label: "参与环节",
      detail: summary.agentParticipants.join(" / "),
    });
  }

  if (summary.keyFindings.length > 0) {
    items.push({
      label: "关键发现",
      detail: summary.keyFindings.join("；"),
    });
  }

  if (summary.coordinationConclusion) {
    items.push({
      label: "协调结论",
      detail: summary.coordinationConclusion,
    });
  }

  return items.length > 0 ? items.slice(0, 3) : fallbackItems;
}

function buildProviderTraceFromSummary(
  summary: AdminConsultationFeedProviderTraceSummary | undefined
): ConsultationProviderTrace | null {
  if (!summary) return null;

  const providerTrace: ConsultationProviderTrace = {};

  if (summary.provider) providerTrace.provider = summary.provider;
  if (summary.source) providerTrace.source = summary.source;
  if (summary.model) providerTrace.model = summary.model;
  if (summary.transport) providerTrace.transport = summary.transport;
  if (summary.transportSource) providerTrace.transportSource = summary.transportSource;
  if (summary.consultationSource) {
    providerTrace.consultationSource = summary.consultationSource;
  }
  if (summary.fallbackReason) providerTrace.fallbackReason = summary.fallbackReason;
  if (summary.brainProvider) providerTrace.brainProvider = summary.brainProvider;
  if (summary.realProvider) providerTrace.realProvider = true;
  if (summary.fallback) providerTrace.fallback = true;

  return Object.keys(providerTrace).length > 0 ? providerTrace : null;
}

function buildProviderStateFromSummary(
  summary: AdminConsultationFeedProviderTraceSummary | undefined
): ConsultationTraceProviderState {
  if (!summary) return "unknown";
  if (summary.realProvider) return "real";
  if (summary.fallback) return "fallback";
  return "unknown";
}

function buildMemoryStateFromSummary(
  summary: AdminConsultationFeedMemoryMetaSummary | undefined
): ConsultationTraceMemoryState {
  if (!summary) return "unknown";
  if (summary.degraded || summary.errors.length > 0) return "degraded";
  if (
    summary.usedSources.length === 0 &&
    summary.matchedSnapshotIds.length === 0 &&
    summary.matchedTraceIds.length === 0
  ) {
    return "empty";
  }
  return "ready";
}

function buildMemoryDetailFromSummary(
  summary: AdminConsultationFeedMemoryMetaSummary | undefined
) {
  if (!summary) return null;
  if (summary.usedSources.length > 0) {
    return `参考了 ${summary.usedSources.length} 份历史资料`;
  }
  if (summary.matchedSnapshotIds.length > 0) {
    return `关联了 ${summary.matchedSnapshotIds.length} 条历史快照`;
  }
  if (summary.matchedTraceIds.length > 0) {
    return `关联了 ${summary.matchedTraceIds.length} 条历史记录`;
  }
  if (summary.backend && summary.backend !== "unknown") {
    return summary.backend;
  }
  return null;
}

function buildFeedTraceViewModel(params: {
  feedItem: AdminConsultationFeedItem;
  localTrace?: AdminConsultationTraceViewModel;
}): AdminConsultationTraceViewModel {
  const { feedItem, localTrace } = params;
  const providerTrace =
    buildProviderTraceFromSummary(feedItem.providerTraceSummary) ??
    localTrace?.providerTrace ??
    null;
  const providerState =
    feedItem.providerTraceSummary
      ? buildProviderStateFromSummary(feedItem.providerTraceSummary)
      : (localTrace?.providerState ?? "unknown");
  const memoryState =
    feedItem.memoryMetaSummary
      ? buildMemoryStateFromSummary(feedItem.memoryMetaSummary)
      : (localTrace?.memoryState ?? "unknown");
  const providerLabel = buildProviderLabel(providerTrace) ?? localTrace?.providerLabel ?? null;
  const memoryDetail =
    buildMemoryDetailFromSummary(feedItem.memoryMetaSummary) ??
    localTrace?.memoryDetail ??
    null;
  const evidenceItems =
    feedItem.evidenceItems.length > 0 ? feedItem.evidenceItems : (localTrace?.evidenceItems ?? []);
  const evidenceHighlights =
    evidenceItems.length > 0
      ? buildEvidenceHighlightsFromItems(evidenceItems)
      : feedItem.explainabilitySummary?.evidenceHighlights.length
        ? feedItem.explainabilitySummary.evidenceHighlights
        : (localTrace?.evidenceHighlights ?? []);

  return {
    participants:
      feedItem.explainabilitySummary?.agentParticipants.length
        ? feedItem.explainabilitySummary.agentParticipants
        : (localTrace?.participants ?? []),
    keyFindings:
      feedItem.explainabilitySummary?.keyFindings.length
        ? feedItem.explainabilitySummary.keyFindings
        : (localTrace?.keyFindings ?? []),
    collaborationSummary:
      feedItem.explainabilitySummary?.coordinationConclusion ||
      feedItem.summary ||
      localTrace?.collaborationSummary ||
      "暂无会诊摘要",
    explainability: buildExplainabilityItemsFromFeed(
      feedItem.explainabilitySummary,
      localTrace?.explainability ?? []
    ),
    evidenceItems,
    providerState,
    providerStateLabel: getProviderStateLabel(providerState),
    providerLabel,
    memoryState,
    memoryStateLabel: getMemoryStateLabel(memoryState),
    memoryDetail,
    syncTargets: pickFirstStringList(
      [feedItem.syncTargets, localTrace?.syncTargets],
      4
    ),
    evidenceHighlights,
    providerTrace,
  };
}

function resolveConsultationEscalation(params: {
  dispatchEvent?: AdminDispatchEvent;
  feedItem?: AdminConsultationFeedItem;
  localConsultation?: ConsultationResult;
}) {
  const dispatchEscalation = normalizeTaskEscalationSuggestion(
    params.dispatchEvent?.source?.escalation
  );
  if (dispatchEscalation) return dispatchEscalation;

  if (params.feedItem?.activeEscalation) {
    return params.feedItem.activeEscalation;
  }

  const feedEscalation = pickHighestPriorityEscalation(
    params.feedItem?.taskEscalations
  );
  if (feedEscalation) return feedEscalation;

  if (params.localConsultation?.activeEscalation) {
    return params.localConsultation.activeEscalation;
  }

  return pickHighestPriorityEscalation(params.localConsultation?.taskEscalations);
}

function buildFeedDecisionViewModel(params: {
  feedItem: AdminConsultationFeedItem;
  child?: AdminConsultationChildMeta;
  dispatchEvent?: AdminDispatchEvent;
  localConsultation?: ConsultationResult;
}): AdminConsultationDecisionViewModel {
  const { feedItem, child, dispatchEvent, localConsultation } = params;
  const resolvedEscalation = resolveConsultationEscalation({
    dispatchEvent,
    feedItem,
    localConsultation,
  });
  const resolvedStatus = resolveDecisionStatus({
    dispatchEvent,
    feedStatus: feedItem.status,
    directorDecisionStatus: feedItem.directorDecisionCard.status,
  });
  const resolvedOwnerRole =
    (resolvedEscalation?.ownerRole as AdminOwnerRole | undefined) ||
    dispatchEvent?.recommendedOwnerRole ||
    feedItem.ownerRole ||
    feedItem.directorDecisionCard.recommendedOwnerRole ||
    localConsultation?.directorDecisionCard.recommendedOwnerRole;
  const recommendedAt =
    dispatchEvent?.recommendedDeadline ||
    feedItem.dueAt ||
    feedItem.directorDecisionCard.recommendedAt ||
    localConsultation?.directorDecisionCard.recommendedAt ||
    "";
  const childName = child?.name || dispatchEvent?.targetName || feedItem.childId;
  const className =
    child?.className ||
    dispatchEvent?.source?.relatedClassNames?.[0] ||
    "当前班级";
  const keyFindings = takeUnique(
    [
      ...(feedItem.explainabilitySummary?.keyFindings ?? []),
      ...(localConsultation?.keyFindings ?? []),
    ],
    3
  );
  const triggerReasons = takeUnique(
    [
      feedItem.triggerReason,
      ...feedItem.triggerReasons,
      ...(localConsultation?.triggerReasons ?? []),
    ],
    3
  );
  const schoolActions = pickFirstStringList(
    [feedItem.todayInSchoolActions, localConsultation?.todayInSchoolActions],
    2
  );
  const homeActions = pickFirstStringList(
    [feedItem.tonightAtHomeActions, localConsultation?.tonightAtHomeActions],
    2
  );
  const followUpActions = pickFirstStringList(
    [feedItem.followUp48h, localConsultation?.followUp48h],
    2
  );

  return {
    consultationId: feedItem.consultationId,
    childId: feedItem.childId,
    childName,
    className,
    riskLevel: feedItem.riskLevel,
    riskLabel: getRiskLabel(feedItem.riskLevel),
    priorityLabel: getPriorityLabel(feedItem.riskLevel),
    status: resolvedStatus.status,
    statusLabel: getStatusLabel(resolvedStatus.status),
    statusSource: resolvedStatus.statusSource,
    summary: feedItem.summary || localConsultation?.summary || "暂无会诊摘要",
    whyHighPriority: resolveAdminWhyHighPriorityText(
      resolvedEscalation?.escalationReason,
      sanitizeAdminWhyHighPriorityText(feedItem.whyHighPriority),
      feedItem.directorDecisionCard.reason,
      localConsultation?.directorDecisionCard.reason,
      feedItem.triggerReason,
      triggerReasons[0],
      keyFindings[0],
      feedItem.summary,
      localConsultation?.summary
    ),
    recommendedOwnerName:
      dispatchEvent?.recommendedOwnerName ||
      feedItem.ownerName ||
      feedItem.directorDecisionCard.recommendedOwnerName ||
      localConsultation?.directorDecisionCard.recommendedOwnerName ||
      buildEscalationOwnerLabel(resolvedEscalation, resolvedOwnerRole),
    recommendedAt,
    recommendedAtLabel: formatDateTimeLabel(recommendedAt),
    generatedAtLabel: formatDateTimeLabel(feedItem.generatedAt),
    triggerReasons,
    keyFindings,
    schoolActions,
    homeActions,
    followUpActions,
  };
}

function buildLocalConsultationMaps(localConsultations: ConsultationResult[]) {
  const byConsultationId = new Map<string, ConsultationResult>();
  const latestByChildId = new Map<string, ConsultationResult>();

  for (const consultation of [...localConsultations].sort((left, right) =>
    right.generatedAt.localeCompare(left.generatedAt)
  )) {
    if (!byConsultationId.has(consultation.consultationId)) {
      byConsultationId.set(consultation.consultationId, consultation);
    }
    if (!latestByChildId.has(consultation.childId)) {
      latestByChildId.set(consultation.childId, consultation);
    }
  }

  return { byConsultationId, latestByChildId };
}

function buildVisibleConsultationCountByChildId(params: {
  normalizedFeedItems: AdminConsultationFeedItem[];
  localConsultations: ConsultationResult[];
  hasFeedItems: boolean;
}) {
  const counts = new Map<string, number>();
  const increment = (childId: string) => {
    counts.set(childId, (counts.get(childId) ?? 0) + 1);
  };

  if (params.hasFeedItems) {
    params.normalizedFeedItems
      .filter((item) => item.shouldEscalateToAdmin)
      .forEach((item) => increment(item.childId));
    return counts;
  }

  params.localConsultations
    .filter((consultation) => consultation.shouldEscalateToAdmin)
    .forEach((consultation) => increment(consultation.childId));

  return counts;
}

function buildPrioritySortValue(item: AdminConsultationPriorityItem) {
  return {
    escalation: item.shouldEscalateToAdmin ? 0 : 1,
    risk: RISK_ORDER[item.riskLevel],
    status: STATUS_ORDER[item.decision.status],
    generatedAt: item.generatedAt,
  };
}

function collapsePriorityItemsByChild(items: AdminConsultationPriorityItem[]) {
  const byChildId = new Map<string, AdminConsultationPriorityItem[]>();

  for (const item of items) {
    const group = byChildId.get(item.childId) ?? [];
    group.push(item);
    byChildId.set(item.childId, group);
  }

  const collapsed: AdminConsultationPriorityItem[] = [];
  for (const group of byChildId.values()) {
    const consultationIds = new Set(group.map((item) => item.consultationId));
    if (consultationIds.size > 1) {
      collapsed.push(...group);
      continue;
    }

    let best = group[0];
    for (const item of group.slice(1)) {
      const existingSort = buildPrioritySortValue(best);
      const nextSort = buildPrioritySortValue(item);
      const shouldReplace =
        nextSort.escalation < existingSort.escalation ||
        (nextSort.escalation === existingSort.escalation &&
          nextSort.risk < existingSort.risk) ||
        (nextSort.escalation === existingSort.escalation &&
          nextSort.risk === existingSort.risk &&
          nextSort.status < existingSort.status) ||
        (nextSort.escalation === existingSort.escalation &&
          nextSort.risk === existingSort.risk &&
          nextSort.status === existingSort.status &&
          nextSort.generatedAt > existingSort.generatedAt);

      if (shouldReplace) {
        best = item;
      }
    }

    collapsed.push(best);
  }

  return collapsed;
}

function buildConsultationRecommendedOwnerRole(params: {
  dispatchEvent?: AdminDispatchEvent;
  feedOwnerRole?: AdminOwnerRole;
  directorDecisionOwnerRole?: AdminOwnerRole;
  localConsultation?: ConsultationResult;
  escalation?: TaskEscalationSuggestion;
}) {
  return (
    (params.escalation?.ownerRole as AdminOwnerRole | undefined) ||
    params.dispatchEvent?.recommendedOwnerRole ||
    params.feedOwnerRole ||
    params.directorDecisionOwnerRole ||
    params.localConsultation?.directorDecisionCard.recommendedOwnerRole ||
    "admin"
  );
}

function buildConsultationNotificationEvidence(
  item: Pick<
    AdminConsultationPriorityItem,
    "riskLevel" | "decision" | "trace" | "activeEscalation"
  >
) {
  const priorityScore = CONSULTATION_PRIORITY_SCORE[item.riskLevel];
  const evidence: InstitutionPriorityEvidence[] = [
    {
      label: "会诊风险",
      value: item.decision.riskLabel,
      weight: priorityScore,
      detail: item.decision.summary,
    },
  ];

  if (item.activeEscalation) {
    evidence.push({
      label: "Task escalation",
      value: item.activeEscalation.escalationLevel,
      weight: Math.max(priorityScore - 10, 20),
      detail: item.activeEscalation.escalationReason,
    });
  }

  const triggerReason = item.decision.triggerReasons[0];
  if (triggerReason) {
    evidence.push({
      label: "触发原因",
      value: triggerReason,
      weight: Math.max(priorityScore - 20, 20),
      detail: item.decision.whyHighPriority,
    });
  }

  const keyFinding = item.decision.keyFindings[0] || item.trace.keyFindings[0];
  if (keyFinding) {
    evidence.push({
      label: "关键发现",
      value: keyFinding,
      weight: Math.max(priorityScore - 35, 15),
      detail: item.trace.collaborationSummary,
    });
  }

  return evidence;
}

export function hasConsultationScopedNotification(
  item: Pick<AdminConsultationPriorityItem, "dispatchBindingScope">
) {
  return (
    item.dispatchBindingScope === "priority" ||
    item.dispatchBindingScope === "consultation"
  );
}

export function buildAdminConsultationNotificationPayload(params: {
  item: Pick<
    AdminConsultationPriorityItem,
    | "consultationId"
    | "childId"
    | "riskLevel"
    | "generatedAt"
    | "decision"
    | "trace"
    | "recommendedOwnerRole"
    | "activeEscalation"
  >;
  institutionName?: string;
}): AdminDispatchCreatePayload {
  const { item } = params;
  const priorityScore = CONSULTATION_PRIORITY_SCORE[item.riskLevel];
  const recommendedAction =
    item.activeEscalation?.recommendedNextStep ||
    item.decision.schoolActions[0] ||
    item.decision.homeActions[0] ||
    item.decision.followUpActions[0] ||
    item.trace.collaborationSummary ||
    item.decision.summary;

  return {
    eventType: "admin_action",
    priorityItemId: item.consultationId,
    title: `${item.decision.priorityLabel}｜${item.decision.childName}重点会诊`,
    summary: item.decision.summary,
    targetType: "child",
    targetId: item.childId,
    targetName: item.decision.childName,
    priorityLevel: item.decision.priorityLabel,
    priorityScore,
    recommendedOwnerRole: item.recommendedOwnerRole,
    recommendedOwnerName: item.decision.recommendedOwnerName,
    recommendedAction,
    recommendedDeadline: item.decision.recommendedAt || item.generatedAt,
    reasonText:
      item.activeEscalation?.escalationReason || item.decision.whyHighPriority,
    evidence: buildConsultationNotificationEvidence(item),
    source: {
      institutionName: params.institutionName || "当前机构",
      workflow: "daily-priority",
      relatedChildIds: [item.childId],
      relatedClassNames:
        item.decision.className && item.decision.className !== "当前班级"
          ? [item.decision.className]
          : undefined,
      consultationId: item.consultationId,
      relatedConsultationIds: [item.consultationId],
      taskId: item.activeEscalation?.taskId,
      relatedTaskIds:
        item.activeEscalation?.relatedTaskIds.length
          ? item.activeEscalation.relatedTaskIds
          : undefined,
      escalation: item.activeEscalation,
    },
  };
}

export function buildAdminConsultationPriorityItems(params: {
  feedItems?: unknown[] | null;
  localConsultations?: ConsultationResult[];
  children: AdminConsultationChildMeta[];
  notificationEvents?: AdminDispatchEvent[];
  institutionName?: string;
  limit?: number;
  useLocalFallback?: boolean;
}) {
  const childMap = new Map(params.children.map((child) => [child.id, child] as const));
  const notificationEvents = params.notificationEvents ?? [];
  const localConsultations = params.localConsultations ?? [];
  const localMaps = buildLocalConsultationMaps(localConsultations);
  const hasFeedItems = Array.isArray(params.feedItems);
  const feedItems: unknown[] = Array.isArray(params.feedItems) ? params.feedItems : [];
  const normalizedFeedItems = hasFeedItems
    ? feedItems
        .map((item) => normalizeAdminConsultationFeedItem(item))
        .flatMap((item) => (item ? [item] : []))
    : [];
  const visibleConsultationCountByChildId = buildVisibleConsultationCountByChildId({
    normalizedFeedItems,
    localConsultations,
    hasFeedItems,
  });

  const items = hasFeedItems
    ? normalizedFeedItems
        .flatMap((feedItem) => {
          if (!feedItem.shouldEscalateToAdmin) {
            return [];
          }

          const child = childMap.get(feedItem.childId);
          const dispatchBinding = resolveDispatchBinding({
            consultationId: feedItem.consultationId,
            childId: feedItem.childId,
            notificationEvents,
            visibleConsultationCountForChild:
              visibleConsultationCountByChildId.get(feedItem.childId) ?? 0,
          });
          const dispatchEvent = dispatchBinding?.event;
          const localConsultation =
            localMaps.byConsultationId.get(feedItem.consultationId) ??
            localMaps.latestByChildId.get(feedItem.childId);
          const localTrace = localConsultation
            ? buildLocalTraceViewModel(localConsultation)
            : undefined;
          const activeEscalation = resolveConsultationEscalation({
            dispatchEvent,
            feedItem,
            localConsultation,
          });
          const recommendedOwnerRole = buildConsultationRecommendedOwnerRole({
            dispatchEvent,
            feedOwnerRole: feedItem.ownerRole,
            directorDecisionOwnerRole: feedItem.directorDecisionCard.recommendedOwnerRole,
            localConsultation,
            escalation: activeEscalation,
          });
          const priorityItem = {
            consultationId: feedItem.consultationId,
            childId: feedItem.childId,
            riskLevel: feedItem.riskLevel,
            generatedAt: feedItem.generatedAt,
            shouldEscalateToAdmin: feedItem.shouldEscalateToAdmin,
            decision: buildFeedDecisionViewModel({
              feedItem,
              child,
              dispatchEvent,
              localConsultation,
            }),
            trace: buildFeedTraceViewModel({
              feedItem,
              localTrace,
            }),
            recommendedOwnerRole,
            activeEscalation,
            dispatchEvent,
            dispatchBindingScope: dispatchBinding?.scope,
          } satisfies AdminConsultationPriorityItem;

          return [
            {
              ...priorityItem,
              notificationPayload: buildAdminConsultationNotificationPayload({
                item: priorityItem,
                institutionName: params.institutionName,
              }),
            },
          ];
        })
    : params.useLocalFallback
      ? localConsultations
          .filter((consultation) => consultation.shouldEscalateToAdmin)
          .map((consultation) => {
            const dispatchBinding = resolveDispatchBinding({
              consultationId: consultation.consultationId,
              childId: consultation.childId,
              notificationEvents,
              visibleConsultationCountForChild:
                visibleConsultationCountByChildId.get(consultation.childId) ?? 0,
            });
            const dispatchEvent = dispatchBinding?.event;
            const activeEscalation = resolveConsultationEscalation({
              dispatchEvent,
              localConsultation: consultation,
            });
            const priorityItem = {
              consultationId: consultation.consultationId,
              childId: consultation.childId,
              riskLevel: consultation.riskLevel,
              generatedAt: consultation.generatedAt,
              shouldEscalateToAdmin: consultation.shouldEscalateToAdmin,
              decision: buildLocalDecisionViewModel({
                consultation,
                child: childMap.get(consultation.childId),
                dispatchEvent,
              }),
              trace: buildLocalTraceViewModel(consultation),
              recommendedOwnerRole: buildConsultationRecommendedOwnerRole({
                dispatchEvent,
                localConsultation: consultation,
                escalation: activeEscalation,
              }),
              activeEscalation,
              dispatchEvent,
              dispatchBindingScope: dispatchBinding?.scope,
            } satisfies AdminConsultationPriorityItem;

            return {
              ...priorityItem,
              notificationPayload: buildAdminConsultationNotificationPayload({
                item: priorityItem,
                institutionName: params.institutionName,
              }),
            };
          })
      : [];

  return collapsePriorityItemsByChild(items)
    .sort((left, right) => {
      const leftSort = buildPrioritySortValue(left);
      const rightSort = buildPrioritySortValue(right);

      if (leftSort.escalation !== rightSort.escalation) {
        return leftSort.escalation - rightSort.escalation;
      }
      if (leftSort.risk !== rightSort.risk) {
        return leftSort.risk - rightSort.risk;
      }
      if (leftSort.status !== rightSort.status) {
        return leftSort.status - rightSort.status;
      }

      return rightSort.generatedAt.localeCompare(leftSort.generatedAt);
    })
    .slice(0, params.limit ?? 4);
}
