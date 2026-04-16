import type { MobileDraft, MobileDraftType } from "@/lib/ai/types";
import type {
  TeacherVoiceDraftItem,
  TeacherVoiceUnderstandResponse,
} from "@/lib/ai/teacher-voice-understand";
import type { TeacherCopilotPayload } from "@/lib/teacher-copilot/types";

export type DraftRecordStatus = "pending" | "confirmed" | "discarded";
export type TeacherDraftPersistStatus = "saved" | "local_only" | "failed";
export type TeacherDraftRecordAction = "seed" | "edit" | "confirm" | "discard";

export interface TeacherDraftUnderstandingSeed {
  transcript: string;
  router_result: TeacherVoiceUnderstandResponse["router_result"] | null;
  draft_items: TeacherVoiceUnderstandResponse["draft_items"];
  warnings: string[];
  copilot?: TeacherCopilotPayload | Record<string, unknown> | null;
  recordCompletionHints?: TeacherCopilotPayload["recordCompletionHints"];
  microTrainingSOP?: TeacherCopilotPayload["microTrainingSOP"];
  parentCommunicationScript?: TeacherCopilotPayload["parentCommunicationScript"];
}

export interface TeacherDraftRecord {
  recordId: string;
  childId?: string;
  childName?: string;
  category: TeacherVoiceDraftItem["category"];
  summary: string;
  rawExcerpt: string;
  confidence: number;
  structuredFields: Record<string, unknown>;
  suggestedActions: string[];
  warnings: string[];
  status: DraftRecordStatus;
  editedSummary?: string;
  editedStructuredFields?: Record<string, unknown>;
  lastAction?: TeacherDraftRecordAction;
  persistStatus?: TeacherDraftPersistStatus;
  persistMessage?: string;
  persistError?: string;
  lastPersistedAt?: string;
  lastPersistAttemptAt?: string;
  updatedAt: string;
}

export interface TeacherDraftConfirmationState {
  version: number;
  activeRecordId?: string;
  records: TeacherDraftRecord[];
}

export interface TeacherDraftUiItem {
  id: string;
  childId?: string;
  childName?: string;
  category: TeacherVoiceDraftItem["category"];
  summary: string;
  rawExcerpt: string;
  confidence: number;
  structuredFields: Record<string, unknown>;
  suggestedActions: string[];
  warnings: string[];
  status: DraftRecordStatus;
  lastAction?: TeacherDraftRecordAction;
  persistStatus?: TeacherDraftPersistStatus;
  persistMessage?: string;
  persistError?: string;
  lastPersistedAt?: string;
  lastPersistAttemptAt?: string;
  updatedAt: string;
  isEdited: boolean;
  record: TeacherDraftRecord;
}

export interface TeacherDraftPersistResult {
  status: TeacherDraftPersistStatus;
  message: string;
  persistedAt: string;
  error?: string;
}

export interface TeacherDraftMutationResult {
  record: TeacherDraftRecord | null;
  records: TeacherDraftRecord[];
}

export interface TeacherDraftPersistAdapter {
  listDrafts(params: {
    sourceDraftId: string;
    includeDiscarded?: boolean;
    limit?: number;
  }): Promise<TeacherDraftRecord[]>;
  updateDraft(params: {
    sourceDraftId: string;
    recordId: string;
    summary: string;
    structuredFields: Record<string, unknown>;
  }): Promise<TeacherDraftMutationResult>;
  confirmDraft(params: {
    sourceDraftId: string;
    recordId: string;
  }): Promise<TeacherDraftMutationResult>;
  discardDraft(params: {
    sourceDraftId: string;
    recordId: string;
  }): Promise<TeacherDraftMutationResult>;
}

function cloneUnknown<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneUnknown(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        cloneUnknown(item),
      ])
    ) as T;
  }

  return value;
}

function sortRecordsByUpdatedAt(records: TeacherDraftRecord[]) {
  return [...records].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)
  );
}

function isRecordStatus(value: unknown): value is DraftRecordStatus {
  return value === "pending" || value === "confirmed" || value === "discarded";
}

function isTeacherDraftRecord(value: unknown): value is TeacherDraftRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.recordId === "string" &&
    typeof candidate.summary === "string" &&
    typeof candidate.rawExcerpt === "string" &&
    typeof candidate.confidence === "number" &&
    typeof candidate.structuredFields === "object" &&
    candidate.structuredFields !== null &&
    Array.isArray(candidate.suggestedActions) &&
    Array.isArray(candidate.warnings) &&
    typeof candidate.updatedAt === "string" &&
    (candidate.lastAction === undefined ||
      candidate.lastAction === "seed" ||
      candidate.lastAction === "edit" ||
      candidate.lastAction === "confirm" ||
      candidate.lastAction === "discard") &&
    (candidate.persistStatus === undefined ||
      candidate.persistStatus === "saved" ||
      candidate.persistStatus === "local_only" ||
      candidate.persistStatus === "failed") &&
    (candidate.persistMessage === undefined ||
      typeof candidate.persistMessage === "string") &&
    (candidate.persistError === undefined ||
      typeof candidate.persistError === "string") &&
    (candidate.lastPersistedAt === undefined ||
      typeof candidate.lastPersistedAt === "string") &&
    (candidate.lastPersistAttemptAt === undefined ||
      typeof candidate.lastPersistAttemptAt === "string") &&
    isRecordStatus(candidate.status)
  );
}

function readStructuredPayloadValue(
  payload: Record<string, unknown> | undefined,
  key: string
) {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  return payload[key];
}

export function readTeacherDraftChildName(
  payload: Record<string, unknown> | undefined
) {
  const childName = readStructuredPayloadValue(payload, "childName");
  return typeof childName === "string" ? childName : undefined;
}

export function readTeacherDraftUnderstandingSeed(
  payload: Record<string, unknown> | undefined
): TeacherDraftUnderstandingSeed | null {
  if (
    !payload ||
    payload.kind !== "teacher-voice-understanding" ||
    typeof payload.t5Seed !== "object" ||
    payload.t5Seed === null
  ) {
    return null;
  }

  const seed = payload.t5Seed as Record<string, unknown>;
  if (
    typeof seed.transcript !== "string" ||
    !Array.isArray(seed.draft_items) ||
    !Array.isArray(seed.warnings)
  ) {
    return null;
  }

  const routerResult =
    typeof seed.router_result === "object" || seed.router_result === null
      ? (seed.router_result as TeacherVoiceUnderstandResponse["router_result"] | null)
      : null;

  return {
    transcript: seed.transcript,
    router_result: routerResult,
    draft_items:
      seed.draft_items as TeacherVoiceUnderstandResponse["draft_items"],
    warnings: seed.warnings.filter((item): item is string => typeof item === "string"),
    copilot:
      typeof seed.copilot === "object" && seed.copilot !== null
        ? (seed.copilot as TeacherCopilotPayload | Record<string, unknown>)
        : undefined,
    recordCompletionHints: Array.isArray(seed.recordCompletionHints)
      ? (seed.recordCompletionHints as TeacherCopilotPayload["recordCompletionHints"])
      : undefined,
    microTrainingSOP:
      typeof seed.microTrainingSOP === "object" && seed.microTrainingSOP !== null
        ? (seed.microTrainingSOP as TeacherCopilotPayload["microTrainingSOP"])
        : undefined,
    parentCommunicationScript:
      typeof seed.parentCommunicationScript === "object" &&
      seed.parentCommunicationScript !== null
        ? (seed.parentCommunicationScript as TeacherCopilotPayload["parentCommunicationScript"])
        : undefined,
  };
}

export function readTeacherDraftConfirmationState(
  payload: Record<string, unknown> | undefined
): TeacherDraftConfirmationState | null {
  if (
    !payload ||
    typeof payload !== "object" ||
    !payload.t5State ||
    typeof payload.t5State !== "object"
  ) {
    return null;
  }

  const state = payload.t5State as Record<string, unknown>;
  if (!Array.isArray(state.records) || !state.records.every(isTeacherDraftRecord)) {
    return null;
  }

  return {
    version: typeof state.version === "number" ? state.version : 1,
    activeRecordId:
      typeof state.activeRecordId === "string" ? state.activeRecordId : undefined,
    records: state.records.map((record) => cloneUnknown(record)),
  };
}

function pickNextActiveRecordId(
  records: TeacherDraftRecord[],
  preferredRecordId?: string
) {
  const activeRecords = records.filter((record) => record.status !== "discarded");
  if (!activeRecords.length) {
    return undefined;
  }

  if (
    preferredRecordId &&
    activeRecords.some((record) => record.recordId === preferredRecordId)
  ) {
    return preferredRecordId;
  }

  return activeRecords[0]?.recordId;
}

export function mapUnderstandingResultToTeacherDraftCards(params: {
  sourceDraftId: string;
  seed: TeacherDraftUnderstandingSeed;
  fallbackChildId?: string;
  fallbackChildName?: string;
  fallbackUpdatedAt?: string;
  now?: string;
}) {
  const timestamp =
    params.fallbackUpdatedAt ?? params.now ?? new Date().toISOString();

  return params.seed.draft_items.map((item, index) => ({
    recordId: `${params.sourceDraftId}-record-${index + 1}`,
    childId: item.child_ref ?? params.fallbackChildId,
    childName: item.child_name ?? params.fallbackChildName,
    category: item.category,
    summary: item.summary,
    rawExcerpt: item.raw_excerpt,
    confidence: item.confidence,
    structuredFields: cloneUnknown(item.structured_fields),
    suggestedActions: [...item.suggested_actions],
    warnings: [...params.seed.warnings],
    status: "pending" as const,
    updatedAt: timestamp,
  }));
}

export function mapTeacherDraftRecordsToUiItems(records: TeacherDraftRecord[]) {
  return sortRecordsByUpdatedAt(records).map((record) => {
    const summary = record.editedSummary?.trim() || record.summary;
    const structuredFields =
      record.editedStructuredFields ?? record.structuredFields;

    return {
      id: record.recordId,
      childId: record.childId,
      childName: record.childName,
      category: record.category,
      summary,
      rawExcerpt: record.rawExcerpt,
      confidence: record.confidence,
      structuredFields: cloneUnknown(structuredFields),
      suggestedActions: [...record.suggestedActions],
      warnings: [...record.warnings],
      status: record.status,
      lastAction: record.lastAction,
      persistStatus: record.persistStatus,
      persistMessage: record.persistMessage,
      persistError: record.persistError,
      lastPersistedAt: record.lastPersistedAt,
      lastPersistAttemptAt: record.lastPersistAttemptAt,
      updatedAt: record.updatedAt,
      isEdited:
        Boolean(record.editedSummary?.trim()) ||
        Boolean(record.editedStructuredFields),
      record,
    } satisfies TeacherDraftUiItem;
  });
}

function getFallbackUpdatedAt(sourceDraft: MobileDraft) {
  return sourceDraft.updatedAt || sourceDraft.createdAt || new Date().toISOString();
}

function getEffectiveStructuredPayload(params: {
  sourceDraft: MobileDraft;
  structuredPayloadOverrides?: Record<string, Record<string, unknown>>;
}) {
  return (
    params.structuredPayloadOverrides?.[params.sourceDraft.draftId] ??
    params.sourceDraft.structuredPayload
  );
}

function buildBaseRecords(params: {
  sourceDraft: MobileDraft;
  structuredPayloadOverrides?: Record<string, Record<string, unknown>>;
}) {
  const payload = getEffectiveStructuredPayload(params);
  const seed = readTeacherDraftUnderstandingSeed(payload);
  if (!seed) {
    return null;
  }

  const state = readTeacherDraftConfirmationState(payload);
  if (state?.records.length) {
    return sortRecordsByUpdatedAt(state.records);
  }

  return sortRecordsByUpdatedAt(
    mapUnderstandingResultToTeacherDraftCards({
      sourceDraftId: params.sourceDraft.draftId,
      seed,
      fallbackChildId: params.sourceDraft.childId,
      fallbackChildName: readTeacherDraftChildName(payload),
      fallbackUpdatedAt: getFallbackUpdatedAt(params.sourceDraft),
    })
  );
}

export function buildTeacherDraftRecordsFromSource(params: {
  sourceDraft: MobileDraft;
  structuredPayloadOverrides?: Record<string, Record<string, unknown>>;
}) {
  return (
    buildBaseRecords({
      sourceDraft: params.sourceDraft,
      structuredPayloadOverrides: params.structuredPayloadOverrides,
    }) ?? []
  );
}

function buildSourceDraftWithState(params: {
  sourceDraft: MobileDraft;
  records: TeacherDraftRecord[];
  activeRecordId?: string;
  structuredPayloadOverrides?: Record<string, Record<string, unknown>>;
  now: string;
}) {
  const payload = getEffectiveStructuredPayload({
    sourceDraft: params.sourceDraft,
    structuredPayloadOverrides: params.structuredPayloadOverrides,
  });
  const currentState = readTeacherDraftConfirmationState(payload);
  const nextRecords = sortRecordsByUpdatedAt(params.records);
  const nextState: TeacherDraftConfirmationState = {
    version: Math.max(1, (currentState?.version ?? 0) + 1),
    activeRecordId: pickNextActiveRecordId(nextRecords, params.activeRecordId),
    records: nextRecords,
  };

  return {
    ...params.sourceDraft,
    updatedAt: params.now,
    structuredPayload: {
      ...(payload ?? {}),
      t5State: nextState,
    },
  } satisfies MobileDraft;
}

function upsertDraftInCollection(drafts: MobileDraft[], nextDraft: MobileDraft) {
  const existingIndex = drafts.findIndex((draft) => draft.draftId === nextDraft.draftId);
  if (existingIndex === -1) {
    return [nextDraft, ...drafts];
  }

  const nextDrafts = [...drafts];
  nextDrafts[existingIndex] = nextDraft;
  return nextDrafts;
}

function buildFailedPersistResult(error: unknown, persistedAt: string): TeacherDraftPersistResult {
  return {
    status: "failed",
    message: "远端保存失败，已保留本地。",
    persistedAt,
    error:
      error instanceof Error ? error.message : "teacher_draft_persist_failed",
  };
}

function getPersistMessageForAction(
  action: TeacherDraftRecordAction,
  result: TeacherDraftPersistResult
) {
  if (result.status === "failed") {
    return "保存失败，已保留本地。";
  }

  if (result.status === "local_only") {
    if (action === "confirm") {
      return "已确认，仅保留在本地 fallback。";
    }

    if (action === "edit") {
      return "编辑已保存到本地 fallback。";
    }

    if (action === "discard") {
      return "已丢弃并软隐藏，仅保留在本地 fallback。";
    }
  }

  if (action === "confirm") {
    return "已确认并保存。";
  }

  if (action === "edit") {
    return "编辑已保存。";
  }

  if (action === "discard") {
    return "已丢弃并软隐藏，source draft 仍保留。";
  }

  return result.message;
}

function prepareRecordForAction(params: {
  record: TeacherDraftRecord;
  action: TeacherDraftRecordAction;
  updatedAt: string;
}) {
  return {
    ...params.record,
    lastAction: params.action,
    persistStatus: undefined,
    persistMessage: undefined,
    persistError: undefined,
    lastPersistAttemptAt: params.updatedAt,
    updatedAt: params.updatedAt,
  } satisfies TeacherDraftRecord;
}

function applyPersistResultToRecord(params: {
  record: TeacherDraftRecord;
  action: TeacherDraftRecordAction;
  result: TeacherDraftPersistResult;
}) {
  return {
    ...params.record,
    lastAction: params.action,
    persistStatus: params.result.status,
    persistMessage: getPersistMessageForAction(params.action, params.result),
    persistError:
      params.result.status === "failed" ? params.result.error ?? params.result.message : undefined,
    lastPersistAttemptAt: params.result.persistedAt,
    lastPersistedAt:
      params.result.status === "failed"
        ? params.record.lastPersistedAt
        : params.result.persistedAt,
    updatedAt: params.result.persistedAt,
  } satisfies TeacherDraftRecord;
}

export function createTeacherDraftPersistAdapter(params: {
  drafts: MobileDraft[];
  saveDraft: (draft: MobileDraft) => void;
  persistNow?: (nextDrafts: MobileDraft[]) => Promise<TeacherDraftPersistResult>;
  structuredPayloadOverrides?: Record<string, Record<string, unknown>>;
  now?: () => string;
}): TeacherDraftPersistAdapter {
  const findSourceDraft = (sourceDraftId: string) =>
    params.drafts.find((draft) => draft.draftId === sourceDraftId);

  const mutateRecord = async (input: {
    sourceDraftId: string;
    recordId: string;
    activeRecordId?: string;
    action: TeacherDraftRecordAction;
    updateRecord: (record: TeacherDraftRecord, updatedAt: string) => TeacherDraftRecord;
  }): Promise<TeacherDraftMutationResult> => {
    const sourceDraft = findSourceDraft(input.sourceDraftId);
    if (!sourceDraft) {
      return { record: null, records: [] };
    }

    const baseRecords =
      buildBaseRecords({
        sourceDraft,
        structuredPayloadOverrides: params.structuredPayloadOverrides,
      }) ?? [];
    const updatedAt = params.now?.() ?? new Date().toISOString();
    const nextRecords = baseRecords.map((record) =>
      record.recordId === input.recordId
        ? input.updateRecord(
            prepareRecordForAction({
              record,
              action: input.action,
              updatedAt,
            }),
            updatedAt
          )
        : record
    );

    const nextSourceDraft = buildSourceDraftWithState({
      sourceDraft,
      records: nextRecords,
      activeRecordId: input.activeRecordId,
      structuredPayloadOverrides: params.structuredPayloadOverrides,
      now: updatedAt,
    });
    params.saveDraft(nextSourceDraft);

    let finalRecords = nextRecords;

    if (params.persistNow) {
      let persistResult: TeacherDraftPersistResult;
      try {
        persistResult = await params.persistNow(
          upsertDraftInCollection(params.drafts, nextSourceDraft)
        );
      } catch (error) {
        persistResult = buildFailedPersistResult(
          error,
          params.now?.() ?? new Date().toISOString()
        );
      }

      finalRecords = nextRecords.map((record) =>
        record.recordId === input.recordId
          ? applyPersistResultToRecord({
              record,
              action: input.action,
              result: persistResult,
            })
          : record
      );

      params.saveDraft(
        buildSourceDraftWithState({
          sourceDraft: nextSourceDraft,
          records: finalRecords,
          activeRecordId: input.activeRecordId,
          structuredPayloadOverrides: params.structuredPayloadOverrides,
          now: persistResult.persistedAt,
        })
      );
    }

    return {
      record: finalRecords.find((record) => record.recordId === input.recordId) ?? null,
      records: finalRecords,
    };
  };

  return {
    async listDrafts({ sourceDraftId, includeDiscarded = false, limit }) {
      const sourceDraft = findSourceDraft(sourceDraftId);
      if (!sourceDraft) {
        return [];
      }

      const records =
        buildBaseRecords({
          sourceDraft,
          structuredPayloadOverrides: params.structuredPayloadOverrides,
        }) ?? [];

      const visibleRecords = includeDiscarded
        ? records
        : records.filter((record) => record.status !== "discarded");

      return typeof limit === "number" ? visibleRecords.slice(0, limit) : visibleRecords;
    },
    async updateDraft({
      sourceDraftId,
      recordId,
      summary,
      structuredFields,
    }) {
      return mutateRecord({
        sourceDraftId,
        recordId,
        activeRecordId: recordId,
        action: "edit",
        updateRecord: (record) => ({
          ...record,
          editedSummary:
            summary.trim() && summary.trim() !== record.summary
              ? summary.trim()
              : undefined,
          editedStructuredFields:
            Object.keys(structuredFields).length > 0
              ? cloneUnknown(structuredFields)
              : undefined,
        }),
      });
    },
    async confirmDraft({ sourceDraftId, recordId }) {
      return mutateRecord({
        sourceDraftId,
        recordId,
        activeRecordId: recordId,
        action: "confirm",
        updateRecord: (record) => ({
          ...record,
          status: "confirmed" as const,
        }),
      });
    },
    async discardDraft({ sourceDraftId, recordId }) {
      return mutateRecord({
        sourceDraftId,
        recordId,
        activeRecordId: undefined,
        action: "discard",
        updateRecord: (record) => ({
          ...record,
          status: "discarded" as const,
        }),
      });
    },
  };
}

export function isTeacherDraftSourceType(draftType: MobileDraftType) {
  return draftType === "voice" || draftType === "ocr";
}
