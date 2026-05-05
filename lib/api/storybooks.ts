import { apiGet, apiPost, type ApiClientOptions } from "@/lib/api/client";
import type { ApiStorybook, ApiStorybookExportData, StorybookExportFormat } from "@/lib/api/types";

export interface UpsertStorybookInput {
  storybookId?: string;
  storyId?: string;
  childId: string;
  sourceRecordIds?: string[];
  pages?: Array<Record<string, unknown>>;
  response?: Record<string, unknown>;
  generatedAt?: string;
}

function withParams(path: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export function listStorybooks(childId?: string, options?: ApiClientOptions) {
  return apiGet<ApiStorybook[]>(withParams("/api/storybooks", { childId }), options);
}

export function getStorybook(storybookId: string, options?: ApiClientOptions) {
  return apiGet<ApiStorybook>(`/api/storybooks/${encodeURIComponent(storybookId)}`, options);
}

export function upsertStorybook(input: UpsertStorybookInput, options?: ApiClientOptions) {
  return apiPost<ApiStorybook>("/api/storybooks", input, options);
}

export function exportStorybook(storybookId: string, format: StorybookExportFormat = "json", options?: ApiClientOptions) {
  return apiGet<ApiStorybookExportData>(
    `/api/storybooks/${encodeURIComponent(storybookId)}/export?${new URLSearchParams({ format }).toString()}`,
    options
  );
}

export function shareStorybook(storybookId: string, input: { summary?: string } = {}, options?: ApiClientOptions) {
  return apiPost<{
    kind: "share-text";
    storybookId: string;
    childId: string;
    summary: string;
    localText: string;
    copyText: string;
    externalService: "unavailable";
    note: string;
  }>(`/api/storybooks/${encodeURIComponent(storybookId)}/share`, input, options);
}
