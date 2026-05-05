import "server-only";

import { createRequestId, buildVivoAuthHeaders } from "./vivo-auth";
import { VivoProviderError } from "./vivo-errors";
import { getVivoEnv } from "./vivo-provider-status";
import type { VivoCapability } from "./types";

export interface VivoRequestOptions {
  capability: VivoCapability;
  path: string;
  method?: "GET" | "POST";
  query?: Record<string, string | number | undefined>;
  headers?: HeadersInit;
  body?: BodyInit | null;
  timeoutMs?: number;
  baseUrl?: string;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/u, "");
}

function buildUrl(baseUrl: string, path: string, query?: VivoRequestOptions["query"]) {
  const url = new URL(path, `${trimTrailingSlash(baseUrl)}/`);
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (typeof value !== "undefined" && String(value).length > 0) {
      url.searchParams.set(key, String(value));
    }
  });
  return url;
}

export async function vivoFetch(options: VivoRequestOptions) {
  const env = getVivoEnv();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  const headers = buildVivoAuthHeaders(options.headers);

  try {
    const response = await fetch(
      buildUrl(options.baseUrl ?? env.baseUrl, options.path, options.query),
      {
        method: options.method ?? "POST",
        headers,
        body: options.body,
        cache: "no-store",
        signal: controller.signal,
      }
    );
    return response;
  } catch (error) {
    throw new VivoProviderError(
      error instanceof Error ? error.message : "vivo provider request failed",
      {
        capability: options.capability,
        status: "provider-unavailable",
        raw: error,
      }
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function vivoJsonRequest<T = Record<string, unknown>>(options: VivoRequestOptions) {
  const response = await vivoFetch(options);
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { rawText: text };
  }

  if (!response.ok) {
    throw new VivoProviderError(`vivo provider returned HTTP ${response.status}`, {
      capability: options.capability,
      status: response.status === 401 ? "missing-env" : "provider-unavailable",
      httpStatus: response.status,
      raw: body,
    });
  }

  return body as T;
}

export { createRequestId };
