import { apiGet, apiPatch, apiPost } from "@/lib/api/client";
import type { ApiArchiveInput, RecordType } from "@/lib/api/types";
import type { AppStateSnapshot } from "@/lib/persistence/snapshot";

type ApiRecordMap = {
  attendance: AppStateSnapshot["attendance"][number] & { archivedAt?: string; updatedAt?: string };
  health: AppStateSnapshot["health"][number] & { archivedAt?: string; updatedAt?: string };
  meal: AppStateSnapshot["meals"][number] & { archivedAt?: string; updatedAt?: string };
  growth: AppStateSnapshot["growth"][number] & { archivedAt?: string; updatedAt?: string };
};

function recordsPath(type: RecordType, options: { childId?: string; includeArchived?: boolean } = {}) {
  const params = new URLSearchParams({ type });
  if (options.childId) params.set("childId", options.childId);
  if (options.includeArchived) params.set("includeArchived", "1");
  return `/api/records?${params.toString()}`;
}

export function listRecords<T extends RecordType>(type: T, options: { childId?: string; includeArchived?: boolean } = {}) {
  return apiGet<ApiRecordMap[T][]>(recordsPath(type, options));
}

export function createRecord<T extends RecordType>(type: T, input: Omit<Partial<ApiRecordMap[T]>, "id"> & { childId: string }) {
  return apiPost<ApiRecordMap[T]>("/api/records", { ...input, type });
}

export function updateRecord<T extends RecordType>(type: T, recordId: string, input: Partial<ApiRecordMap[T]>) {
  return apiPatch<ApiRecordMap[T]>(`/api/records/${encodeURIComponent(recordId)}`, { ...input, type });
}

export function archiveRecord<T extends RecordType>(type: T, recordId: string, input: ApiArchiveInput) {
  return apiPost<ApiRecordMap[T]>(`/api/records/${encodeURIComponent(recordId)}/archive`, { ...input, type });
}
