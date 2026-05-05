import { apiGet, apiPatch, apiPost, type ApiClientOptions } from "@/lib/api/client";
import type { ApiWeeklyReport, ArchiveAction, ReportScopeType, WeeklyReportExportFormat } from "@/lib/api/types";

export interface WeeklyReportCreateInput {
  title?: string;
  scopeType?: ReportScopeType;
  scopeId?: string;
  periodStart?: string;
  periodEnd?: string;
  summary?: string;
  payload?: Record<string, unknown>;
}

export interface WeeklyReportExportData {
  reportId: string;
  format: WeeklyReportExportFormat;
  exportedAt: string;
  content: string;
  mimeType: string;
  filename: string;
}

function reportPath(reportId: string) {
  return `/api/weekly-reports/${encodeURIComponent(reportId)}`;
}

export function listWeeklyReports(query: { includeArchived?: boolean } = {}, options?: ApiClientOptions) {
  const params = new URLSearchParams();
  if (query.includeArchived) params.set("includeArchived", "1");
  const search = params.toString();
  return apiGet<ApiWeeklyReport[]>(`/api/weekly-reports${search ? `?${search}` : ""}`, options);
}

export function createWeeklyReport(input: WeeklyReportCreateInput, options?: ApiClientOptions) {
  return apiPost<ApiWeeklyReport>("/api/weekly-reports", input, options);
}

export function getWeeklyReport(reportId: string, options?: ApiClientOptions) {
  return apiGet<ApiWeeklyReport>(reportPath(reportId), options);
}

export function updateWeeklyReport(reportId: string, input: Pick<WeeklyReportCreateInput, "title">, options?: ApiClientOptions) {
  return apiPatch<ApiWeeklyReport>(reportPath(reportId), input, options);
}

export function archiveWeeklyReport(reportId: string, action: ArchiveAction = "archive", options?: ApiClientOptions) {
  return apiPost<ApiWeeklyReport>(`${reportPath(reportId)}/archive`, { action }, options);
}

export function shareWeeklyReport(reportId: string, input: { summary?: string } = {}, options?: ApiClientOptions) {
  return apiPost<ApiWeeklyReport>(`${reportPath(reportId)}/share`, input, options);
}

export function exportWeeklyReport(
  reportId: string,
  format: WeeklyReportExportFormat = "json",
  options?: ApiClientOptions
) {
  return apiGet<WeeklyReportExportData>(`${reportPath(reportId)}/export?format=${encodeURIComponent(format)}`, options);
}
