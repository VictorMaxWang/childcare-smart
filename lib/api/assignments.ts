import { apiGet, apiPatch, apiPost, type ApiClientOptions } from "@/lib/api/client";
import type { ApiAssignment, ApiAssignmentStatus } from "@/lib/api/types";

export interface AssignmentCreateInput {
  childId: string;
  teacherId: string;
  title?: string;
  description: string;
  dueAt?: string;
  feedbackId?: string;
  consultationId?: string;
  riskItemId?: string;
}

function withParams(path: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export function listAssignments(
  query: { childId?: string; teacherId?: string; status?: ApiAssignmentStatus } = {},
  options?: ApiClientOptions
) {
  return apiGet<ApiAssignment[]>(withParams("/api/assignments", query), options);
}

export function createAssignment(input: AssignmentCreateInput, options?: ApiClientOptions) {
  return apiPost<ApiAssignment>("/api/assignments", input, options);
}

export function updateAssignmentStatus(
  assignmentId: string,
  input: { status: ApiAssignmentStatus; completionSummary?: string },
  options?: ApiClientOptions
) {
  return apiPatch<ApiAssignment>(`/api/assignments/${encodeURIComponent(assignmentId)}`, input, options);
}
