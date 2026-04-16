import { NextResponse } from "next/server";
import type {
  ParentStoryBookRequest,
  ParentStoryBookResponse,
  ParentStoryBookTransport,
} from "@/lib/ai/types";
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

export const runtime = "nodejs";
const DEFAULT_PARENT_STORYBOOK_BRAIN_TIMEOUT_MS = 45_000;

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

function buildBrainProxyErrorHeaders(brainForward: BrainForwardResult) {
  return createBrainTransportHeaders({
    transport: "brain-proxy-error",
    targetPath: brainForward.targetPath,
    upstreamHost: brainForward.upstreamHost,
    fallbackReason: brainForward.fallbackReason ?? "brain-proxy-unavailable",
  });
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
  return {
    ...story,
    fallbackReason: story.fallbackReason ?? meta.fallbackReason,
    providerMeta: {
      ...story.providerMeta,
      transport: normalizeStoryBookTransport(meta.transport),
      fallbackReason: story.providerMeta.fallbackReason ?? meta.fallbackReason,
      diagnostics: {
        brain: {
          reachable: meta.transport === "remote-brain-proxy",
          fallbackReason: meta.fallbackReason,
          upstreamHost: meta.upstreamHost,
          statusCode: meta.statusCode ?? story.providerMeta.diagnostics?.brain?.statusCode ?? null,
          retryStrategy:
            meta.retryStrategy ??
            story.providerMeta.diagnostics?.brain?.retryStrategy ??
            "none",
          elapsedMs:
            meta.elapsedMs ??
            story.providerMeta.diagnostics?.brain?.elapsedMs ??
            null,
          timeoutMs:
            meta.timeoutMs ??
            story.providerMeta.diagnostics?.brain?.timeoutMs ??
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

function buildBrainProxyUnavailableResponse(brainForward: BrainForwardResult) {
  return NextResponse.json(
    {
      error: "Parent storybook brain is unavailable",
      code: "brain-proxy-unavailable",
      diagnostics: {
        transport: "brain-proxy-error",
        targetPath: brainForward.targetPath,
        upstreamHost: brainForward.upstreamHost,
        fallbackReason: brainForward.fallbackReason ?? "brain-proxy-unavailable",
        statusCode: brainForward.statusCode,
        retryStrategy: brainForward.retryStrategy,
        elapsedMs: brainForward.elapsedMs,
        timeoutMs: brainForward.timeoutMs,
      },
    },
    {
      status: 503,
      headers: mergeHeaders(
        buildBrainProxyErrorHeaders(brainForward),
        buildCacheHeaders("bypass")
      ),
    }
  );
}

export async function POST(request: Request) {
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

  const bypassCache = shouldBypassStoryCache(request);
  const cacheKey = buildParentStoryBookRequestCacheKey(payload);
  const cachedResponse = bypassCache ? null : getCachedParentStoryBookResponse(cacheKey);

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

  const brainForward = await forwardBrainRequest(
    request,
    "/api/v1/agents/parent/storybook",
    { timeoutMs: PARENT_STORYBOOK_BRAIN_TIMEOUT_MS }
  );

  if (brainForward.response) {
    const remoteStory = await parseRemoteStoryResponse(brainForward.response.clone());
    if (!remoteStory) {
      return brainForward.response;
    }

    const preparedStory = attachTransportMetadata(
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

  return buildBrainProxyUnavailableResponse(brainForward);
}
