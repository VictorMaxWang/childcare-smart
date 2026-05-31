import { NextResponse } from "next/server";
import type {
  ParentStoryBookRequest,
  ParentStoryBookResponse,
  ParentStoryBookTransport,
} from "@/lib/ai/types";
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
  enhanceParentStoryBookWithVivoText,
  ParentStoryBookRealTextError,
  shouldRequireNextVivoStoryText,
} from "@/lib/server/parent-storybook-real-text";
import { authorizeAiRoute } from "@/lib/server/ai-route-guard";
import { requireDemoSession } from "@/lib/server/session";

export const runtime = "nodejs";
const DEFAULT_PARENT_STORYBOOK_BRAIN_TIMEOUT_MS = 45_000;
const ROLE_PARENT = "家长";

function resolveParentStoryBookBrainTimeoutMs() {
  const rawValue =
    process.env.PARENT_STORYBOOK_BRAIN_TIMEOUT_MS?.trim() ??
    process.env.BRAIN_API_TIMEOUT_MS?.trim();
  const parsed = rawValue ? Number(rawValue) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_PARENT_STORYBOOK_BRAIN_TIMEOUT_MS;
}

const PARENT_STORYBOOK_BRAIN_TIMEOUT_MS = resolveParentStoryBookBrainTimeoutMs();

function resolveParentStoryBookBackendMediaTimeoutMs() {
  const rawValue =
    process.env.PARENT_STORYBOOK_BACKEND_MEDIA_TIMEOUT_MS?.trim() ??
    process.env.PARENT_STORYBOOK_BACKEND_GRACE_TIMEOUT_MS?.trim();
  const parsed = rawValue ? Number(rawValue) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : PARENT_STORYBOOK_BRAIN_TIMEOUT_MS;
}

const PARENT_STORYBOOK_BACKEND_MEDIA_TIMEOUT_MS =
  resolveParentStoryBookBackendMediaTimeoutMs();

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
  return {
    ...story,
    fallbackReason: story.fallbackReason ?? meta.fallbackReason,
    providerMeta: {
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
    },
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
      { cacheState: input.cacheState }
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
  return NextResponse.json(
    {
      code: "brain-proxy-unavailable",
      error: "真实绘本生成暂不可用，请稍后重试。",
      fallbackReason: input.fallbackReason,
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
}) {
  return NextResponse.json(
    {
      code: "storybook-text-provider-unavailable",
      error: "AI 生成失败，请检查服务配置。",
      fallbackReason: input.fallbackReason,
      diagnostics: {
        transport: input.brainForward ? "remote-brain-proxy" : "next-json-fallback",
        targetPath: input.brainForward?.targetPath ?? "/api/v1/agents/parent/storybook",
        upstreamHost: input.brainForward?.upstreamHost ?? null,
        fallbackReason: input.fallbackReason,
        statusCode: input.brainForward?.statusCode ?? null,
        retryStrategy: input.brainForward?.retryStrategy ?? "none",
        elapsedMs: input.brainForward?.elapsedMs ?? null,
        timeoutMs: input.brainForward?.timeoutMs ?? null,
        textProvider: "vivo-chat",
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

async function requireVivoStoryTextResponse(input: {
  payload: ParentStoryBookRequest;
  story: ParentStoryBookResponse;
  cacheState: "miss" | "bypass";
  brainForward?: BrainForwardResult;
}) {
  try {
    return prepareParentStoryBookResponseForDelivery(
      await enhanceParentStoryBookWithVivoText({
        payload: input.payload,
        story: input.story,
      }),
      { cacheState: input.cacheState }
    );
  } catch (error) {
    const fallbackReason =
      error instanceof ParentStoryBookRealTextError
        ? error.fallbackReason
        : "provider-response-error";
    return buildTextProviderUnavailableResponse({
      brainForward: input.brainForward,
      fallbackReason,
      statusCode: error instanceof ParentStoryBookRealTextError ? error.statusCode : 502,
    });
  }
}

export async function POST(request: Request) {
  const authError = await authorizeAiRoute(request, {
    requiredRole: "parent",
    collectJsonClassNames: false,
  });
  if (authError) return authError;

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
    console.error("[AI] Invalid parent storybook payload", error);
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: buildCacheHeaders("bypass") }
    );
  }

  const requestedChildId = resolveRequestChildId(payload);
  const snapshotChildId = resolveSnapshotChildId(payload);
  const sessionUser = (await requireDemoSession(request)).user;
  if (sessionUser.role !== ROLE_PARENT) {
    return NextResponse.json(
      { error: "Parent role required" },
      { status: 403, headers: buildCacheHeaders("bypass") }
    );
  }
  if (!requestedChildId || !(sessionUser.childIds ?? []).includes(requestedChildId)) {
    return NextResponse.json(
      { error: "Child is not authorized for current parent" },
      { status: 403, headers: buildCacheHeaders("bypass") }
    );
  }
  if (snapshotChildId && snapshotChildId !== requestedChildId) {
    return NextResponse.json(
      { error: "Storybook snapshot child does not match requested child" },
      { status: 403, headers: buildCacheHeaders("bypass") }
    );
  }
  if (isDemoSeedRequest(payload) && sessionUser.accountKind !== "demo") {
    return NextResponse.json(
      { error: "Demo seed storybooks are only available to demo parent accounts" },
      { status: 403, headers: buildCacheHeaders("bypass") }
    );
  }
  payload = {
    ...payload,
    childId: requestedChildId,
  };

  const bypassCache = shouldBypassStoryCache(request);
  const cacheKey = buildParentStoryBookRequestCacheKey(payload);
  const cachedResponse = bypassCache ? null : getCachedParentStoryBookResponse(cacheKey);

  if (isDemoSeedRequest(payload)) {
    const fallbackReason = "demo-seed-isolated";
    const localStory = buildLocalStoryBookFallback({
      payload,
      fallbackReason,
      cacheState: "bypass",
    });

    return NextResponse.json(localStory, {
      status: 200,
      headers: buildLocalStoryBookFallbackHeaders({
        fallbackReason,
        cacheState: "bypass",
        demoSeedIsolated: true,
      }),
    });
  }

  if (cachedResponse) {
    const cachedStory = attachTransportMetadata(
      prepareParentStoryBookResponseForDelivery(cachedResponse.story, {
        cacheState: "hit",
        ttlSeconds: cachedResponse.story.cacheMeta?.ttlSeconds,
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

    return NextResponse.json(cachedStory, {
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
    });
  }

  const requireRealStoryText = shouldRequireRealStoryTextInThisRuntime();
  const brainForward = await forwardBrainRequest(
    request,
    "/api/v1/agents/parent/storybook",
    {
      timeoutMs: requireRealStoryText
        ? PARENT_STORYBOOK_BACKEND_MEDIA_TIMEOUT_MS
        : PARENT_STORYBOOK_BRAIN_TIMEOUT_MS,
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

    if (requireRealStoryText && shouldRequireNextVivoStoryText(preparedStory)) {
      const enhancedStory = await requireVivoStoryTextResponse({
        payload,
        story: preparedStory,
        cacheState: shouldCacheParentStoryBookResponse(preparedStory) ? "miss" : "bypass",
        brainForward,
      });
      if (enhancedStory instanceof NextResponse) {
        return enhancedStory;
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

    return NextResponse.json(preparedStory, {
      status: brainForward.response.status,
      headers: mergeHeaders(
        brainForward.response.headers,
        buildCacheHeaders(preparedStory.cacheMeta?.storyResponse ?? "bypass")
      ),
    });
  }

  const fallbackReason = brainForward.fallbackReason ?? "brain-proxy-unavailable";
  if (requireRealStoryText) {
    const localStory = buildLocalStoryBookFallback({
      payload,
      brainForward,
      fallbackReason,
      cacheState: "bypass",
    });
    const enhancedStory = await requireVivoStoryTextResponse({
      payload,
      story: localStory,
      cacheState: "bypass",
      brainForward,
    });
    if (enhancedStory instanceof NextResponse) {
      return enhancedStory;
    }

    return NextResponse.json(enhancedStory, {
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
    });
  }

  const localStory = buildLocalStoryBookFallback({
    payload,
    brainForward,
    fallbackReason,
    cacheState: "bypass",
  });

  return NextResponse.json(localStory, {
    status: 200,
    headers: buildLocalStoryBookFallbackHeaders({
      brainForward,
      fallbackReason,
      cacheState: "bypass",
    }),
  });
}
