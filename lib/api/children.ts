import { apiGet, apiPatch, apiPost } from "@/lib/api/client";
import type { ApiArchiveInput, ApiChild, ApiChildInput, ApiChildPatch } from "@/lib/api/types";

function childrenPath(includeArchived?: boolean) {
  return includeArchived ? "/api/children?includeArchived=1" : "/api/children";
}

export function listChildren(options: { includeArchived?: boolean } = {}) {
  return apiGet<ApiChild[]>(childrenPath(options.includeArchived));
}

export function getChild(childId: string) {
  return apiGet<ApiChild>(`/api/children/${encodeURIComponent(childId)}`);
}

export function createChild(input: ApiChildInput) {
  return apiPost<ApiChild>("/api/children", input);
}

export function updateChild(childId: string, input: ApiChildPatch) {
  return apiPatch<ApiChild>(`/api/children/${encodeURIComponent(childId)}`, input);
}

export function archiveChild(childId: string, input: ApiArchiveInput) {
  return apiPost<ApiChild>(`/api/children/${encodeURIComponent(childId)}/archive`, input);
}
