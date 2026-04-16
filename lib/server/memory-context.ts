import type {
  MemoryContextEnvelope,
  MemoryContextMeta,
  MemoryContextProfileRecord,
  MemoryContextSnapshotRecord,
  MemoryContextTraceRecord,
  PromptMemoryContext,
} from "@/lib/ai/types";
import { getBrainBaseUrl } from "@/lib/server/brain-client";
import { createEmptyMemoryContextEnvelope, createEmptyMemoryMeta, createEmptyPromptMemoryContext } from "@/lib/memory/prompt-context";

interface BuildMemoryContextParams {
  childId: string;
  workflowType: string;
  query?: string;
  limit?: number;
  topK?: number;
  sessionId?: string;
  request?: Request;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => asString(item).trim()).filter(Boolean) : [];
}

function normalizePromptContext(value: unknown): PromptMemoryContext {
  if (!value || typeof value !== "object") return createEmptyPromptMemoryContext();
  const record = value as Record<string, unknown>;
  return {
    longTermTraits: asStringArray(record.long_term_traits),
    recentContinuitySignals: asStringArray(record.recent_continuity_signals),
    lastConsultationTakeaways: asStringArray(record.last_consultation_takeaways),
    openLoops: asStringArray(record.open_loops),
  };
}

function normalizeMeta(value: unknown): MemoryContextMeta {
  if (!value || typeof value !== "object") return createEmptyMemoryMeta();
  const record = value as Record<string, unknown>;
  return createEmptyMemoryMeta({
    backend: asString(record.backend) || "unknown",
    degraded: Boolean(record.degraded),
    usedSources: asStringArray(record.used_sources),
    errors: asStringArray(record.errors),
    matchedSnapshotIds: asStringArray(record.matched_snapshot_ids),
    matchedTraceIds: asStringArray(record.matched_trace_ids),
  });
}

function normalizeSnapshotRecord(value: unknown): MemoryContextSnapshotRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return {
    id: asString(record.id),
    childId: asString(record.child_id) || undefined,
    sessionId: asString(record.session_id) || undefined,
    snapshotType: asString(record.snapshot_type),
    inputSummary: asString(record.input_summary) || undefined,
    snapshotJson:
      record.snapshot_json && typeof record.snapshot_json === "object"
        ? (record.snapshot_json as Record<string, unknown>)
        : {},
    createdAt: asString(record.created_at) || undefined,
  };
}

function normalizeTraceRecord(value: unknown): MemoryContextTraceRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return {
    id: asString(record.id),
    traceId: asString(record.trace_id),
    childId: asString(record.child_id) || undefined,
    sessionId: asString(record.session_id) || undefined,
    nodeName: asString(record.node_name),
    actionType: asString(record.action_type),
    inputSummary: asString(record.input_summary) || undefined,
    outputSummary: asString(record.output_summary) || undefined,
    status: asString(record.status),
    metadataJson:
      record.metadata_json && typeof record.metadata_json === "object"
        ? (record.metadata_json as Record<string, unknown>)
        : undefined,
    createdAt: asString(record.created_at) || undefined,
  };
}

function normalizeChildProfile(value: unknown): MemoryContextProfileRecord | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return {
    id: asString(record.id),
    childId: asString(record.child_id),
    profileJson:
      record.profile_json && typeof record.profile_json === "object"
        ? (record.profile_json as Record<string, unknown>)
        : {},
    source: asString(record.source) || undefined,
    version: typeof record.version === "number" ? record.version : undefined,
    createdAt: asString(record.created_at) || undefined,
    updatedAt: asString(record.updated_at) || undefined,
  };
}

function buildHeaders(request?: Request) {
  const headers = new Headers({ "content-type": "application/json" });
  if (!request) return headers;

  for (const key of ["x-request-id", "x-correlation-id", "x-trace-id", "x-debug-memory"]) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }

  return headers;
}

function normalizeEnvelope(
  childId: string,
  workflowType: string,
  value: unknown,
  fallbackError?: string
): MemoryContextEnvelope {
  if (!value || typeof value !== "object") {
    return {
      ...createEmptyMemoryContextEnvelope(childId, workflowType),
      meta: createEmptyMemoryMeta({
        backend: "none",
        degraded: Boolean(fallbackError),
        errors: fallbackError ? [fallbackError] : [],
      }),
    };
  }

  const record = value as Record<string, unknown>;
  return {
    childId: asString(record.child_id) || childId,
    workflowType: asString(record.workflow_type) || workflowType,
    childProfile: normalizeChildProfile(record.child_profile),
    recentSnapshots: Array.isArray(record.recent_snapshots)
      ? record.recent_snapshots.map(normalizeSnapshotRecord).filter((item): item is MemoryContextSnapshotRecord => Boolean(item))
      : [],
    recentConsultations: Array.isArray(record.recent_consultations)
      ? record.recent_consultations
          .map(normalizeSnapshotRecord)
          .filter((item): item is MemoryContextSnapshotRecord => Boolean(item))
      : [],
    relevantTraces: Array.isArray(record.relevant_traces)
      ? record.relevant_traces.map(normalizeTraceRecord).filter((item): item is MemoryContextTraceRecord => Boolean(item))
      : [],
    promptContext: normalizePromptContext(record.prompt_context),
    meta: normalizeMeta(record.meta),
  };
}

export async function buildMemoryContextForPrompt(
  params: BuildMemoryContextParams
): Promise<MemoryContextEnvelope> {
  const baseUrl = getBrainBaseUrl();
  if (!baseUrl) {
    return {
      ...createEmptyMemoryContextEnvelope(params.childId, params.workflowType),
      meta: createEmptyMemoryMeta({
        backend: "next-fallback",
        degraded: true,
        errors: ["BRAIN_API_BASE_URL is not configured"],
      }),
    };
  }

  try {
    const response = await fetch(`${baseUrl}/api/v1/memory/context`, {
      method: "POST",
      headers: buildHeaders(params.request),
      cache: "no-store",
      body: JSON.stringify({
        child_id: params.childId,
        workflow_type: params.workflowType,
        options: {
          query: params.query,
          limit: params.limit,
          top_k: params.topK,
          session_id: params.sessionId,
        },
      }),
    });

    if (!response.ok) {
      return normalizeEnvelope(
        params.childId,
        params.workflowType,
        null,
        `Memory endpoint returned ${response.status}`
      );
    }

    const raw = (await response.json()) as unknown;
    return normalizeEnvelope(params.childId, params.workflowType, raw);
  } catch (error) {
    return normalizeEnvelope(
      params.childId,
      params.workflowType,
      null,
      error instanceof Error ? error.message : "Unknown memory fetch error"
    );
  }
}
