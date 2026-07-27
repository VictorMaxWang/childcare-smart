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
  signal?: AbortSignal;
  onRequestStart?: () => void;
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

function wrapVivoTransportError(
  options: VivoRequestOptions,
  timeoutSignal: AbortSignal,
  error: unknown
) {
  const failureKind = options.signal?.aborted
    ? "request-cancelled"
    : timeoutSignal.aborted
      ? "request-timeout"
      : "transport";
  return new VivoProviderError(
    failureKind === "request-cancelled"
      ? "vivo provider request was cancelled"
      : failureKind === "request-timeout"
        ? "vivo provider request deadline was exceeded"
        : error instanceof Error
          ? error.message
          : "vivo provider request failed",
    {
      capability: options.capability,
      status: "provider-unavailable",
      raw: error,
      failureKind,
    }
  );
}

async function vivoFetchWithDeadline(options: VivoRequestOptions) {
  const env = getVivoEnv();
  const timeoutSignal = AbortSignal.timeout(
    Math.max(1, options.timeoutMs ?? 30_000)
  );
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal;
  const headers = buildVivoAuthHeaders(options.headers);

  try {
    options.onRequestStart?.();
    const response = await fetch(
      buildUrl(options.baseUrl ?? env.baseUrl, options.path, options.query),
      {
        method: options.method ?? "POST",
        headers,
        body: options.body,
        cache: "no-store",
        signal,
      }
    );
    return { response, timeoutSignal };
  } catch (error) {
    throw wrapVivoTransportError(options, timeoutSignal, error);
  }
}

export async function vivoFetch(options: VivoRequestOptions) {
  return (await vivoFetchWithDeadline(options)).response;
}

export async function vivoJsonRequest<T = Record<string, unknown>>(options: VivoRequestOptions) {
  const { response, timeoutSignal } = await vivoFetchWithDeadline(options);
  let text: string;
  try {
    // Headers 到达并不代表请求完成；正文读取继续受同一截止时间与取消信号约束。
    text = await response.text();
  } catch (error) {
    throw wrapVivoTransportError(options, timeoutSignal, error);
  }
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { rawText: text };
  }

  if (!response.ok) {
    const failureKind =
      response.status === 401 || response.status === 403
        ? "authentication"
        : response.status === 429
          ? "rate-limited"
          : "provider-response";
    throw new VivoProviderError(`vivo provider returned HTTP ${response.status}`, {
      capability: options.capability,
      // 已发出请求后的 401/403 是凭据被拒绝，不是本地缺少环境变量。
      status: "provider-unavailable",
      httpStatus: response.status,
      raw: body,
      failureKind,
    });
  }

  return body as T;
}

export { createRequestId };
