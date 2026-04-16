import type { AccountRole } from "@/lib/auth/accounts";
import type {
  GuardianFeedback,
  LegacyGuardianFeedbackSourceWorkflow,
  ParentFeedbackAttachmentRef,
  ParentFeedbackAttachments,
  ParentFeedbackChildReaction,
  ParentFeedbackExecutionStatus,
  ParentFeedbackExecutorRole,
  ParentFeedbackImprovementStatus,
  ParentStructuredFeedbackLite,
  ParentStructuredFeedbackRecord,
  ParentStructuredFeedbackSource,
  ParentStructuredFeedbackSourceRole,
} from "@/lib/feedback/types";
import type { TaskEscalationFeedbackSignal } from "@/lib/tasks/types";

const EXECUTION_STATUSES = new Set<ParentFeedbackExecutionStatus>([
  "not_started",
  "partial",
  "completed",
  "unable_to_execute",
]);
const EXECUTOR_ROLES = new Set<ParentFeedbackExecutorRole>([
  "parent",
  "grandparent",
  "caregiver",
  "teacher",
  "mixed",
]);
const CHILD_REACTIONS = new Set<ParentFeedbackChildReaction>([
  "resisted",
  "neutral",
  "accepted",
  "improved",
]);
const IMPROVEMENT_STATUSES = new Set<ParentFeedbackImprovementStatus>([
  "no_change",
  "slight_improvement",
  "clear_improvement",
  "worse",
  "unknown",
]);
const SOURCE_ROLES = new Set<ParentStructuredFeedbackSourceRole>([
  "parent",
  "teacher",
  "admin",
  "system",
  "unknown",
]);
const LEGACY_WORKFLOWS = new Set<LegacyGuardianFeedbackSourceWorkflow>([
  "parent-agent",
  "teacher-agent",
  "manual",
]);

export interface NormalizeParentStructuredFeedbackOptions {
  feedbackId?: string;
  createdBy?: string;
  createdByRole?: AccountRole;
  sourceRole?: ParentStructuredFeedbackSourceRole;
  sourceChannel?: string;
  submittedAt?: string;
  allowGenerateId?: boolean;
}

export interface NormalizeGuardianFeedbackCollectionOptions
  extends NormalizeParentStructuredFeedbackOptions {
  strict?: boolean;
}

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringOrUndefined(value: unknown) {
  const normalized = asTrimmedString(value);
  return normalized.length > 0 ? normalized : undefined;
}

function asPositiveInteger(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed);
    }
  }

  return undefined;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of value) {
    const normalized = asTrimmedString(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function normalizeAttachmentRefs(value: unknown) {
  const rawItems = Array.isArray(value) ? value : value ? [value] : [];
  const items: ParentFeedbackAttachmentRef[] = [];

  for (const item of rawItems) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const url = asStringOrUndefined(record.url);
    const name = asStringOrUndefined(record.name);
    const mimeType = asStringOrUndefined(record.mimeType);
    const sizeBytes =
      typeof record.sizeBytes === "number" && Number.isFinite(record.sizeBytes)
        ? record.sizeBytes
        : undefined;
    const meta =
      record.meta && typeof record.meta === "object" && !Array.isArray(record.meta)
        ? (record.meta as Record<string, unknown>)
        : undefined;

    if (!url && !name && !mimeType && !meta) continue;
    items.push({
      url,
      name,
      mimeType,
      sizeBytes,
      meta,
    });
  }

  return items;
}

function normalizeAttachments(value: unknown): ParentFeedbackAttachments {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  const voice = normalizeAttachmentRefs(record.voice);
  const image = normalizeAttachmentRefs(record.image);

  return {
    ...(voice.length > 0 ? { voice } : {}),
    ...(image.length > 0 ? { image } : {}),
  };
}

function generateFeedbackId(prefix = "feedback") {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function coerceSourceRoleFromLegacyRole(value: unknown): ParentStructuredFeedbackSourceRole {
  const normalized = asTrimmedString(value).toLowerCase();
  if (!normalized) return "unknown";
  if (SOURCE_ROLES.has(normalized as ParentStructuredFeedbackSourceRole)) {
    return normalized as ParentStructuredFeedbackSourceRole;
  }
  if (normalized.includes("parent") || normalized === "瀹堕暱") return "parent";
  if (normalized.includes("teacher") || normalized === "鏁欏笀") return "teacher";
  if (normalized.includes("admin") || normalized.includes("director") || normalized === "鏈烘瀯绠＄悊鍛?") {
    return "admin";
  }
  return "unknown";
}

function normalizeSourceRole(
  value: unknown,
  createdByRole: unknown,
  sourceWorkflow: unknown
): ParentStructuredFeedbackSourceRole {
  const direct = asTrimmedString(value).toLowerCase();
  if (SOURCE_ROLES.has(direct as ParentStructuredFeedbackSourceRole)) {
    return direct as ParentStructuredFeedbackSourceRole;
  }

  const workflow = asTrimmedString(sourceWorkflow).toLowerCase();
  if (workflow === "parent-agent") return "parent";
  if (workflow === "teacher-agent") return "teacher";

  return coerceSourceRoleFromLegacyRole(createdByRole);
}

function normalizeSourceChannel(value: unknown, sourceWorkflow: unknown) {
  return (
    asStringOrUndefined(value) ??
    asStringOrUndefined(sourceWorkflow) ??
    "manual"
  );
}

function normalizeLegacyWorkflow(
  value: unknown
): LegacyGuardianFeedbackSourceWorkflow | undefined {
  const normalized = asTrimmedString(value);
  if (LEGACY_WORKFLOWS.has(normalized as LegacyGuardianFeedbackSourceWorkflow)) {
    return normalized as LegacyGuardianFeedbackSourceWorkflow;
  }
  return undefined;
}

function normalizeExecutionStatus(
  value: unknown,
  executed: unknown
): ParentFeedbackExecutionStatus {
  const normalized = asTrimmedString(value).toLowerCase();
  if (EXECUTION_STATUSES.has(normalized as ParentFeedbackExecutionStatus)) {
    return normalized as ParentFeedbackExecutionStatus;
  }
  if (executed === true) return "completed";
  return "not_started";
}

function normalizeExecutorRole(
  value: unknown,
  sourceRole: ParentStructuredFeedbackSourceRole
): ParentFeedbackExecutorRole {
  const normalized = asTrimmedString(value).toLowerCase();
  if (EXECUTOR_ROLES.has(normalized as ParentFeedbackExecutorRole)) {
    return normalized as ParentFeedbackExecutorRole;
  }
  if (sourceRole === "teacher") return "teacher";
  if (sourceRole === "parent") return "parent";
  return "mixed";
}

function normalizeChildReaction(
  value: unknown,
  improvementStatus: ParentFeedbackImprovementStatus
): ParentFeedbackChildReaction {
  const normalized = asTrimmedString(value).toLowerCase();
  if (CHILD_REACTIONS.has(normalized as ParentFeedbackChildReaction)) {
    return normalized as ParentFeedbackChildReaction;
  }
  if (
    normalized.includes("resist") ||
    normalized.includes("cry") ||
    normalized.includes("拒") ||
    normalized.includes("哭")
  ) {
    return "resisted";
  }
  if (
    normalized.includes("accept") ||
    normalized.includes("cooperate") ||
    normalized.includes("配合")
  ) {
    return "accepted";
  }
  if (
    normalized.includes("improve") ||
    normalized.includes("better") ||
    normalized.includes("好转") ||
    improvementStatus === "clear_improvement" ||
    improvementStatus === "slight_improvement"
  ) {
    return "improved";
  }
  return "neutral";
}

function normalizeImprovementStatus(value: unknown): ParentFeedbackImprovementStatus {
  if (typeof value === "boolean") {
    return value ? "clear_improvement" : "no_change";
  }

  const normalized = asTrimmedString(value).toLowerCase();
  if (IMPROVEMENT_STATUSES.has(normalized as ParentFeedbackImprovementStatus)) {
    return normalized as ParentFeedbackImprovementStatus;
  }
  if (normalized === "unknown") return "unknown";
  if (normalized === "partial" || normalized === "slight" || normalized === "slight_improvement") {
    return "slight_improvement";
  }
  if (normalized === "yes" || normalized === "clear" || normalized === "clear_improvement") {
    return "clear_improvement";
  }
  if (normalized === "worse") return "worse";
  if (normalized === "no" || normalized === "false" || normalized === "no_change") {
    return "no_change";
  }
  return "unknown";
}

function normalizeSourceObject(
  value: unknown,
  defaults: {
    kind: ParentStructuredFeedbackSource["kind"];
    workflow?: string;
    createdBy?: string;
    createdByRole?: AccountRole;
  }
): ParentStructuredFeedbackSource {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      kind: defaults.kind,
      workflow: defaults.workflow,
      createdBy: defaults.createdBy,
      createdByRole: defaults.createdByRole,
    };
  }

  const record = value as Record<string, unknown>;
  const kind = asTrimmedString(record.kind);
  const normalizedKind =
    kind === "structured" || kind === "legacy_guardian_feedback"
      ? kind
      : defaults.kind;

  return {
    kind: normalizedKind,
    workflow: asStringOrUndefined(record.workflow) ?? defaults.workflow,
    createdBy: asStringOrUndefined(record.createdBy) ?? defaults.createdBy,
    createdByRole:
      (record.createdByRole as AccountRole | undefined) ?? defaults.createdByRole,
    traceId: asStringOrUndefined(record.traceId),
    meta:
      record.meta && typeof record.meta === "object" && !Array.isArray(record.meta)
        ? (record.meta as Record<string, unknown>)
        : undefined,
  };
}

function mapImprovementStatusToLegacy(
  value: ParentFeedbackImprovementStatus
): boolean | "unknown" {
  if (value === "clear_improvement" || value === "slight_improvement") return true;
  if (value === "no_change" || value === "worse") return false;
  return "unknown";
}

function mapExecutionStatusToLegacyExecuted(
  value: ParentFeedbackExecutionStatus,
  explicitExecuted: unknown
) {
  if (typeof explicitExecuted === "boolean") return explicitExecuted;
  if (value === "completed" || value === "partial") return true;
  return false;
}

function buildLegacyStatus(
  explicitStatus: unknown,
  executionStatus: ParentFeedbackExecutionStatus
) {
  return (
    asStringOrUndefined(explicitStatus) ??
    (executionStatus === "completed"
      ? "completed"
      : executionStatus === "partial"
        ? "partial"
        : executionStatus === "unable_to_execute"
          ? "unable_to_execute"
          : "not_started")
  );
}

function buildNotes(
  notes: unknown,
  freeNote: unknown,
  content: unknown
) {
  return (
    asStringOrUndefined(notes) ??
    asStringOrUndefined(freeNote) ??
    asStringOrUndefined(content) ??
    ""
  );
}

function buildLegacyContent(params: {
  explicitContent: unknown;
  notes: string;
  barriers: string[];
  childReaction: ParentFeedbackChildReaction;
  improvementStatus: ParentFeedbackImprovementStatus;
  executionStatus: ParentFeedbackExecutionStatus;
}) {
  const explicit = asStringOrUndefined(params.explicitContent);
  if (explicit) return explicit;

  const parts = [
    params.notes,
    params.barriers.length > 0 ? `Barriers: ${params.barriers.join("; ")}` : undefined,
    params.childReaction !== "neutral"
      ? `Child reaction: ${params.childReaction}`
      : undefined,
    params.improvementStatus !== "unknown"
      ? `Improvement: ${params.improvementStatus}`
      : undefined,
    `Execution: ${params.executionStatus}`,
  ].filter((item): item is string => Boolean(item));

  return parts.join(" | ") || "Parent feedback recorded.";
}

function buildLegacyFreeNote(
  explicitFreeNote: unknown,
  notes: string,
  barriers: string[]
) {
  const explicit = asStringOrUndefined(explicitFreeNote);
  if (explicit) return explicit;

  const parts = [
    notes || undefined,
    barriers.length > 0 ? `Barriers: ${barriers.join("; ")}` : undefined,
  ].filter((item): item is string => Boolean(item));

  return parts.join(" | ") || undefined;
}

function feedbackScore(record: ParentStructuredFeedbackRecord) {
  return [
    record.relatedTaskId,
    record.relatedConsultationId,
    record.executionCount,
    record.barriers.length > 0 ? "barriers" : "",
    record.notes,
    record.attachments.voice?.length ? "voice" : "",
    record.attachments.image?.length ? "image" : "",
    record.sourceChannel,
  ].filter(Boolean).length;
}

function dedupeFeedbacks(records: ParentStructuredFeedbackRecord[]) {
  const seen = new Map<string, ParentStructuredFeedbackRecord>();
  for (const record of records) {
    const key =
      record.feedbackId ||
      record.id ||
      [record.childId, record.submittedAt, record.content].join(":");
    const existing = seen.get(key);
    if (!existing || feedbackScore(record) > feedbackScore(existing)) {
      seen.set(key, record);
    }
  }
  return Array.from(seen.values());
}

export function normalizeParentStructuredFeedback(
  value: unknown,
  options: NormalizeParentStructuredFeedbackOptions = {}
): ParentStructuredFeedbackRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const feedbackId =
    asStringOrUndefined(record.feedbackId) ??
    asStringOrUndefined(record.id) ??
    options.feedbackId ??
    (options.allowGenerateId === false ? undefined : generateFeedbackId());
  const childId = asStringOrUndefined(record.childId);

  if (!feedbackId || !childId) {
    return null;
  }

  const createdBy = asStringOrUndefined(record.createdBy) ?? options.createdBy ?? "Unknown";
  const createdByRole =
    (record.createdByRole as AccountRole | undefined) ??
    options.createdByRole ??
    ("瀹堕暱" as AccountRole);
  const sourceRole =
    options.sourceRole ??
    normalizeSourceRole(record.sourceRole, createdByRole, record.sourceWorkflow);
  const sourceChannel = normalizeSourceChannel(
    record.sourceChannel ?? options.sourceChannel,
    record.sourceWorkflow
  );
  const executionStatus = normalizeExecutionStatus(
    record.executionStatus,
    record.executed
  );
  const improvementStatus = normalizeImprovementStatus(
    record.improvementStatus ?? record.improved
  );
  const childReaction = normalizeChildReaction(
    record.childReaction,
    improvementStatus
  );
  const notes = buildNotes(record.notes, record.freeNote, record.content);
  const barriers = asStringArray(record.barriers);
  const attachments = normalizeAttachments(record.attachments);
  const submittedAt =
    asStringOrUndefined(record.submittedAt) ??
    asStringOrUndefined(record.date) ??
    options.submittedAt ??
    new Date().toISOString();
  const executorRole = normalizeExecutorRole(record.executorRole, sourceRole);
  const executionCount = asPositiveInteger(record.executionCount);
  const relatedTaskId =
    asStringOrUndefined(record.relatedTaskId) ??
    asStringOrUndefined(record.interventionCardId);
  const relatedConsultationId =
    asStringOrUndefined(record.relatedConsultationId) ??
    asStringOrUndefined(record.consultationId);
  const source = normalizeSourceObject(record.source, {
    kind: record.feedbackId ? "structured" : "legacy_guardian_feedback",
    workflow: normalizeLegacyWorkflow(sourceChannel) ?? sourceChannel,
    createdBy,
    createdByRole,
  });
  const fallback =
    record.fallback && typeof record.fallback === "object" && !Array.isArray(record.fallback)
      ? ({
          rawStatus:
            asStringOrUndefined((record.fallback as Record<string, unknown>).rawStatus) ??
            asStringOrUndefined(record.status),
          rawChildReaction:
            asStringOrUndefined((record.fallback as Record<string, unknown>).rawChildReaction) ??
            asStringOrUndefined(record.childReaction),
          rawImproved:
            ((record.fallback as Record<string, unknown>).rawImproved as
              | boolean
              | string
              | undefined) ??
            ((typeof record.improved === "boolean" || typeof record.improved === "string")
              ? (record.improved as boolean | string)
              : undefined),
          rawExecutionStatus:
            asStringOrUndefined(
              (record.fallback as Record<string, unknown>).rawExecutionStatus
            ) ?? asStringOrUndefined(record.executionStatus),
          rawInterventionCardId:
            asStringOrUndefined(
              (record.fallback as Record<string, unknown>).rawInterventionCardId
            ) ?? asStringOrUndefined(record.interventionCardId),
          rawSourceWorkflow:
            asStringOrUndefined(
              (record.fallback as Record<string, unknown>).rawSourceWorkflow
            ) ?? asStringOrUndefined(record.sourceWorkflow),
          notesSummary:
            asStringOrUndefined(
              (record.fallback as Record<string, unknown>).notesSummary
            ) ?? (notes ? notes.slice(0, 160) : undefined),
        })
      : {
          rawStatus: asStringOrUndefined(record.status),
          rawChildReaction: asStringOrUndefined(record.childReaction),
          rawImproved:
            typeof record.improved === "boolean" || typeof record.improved === "string"
              ? (record.improved as boolean | string)
              : undefined,
          rawExecutionStatus: asStringOrUndefined(record.executionStatus),
          rawInterventionCardId: asStringOrUndefined(record.interventionCardId),
          rawSourceWorkflow: asStringOrUndefined(record.sourceWorkflow),
          notesSummary: notes ? notes.slice(0, 160) : undefined,
        };

  const legacyStatus = buildLegacyStatus(record.status, executionStatus);
  const legacyContent = buildLegacyContent({
    explicitContent: record.content,
    notes,
    barriers,
    childReaction,
    improvementStatus,
    executionStatus,
  });
  const legacyFreeNote = buildLegacyFreeNote(record.freeNote, notes, barriers);
  const legacyImproved =
    typeof record.improved === "boolean" || record.improved === "unknown"
      ? (record.improved as boolean | "unknown")
      : mapImprovementStatusToLegacy(improvementStatus);

  return {
    feedbackId,
    childId,
    sourceRole,
    sourceChannel,
    relatedTaskId,
    relatedConsultationId,
    executionStatus,
    executionCount,
    executorRole,
    childReaction,
    improvementStatus,
    barriers,
    notes,
    attachments,
    submittedAt,
    source,
    fallback,
    id: feedbackId,
    date: asStringOrUndefined(record.date) ?? submittedAt,
    status: legacyStatus,
    content: legacyContent,
    interventionCardId: relatedTaskId,
    sourceWorkflow:
      normalizeLegacyWorkflow(record.sourceWorkflow) ??
      normalizeLegacyWorkflow(sourceChannel),
    executed: mapExecutionStatusToLegacyExecuted(executionStatus, record.executed),
    improved: legacyImproved,
    freeNote: legacyFreeNote,
    createdBy,
    createdByRole,
  };
}

export function normalizeGuardianFeedbackCollection(
  value: unknown,
  options: NormalizeGuardianFeedbackCollectionOptions = {}
): GuardianFeedback[] | null {
  if (!Array.isArray(value)) {
    return options.strict ? null : [];
  }

  const records: GuardianFeedback[] = [];
  for (const item of value) {
    const normalized = normalizeParentStructuredFeedback(item, options);
    if (!normalized) {
      if (options.strict) return null;
      continue;
    }
    records.push(normalized);
  }

  return dedupeFeedbacks(records);
}

export function toLegacyGuardianFeedbackMirror(
  value: unknown,
  options?: NormalizeParentStructuredFeedbackOptions
): GuardianFeedback | null {
  return normalizeParentStructuredFeedback(value, options);
}

export function toFollowUpFeedbackLite(
  value: unknown,
  options?: NormalizeParentStructuredFeedbackOptions
): ParentStructuredFeedbackLite | null {
  const normalized = normalizeParentStructuredFeedback(value, options);
  if (!normalized) return null;

  return {
    feedbackId: normalized.feedbackId,
    childId: normalized.childId,
    sourceRole: normalized.sourceRole,
    sourceChannel: normalized.sourceChannel,
    relatedTaskId: normalized.relatedTaskId,
    relatedConsultationId: normalized.relatedConsultationId,
    executionStatus: normalized.executionStatus,
    executionCount: normalized.executionCount,
    executorRole: normalized.executorRole,
    childReaction: normalized.childReaction,
    improvementStatus: normalized.improvementStatus,
    barriers: normalized.barriers,
    notes: normalized.notes,
    attachments: normalized.attachments,
    submittedAt: normalized.submittedAt,
    source: normalized.source,
    fallback: normalized.fallback,
    id: normalized.id,
    date: normalized.date,
    status: normalized.status,
    content: normalized.content,
    interventionCardId: normalized.interventionCardId,
    sourceWorkflow: normalized.sourceWorkflow,
    executed: normalized.executed,
    improved: normalized.improved,
    freeNote: normalized.freeNote,
  };
}

export function toTaskFeedbackSignal(
  value: unknown,
  options?: NormalizeParentStructuredFeedbackOptions
): TaskEscalationFeedbackSignal | null {
  const normalized = normalizeParentStructuredFeedback(value, options);
  if (!normalized) return null;

  return {
    feedbackId: normalized.feedbackId,
    childId: normalized.childId,
    date: normalized.date,
    submittedAt: normalized.submittedAt,
    interventionCardId: normalized.interventionCardId,
    relatedTaskId: normalized.relatedTaskId,
    relatedConsultationId: normalized.relatedConsultationId,
    status: normalized.status,
    content: normalized.content,
    executionStatus: normalized.executionStatus,
    executionCount: normalized.executionCount,
    executed: normalized.executed,
    executorRole: normalized.executorRole,
    childReaction: normalized.childReaction,
    improved: normalized.improved,
    improvementStatus: normalized.improvementStatus,
    freeNote: normalized.freeNote,
    notes: normalized.notes,
    barriers: normalized.barriers,
    sourceChannel: normalized.sourceChannel,
    sourceRole: normalized.sourceRole,
  };
}
