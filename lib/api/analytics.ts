import { apiGet, type ApiClientOptions } from "@/lib/api/client";
import type { AnalyticsMetric, ApiAdminQualityMetrics, ApiAdminSummary, ApiAnalyticsTrend } from "@/lib/api/types";

export interface AnalyticsTrendQuery {
  childId?: string;
  classId?: string;
  metric?: AnalyticsMetric;
  timeRange?: string;
  windowDays?: number;
}

function withQuery(path: string, query: AnalyticsTrendQuery = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value !== "undefined" && value !== "") params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

export function getAdminSummary(options?: ApiClientOptions) {
  return apiGet<ApiAdminSummary>("/api/analytics/admin/summary", options);
}

export function getAdminQualityMetrics(options?: ApiClientOptions) {
  return apiGet<ApiAdminQualityMetrics>("/api/analytics/admin/quality-metrics", options);
}

export function getAnalyticsTrend(query: AnalyticsTrendQuery = {}, options?: ApiClientOptions) {
  return apiGet<ApiAnalyticsTrend>(withQuery("/api/analytics/trends", query), options);
}

export function getChildTrend(childId: string, query: Omit<AnalyticsTrendQuery, "childId"> = {}, options?: ApiClientOptions) {
  return apiGet<ApiAnalyticsTrend>(withQuery(`/api/children/${encodeURIComponent(childId)}/trend`, query), options);
}
