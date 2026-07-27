import { NextResponse } from "next/server";
import type {
  ParentStoryBookRequest,
  ParentStoryBookResponse,
  ParentStoryBookTransport,
} from "@/lib/ai/types";
import {
  attestAiJsonResponse,
  attestAiResult,
  type AiProvenanceContext,
} from "@/lib/ai/provenance-attestation";
import { buildAiProviderTrace, buildAiProviderTraceFromProviderMeta } from "@/lib/ai/provider-trace";
import { buildParentStoryBookResponse } from "@/lib/agent/parent-storybook";
import {
  buildParentStoryBookRequestCacheKey,
  getCachedParentStoryBookResponse,
  prepareParentStoryBookResponseForDelivery,
  setCachedParentStoryBookResponse,
  shouldCacheParentStoryBookResponse,
} from "@/lib/server/parent-storybook-cache";
import {
  createBrainTransportHeaders,
  forwardBrainRequest,
  type BrainForwardResult,
  type BrainTransport,
} from "@/lib/server/brain-client";
import {
  enhanceParentStoryBookWithRealText,
  ParentStoryBookRealTextError,
  shouldRequireNextRealStoryText,
} from "@/lib/server/parent-storybook-real-text";
import { aiRouteLimitedResponse, authorizeAiRouteSession } from "@/lib/server/ai-route-guard";
import { ApiRouteError } from "@/lib/server/api-errors";
import {
  buildServiceScopeClaim,
  getSessionScope,
  requireScopedChild,
} from "@/lib/server/session-scope";
import { logSecurityEvent } from "@/lib/server/security-log";

export const runtime = "nodejs";
export const maxDuration = 120;
const DEFAULT_PARENT_STORYBOOK_BRAIN_TIMEOUT_MS = 45_000;
const DEFAULT_PARENT_STORYBOOK_REQUEST_TIMEOUT_MS = 70_000;
const MAX_PARENT_STORYBOOK_BRAIN_TIMEOUT_MS = 45_000;
const MAX_PARENT_STORYBOOK_REQUEST_TIMEOUT_MS = 90_000;
const ROLE_PARENT = "家长";
const ROLE_TEACHER = "教师";

function resolveBoundedTimeoutMs(
  rawValue: string | undefined,
  fallbackMs: number,
  maximumMs: number
) {
  const parsed = rawValue?.trim() ? Number(rawValue.trim()) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackMs;
  return Math.min(Math.round(parsed), maximumMs);
}

function resolveParentStoryBookBrainTimeoutMs() {
  const rawValue =
    process.env.PARENT_STORYBOOK_BRAIN_TIMEOUT_MS?.trim() ??
    process.env.BRAIN_API_TIMEOUT_MS?.trim();
  return resolveBoundedTimeoutMs(
    rawValue,
    DEFAULT_PARENT_STORYBOOK_BRAIN_TIMEOUT_MS,
    MAX_PARENT_STORYBOOK_BRAIN_TIMEOUT_MS
  );
}

function resolveParentStoryBookBackendMediaTimeoutMs() {
  const rawValue =
    process.env.PARENT_STORYBOOK_BACKEND_MEDIA_TIMEOUT_MS?.trim() ??
    process.env.PARENT_STORYBOOK_BACKEND_GRACE_TIMEOUT_MS?.trim();
  return resolveBoundedTimeoutMs(
    rawValue,
    resolveParentStoryBookBrainTimeoutMs(),
    MAX_PARENT_STORYBOOK_BRAIN_TIMEOUT_MS
  );
}

function resolveParentStoryBookRequestTimeoutMs() {
  return resolveBoundedTimeoutMs(
    process.env.PARENT_STORYBOOK_REQUEST_TIMEOUT_MS,
    DEFAULT_PARENT_STORYBOOK_REQUEST_TIMEOUT_MS,
    MAX_PARENT_STORYBOOK_REQUEST_TIMEOUT_MS
  );
}

export const parentStoryBookRouteInternals = {
  resolveParentStoryBookBackendMediaTimeoutMs,
  resolveParentStoryBookBrainTimeoutMs,
  resolveParentStoryBookRequestTimeoutMs,
};

function normalizeStoryBookTransport(transport: BrainTransport): ParentStoryBookTransport {
  if (transport === "brain-proxy-error") {
    return "next-json-fallback";
  }
  return transport;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function shouldBypassStoryCache(request: Request) {
  const headerValue = request.headers.get("x-smartchildcare-cache-bypass");
  return headerValue === "1" || headerValue === "true";
}

function isParentStoryBookRequest(payload: unknown): payload is ParentStoryBookRequest {
  if (!isRecord(payload)) return false;
  if (!isRecord(payload.snapshot)) return false;
  if (!isRecord(payload.snapshot.child)) return false;
  if (
    "pageCount" in payload &&
    payload.pageCount !== undefined &&
    payload.pageCount !== 4 &&
    payload.pageCount !== 5 &&
    payload.pageCount !== 6 &&
    payload.pageCount !== 8
  ) {
    return false;
  }
  if (
    "styleMode" in payload &&
    payload.styleMode !== undefined &&
    payload.styleMode !== "preset" &&
    payload.styleMode !== "custom"
  ) {
    return false;
  }
  return Array.isArray(payload.highlightCandidates);
}

function buildCacheHeaders(value: "hit" | "miss" | "bypass") {
  const headers = new Headers();
  headers.set("x-smartchildcare-storybook-cache", value);
  return headers;
}

function mergeHeaders(...groups: Array<HeadersInit | undefined>) {
  const headers = new Headers();

  for (const group of groups) {
    if (!group) continue;
    new Headers(group).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  headers.set("cache-control", "no-store");
  return headers;
}

async function parseRemoteStoryResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;

  try {
    return (await response.json()) as ParentStoryBookResponse;
  } catch {
    return null;
  }
}

function attachTransportMetadata(
  story: ParentStoryBookResponse,
  meta: {
    transport: Exclude<BrainTransport, "brain-proxy-error">;
    fallbackReason: string | null;
    upstreamHost: string | null;
    statusCode?: number | null;
    retryStrategy?: "none" | "normalized-base-retry";
    elapsedMs?: number | null;
    timeoutMs?: number | null;
  }
) {
  const storyBrainDiagnostics = story.providerMeta.diagnostics?.brain;
  const providerMeta = {
    ...story.providerMeta,
    transport: normalizeStoryBookTransport(meta.transport),
    fallbackReason: story.providerMeta.fallbackReason ?? meta.fallbackReason,
    diagnostics: {
      brain: {
        reachable: storyBrainDiagnostics?.reachable ?? meta.transport === "remote-brain-proxy",
        fallbackReason: storyBrainDiagnostics?.fallbackReason ?? meta.fallbackReason,
        upstreamHost: storyBrainDiagnostics?.upstreamHost ?? meta.upstreamHost,
        statusCode: storyBrainDiagnostics?.statusCode ?? meta.statusCode ?? null,
        retryStrategy:
          storyBrainDiagnostics?.retryStrategy ??
          meta.retryStrategy ??
          "none",
        elapsedMs:
          storyBrainDiagnostics?.elapsedMs ??
          meta.elapsedMs ??
          null,
        timeoutMs:
          storyBrainDiagnostics?.timeoutMs ??
          meta.timeoutMs ??
          null,
      },
      image: story.providerMeta.diagnostics?.image ?? {
        requestedProvider: story.providerMeta.imageProvider,
        resolvedProvider: story.providerMeta.imageProvider,
        liveEnabled:
          story.providerMeta.imageDelivery === "real" ||
          story.providerMeta.imageDelivery === "mixed",
        missingConfig: [],
        jobStatus: "idle",
        pendingSceneCount: 0,
        readySceneCount: 0,
        errorSceneCount: 0,
        lastErrorStage: null,
        lastErrorReason: null,
        elapsedMs: null,
      },
      audio: story.providerMeta.diagnostics?.audio ?? {
        requestedProvider: story.providerMeta.audioProvider,
        resolvedProvider: story.providerMeta.audioProvider,
        liveEnabled:
          story.providerMeta.audioDelivery === "real" ||
          story.providerMeta.audioDelivery === "mixed",
        missingConfig: [],
        jobStatus: "idle",
        pendingSceneCount: 0,
        readySceneCount: 0,
        errorSceneCount: 0,
        lastErrorStage: null,
        lastErrorReason: null,
        elapsedMs: null,
      },
    },
  };
  return {
    ...story,
    fallbackReason: story.fallbackReason ?? meta.fallbackReason,
    provider: providerMeta.provider,
    providerTrace: buildAiProviderTraceFromProviderMeta({
      providerMeta,
      source: story.source,
      fallback: story.fallback,
      fallbackReason: story.fallbackReason ?? meta.fallbackReason,
      capability: "llm",
    }),
    providerMeta,
  } satisfies ParentStoryBookResponse;
}

function isDemoSeedRequest(payload: ParentStoryBookRequest) {
  return payload.requestSource?.startsWith("parent-storybook-demo-seed:") ?? false;
}

function resolveRequestChildId(payload: ParentStoryBookRequest) {
  if (typeof payload.childId === "string" && payload.childId.trim()) {
    return payload.childId.trim();
  }
  const snapshotChild = payload.snapshot.child;
  if (isRecord(snapshotChild) && typeof snapshotChild.id === "string" && snapshotChild.id.trim()) {
    const snapshotChildId = snapshotChild.id.trim();
    return snapshotChildId === "storybook-guest" ? "" : snapshotChildId;
  }
  return "";
}

function resolveSnapshotChildId(payload: ParentStoryBookRequest) {
  const snapshotChild = payload.snapshot.child;
  if (isRecord(snapshotChild) && typeof snapshotChild.id === "string" && snapshotChild.id.trim()) {
    const snapshotChildId = snapshotChild.id.trim();
    return snapshotChildId === "storybook-guest" ? "" : snapshotChildId;
  }
  return "";
}

function buildLocalStoryBookFallback(input: {
  payload: ParentStoryBookRequest;
  institutionId: string;
  brainForward?: BrainForwardResult;
  fallbackReason: string;
  cacheState: "miss" | "bypass";
}) {
  return attachTransportMetadata(
    prepareParentStoryBookResponseForDelivery(
      buildParentStoryBookResponse(input.payload, {
        transport: "next-json-fallback",
        fallbackReason: input.fallbackReason,
        source: "fallback",
        fallback: true,
        upstreamHost: input.brainForward?.upstreamHost,
        statusCode: input.brainForward?.statusCode,
        retryStrategy: input.brainForward?.retryStrategy,
      }),
      {
        cacheState: input.cacheState,
        institutionId: input.institutionId,
      }
    ),
    {
      transport: "next-json-fallback",
      fallbackReason: input.fallbackReason,
      upstreamHost: input.brainForward?.upstreamHost ?? null,
      statusCode: input.brainForward?.statusCode,
      retryStrategy: input.brainForward?.retryStrategy,
      elapsedMs: input.brainForward?.elapsedMs,
      timeoutMs: input.brainForward?.timeoutMs,
    }
  );
}

function buildLocalStoryBookFallbackHeaders(input: {
  brainForward?: BrainForwardResult;
  fallbackReason: string;
  cacheState: "miss" | "bypass";
  demoSeedIsolated?: boolean;
}) {
  const headers = mergeHeaders(
    createBrainTransportHeaders({
      transport: "next-json-fallback",
      targetPath: input.brainForward?.targetPath ?? "/api/v1/agents/parent/storybook",
      upstreamHost: input.brainForward?.upstreamHost ?? null,
      fallbackReason: input.fallbackReason,
    }),
    buildCacheHeaders(input.cacheState)
  );
  if (input.demoSeedIsolated) {
    headers.set("x-smartchildcare-storybook-demo-seed", "isolated");
  }
  return headers;
}

function buildProviderUnavailableResponse(input: {
  brainForward: BrainForwardResult;
  fallbackReason: string;
  statusCode?: number;
}) {
  const providerTrace = buildAiProviderTrace({
    capability: "llm",
    provider: "remote-brain",
    source: "fallback",
    mode: "fallback",
    fallback: true,
    fallbackReason: input.fallbackReason,
    realProvider: false,
    transport: "brain-proxy-error",
    transportSource: "next-server",
    extra: {
      upstreamHost: input.brainForward.upstreamHost,
    },
  });
  return NextResponse.json(
    {
      code: "brain-proxy-unavailable",
      source: "fallback",
      provider: providerTrace.provider,
      fallback: true,
      error: "真实绘本生成暂不可用，请稍后重试。",
      fallbackReason: input.fallbackReason,
      providerTrace,
      diagnostics: {
        transport: "brain-proxy-error",
        targetPath: input.brainForward.targetPath,
        upstreamHost: input.brainForward.upstreamHost,
        fallbackReason: input.fallbackReason,
        statusCode: input.brainForward.statusCode,
        retryStrategy: input.brainForward.retryStrategy,
        elapsedMs: input.brainForward.elapsedMs,
        timeoutMs: input.brainForward.timeoutMs,
      },
    },
    {
      status: input.statusCode ?? 503,
      headers: mergeHeaders(
        createBrainTransportHeaders({
          transport: "brain-proxy-error",
          targetPath: input.brainForward.targetPath,
          upstreamHost: input.brainForward.upstreamHost,
          fallbackReason: input.fallbackReason,
        }),
        buildCacheHeaders("bypass")
      ),
    }
  );
}

function shouldRequireRealStoryTextInThisRuntime() {
  return process.env.PARENT_STORYBOOK_REQUIRE_REAL_TEXT === "1" || process.env.NODE_ENV === "production";
}

function buildTextProviderUnavailableResponse(input: {
  brainForward?: BrainForwardResult;
  fallbackReason: string;
  statusCode?: number;
  attemptCount?: number;
  attemptedProviders?: string[];
  provider?: string | null;
  providerHttpStatus?: number | null;
  failureKind?: string | null;
}) {
  const providerTrace = buildAiProviderTrace({
    capability: "llm",
    provider: input.provider ?? "vivo-chat+dashscope",
    source: "fallback",
    mode: "fallback",
    fallback: true,
    fallbackReason: input.fallbackReason,
    realProvider: false,
    transport: input.brainForward ? "remote-brain-proxy" : "next-json-fallback",
    transportSource: "next-server",
    extra: {
      upstreamHost: input.brainForward?.upstreamHost ?? null,
    },
  });
  return NextResponse.json(
    {
      code: "storybook-text-provider-unavailable",
      source: "fallback",
      provider: providerTrace.provider,
      fallback: true,
      error: "AI 生成失败，请检查服务配置。",
      fallbackReason: input.fallbackReason,
      providerTrace,
      diagnostics: {
        transport: input.brainForward ? "remote-brain-proxy" : "next-json-fallback",
        targetPath: input.brainForward?.targetPath ?? "/api/v1/agents/parent/storybook",
        upstreamHost: input.brainForward?.upstreamHost ?? null,
        fallbackReason: input.fallbackReason,
        statusCode: input.brainForward?.statusCode ?? null,
        retryStrategy: input.brainForward?.retryStrategy ?? "none",
        elapsedMs: input.brainForward?.elapsedMs ?? null,
        timeoutMs: input.brainForward?.timeoutMs ?? null,
        textProvider: input.provider ?? "vivo-chat+dashscope",
        textAttemptCount: input.attemptCount ?? 0,
        attemptedProviders: input.attemptedProviders ?? [],
        providerHttpStatus: input.providerHttpStatus ?? null,
        failureKind: input.failureKind ?? null,
      },
    },
    {
      status: input.statusCode ?? 503,
      headers: mergeHeaders(
        createBrainTransportHeaders({
          transport: "brain-proxy-error",
          targetPath: input.brainForward?.targetPath ?? "/api/v1/agents/parent/storybook",
          upstreamHost: input.brainForward?.upstreamHost ?? null,
          fallbackReason: input.fallbackReason,
        }),
        buildCacheHeaders("bypass")
      ),
    }
  );
}

async function requireRealStoryTextResponse(input: {
  payload: ParentStoryBookRequest;
  story: ParentStoryBookResponse;
  institutionId: string;
  cacheState: "miss" | "bypass";
  brainForward?: BrainForwardResult;
  signal?: AbortSignal;
  deadlineAtMs?: number;
}) {
  try {
    const enhanced = await enhanceParentStoryBookWithRealText({
      payload: input.payload,
      story: input.story,
      signal: input.signal,
      deadlineAtMs: input.deadlineAtMs,
    });
    const tracedEnhanced = {
      ...enhanced,
      provider: enhanced.providerMeta.provider,
      providerTrace: buildAiProviderTraceFromProviderMeta({
        providerMeta: enhanced.providerMeta,
        source: enhanced.source,
        fallback: enhanced.fallback,
        fallbackReason: enhanced.fallbackReason,
        capability: "llm",
      }),
    } satisfies ParentStoryBookResponse;
    return prepareParentStoryBookResponseForDelivery(
      tracedEnhanced,
      {
        cacheState: input.cacheState,
        institutionId: input.institutionId,
      }
    );
  } catch (error) {
    const fallbackReason =
      error instanceof ParentStoryBookRealTextError
        ? error.fallbackReason
        : "provider-response-error";
    const statusCode =
      error instanceof ParentStoryBookRealTextError ? error.statusCode : 502;
    const attemptCount =
      error instanceof ParentStoryBookRealTextError ? error.attemptCount : 1;
    const attemptedProviders =
      error instanceof ParentStoryBookRealTextError
        ? error.attemptedProviders
        : [];
    const provider =
      error instanceof ParentStoryBookRealTextError
        ? error.provider
        : null;
    const providerHttpStatus =
      error instanceof ParentStoryBookRealTextError
        ? error.providerHttpStatus
        : null;
    const failureKind =
      error instanceof ParentStoryBookRealTextError
        ? error.failureKind
        : null;
    logSecurityEvent("warn", "ai.parent_storybook.text_provider_unavailable", {
      fallbackReason,
      statusCode,
      attemptCount,
      attemptedProviders,
      provider,
      providerHttpStatus,
      failureKind,
      upstreamHost: input.brainForward?.upstreamHost ?? null,
      brainStatusCode: input.brainForward?.statusCode ?? null,
    });
    return buildTextProviderUnavailableResponse({
      brainForward: input.brainForward,
      fallbackReason,
      statusCode,
      attemptCount,
      attemptedProviders,
      provider,
      providerHttpStatus,
      failureKind,
    });
  }
}

export async function POST(request: Request) {
  const requestTimeoutMs = resolveParentStoryBookRequestTimeoutMs();
  const requestDeadlineAtMs = Date.now() + requestTimeoutMs;
  const routeTimeoutSignal = AbortSignal.timeout(requestTimeoutMs);
  const routeSignal = AbortSignal.any([
    request.signal,
    routeTimeoutSignal,
  ]);
  const authResult = await authorizeAiRouteSession(request, {
    requiredRole: "parent-or-teacher",
    collectJsonClassNames: false,
    ignoredChildIds: ["storybook-guest"],
  });
  if (authResult instanceof Response) return authResult;

  let payload: ParentStoryBookRequest;

  try {
    const parsed = (await request.clone().json()) as unknown;
    if (!isParentStoryBookRequest(parsed)) {
      return NextResponse.json(
        { error: "Invalid parent storybook payload" },
        { status: 400, headers: buildCacheHeaders("bypass") }
      );
    }
    payload = parsed;
  } catch (error) {
    logSecurityEvent("error", "ai.parent_storybook.invalid_payload", { error });
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: buildCacheHeaders("bypass") }
    );
  }

  const requestedChildId = resolveRequestChildId(payload);
  const snapshotChildId = resolveSnapshotChildId(payload);
  const sessionUser = authResult.session.user;
  if (sessionUser.role !== ROLE_PARENT && sessionUser.role !== ROLE_TEACHER) {
    return aiRouteLimitedResponse(
      {
        reason: "role_mismatch",
        error: "Parent or teacher role required.",
        requiredRole: "parent-or-teacher",
      },
      { headers: buildCacheHeaders("bypass") }
    );
  }
  if (!requestedChildId) {
    return aiRouteLimitedResponse(
      {
        reason: "scope_required",
        error: "Child scope is required for storybook generation.",
        requiredRole: "parent-or-teacher",
      },
      { headers: buildCacheHeaders("bypass") }
    );
  }
  if (snapshotChildId && snapshotChildId !== requestedChildId) {
    return aiRouteLimitedResponse(
      {
        reason: "forbidden_child",
        error: "Storybook snapshot child does not match requested child",
        requiredRole: "parent-or-teacher",
      },
      { headers: buildCacheHeaders("bypass") }
    );
  }
  // demoSeed 包含固定演示材料，不能因开放教师真实生成而扩大到教师会话。
  if (isDemoSeedRequest(payload) && sessionUser.role !== ROLE_PARENT) {
    return aiRouteLimitedResponse(
      {
        reason: "role_mismatch",
        error: "Demo seed storybooks are only available to demo parent accounts.",
        requiredRole: "parent",
      },
      { headers: buildCacheHeaders("bypass") }
    );
  }
  if (isDemoSeedRequest(payload) && sessionUser.accountKind !== "demo") {
    return aiRouteLimitedResponse(
      {
        reason: "demo_seed_only",
        error: "Demo seed storybooks are only available to demo parent accounts.",
        requiredRole: "parent",
      },
      { headers: buildCacheHeaders("bypass") }
    );
  }
  const sessionScope = await getSessionScope(authResult.session);
  if (!isDemoSeedRequest(payload)) {
    try {
      requireScopedChild(sessionScope, requestedChildId);
    } catch (error) {
      if (error instanceof ApiRouteError && (error.code === "forbidden_scope" || error.code === "not_found")) {
        return aiRouteLimitedResponse(
          {
            reason: "forbidden_child",
            error: "Current account cannot access this child storybook scope.",
            requiredRole: "parent-or-teacher",
          },
          { headers: buildCacheHeaders("bypass") }
        );
      }
      throw error;
    }
  }
  payload = {
    ...payload,
    childId: requestedChildId,
  };
  const provenanceContext: AiProvenanceContext = {
    userId: sessionUser.id,
    institutionId: sessionUser.institutionId,
    capability: "parent-storybook",
    scopeId: requestedChildId,
  };

  const bypassCache = shouldBypassStoryCache(request);
  const cacheKey = buildParentStoryBookRequestCacheKey(payload);
  const cachedResponse = bypassCache ? null : getCachedParentStoryBookResponse(cacheKey);

  if (isDemoSeedRequest(payload)) {
    const fallbackReason = "demo-seed-isolated";
    const localStory = buildLocalStoryBookFallback({
      payload,
      institutionId: sessionScope.institutionId,
      fallbackReason,
      cacheState: "bypass",
    });

    return NextResponse.json(
      attestAiResult(localStory, provenanceContext),
      {
        status: 200,
        headers: buildLocalStoryBookFallbackHeaders({
          fallbackReason,
          cacheState: "bypass",
          demoSeedIsolated: true,
        }),
      }
    );
  }

  if (cachedResponse) {
    const cachedStory = attachTransportMetadata(
      prepareParentStoryBookResponseForDelivery(cachedResponse.story, {
        cacheState: "hit",
        ttlSeconds: cachedResponse.story.cacheMeta?.ttlSeconds,
        institutionId: sessionScope.institutionId,
      }),
      {
        transport: cachedResponse.transport,
        fallbackReason: cachedResponse.fallbackReason,
        upstreamHost: cachedResponse.upstreamHost,
        statusCode: cachedResponse.story.providerMeta.diagnostics?.brain?.statusCode ?? null,
        retryStrategy:
          cachedResponse.story.providerMeta.diagnostics?.brain?.retryStrategy ?? "none",
      }
    );

    return NextResponse.json(
      attestAiResult(cachedStory, provenanceContext),
      {
        status: 200,
        headers: mergeHeaders(
          createBrainTransportHeaders({
            transport: cachedResponse.transport,
            targetPath: cachedResponse.targetPath,
            upstreamHost: cachedResponse.upstreamHost,
            fallbackReason: cachedResponse.fallbackReason,
          }),
          buildCacheHeaders("hit")
        ),
      }
    );
  }

  const requireRealStoryText = shouldRequireRealStoryTextInThisRuntime();
  const brainRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(payload),
    signal: routeSignal,
  });
  const configuredBrainTimeoutMs = requireRealStoryText
    ? resolveParentStoryBookBackendMediaTimeoutMs()
    : resolveParentStoryBookBrainTimeoutMs();
  const remainingRequestBudgetMs = requestDeadlineAtMs - Date.now();
  if (remainingRequestBudgetMs <= 0) {
    logSecurityEvent("warn", "ai.parent_storybook.deadline_before_brain", {
      attemptCount: 0,
    });
    return attestAiJsonResponse(
      buildTextProviderUnavailableResponse({
        fallbackReason: "provider-deadline-exceeded",
        statusCode: 504,
        attemptCount: 0,
      }),
      provenanceContext
    );
  }
  const brainForward = await forwardBrainRequest(
    brainRequest,
    "/api/v1/agents/parent/storybook",
    {
      timeoutMs: Math.min(
        configuredBrainTimeoutMs,
        remainingRequestBudgetMs
      ),
      serviceScope: buildServiceScopeClaim(sessionScope),
      bufferResponseBody: true,
    }
  );

  if (brainForward.response) {
    const remoteStory = await parseRemoteStoryResponse(brainForward.response.clone());
    if (!brainForward.response.ok || !remoteStory) {
      const fallbackReason =
        brainForward.fallbackReason ??
        (!brainForward.response.ok ? "brain-proxy-non-ok" : "brain-proxy-invalid-json");
      return buildProviderUnavailableResponse({
        brainForward,
        fallbackReason,
        statusCode: brainForward.response.status >= 500 ? 503 : brainForward.response.status,
      });
    }

    let preparedStory: ParentStoryBookResponse = attachTransportMetadata(
      prepareParentStoryBookResponseForDelivery(remoteStory, {
        cacheState: shouldCacheParentStoryBookResponse(remoteStory) ? "miss" : "bypass",
        institutionId: sessionScope.institutionId,
      }),
      {
        transport: "remote-brain-proxy",
        fallbackReason: null,
        upstreamHost: brainForward.upstreamHost,
        statusCode: brainForward.statusCode,
        retryStrategy: brainForward.retryStrategy,
        elapsedMs: brainForward.elapsedMs,
        timeoutMs: brainForward.timeoutMs,
      }
    );

    if (requireRealStoryText && shouldRequireNextRealStoryText(preparedStory)) {
      const enhancedStory = await requireRealStoryTextResponse({
        payload,
        story: preparedStory,
        institutionId: sessionScope.institutionId,
        cacheState: shouldCacheParentStoryBookResponse(preparedStory) ? "miss" : "bypass",
        brainForward,
        signal: routeSignal,
        deadlineAtMs: requestDeadlineAtMs,
      });
      if (enhancedStory instanceof NextResponse) {
        return attestAiJsonResponse(
          enhancedStory,
          provenanceContext
        );
      }
      preparedStory = enhancedStory;
    }

    if (shouldCacheParentStoryBookResponse(preparedStory) && !bypassCache) {
      setCachedParentStoryBookResponse(cacheKey, {
        story: preparedStory,
        transport: "remote-brain-proxy",
        targetPath: brainForward.targetPath,
        upstreamHost: brainForward.upstreamHost,
        fallbackReason: null,
      });
    }

    return NextResponse.json(
      attestAiResult(preparedStory, provenanceContext),
      {
        status: brainForward.response.status,
        headers: mergeHeaders(
          brainForward.response.headers,
          buildCacheHeaders(
            preparedStory.cacheMeta?.storyResponse ?? "bypass"
          )
        ),
      }
    );
  }

  const fallbackReason = brainForward.fallbackReason ?? "brain-proxy-unavailable";
  if (requireRealStoryText) {
    const localStory = buildLocalStoryBookFallback({
      payload,
      institutionId: sessionScope.institutionId,
      brainForward,
      fallbackReason,
      cacheState: "bypass",
    });
    const enhancedStory = await requireRealStoryTextResponse({
      payload,
      story: localStory,
      institutionId: sessionScope.institutionId,
      cacheState: "bypass",
      brainForward,
      signal: routeSignal,
      deadlineAtMs: requestDeadlineAtMs,
    });
    if (enhancedStory instanceof NextResponse) {
      return attestAiJsonResponse(
        enhancedStory,
        provenanceContext
      );
    }

    return NextResponse.json(
      attestAiResult(enhancedStory, provenanceContext),
      {
        status: 200,
        headers: mergeHeaders(
          createBrainTransportHeaders({
            transport: "next-json-fallback",
            targetPath: brainForward.targetPath,
            upstreamHost: brainForward.upstreamHost,
            fallbackReason: null,
          }),
          buildCacheHeaders("bypass")
        ),
      }
    );
  }

  const localStory = buildLocalStoryBookFallback({
    payload,
    institutionId: sessionScope.institutionId,
    brainForward,
    fallbackReason,
    cacheState: "bypass",
  });

  return NextResponse.json(
    attestAiResult(localStory, provenanceContext),
    {
      status: 200,
      headers: buildLocalStoryBookFallbackHeaders({
        brainForward,
        fallbackReason,
        cacheState: "bypass",
      }),
    }
  );
}
