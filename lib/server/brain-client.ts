const DEFAULT_TIMEOUT_MS = 20_000;

export const SMARTCHILDCARE_TRANSPORT_HEADER = "x-smartchildcare-transport";
export const SMARTCHILDCARE_TARGET_HEADER = "x-smartchildcare-target";
export const SMARTCHILDCARE_FALLBACK_REASON_HEADER = "x-smartchildcare-fallback-reason";
export const SMARTCHILDCARE_UPSTREAM_HOST_HEADER = "x-smartchildcare-upstream-host";

export type BrainTransport =
  | "brain-proxy-error"
  | "remote-brain-proxy"
  | "next-json-fallback"
  | "next-stream-fallback";
export type BrainRetryStrategy = "none" | "normalized-base-retry";

export interface BrainForwardResult {
  response: Response | null;
  targetPath: string;
  upstreamHost: string | null;
  fallbackReason: string | null;
  statusCode: number | null;
  retryStrategy: BrainRetryStrategy;
  elapsedMs: number | null;
  timeoutMs: number;
}

function normalizeBaseUrl(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const withoutTrailingSlash = trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
  return withoutTrailingSlash.replace(/\/api\/v1$/iu, "");
}

function trimTrailingSlash(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

type BrainBaseUrlDetails = {
  rawBaseUrl: string | null;
  normalizedBaseUrl: string | null;
  hadApiV1Suffix: boolean;
  implicitDefault: boolean;
  localDevCandidateBaseUrls: string[];
};

function resolveBrainBaseUrlDetails(): BrainBaseUrlDetails {
  const configuredBaseUrl = trimTrailingSlash(
    process.env.BRAIN_API_BASE_URL ?? process.env.NEXT_PUBLIC_BACKEND_BASE_URL
  );
  if (configuredBaseUrl) {
    const normalizedBaseUrl = normalizeBaseUrl(configuredBaseUrl);
    return {
      rawBaseUrl: configuredBaseUrl,
      normalizedBaseUrl,
      hadApiV1Suffix: configuredBaseUrl !== normalizedBaseUrl,
      implicitDefault: false,
      localDevCandidateBaseUrls: [],
    };
  }

  if (process.env.NODE_ENV !== "production") {
    const localDevCandidateBaseUrls = resolveLocalDevBrainBaseUrls();
    const fallbackBaseUrl = localDevCandidateBaseUrls[0] ?? null;
    return {
      rawBaseUrl: fallbackBaseUrl,
      normalizedBaseUrl: fallbackBaseUrl,
      hadApiV1Suffix: false,
      implicitDefault: true,
      localDevCandidateBaseUrls,
    };
  }

  return {
    rawBaseUrl: null,
    normalizedBaseUrl: null,
    hadApiV1Suffix: false,
    implicitDefault: false,
    localDevCandidateBaseUrls: [],
  };
}

function sanitizeReasonToken(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return normalized.replace(/^-+|-+$/g, "") || "unknown";
}

function resolveUpstreamHost(baseUrl: string | null) {
  if (!baseUrl) return null;

  try {
    return new URL(baseUrl).host || null;
  } catch {
    return null;
  }
}

function fallbackReasonFromError(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "brain-proxy-timeout";
  }
  if (error instanceof Error) {
    return `brain-fetch-${sanitizeReasonToken(error.name || "error")}`;
  }
  return "brain-fetch-error";
}

function buildTransportHeaders({
  transport,
  targetPath,
  upstreamHost,
  fallbackReason,
}: {
  transport: BrainTransport;
  targetPath: string;
  upstreamHost?: string | null;
  fallbackReason?: string | null;
}) {
  const headers = new Headers();
  headers.set(SMARTCHILDCARE_TRANSPORT_HEADER, transport);
  headers.set(SMARTCHILDCARE_TARGET_HEADER, targetPath);
  if (upstreamHost) headers.set(SMARTCHILDCARE_UPSTREAM_HOST_HEADER, upstreamHost);
  if (fallbackReason) headers.set(SMARTCHILDCARE_FALLBACK_REASON_HEADER, fallbackReason);
  return headers;
}

function mergeHeaders(base: HeadersInit, extra?: HeadersInit) {
  const headers = new Headers(base);
  if (!extra) return headers;

  new Headers(extra).forEach((value, key) => {
    headers.set(key, value);
  });
  return headers;
}

function resolveLocalDevBrainBaseUrls() {
  const candidatePorts = [process.env.APP_PORT?.trim(), "8000", "8010"];
  const ports = candidatePorts
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  return [...new Set(ports)].map((port) => `http://127.0.0.1:${port}`);
}

export function getBrainBaseUrl() {
  return resolveBrainBaseUrlDetails().normalizedBaseUrl;
}

export function createBrainTransportHeaders({
  transport,
  targetPath,
  upstreamHost,
  fallbackReason,
}: {
  transport: BrainTransport;
  targetPath: string;
  upstreamHost?: string | null;
  fallbackReason?: string | null;
}) {
  return buildTransportHeaders({ transport, targetPath, upstreamHost, fallbackReason });
}

export function readBrainTransportHeaders(headers: Headers) {
  return {
    transport: headers.get(SMARTCHILDCARE_TRANSPORT_HEADER),
    targetPath: headers.get(SMARTCHILDCARE_TARGET_HEADER),
    upstreamHost: headers.get(SMARTCHILDCARE_UPSTREAM_HOST_HEADER),
    fallbackReason: headers.get(SMARTCHILDCARE_FALLBACK_REASON_HEADER),
  };
}

function getBrainTimeoutMs(overrideTimeoutMs?: number | null) {
  if (typeof overrideTimeoutMs === "number" && Number.isFinite(overrideTimeoutMs) && overrideTimeoutMs > 0) {
    return overrideTimeoutMs;
  }
  const raw = process.env.BRAIN_API_TIMEOUT_MS?.trim();
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function buildForwardHeaders(request: Request) {
  const incoming = new Headers(request.headers);
  const headers = new Headers();

  const contentType = incoming.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const accept = incoming.get("accept");
  if (accept) headers.set("accept", accept);

  const traceHeaders = [
    "x-request-id",
    "x-correlation-id",
    "x-trace-id",
    "x-ai-force-fallback",
    "x-debug-memory",
  ];

  traceHeaders.forEach((name) => {
    const value = incoming.get(name);
    if (value) headers.set(name, value);
  });

  return headers;
}

function shouldFallback(response: Response) {
  return (
    response.status === 404 ||
    response.status === 405 ||
    response.status === 501 ||
    response.status >= 500
  );
}

export async function forwardBrainRequest(
  request: Request,
  targetPath: string,
  options?: {
    timeoutMs?: number;
  }
): Promise<BrainForwardResult> {
  const baseUrlDetails = resolveBrainBaseUrlDetails();
  const baseUrl = baseUrlDetails.normalizedBaseUrl;
  const upstreamHost = resolveUpstreamHost(baseUrl);
  const timeoutMs = getBrainTimeoutMs(options?.timeoutMs);
  if (!baseUrl) {
    console.warn(
      `[BRAIN_PROXY] Falling back for ${targetPath}: BRAIN_API_BASE_URL is not configured.`
    );
    return {
      response: null,
      targetPath,
      upstreamHost,
      fallbackReason: "brain-base-url-missing",
      statusCode: null,
      retryStrategy: "none",
      elapsedMs: null,
      timeoutMs,
    };
  }

  const controller = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const method = request.method.toUpperCase();
  const retryStrategy: BrainRetryStrategy = baseUrlDetails.hadApiV1Suffix
    ? "normalized-base-retry"
    : "none";
  const attemptedBaseUrls = baseUrlDetails.implicitDefault
    ? baseUrlDetails.localDevCandidateBaseUrls
    : ([
        baseUrlDetails.rawBaseUrl ?? baseUrl,
        ...(
          retryStrategy === "normalized-base-retry" &&
          baseUrlDetails.normalizedBaseUrl &&
          baseUrlDetails.normalizedBaseUrl !== baseUrlDetails.rawBaseUrl
            ? [baseUrlDetails.normalizedBaseUrl]
            : []
        ),
      ].filter(Boolean) as string[]);

  try {
    const requestBody =
      method === "GET" || method === "HEAD"
        ? undefined
        : await request.clone().arrayBuffer();

    let lastStatusCode: number | null = null;
    let lastFallbackReason: string | null = null;
    let lastUpstreamHost = upstreamHost;
    for (const [attemptIndex, attemptBaseUrl] of attemptedBaseUrls.entries()) {
      lastUpstreamHost = resolveUpstreamHost(attemptBaseUrl);

      try {
        const proxiedResponse = await fetch(`${attemptBaseUrl}${targetPath}`, {
          method,
          headers: buildForwardHeaders(request),
          body: requestBody,
          cache: "no-store",
          signal: controller.signal,
        });

        if (shouldFallback(proxiedResponse)) {
          lastStatusCode = proxiedResponse.status;
          lastFallbackReason = `brain-status-${proxiedResponse.status}`;
          const canRetryWithNormalizedBase =
            proxiedResponse.status === 404 &&
            retryStrategy === "normalized-base-retry" &&
            attemptIndex === 0 &&
            attemptedBaseUrls.length > 1;
          const canRetryWithNextLocalCandidate =
            baseUrlDetails.implicitDefault && attemptIndex < attemptedBaseUrls.length - 1;

          if (canRetryWithNormalizedBase) {
            console.warn(
              `[BRAIN_PROXY] Brain returned 404 for ${targetPath} via ${attemptBaseUrl}; retrying with normalized base ${attemptedBaseUrls[attemptIndex + 1]}.`
            );
            continue;
          }

          if (canRetryWithNextLocalCandidate) {
            console.warn(
              `[BRAIN_PROXY] Brain returned ${proxiedResponse.status} for ${targetPath} via ${attemptBaseUrl}; retrying next local candidate ${attemptedBaseUrls[attemptIndex + 1]}.`
            );
            continue;
          }

          console.warn(
            `[BRAIN_PROXY] Falling back for ${targetPath}: backend returned ${proxiedResponse.status} (${lastFallbackReason}).`
          );
          return {
            response: null,
            targetPath,
            upstreamHost: lastUpstreamHost,
            fallbackReason: lastFallbackReason,
            statusCode: lastStatusCode,
            retryStrategy,
            elapsedMs: Date.now() - startedAt,
            timeoutMs,
          };
        }

        const responseHeaders = new Headers();
        const contentType = proxiedResponse.headers.get("content-type");
        if (contentType) responseHeaders.set("content-type", contentType);

        const cacheControl = proxiedResponse.headers.get("cache-control");
        if (cacheControl) responseHeaders.set("cache-control", cacheControl);

        const transportHeaders = buildTransportHeaders({
          transport: "remote-brain-proxy",
          targetPath,
          upstreamHost: lastUpstreamHost,
        });
        transportHeaders.forEach((value, key) => {
          responseHeaders.set(key, value);
        });

        console.info(
          `[BRAIN_PROXY] Remote brain proxy succeeded for ${targetPath} via ${lastUpstreamHost ?? "unknown-upstream"}.`
        );

        return {
          response: new Response(proxiedResponse.body, {
            status: proxiedResponse.status,
            statusText: proxiedResponse.statusText,
            headers: responseHeaders,
          }),
          targetPath,
          upstreamHost: lastUpstreamHost,
          fallbackReason: null,
          statusCode: null,
          retryStrategy,
          elapsedMs: Date.now() - startedAt,
          timeoutMs,
        };
      } catch (error) {
        lastFallbackReason = fallbackReasonFromError(error);
        const canRetryWithNextLocalCandidate =
          baseUrlDetails.implicitDefault &&
          !(error instanceof DOMException && error.name === "AbortError") &&
          attemptIndex < attemptedBaseUrls.length - 1;

        if (canRetryWithNextLocalCandidate) {
          console.warn(
            `[BRAIN_PROXY] Fetch failed for ${targetPath} via ${attemptBaseUrl} (${lastFallbackReason}); retrying next local candidate ${attemptedBaseUrls[attemptIndex + 1]}.`
          );
          continue;
        }

        console.warn(
          `[BRAIN_PROXY] Falling back for ${targetPath}: ${lastFallbackReason}.`,
          error
        );
        return {
          response: null,
          targetPath,
          upstreamHost: lastUpstreamHost,
          fallbackReason: lastFallbackReason,
          statusCode: null,
          retryStrategy,
          elapsedMs: Date.now() - startedAt,
          timeoutMs,
        };
      }
    }

    return {
      response: null,
      targetPath,
      upstreamHost: lastUpstreamHost,
      fallbackReason: lastFallbackReason ?? "brain-proxy-unavailable",
      statusCode: lastStatusCode,
      retryStrategy,
      elapsedMs: Date.now() - startedAt,
      timeoutMs,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export const brainClientInternals = {
  normalizeBaseUrl,
  trimTrailingSlash,
  resolveLocalDevBrainBaseUrls,
  resolveBrainBaseUrlDetails,
};

function createSseResponse(body: ReadableStream<Uint8Array>, extraHeaders?: HeadersInit) {
  return new Response(body, {
    status: 200,
    headers: mergeHeaders(
      {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
      extraHeaders
    ),
  });
}

export function createMockBrainStreamResponse() {
  const encoder = new TextEncoder();
  const events = [
    'event: meta\ndata: {"source":"next-fallback","mode":"mock"}\n\n',
    'event: reasoning\ndata: {"message":"FastAPI SSE endpoint is not available yet, using fallback stream."}\n\n',
    'event: final\ndata: {"message":"Fallback stream completed."}\n\n',
  ];

  return createSseResponse(
    new ReadableStream<Uint8Array>({
      start(controller) {
        events.forEach((event, index) => {
          setTimeout(() => {
            controller.enqueue(encoder.encode(event));
            if (index === events.length - 1) controller.close();
          }, index * 80);
        });
      },
    }),
    buildTransportHeaders({
      transport: "next-stream-fallback",
      targetPath: "/api/v1/stream/agent",
      fallbackReason: "brain-stream-mock-fallback",
    })
  );
}
