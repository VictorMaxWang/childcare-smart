import type {
  MobileDraft,
  MobileDraftPersistenceScope,
  MobileDraftType,
  MobileDraftSyncStatus,
} from "@/lib/ai/types";

function createDraftId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}`;
}

export function createMobileDraft(params: {
  draftId?: string;
  childId: string;
  draftType: MobileDraftType;
  targetRole: MobileDraft["targetRole"];
  content: string;
  structuredPayload?: Record<string, unknown>;
  persistenceScope?: MobileDraftPersistenceScope;
  attachmentName?: string;
  syncStatus?: MobileDraftSyncStatus;
}): MobileDraft {
  const timestamp = new Date().toISOString();

  return {
    draftId: params.draftId ?? createDraftId("draft"),
    childId: params.childId,
    draftType: params.draftType,
    targetRole: params.targetRole,
    content: params.content,
    structuredPayload: params.structuredPayload,
    persistenceScope: params.persistenceScope ?? "remote",
    syncStatus: params.syncStatus ?? "local_pending",
    attachmentName: params.attachmentName,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function readNestedObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function isLocalOnlyMobileDraft(draft: MobileDraft) {
  if (draft.persistenceScope === "local") return true;

  const payload = readNestedObject(draft.structuredPayload);
  if (!payload) return false;

  const source = payload.source;
  if (source === "mock" || source === "mock-voice" || source === "mock-ocr") {
    return true;
  }

  const upload = readNestedObject(payload.upload);
  if (
    upload?.source === "mock" ||
    upload?.source === "local-text-fallback" ||
    upload?.status === "mocked" ||
    upload?.status === "local_fallback"
  ) {
    return true;
  }

  const raw = readNestedObject(upload?.raw);
  const rawMode = raw?.mode;
  return typeof rawMode === "string" && rawMode.includes("demo");
}

export function filterRemotePersistableMobileDrafts(drafts: MobileDraft[]) {
  return drafts.filter((draft) => !isLocalOnlyMobileDraft(draft));
}

export function getDraftSyncStatusLabel(
  syncStatus: MobileDraftSyncStatus,
  persistenceScope?: MobileDraftPersistenceScope
) {
  if (persistenceScope === "local") return "仅本地演示";
  if (syncStatus === "synced") return "已同步";
  if (syncStatus === "failed") return "同步失败";
  return "待同步";
}
