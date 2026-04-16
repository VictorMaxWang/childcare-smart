import type { HighRiskConsultationResult } from "@/lib/ai/types";
import { buildConsultationEvidenceItems } from "@/lib/consultation/evidence";

type NormalizationOptions = {
  brainProvider?: string;
  defaultTransport?: string;
  defaultTransportSource?: string;
  defaultConsultationSource?: string;
  defaultFallbackReason?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function asBoolean(value: unknown, defaultValue = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
    if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  }
  return defaultValue;
}

function uniqueStrings(values: unknown[], limit = 24) {
  const seen = new Set<string>();
  const result: string[] = [];

  values.forEach((item) => {
    const normalized = String(item ?? "").trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });

  return result.slice(0, limit);
}

function asStringArray(value: unknown, limit = 24) {
  return Array.isArray(value) ? uniqueStrings(value, limit) : [];
}

function normalizeMemoryMeta(
  value: unknown,
  fallbackMemory?: Record<string, unknown>
) {
  const record = asRecord(value);
  const fallback = asRecord(fallbackMemory);
  const normalized: Record<string, unknown> = {
    backend:
      asString(record.backend) ||
      asString(record.memoryContextBackend) ||
      asString(fallback.backend) ||
      "unknown",
    degraded:
      asBoolean(record.degraded) ||
      asBoolean(record.memoryContextDegraded) ||
      asBoolean(fallback.degraded),
    usedSources: asStringArray(
      record.usedSources ?? record.used_sources ?? fallback.usedSources ?? fallback.used_sources,
      8
    ),
    errors: asStringArray(record.errors ?? fallback.errors, 8),
    matchedSnapshotIds: asStringArray(
      record.matchedSnapshotIds ??
        record.matched_snapshot_ids ??
        fallback.matchedSnapshotIds ??
        fallback.matched_snapshot_ids,
      8
    ),
    matchedTraceIds: asStringArray(
      record.matchedTraceIds ??
        record.matched_trace_ids ??
        fallback.matchedTraceIds ??
        fallback.matched_trace_ids,
      8
    ),
  };

  const matchedSearchSources = asStringArray(
    record.matchedSearchSources ??
      record.matched_search_sources ??
      fallback.matchedSearchSources ??
      fallback.matched_search_sources,
    8
  );
  if (matchedSearchSources.length > 0) {
    normalized.matchedSearchSources = matchedSearchSources;
  }

  const memoryContextUsed =
    typeof record.memoryContextUsed === "boolean"
      ? record.memoryContextUsed
      : typeof fallback.memoryContextUsed === "boolean"
        ? fallback.memoryContextUsed
        : undefined;
  if (typeof memoryContextUsed === "boolean") {
    normalized.memoryContextUsed = memoryContextUsed;
  }

  const memoryContextCount = Number(
    record.memoryContextCount ?? fallback.memoryContextCount ?? Number.NaN
  );
  if (Number.isFinite(memoryContextCount)) {
    normalized.memoryContextCount = memoryContextCount;
  }

  const memoryContextChildIds = asStringArray(
    record.memoryContextChildIds ?? fallback.memoryContextChildIds,
    8
  );
  if (memoryContextChildIds.length > 0) {
    normalized.memoryContextChildIds = memoryContextChildIds;
  }

  return normalized;
}

function normalizeProviderTrace(
  result: Record<string, unknown>,
  options: NormalizationOptions
) {
  const trace = asRecord(result.providerTrace);
  const source = asString(trace.source) || asString(result.source) || "unknown";
  const provider =
    asString(trace.provider) || asString(trace.llm) || asString(result.provider) || source;
  const transport = asString(trace.transport) || options.defaultTransport || "";
  const providerTrace: Record<string, unknown> = {
    provider,
    source,
    model: asString(trace.model) || asString(result.model),
    requestId: asString(trace.requestId) || asString(trace.request_id),
    transport,
    transportSource:
      asString(trace.transportSource) || options.defaultTransportSource || transport,
    consultationSource:
      asString(trace.consultationSource) ||
      options.defaultConsultationSource ||
      asString(result.source),
    fallbackReason:
      asString(trace.fallbackReason) ||
      asString(trace.fallback_reason) ||
      options.defaultFallbackReason ||
      "",
    brainProvider: asString(trace.brainProvider) || options.brainProvider || "next-fallback",
  };

  const fallback =
    typeof trace.fallback === "boolean"
      ? Boolean(trace.fallback)
      : providerTrace.source !== "vivo";
  const realProvider =
    typeof trace.realProvider === "boolean"
      ? Boolean(trace.realProvider)
      : providerTrace.source === "vivo" && !fallback;

  providerTrace.fallback = fallback;
  providerTrace.realProvider = realProvider;

  ["llm", "ocr", "asr", "tts", "modes", "meta"].forEach((key) => {
    if (key in trace) {
      providerTrace[key] = trace[key];
    }
  });

  return providerTrace;
}

function normalizeParticipants(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => {
          const record = asRecord(item);
          const id = asString(record.id) || "unknown";
          const label = asString(record.label) || id;
          return { id, label };
        })
        .filter((item) => item.label)
    : [];
}

function normalizeCoordinatorSummary(result: Record<string, unknown>) {
  const summary = asRecord(result.coordinatorSummary);
  const todayInSchoolActions = asStringArray(result.todayInSchoolActions, 8);
  const tonightAtHomeActions = asStringArray(result.tonightAtHomeActions, 8);
  const nextCheckpoints = asStringArray(
    summary.observationPoints ?? result.observationPoints ?? result.nextCheckpoints,
    8
  );
  const reviewIn48h =
    asString(summary.reviewIn48h) ||
    asString(result.reviewIn48h) ||
    asStringArray(result.followUp48h, 1)[0] ||
    "";
  const shouldEscalateToAdmin =
    typeof summary.shouldEscalateToAdmin === "boolean"
      ? Boolean(summary.shouldEscalateToAdmin)
      : asBoolean(result.shouldEscalateToAdmin);

  return {
    finalConclusion:
      asString(summary.finalConclusion) || asString(result.summary) || "",
    riskLevel: asString(summary.riskLevel) || asString(result.riskLevel) || "medium",
    problemDefinition:
      asString(summary.problemDefinition) ||
      asStringArray(result.keyFindings, 1)[0] ||
      asString(result.summary),
    schoolAction:
      asString(summary.schoolAction) ||
      todayInSchoolActions[0] ||
      asString(result.schoolAction) ||
      "\u4eca\u5929\u5148\u8865\u9f50\u56ed\u5185\u89c2\u5bdf\u8bb0\u5f55\u3002",
    homeAction:
      asString(summary.homeAction) ||
      tonightAtHomeActions[0] ||
      asString(result.homeAction) ||
      "\u4eca\u665a\u5f62\u6210\u4e00\u6761\u660e\u786e\u7684\u5bb6\u5ead\u53cd\u9988\u3002",
    observationPoints: nextCheckpoints,
    reviewIn48h,
    shouldEscalateToAdmin,
  };
}

function normalizeDirectorDecisionCard(
  result: Record<string, unknown>,
  shouldEscalateToAdmin: boolean
) {
  const record = asRecord(result.directorDecisionCard);
  const recommendedOwnerRole =
    asString(record.recommendedOwnerRole) || (shouldEscalateToAdmin ? "admin" : "teacher");
  const recommendedOwnerName =
    asString(record.recommendedOwnerName) ||
    (recommendedOwnerRole === "admin" ? "\u56ed\u957f" : "\u73ed\u7ea7\u8001\u5e08");

  return {
    title: asString(record.title) || "\u56ed\u957f\u51b3\u7b56\u5361",
    reason:
      asString(record.reason) ||
      asString(asRecord(result.coordinatorSummary).problemDefinition) ||
      asString(result.summary) ||
      "\u5f53\u524d\u9ad8\u98ce\u9669\u4f1a\u8bca\u9700\u8981\u7ee7\u7eed\u63a8\u8fdb\u95ed\u73af\u52a8\u4f5c\u3002",
    recommendedOwnerRole,
    recommendedOwnerName,
    recommendedAt: asString(record.recommendedAt) || "today",
    status: asString(record.status) || "pending",
  };
}

function normalizeExplainability(
  result: Record<string, unknown>,
  participants: Array<{ id: string; label: string }>,
  keyFindings: string[],
  coordinationConclusion: string
) {
  const participantLabels = uniqueStrings(
    participants.map((item) => item.label),
    8
  );
  const canonical = [
    {
      label: "Agent \u53c2\u4e0e",
      detail:
        participantLabels.join("\u3001") ||
        "\u9ad8\u98ce\u9669\u4f1a\u8bca\u4e3b\u94fe\u5df2\u53c2\u4e0e\u534f\u540c\u3002",
    },
    {
      label: "\u5173\u952e\u53d1\u73b0",
      detail:
        keyFindings.slice(0, 3).join("\u3001") ||
        "\u5f53\u524d\u9700\u8981\u56f4\u7ed5\u98ce\u9669\u4fe1\u53f7\u7ee7\u7eed\u4fdd\u7559\u95ed\u73af\u89c2\u5bdf\u3002",
    },
    {
      label: "\u534f\u8c03\u7ed3\u8bba",
      detail: coordinationConclusion || asString(result.summary),
    },
  ];

  const seen = new Set(canonical.map((item) => `${item.label}:${item.detail}`));
  const extras = Array.isArray(result.explainability)
    ? result.explainability
        .map((item) => {
          const record = asRecord(item);
          return {
            label: asString(record.label) || "\u8bf4\u660e",
            detail: asString(record.detail),
          };
        })
        .filter((item) => {
          if (!item.detail) return false;
          const key = `${item.label}:${item.detail}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
    : [];

  return [...canonical, ...extras];
}

function validateNormalizedResult(result: Record<string, unknown>) {
  const issues: string[] = [];

  [
    "consultationId",
    "childId",
    "generatedAt",
    "riskLevel",
    "source",
    "summary",
    "parentMessageDraft",
    "reviewIn48h",
  ].forEach((key) => {
    if (!asString(result[key])) issues.push(key);
  });

  [
    "triggerReasons",
    "keyFindings",
    "todayInSchoolActions",
    "tonightAtHomeActions",
    "followUp48h",
    "nextCheckpoints",
    "explainability",
    "evidenceItems",
  ].forEach((key) => {
    if (!Array.isArray(result[key])) issues.push(key);
  });

  [
    "providerTrace",
    "memoryMeta",
    "traceMeta",
    "coordinatorSummary",
    "directorDecisionCard",
    "interventionCard",
  ].forEach((key) => {
    if (Object.keys(asRecord(result[key])).length === 0) issues.push(key);
  });

  if (typeof result.shouldEscalateToAdmin !== "boolean") {
    issues.push("shouldEscalateToAdmin");
  }
  if (Object.keys(asRecord(asRecord(result.traceMeta).memory)).length === 0) {
    issues.push("traceMeta.memory");
  }

  if (issues.length > 0) {
    throw new Error(`normalized consultation result missing required fields: ${issues.join(", ")}`);
  }
}

export function normalizeHighRiskConsultationResult(
  rawResult: Record<string, unknown>,
  options: NormalizationOptions = {}
) {
  const result = { ...rawResult };
  const participants = normalizeParticipants(result.participants);
  const triggerReasons = asStringArray(result.triggerReasons, 12);
  const keyFindings = asStringArray(result.keyFindings, 12);
  const todayInSchoolActions = asStringArray(result.todayInSchoolActions, 12);
  const tonightAtHomeActions = asStringArray(result.tonightAtHomeActions, 12);
  const followUp48h = asStringArray(result.followUp48h, 12);
  const nextCheckpoints = asStringArray(result.nextCheckpoints, 12);
  const continuityNotes = asStringArray(result.continuityNotes, 12);
  const traceMeta = asRecord(result.traceMeta);
  const providerTrace = normalizeProviderTrace(result, options);
  const memoryMeta = normalizeMemoryMeta(result.memoryMeta, asRecord(traceMeta.memory));
  const coordinatorSummary = normalizeCoordinatorSummary(result);
  const directorDecisionCard = normalizeDirectorDecisionCard(
    result,
    coordinatorSummary.shouldEscalateToAdmin
  );
  const explainability = normalizeExplainability(
    result,
    participants,
    keyFindings,
    coordinatorSummary.finalConclusion
  );
  const evidenceItems = buildConsultationEvidenceItems({
    consultationId: asString(result.consultationId),
    generatedAt: asString(result.generatedAt),
    keyFindings,
    triggerReasons,
    todayInSchoolActions,
    tonightAtHomeActions,
    followUp48h,
    explainability,
    continuityNotes,
    memoryMeta,
    providerTrace,
    multimodalNotes: asRecord(result.multimodalNotes),
    rawEvidenceItems: result.evidenceItems,
  });

  const normalized: Record<string, unknown> = {
    ...result,
    consultationId: asString(result.consultationId),
    childId: asString(result.childId),
    generatedAt: asString(result.generatedAt),
    riskLevel: asString(result.riskLevel) || "medium",
    source: asString(result.source) || String(providerTrace.source ?? "fallback"),
    provider: String(providerTrace.provider ?? asString(result.provider)),
    model: String(providerTrace.model ?? asString(result.model)),
    realProvider: Boolean(providerTrace.realProvider),
    fallback: Boolean(providerTrace.fallback),
    triggerReason: asString(result.triggerReason) || triggerReasons[0] || "",
    triggerReasons,
    keyFindings,
    todayInSchoolActions,
    tonightAtHomeActions,
    followUp48h,
    nextCheckpoints,
    continuityNotes,
    evidenceItems,
    participants,
    shouldEscalateToAdmin: coordinatorSummary.shouldEscalateToAdmin,
    coordinatorSummary,
    directorDecisionCard,
    providerTrace,
    memoryMeta,
    traceMeta: {
      ...traceMeta,
      provider: providerTrace.provider,
      source: providerTrace.source,
      model: providerTrace.model,
      requestId: providerTrace.requestId,
      transport: providerTrace.transport,
      transportSource: providerTrace.transportSource,
      consultationSource: providerTrace.consultationSource,
      fallbackReason: providerTrace.fallbackReason,
      brainProvider: providerTrace.brainProvider,
      fallback: providerTrace.fallback,
      realProvider: providerTrace.realProvider,
      memory: memoryMeta,
      agentParticipants: participants.map((item) => item.label),
      coordinationConclusion: coordinatorSummary.finalConclusion,
      keyFindings,
      evidenceCount: evidenceItems.length,
    },
    explainability,
    reviewIn48h:
      asString(result.reviewIn48h) ||
      String(coordinatorSummary.reviewIn48h ?? "") ||
      followUp48h[0] ||
      "",
    parentMessageDraft: asString(result.parentMessageDraft),
  };

  validateNormalizedResult(normalized);
  return normalized as HighRiskConsultationResult & Record<string, unknown>;
}
