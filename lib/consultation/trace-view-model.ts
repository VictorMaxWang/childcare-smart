import type {
  ConsultationEvidenceItem,
  HighRiskConsultationResult,
  MemoryContextMeta,
} from "@/lib/ai/types";
import {
  buildLegacyTraceEvidenceFromItems,
  filterConsultationEvidenceItemsByStage,
} from "@/lib/consultation/evidence";
import {
  asTraceStringArray,
  buildExplainabilityEvidence,
  CONSULTATION_STAGE_ORDER,
  getConsultationStageDescription,
  getConsultationStageLabel,
  getConsultationStageShortLabel,
  getConsultationTraceOverallStatusLabel,
  pickTraceMemoryMeta,
  type ConsultationProviderTrace,
  type ConsultationStageKey,
  type ConsultationStageTextEvent,
  type ConsultationStageView,
  type ConsultationSummaryCardData,
  type ConsultationTraceCallout,
  type ConsultationTraceMemoryState,
  type ConsultationTraceMode,
  type ConsultationTraceOverallStatus,
  type ConsultationTraceProviderState,
  type ConsultationTraceResultState,
  type ConsultationTraceState,
  type ConsultationTraceViewModel,
  type FollowUp48hCardData,
} from "@/lib/consultation/trace-types";

function firstDefined<T>(...values: Array<T | null | undefined>) {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function lastNoteForStage(
  notes: ConsultationStageTextEvent[],
  stage: ConsultationStageKey
) {
  const stageNotes = notes.filter((note) => note.stage === stage);
  return stageNotes.at(-1);
}

function getResolvedProviderTrace(
  state: ConsultationTraceState
): ConsultationProviderTrace | null {
  const resultTrace =
    state.result?.providerTrace && typeof state.result.providerTrace === "object"
      ? (state.result.providerTrace as ConsultationProviderTrace)
      : null;

  return state.providerTrace ?? resultTrace ?? null;
}

function getResolvedMemoryMeta(
  state: ConsultationTraceState,
  traceMemoryMeta: Record<string, unknown> | null
) {
  return state.memoryMeta ?? traceMemoryMeta ?? state.result?.memoryMeta ?? null;
}

function buildProviderState(
  providerTrace: ConsultationProviderTrace | null
): ConsultationTraceProviderState {
  if (!providerTrace) return "unknown";
  if (providerTrace.realProvider) return "real";
  if (providerTrace.fallback) return "fallback";
  return "unknown";
}

function buildMemoryState(
  memoryMeta: MemoryContextMeta | Record<string, unknown> | null,
  traceMemoryMeta: Record<string, unknown> | null
): ConsultationTraceMemoryState {
  const resolved = asRecord(memoryMeta ?? traceMemoryMeta);
  if (Object.keys(resolved).length === 0) return "unknown";

  const degraded = Boolean(resolved.degraded);
  const usedSources = asTraceStringArray(resolved.usedSources);
  const matchedSnapshotIds = asTraceStringArray(resolved.matchedSnapshotIds);
  const matchedTraceIds = asTraceStringArray(resolved.matchedTraceIds);
  const errors = asTraceStringArray(resolved.errors);

  if (degraded || errors.length > 0) return "degraded";
  if (
    usedSources.length === 0 &&
    matchedSnapshotIds.length === 0 &&
    matchedTraceIds.length === 0
  ) {
    return "empty";
  }
  return "ready";
}

function buildResultState(
  state: ConsultationTraceState,
  hasResult: boolean
): ConsultationTraceResultState {
  if (state.invalidResultReason) return "invalid";
  return hasResult ? "ready" : "pending";
}

function buildLongTermSummaryCard(
  result: HighRiskConsultationResult,
  memoryMeta: MemoryContextMeta | Record<string, unknown> | null,
  providerTrace: ConsultationProviderTrace | null
): ConsultationSummaryCardData {
  return {
    stage: "long_term_profile",
    title: "长期画像",
    summary: result.summary,
    content:
      result.continuityNotes?.[0] ??
      result.coordinatorSummary?.finalConclusion ??
      result.summary,
    items: [
      ...(result.continuityNotes ?? []).slice(0, 2),
      ...asTraceStringArray(asRecord(memoryMeta).usedSources)
        .slice(0, 2)
        .map((item) => `memory source: ${item}`),
    ].filter(Boolean),
    providerTrace: providerTrace ?? undefined,
    memoryMeta: memoryMeta ?? undefined,
  };
}

function buildCurrentSummaryCard(
  result: HighRiskConsultationResult,
  memoryMeta: MemoryContextMeta | Record<string, unknown> | null,
  providerTrace: ConsultationProviderTrace | null
): ConsultationSummaryCardData {
  return {
    stage: "current_recommendation",
    title: "当前建议",
    summary: result.summary,
    content: result.coordinatorSummary?.finalConclusion ?? result.summary,
    items: [
      ...(result.todayInSchoolActions ?? []).slice(0, 2),
      ...(result.tonightAtHomeActions ?? []).slice(0, 2),
      ...(result.followUp48h ?? []).slice(0, 1),
    ].filter(Boolean),
    providerTrace: providerTrace ?? undefined,
    memoryMeta: memoryMeta ?? undefined,
  };
}

function buildDerivedFollowUpCard(
  result: HighRiskConsultationResult,
  providerTrace: ConsultationProviderTrace | null
): FollowUp48hCardData {
  return {
    title: "48 小时复查",
    items: result.followUp48h ?? [],
    reviewIn48h: result.reviewIn48h ?? "",
    providerTrace: providerTrace ?? undefined,
  };
}

function buildLongTermEvidence(
  memoryMeta: MemoryContextMeta | Record<string, unknown> | null,
  continuityNotes: string[]
) {
  const evidence = continuityNotes.slice(0, 2).map((detail) => ({
    label: "长期画像",
    detail,
  }));

  const resolved = asRecord(memoryMeta);
  const backend = String(resolved.backend ?? "").trim();
  if (backend) {
    evidence.push({
      label: "memory backend",
      detail: backend,
    });
  }

  asTraceStringArray(resolved.usedSources)
    .slice(0, 2)
    .forEach((detail) => {
      evidence.push({
        label: "memory source",
        detail,
      });
    });

  return evidence.slice(0, 4);
}

function buildRecentEvidence(
  triggerReasons: string[],
  keyFindings: string[],
  nextCheckpoints: string[]
) {
  return [
    ...triggerReasons.slice(0, 2).map((detail) => ({
      label: "触发原因",
      detail,
    })),
    ...keyFindings.slice(0, 1).map((detail) => ({
      label: "关键发现",
      detail,
    })),
    ...nextCheckpoints.slice(0, 1).map((detail) => ({
      label: "复查线索",
      detail,
    })),
  ];
}

function buildCurrentEvidence(result: HighRiskConsultationResult | null) {
  return [
    ...buildExplainabilityEvidence(result?.explainability, 3),
    ...asTraceStringArray(result?.followUp48h).slice(0, 1).map((detail) => ({
      label: "48h 复查",
      detail,
    })),
  ].slice(0, 4);
}

function getResultEvidenceItems(
  result: HighRiskConsultationResult | null
): ConsultationEvidenceItem[] {
  return Array.isArray(result?.evidenceItems) ? result.evidenceItems : [];
}

function buildStageSummary(
  stage: ConsultationStageKey,
  state: ConsultationTraceState,
  summaryCard: ConsultationSummaryCardData | undefined,
  followUpCard: FollowUp48hCardData | undefined
) {
  const note = lastNoteForStage(state.stageNotes, stage);
  const status = state.stageStatuses[stage];
  const result = state.result;

  if (stage === "long_term_profile") {
    return (
      firstDefined(
        note?.text,
        summaryCard?.summary,
        summaryCard?.content,
        result?.continuityNotes?.[0]
      ) ?? getConsultationStageDescription(stage)
    );
  }

  if (stage === "recent_context") {
    return (
      firstDefined(
        note?.text,
        status?.message,
        result?.triggerReasons?.[0],
        result?.keyFindings?.[0]
      ) ?? getConsultationStageDescription(stage)
    );
  }

  return (
    firstDefined(
      note?.text,
      summaryCard?.summary,
      summaryCard?.content,
      result?.summary,
      result?.coordinatorSummary?.finalConclusion,
      followUpCard?.reviewIn48h
    ) ?? getConsultationStageDescription(stage)
  );
}

function buildStageItems(
  stage: ConsultationStageKey,
  state: ConsultationTraceState,
  summaryCard: ConsultationSummaryCardData | undefined,
  followUpCard: FollowUp48hCardData | undefined,
  memoryMeta: MemoryContextMeta | Record<string, unknown> | null
) {
  const note = lastNoteForStage(state.stageNotes, stage);
  const result = state.result;

  if (note?.items.length) {
    return note.items;
  }
  if (summaryCard?.items?.length) {
    return summaryCard.items;
  }
  if (followUpCard?.items?.length) {
    return followUpCard.items;
  }

  if (stage === "long_term_profile") {
    return [
      ...(result?.continuityNotes ?? []).slice(0, 2),
      ...asTraceStringArray(asRecord(memoryMeta).usedSources)
        .slice(0, 2)
        .map((item) => `memory source: ${item}`),
    ].filter(Boolean);
  }

  if (stage === "recent_context") {
    return [
      ...(result?.triggerReasons ?? []).slice(0, 2),
      ...(result?.keyFindings ?? []).slice(0, 2),
      ...(result?.nextCheckpoints ?? []).slice(0, 1),
    ].filter(Boolean);
  }

  return [
    ...(result?.todayInSchoolActions ?? []).slice(0, 2),
    ...(result?.tonightAtHomeActions ?? []).slice(0, 2),
    ...(result?.followUp48h ?? []).slice(0, 1),
  ].filter(Boolean);
}

function buildStageTitle(
  stage: ConsultationStageKey,
  state: ConsultationTraceState,
  summaryCard: ConsultationSummaryCardData | undefined,
  followUpCard: FollowUp48hCardData | undefined
) {
  return (
    firstDefined(
      state.stageStatuses[stage]?.title,
      lastNoteForStage(state.stageNotes, stage)?.title,
      summaryCard?.title,
      stage === "current_recommendation"
        ? followUpCard?.title
        : undefined
    ) ?? getConsultationStageLabel(stage)
  );
}

function buildStageSource(
  stage: ConsultationStageKey,
  state: ConsultationTraceState,
  providerTrace: ConsultationProviderTrace | null,
  memoryState: ConsultationTraceMemoryState
) {
  const noteSource = lastNoteForStage(state.stageNotes, stage)?.source;
  if (noteSource) return noteSource;

  if (
    (stage === "long_term_profile" || stage === "recent_context") &&
    memoryState !== "unknown"
  ) {
    return "memory";
  }

  return providerTrace?.source ?? state.result?.source ?? undefined;
}

function buildStageEmptyState(
  stage: ConsultationStageKey,
  memoryState: ConsultationTraceMemoryState,
  invalidResultReason: string | null
) {
  if (stage === "long_term_profile") {
    return memoryState === "empty"
      ? "当前暂无历史记忆命中，系统会按教师输入继续生成会诊建议。"
      : "长期画像加载后会在这里展示系统读取到的底色和连续性线索。";
  }

  if (stage === "recent_context") {
    return "最近会诊与快照整理完成后，会把最新触发原因和复查线索收敛到这里。";
  }

  if (invalidResultReason) {
    return "当前建议结果不完整，已保留 trace 供联调排查，业务卡片未同步。";
  }

  return "当前建议生成后，会在这里展示园内动作、今晚任务和 48 小时复查。";
}

function buildStageCallout(
  stage: ConsultationStageKey,
  memoryState: ConsultationTraceMemoryState,
  providerState: ConsultationTraceProviderState,
  state: ConsultationTraceState
): ConsultationTraceCallout | null {
  if (stage === "long_term_profile" && memoryState === "empty") {
    return {
      tone: "info",
      title: "暂无历史记忆命中",
      description: "这次会诊会更多依赖教师补充和当前上下文，不影响继续生成建议。",
    };
  }

  if (stage === "long_term_profile" && memoryState === "degraded") {
    return {
      tone: "warning",
      title: "记忆上下文已降级",
      description: "系统仍会继续生成结果，但历史画像与命中来源可能不完整。",
    };
  }

  if (stage === "current_recommendation" && providerState === "fallback") {
    return {
      tone: "warning",
      title: "当前使用 fallback 链路",
      description: "主内容仍可展示，但需要在联调时确认真实 provider 链路是否正常。",
    };
  }

  if (stage === "current_recommendation" && state.invalidResultReason) {
    return {
      tone: "warning",
      title: "结果不完整",
      description: "已保留 trace 与阶段内容，但未同步最终业务卡片。",
    };
  }

  if (stage === "current_recommendation" && state.streamEndedUnexpectedly) {
    return {
      tone: "warning",
      title: "SSE 提前结束",
      description: "当前只保留了已收到的阶段内容，可继续用于排查流式链路。",
    };
  }

  return null;
}

function stageStatus(
  stage: ConsultationStageKey,
  state: ConsultationTraceState,
  hasResult: boolean
): ConsultationStageView["status"] {
  const stageIndex = CONSULTATION_STAGE_ORDER.indexOf(stage);
  const activeIndex = state.activeStage
    ? CONSULTATION_STAGE_ORDER.indexOf(state.activeStage)
    : -1;
  const hasStageActivity =
    Boolean(state.stageStatuses[stage]) ||
    Boolean(lastNoteForStage(state.stageNotes, stage)) ||
    Boolean(state.stageUi[stage]);

  if (hasResult) {
    return "completed";
  }
  if (stageIndex < activeIndex) {
    return "completed";
  }
  if (stage === state.activeStage) {
    return "active";
  }
  if (state.streamEndedUnexpectedly && hasStageActivity) {
    return "completed";
  }
  if (!state.activeStage && !state.isStreaming && hasStageActivity) {
    return "completed";
  }
  return "pending";
}

function buildStageEvidenceItems(
  stage: ConsultationStageKey,
  result: HighRiskConsultationResult | null
) {
  return filterConsultationEvidenceItemsByStage(getResultEvidenceItems(result), stage);
}

function buildStageEvidence(
  stage: ConsultationStageKey,
  result: HighRiskConsultationResult | null,
  memoryMeta: MemoryContextMeta | Record<string, unknown> | null
) {
  const evidenceItems = buildStageEvidenceItems(stage, result);
  if (evidenceItems.length > 0) {
    return buildLegacyTraceEvidenceFromItems(evidenceItems);
  }

  if (stage === "long_term_profile") {
    return buildLongTermEvidence(memoryMeta, result?.continuityNotes ?? []);
  }

  if (stage === "recent_context") {
    return buildRecentEvidence(
      result?.triggerReasons ?? [],
      result?.keyFindings ?? [],
      result?.nextCheckpoints ?? []
    );
  }

  return buildCurrentEvidence(result);
}

function buildCallouts(params: {
  overallStatus: ConsultationTraceOverallStatus;
  providerState: ConsultationTraceProviderState;
  memoryState: ConsultationTraceMemoryState;
  resultState: ConsultationTraceResultState;
  state: ConsultationTraceState;
  hasResult: boolean;
}): ConsultationTraceCallout[] {
  const callouts: ConsultationTraceCallout[] = [];

  if (params.overallStatus === "loading") {
    callouts.push({
      tone: "info",
      title: "正在建立会诊流连接",
      description: "首包到达后，会按三阶段依次展开长期画像、最近会诊和当前建议。",
    });
  }

  if (params.state.streamError) {
    callouts.push({
      tone: "error",
      title: "会诊流请求失败",
      description: params.state.streamError,
    });
  }

  if (
    params.overallStatus === "partial" &&
    params.state.streamEndedUnexpectedly
  ) {
    callouts.push({
      tone: "warning",
      title: "会诊流被提前中断",
      description: "已保留已收到的阶段内容，便于继续联调和复盘。",
    });
  }

  if (params.resultState === "invalid" && params.state.invalidResultReason) {
    callouts.push({
      tone: "warning",
      title: "最终结果未通过前端校验",
      description: params.state.invalidResultReason,
    });
  }

  if (params.providerState === "fallback") {
    callouts.push({
      tone: "warning",
      title: "当前展示的是 fallback 结果",
      description: "页面仍可演示，但 staging 联调时需要继续确认真实 provider 链路。",
    });
  }

  if (params.memoryState === "empty") {
    callouts.push({
      tone: "info",
      title: "暂无历史记忆命中",
      description: "系统会按当前教师输入和实时上下文继续生成建议。",
    });
  }

  if (params.memoryState === "degraded") {
    callouts.push({
      tone: "warning",
      title: "记忆上下文已降级",
      description: "已命中的历史来源可能不完整，但不会阻断当前会诊展示。",
    });
  }

  if (
    params.overallStatus === "done" &&
    params.hasResult &&
    params.providerState === "real"
  ) {
    callouts.push({
      tone: "success",
      title: "会诊已完成",
      description: "当前结果已具备落到教师、家长和园长端的可展示闭环。",
    });
  }

  return callouts;
}

function buildSyncTargets(result: HighRiskConsultationResult | null) {
  if (!result) {
    return [];
  }

  const targets = ["教师端结果卡", "家长端今晚任务"];
  if (result.shouldEscalateToAdmin) {
    targets.push("园长端决策卡");
  }
  return targets;
}

export function buildConsultationTraceViewModel(
  state: ConsultationTraceState
): ConsultationTraceViewModel {
  const traceMemoryMeta = pickTraceMemoryMeta(state.result);
  const providerTrace = getResolvedProviderTrace(state);
  const memoryMeta = getResolvedMemoryMeta(state, traceMemoryMeta);
  const hasResult = Boolean(state.result) && !state.invalidResultReason;

  const overallStatus: ConsultationTraceOverallStatus = state.streamError
    ? "error"
    : hasResult
      ? "done"
      : state.isStreaming && !state.receivedAnyEvent
        ? "loading"
        : state.isStreaming
          ? "streaming"
          : state.invalidResultReason ||
              state.streamEndedUnexpectedly ||
              state.receivedDone ||
              Boolean(state.receivedAnyEvent)
            ? "partial"
            : "idle";

  const providerState = buildProviderState(providerTrace);
  const memoryState = buildMemoryState(memoryMeta, traceMemoryMeta);
  const resultState = buildResultState(state, hasResult);
  const progressValue = hasResult
    ? 100
    : state.activeStage
      ? (CONSULTATION_STAGE_ORDER.indexOf(state.activeStage) + 1) *
        (100 / CONSULTATION_STAGE_ORDER.length)
      : overallStatus === "loading"
        ? 8
        : 0;

  const activeIndex = state.activeStage
    ? CONSULTATION_STAGE_ORDER.indexOf(state.activeStage)
    : -1;

  const stages = CONSULTATION_STAGE_ORDER.map((stage) => {
    const derivedSummaryCard =
      stage === "long_term_profile" && state.result
        ? buildLongTermSummaryCard(state.result, memoryMeta, providerTrace)
        : stage === "current_recommendation" && state.result
          ? buildCurrentSummaryCard(state.result, traceMemoryMeta ?? memoryMeta, providerTrace)
          : undefined;

    const summaryCard = state.stageUi[stage]?.summaryCard ?? derivedSummaryCard;
    const followUpCard =
      state.stageUi[stage]?.followUpCard ??
      (stage === "current_recommendation" && state.result
        ? buildDerivedFollowUpCard(state.result, providerTrace)
        : undefined);

    const stageMemoryMeta =
      summaryCard?.memoryMeta ??
      state.stageStatuses[stage]?.memory ??
      (stage === "long_term_profile" || stage === "recent_context"
        ? memoryMeta
        : traceMemoryMeta ?? memoryMeta);

    const stageProviderTrace =
      summaryCard?.providerTrace ??
      followUpCard?.providerTrace ??
      state.stageStatuses[stage]?.providerTrace ??
      (stage === "current_recommendation" ? providerTrace : null);

    const status = stageStatus(stage, state, hasResult);
    const stageEvidenceItems = buildStageEvidenceItems(stage, state.result);

    const stageIndex = CONSULTATION_STAGE_ORDER.indexOf(stage);
    const expandedByDefault =
      state.mode === "debug" ||
      status === "active" ||
      (activeIndex > 0 && stageIndex === activeIndex - 1) ||
      (!state.isStreaming && hasResult && stage === "current_recommendation");

    return {
      key: stage,
      label: getConsultationStageLabel(stage),
      shortLabel: getConsultationStageShortLabel(stage),
      description: getConsultationStageDescription(stage),
      status,
      title: buildStageTitle(stage, state, summaryCard, followUpCard),
      summary: buildStageSummary(stage, state, summaryCard, followUpCard),
      items: buildStageItems(stage, state, summaryCard, followUpCard, stageMemoryMeta),
      emptyState: buildStageEmptyState(stage, memoryState, state.invalidResultReason ?? null),
      providerTrace: stageProviderTrace,
      memoryMeta: stageMemoryMeta,
      source: buildStageSource(stage, state, stageProviderTrace ?? null, memoryState),
      summaryCard,
      followUpCard,
      evidenceItems: stageEvidenceItems,
      evidence: buildStageEvidence(stage, state.result, stageMemoryMeta),
      callout: buildStageCallout(stage, memoryState, providerState, state),
      expandedByDefault,
    } satisfies ConsultationStageView;
  });

  const callouts = buildCallouts({
    overallStatus,
    providerState,
    memoryState,
    resultState,
    state,
    hasResult,
  });
  const evidenceItems = getResultEvidenceItems(state.result);

  const hasContent =
    callouts.length > 0 ||
    stages.some(
      (stage) =>
        stage.items.length > 0 ||
        stage.evidenceItems.length > 0 ||
        stage.evidence.length > 0 ||
        Boolean(stage.summaryCard) ||
        Boolean(stage.followUpCard) ||
        Boolean(lastNoteForStage(state.stageNotes, stage.key)) ||
        Boolean(state.stageStatuses[stage.key])
    );

  return {
    mode: state.mode,
    activeStage: state.activeStage,
    overallStatus,
    overallStatusLabel: getConsultationTraceOverallStatusLabel(overallStatus),
    providerState,
    memoryState,
    resultState,
    progressValue,
    streamMessage: state.streamMessage,
    streamError: state.streamError,
    traceId: state.traceId ?? state.result?.consultationId ?? null,
    providerTrace,
    memoryMeta,
    traceMemoryMeta,
    evidenceItems,
    stages,
    callouts,
    syncTargets: hasResult ? buildSyncTargets(state.result) : [],
    hasContent,
    rawStageInfo: {
      statuses: state.stageStatuses,
      notes: state.stageNotes,
      ui: state.stageUi,
    },
  };
}

export function buildConsultationResultTraceViewModel(params: {
  result: HighRiskConsultationResult;
  mode?: ConsultationTraceMode;
  streamMessage?: string;
}) {
  return buildConsultationTraceViewModel({
    mode: params.mode ?? "demo",
    activeStage: null,
    isStreaming: false,
    streamMessage:
      params.streamMessage ??
      "会诊已完成，以下为可用于园长侧说明的三阶段故事摘要。",
    streamError: null,
    traceId: params.result.consultationId,
    providerTrace:
      params.result.providerTrace &&
      typeof params.result.providerTrace === "object"
        ? (params.result.providerTrace as ConsultationProviderTrace)
        : null,
    memoryMeta: params.result.memoryMeta ?? null,
    stageNotes: [],
    stageStatuses: {},
    stageUi: {},
    result: params.result,
    receivedAnyEvent: true,
    receivedDone: true,
    streamEndedUnexpectedly: false,
    invalidResultReason: null,
  });
}
