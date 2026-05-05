import { apiGet, apiPatch, apiPost, type ApiClientOptions } from "@/lib/api/client";
import type { AppStateSnapshot } from "@/lib/persistence/snapshot";

export type ApiReminder = AppStateSnapshot["reminders"][number];

function withParams(path: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export function listReminders(options: { childId?: string } = {}, clientOptions?: ApiClientOptions) {
  return apiGet<ApiReminder[]>(withParams("/api/reminders", { childId: options.childId }), clientOptions);
}

export function createReminder(input: Partial<ApiReminder> & { childId: string }, clientOptions?: ApiClientOptions) {
  return apiPost<ApiReminder>("/api/reminders", input, clientOptions);
}

export function updateReminder(reminderId: string, input: Partial<ApiReminder>, clientOptions?: ApiClientOptions) {
  return apiPatch<ApiReminder>(`/api/reminders/${encodeURIComponent(reminderId)}`, input, clientOptions);
}
