import type { MobileDraft, MobileDraftType, MobileDraftSyncStatus } from "@/lib/ai/types";

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
    syncStatus: params.syncStatus ?? "local_pending",
    attachmentName: params.attachmentName,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function getDraftSyncStatusLabel(syncStatus: MobileDraftSyncStatus) {
  if (syncStatus === "synced") return "已同步";
  if (syncStatus === "failed") return "同步失败";
  return "待同步";
}
