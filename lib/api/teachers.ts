import { apiGet, apiPatch, apiPost } from "@/lib/api/client";
import type { ApiArchiveInput, ApiTeacher, ApiTeacherInput, ApiTeacherPatch } from "@/lib/api/types";

function teachersPath(includeArchived?: boolean) {
  return includeArchived ? "/api/teachers?includeArchived=1" : "/api/teachers";
}

export function listTeachers(options: { includeArchived?: boolean } = {}) {
  return apiGet<ApiTeacher[]>(teachersPath(options.includeArchived));
}

export function getTeacher(teacherId: string) {
  return apiGet<ApiTeacher>(`/api/teachers/${encodeURIComponent(teacherId)}`);
}

export function createTeacher(input: ApiTeacherInput) {
  return apiPost<ApiTeacher>("/api/teachers", input);
}

export function updateTeacher(teacherId: string, input: ApiTeacherPatch) {
  return apiPatch<ApiTeacher>(`/api/teachers/${encodeURIComponent(teacherId)}`, input);
}

export function archiveTeacher(teacherId: string, input: ApiArchiveInput) {
  return apiPost<ApiTeacher>(`/api/teachers/${encodeURIComponent(teacherId)}/archive`, input);
}
