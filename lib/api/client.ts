import { ApiClientError } from "@/lib/api/errors";
import type { ApiEnvelope } from "@/lib/api/types";

export interface ApiClientOptions extends RequestInit {
  demoAccountId?: string;
}

export async function apiRequest<T>(path: string, options: ApiClientOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("accept")) {
    headers.set("accept", "application/json");
  }
  if (options.body && !headers.has("content-type") && !(options.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }
  if (options.demoAccountId) {
    headers.set("x-demo-account-id", options.demoAccountId);
  }

  const response = await fetch(path, {
    ...options,
    headers,
    cache: options.cache ?? "no-store",
  });
  const body = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!body || body.ok !== true) {
    const error = body && body.ok === false ? body.error : `API request failed with status ${response.status}.`;
    const code = body && body.ok === false ? body.code : "server_error";
    throw new ApiClientError(error, code, response.status);
  }

  return body.data;
}

export function apiGet<T>(path: string, options?: ApiClientOptions) {
  return apiRequest<T>(path, { ...options, method: "GET" });
}

export function apiPost<T>(path: string, data?: unknown, options?: ApiClientOptions) {
  return apiRequest<T>(path, {
    ...options,
    method: "POST",
    body: typeof data === "undefined" ? undefined : JSON.stringify(data),
  });
}

export function apiPatch<T>(path: string, data?: unknown, options?: ApiClientOptions) {
  return apiRequest<T>(path, {
    ...options,
    method: "PATCH",
    body: typeof data === "undefined" ? undefined : JSON.stringify(data),
  });
}
