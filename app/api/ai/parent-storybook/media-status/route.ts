import type {
  ParentStoryBookDiagnosticsChannel,
  ParentStoryBookImageDelivery,
  ParentStoryBookMediaStatusRequest,
  ParentStoryBookResponse,
  ParentStoryBookScene,
} from "@/lib/ai/types";
import { getVivoEnv, requestVivoTts } from "@/lib/providers/vivo";
import { authorizeAiRoute } from "@/lib/server/ai-route-guard";
import {
  createBrainTransportHeaders,
  forwardBrainRequest,
} from "@/lib/server/brain-client";
import {
  cacheParentStoryBookMediaDataUrl,
  prepareParentStoryBookResponseForDelivery,
} from "@/lib/server/parent-storybook-cache";
import { requireDemoSession } from "@/lib/server/session";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
const ROLE_PARENT = "家长";
const VIVO_IMAGE_GENERATION_PATH = "/api/v1/image_generation";
const VIVO_IMAGE_GENERATION_MODULE = "aigc";
const VIVO_IMAGE_RATE_LIMIT_BACKOFF_MS = 70_000;
const VIVO_IMAGE_ERROR_BACKOFF_MS = 20_000;

function resolveMediaStatusTimeoutMs() {
  const raw =
    process.env.PARENT_STORYBOOK_MEDIA_STATUS_TIMEOUT_MS ??
    process.env.PARENT_STORYBOOK_BACKEND_MEDIA_TIMEOUT_MS ??
    process.env.PARENT_STORYBOOK_BRAIN_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 1000 ? parsed : 60_000;
}

function isMediaStatusPayload(payload: unknown): payload is ParentStoryBookMediaStatusRequest {
  if (!payload || typeof payload !== "object") return false;
  const value = payload as Partial<ParentStoryBookMediaStatusRequest>;
  return (
    typeof value.childId === "string" &&
    value.childId.trim().length > 0 &&
    typeof value.storyId === "string" &&
    value.storyId.trim().length > 0 &&
    Boolean(value.story) &&
    typeof value.story === "object" &&
    value.story?.storyId === value.storyId &&
    value.story?.childId === value.childId &&
    Array.isArray(value.story?.scenes)
  );
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

function boundedConcurrency(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(max, Math.floor(parsed)));
}

function normalizePrioritySceneIndices(story: ParentStoryBookResponse, values: unknown) {
  const ordered: number[] = [];
  for (const rawValue of Array.isArray(values) ? values : []) {
    const sceneIndex = Number(rawValue);
    if (
      Number.isInteger(sceneIndex) &&
      sceneIndex >= 1 &&
      sceneIndex <= story.scenes.length &&
      !ordered.includes(sceneIndex)
    ) {
      ordered.push(sceneIndex);
    }
  }
  for (let sceneIndex = 1; sceneIndex <= Math.min(2, story.scenes.length); sceneIndex += 1) {
    if (!ordered.includes(sceneIndex)) ordered.push(sceneIndex);
  }
  for (const scene of story.scenes) {
    if (!ordered.includes(scene.sceneIndex)) ordered.push(scene.sceneIndex);
  }
  return ordered;
}

function orderedScenes(story: ParentStoryBookResponse, prioritySceneIndices: number[]) {
  const order = new Map(prioritySceneIndices.map((sceneIndex, index) => [sceneIndex, index]));
  return [...story.scenes].sort(
    (left, right) =>
      (order.get(left.sceneIndex) ?? 10_000) - (order.get(right.sceneIndex) ?? 10_000) ||
      left.sceneIndex - right.sceneIndex
  );
}

function isRealImageScene(scene: ParentStoryBookScene) {
  return scene.imageSourceKind === "real" && scene.imageStatus === "ready" && Boolean(scene.imageUrl);
}

function isRealAudioScene(scene: ParentStoryBookScene) {
  return scene.audioStatus === "ready" && Boolean(scene.audioUrl);
}

function resolveImageDelivery(story: ParentStoryBookResponse): ParentStoryBookImageDelivery {
  const kinds = new Set(
    story.scenes.map((scene) => scene.imageSourceKind ?? (scene.imageStatus === "ready" && scene.imageUrl ? "real" : "svg-fallback"))
  );
  if (kinds.size === 1) return kinds.values().next().value as ParentStoryBookImageDelivery;
  return "mixed";
}

function resolveAudioDelivery(story: ParentStoryBookResponse): ParentStoryBookResponse["providerMeta"]["audioDelivery"] {
  const readyCount = story.scenes.filter(isRealAudioScene).length;
  if (readyCount === 0) return "preview-only";
  if (readyCount === story.scenes.length) return "real";
  return "mixed";
}

function channelStatus(input: {
  liveEnabled: boolean;
  pendingSceneCount: number;
  readySceneCount: number;
  errorSceneCount: number;
}): NonNullable<ParentStoryBookDiagnosticsChannel["jobStatus"]> {
  if (!input.liveEnabled) return "disabled";
  if (input.pendingSceneCount > 0 && input.errorSceneCount > 0) return "partial";
  if (input.pendingSceneCount > 0) return "warming";
  if (input.errorSceneCount > 0 && input.readySceneCount > 0) return "partial";
  if (input.errorSceneCount > 0) return "error";
  if (input.readySceneCount > 0) return "ready";
  return "idle";
}

function missingVivoCoreEnv() {
  const env = getVivoEnv();
  const missing: string[] = [];
  if (!env.appId) missing.push("VIVO_APP_ID");
  if (!env.appKey) missing.push("VIVO_APP_KEY");
  if (!env.baseUrl) missing.push("VIVO_BASE_URL");
  return missing;
}

function normalizeErrorReason(error: unknown) {
  return error instanceof Error ? error.message : String(error || "unknown provider error");
}

function isVivoRateLimitError(errorReason: string | null | undefined) {
  return /(?:\b1003\b|rate\s*limit|too many requests|限流|频率)/iu.test(
    String(errorReason ?? "")
  );
}

function resolveImageRetryBackoffMs(errorReason: string) {
  const envValue = Number(process.env.STORYBOOK_IMAGE_RETRY_BACKOFF_MS);
  const fallback = isVivoRateLimitError(errorReason)
    ? VIVO_IMAGE_RATE_LIMIT_BACKOFF_MS
    : VIVO_IMAGE_ERROR_BACKOFF_MS;
  if (Number.isFinite(envValue) && envValue >= 1_000) {
    return Math.max(1_000, Math.floor(envValue));
  }
  return fallback;
}

function readEpochMs(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveVivoImageUrl(baseUrl: string, path: string) {
  return new URL(path, `${baseUrl.replace(/\/+$/u, "")}/`);
}

function extractVivoImageUrl(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const root = payload as Record<string, unknown>;
  const data = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : root;
  const images = data.images;
  if (Array.isArray(images)) {
    for (const item of images) {
      if (typeof item === "string" && item.trim()) return item.trim();
      if (item && typeof item === "object") {
        const url = String((item as Record<string, unknown>).url ?? "").trim();
        if (url) return url;
      }
    }
  }
  return String(data.image ?? data.url ?? "").trim();
}

function assertVivoBusinessSuccess(payload: unknown) {
  if (!payload || typeof payload !== "object") return;
  const root = payload as Record<string, unknown>;
  const code = root.code;
  if (typeof code === "undefined" || code === null || code === "" || code === 0 || code === 200 || code === "0" || code === "200") {
    return;
  }
  const message = String(root.msg ?? root.message ?? root.desc ?? "business-error");
  throw new Error(`vivo image generation failed: ${code} ${message}`);
}

async function requestVivoStoryImage(scene: ParentStoryBookScene) {
  const env = getVivoEnv();
  if (!env.appKey || !env.appId) {
    throw new Error("VIVO_APP_ID/VIVO_APP_KEY missing for story image generation");
  }
  const requestId = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `img-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const url = resolveVivoImageUrl(env.baseUrl, VIVO_IMAGE_GENERATION_PATH);
  url.searchParams.set("module", VIVO_IMAGE_GENERATION_MODULE);
  url.searchParams.set("request_id", requestId);
  url.searchParams.set("system_time", String(Date.now()));

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.appKey}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      model: process.env.STORYBOOK_IMAGE_MODEL?.trim() || "Doubao-Seedream-4.5",
      prompt: scene.imagePrompt,
      parameters: {
        size: process.env.STORYBOOK_IMAGE_SIZE?.trim() || "2K",
      },
    }),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    throw new Error(`vivo image generation HTTP ${response.status}`);
  }
  assertVivoBusinessSuccess(payload);
  const imageUrl = extractVivoImageUrl(payload);
  if (!imageUrl) {
    throw new Error("vivo image generation returned no image URL");
  }
  return imageUrl;
}

async function completeStoryMediaLocally(input: {
  payload: ParentStoryBookMediaStatusRequest;
  targetPath: string;
  upstreamHost: string | null;
  routeFallbackReason: string | null;
}) {
  const startedAt = Date.now();
  const story = JSON.parse(JSON.stringify(input.payload.story)) as ParentStoryBookResponse;
  const imageConcurrency = boundedConcurrency(process.env.STORYBOOK_IMAGE_CONCURRENCY, 2, 3);
  const audioConcurrency = boundedConcurrency(process.env.STORYBOOK_TTS_CONCURRENCY, 4, 4);
  const missingCoreEnv = missingVivoCoreEnv();
  const imageLiveEnabled = missingCoreEnv.length === 0;
  const audioLiveEnabled = missingCoreEnv.length === 0;
  const prioritySceneIndices = normalizePrioritySceneIndices(story, input.payload.prioritySceneIndices);
  const scenesByIndex = new Map(story.scenes.map((scene, index) => [scene.sceneIndex, index]));
  const previousDiagnostics = story.providerMeta.diagnostics;
  const previousImageDiagnostics = previousDiagnostics?.image;
  const previousImageRetryAtMs = readEpochMs(previousImageDiagnostics?.nextRetryAtMs);
  const previousImageRateLimited = Boolean(
    previousImageDiagnostics?.rateLimited ||
      isVivoRateLimitError(previousImageDiagnostics?.lastErrorReason)
  );
  const imageBackoffActive = Boolean(
    imageLiveEnabled &&
      previousImageRetryAtMs &&
      previousImageRetryAtMs > startedAt
  );
  const effectiveImageConcurrency = previousImageRateLimited ? 1 : imageConcurrency;
  let imageErrorCount = 0;
  let audioErrorCount = 0;
  let lastImageError: string | null = null;
  let lastAudioError: string | null = null;
  let imageRetryAfterMs: number | null = imageBackoffActive && previousImageRetryAtMs
    ? Math.max(previousImageRetryAtMs - startedAt, 1_000)
    : null;
  let imageNextRetryAtMs: number | null = imageBackoffActive && previousImageRetryAtMs
    ? previousImageRetryAtMs
    : null;
  let imageRateLimited = imageBackoffActive || previousImageRateLimited;

  const imageCandidates = imageLiveEnabled
    ? imageBackoffActive
      ? []
      : orderedScenes(story, prioritySceneIndices).filter((scene) => !isRealImageScene(scene)).slice(0, effectiveImageConcurrency)
    : [];
  const audioCandidates = audioLiveEnabled
    ? orderedScenes(story, prioritySceneIndices).filter((scene) => !isRealAudioScene(scene)).slice(0, audioConcurrency)
    : [];

  const imageTasks = imageCandidates.map(async (scene) => {
    try {
      const imageUrl = await requestVivoStoryImage(scene);
      const index = scenesByIndex.get(scene.sceneIndex);
      if (typeof index === "number") {
        story.scenes[index] = {
          ...story.scenes[index],
          imageUrl,
          assetRef: imageUrl,
          imageStatus: "ready",
          imageSourceKind: "real",
          imageCacheHit: false,
        };
      }
    } catch (error) {
      imageErrorCount += 1;
      lastImageError = normalizeErrorReason(error);
      const retryAfterMs = resolveImageRetryBackoffMs(lastImageError);
      imageRetryAfterMs = Math.max(imageRetryAfterMs ?? 0, retryAfterMs);
      imageNextRetryAtMs = Date.now() + retryAfterMs;
      imageRateLimited = imageRateLimited || isVivoRateLimitError(lastImageError);
    }
  });

  const audioTasks = audioCandidates.map(async (scene) => {
    try {
      const result = await requestVivoTts({
        text: scene.audioScript || scene.sceneText,
        childId: story.childId,
        storyId: story.storyId,
        page: scene.sceneIndex,
        voiceStyle: scene.voiceStyle,
      });
      const audioDataUrl = `data:${result.audioContentType};base64,${result.audioBytes.toString("base64")}`;
      const audioUrl = cacheParentStoryBookMediaDataUrl(
        audioDataUrl,
        `${story.storyId}:next-vivo-tts:${scene.sceneIndex}`,
        { childId: story.childId, storybookId: story.storyId }
      ) ?? audioDataUrl;
      const index = scenesByIndex.get(scene.sceneIndex);
      if (typeof index === "number") {
        story.scenes[index] = {
          ...story.scenes[index],
          audioUrl,
          audioRef: audioUrl.split("/").pop() ?? story.scenes[index].audioRef,
          audioStatus: "ready",
          engineId: result.engineId,
          voiceName: result.voiceName,
          audioCacheHit: false,
        };
      }
    } catch (error) {
      audioErrorCount += 1;
      lastAudioError = normalizeErrorReason(error);
    }
  });

  await Promise.all([...imageTasks, ...audioTasks]);

  const imageReadySceneCount = story.scenes.filter(isRealImageScene).length;
  const audioReadySceneCount = story.scenes.filter(isRealAudioScene).length;
  const imagePendingSceneCount = imageLiveEnabled ? story.scenes.length - imageReadySceneCount : 0;
  const audioPendingSceneCount = audioLiveEnabled ? story.scenes.length - audioReadySceneCount : 0;
  const imageDelivery = resolveImageDelivery(story);
  const audioDelivery = resolveAudioDelivery(story);
  const textIsReal = story.providerMeta.textDelivery === "real";
  const allReal = textIsReal && imageDelivery === "real" && audioDelivery === "real";
  const imageLastErrorReason =
    lastImageError ??
    (imageBackoffActive ? previousImageDiagnostics?.lastErrorReason ?? null : null);

  story.fallback = !allReal;
  story.fallbackReason = textIsReal ? null : story.fallbackReason ?? story.providerMeta.fallbackReason ?? null;
  story.providerMeta = {
    ...story.providerMeta,
    mode: allReal ? "live" : "mixed",
    imageProvider: imageDelivery === "real" ? "vivo-story-image" : imageDelivery === "mixed" ? "vivo-story-image+storybook-dynamic-fallback" : "storybook-dynamic-fallback",
    audioProvider: audioDelivery === "real" ? "vivo-story-tts" : audioDelivery === "mixed" ? "vivo-story-tts+storybook-mock-preview" : "storybook-mock-preview",
    imageDelivery,
    audioDelivery,
    fallbackReason: textIsReal ? null : story.providerMeta.fallbackReason ?? null,
    realProvider: story.providerMeta.realProvider || textIsReal || imageReadySceneCount > 0 || audioReadySceneCount > 0,
    cacheHitCount: story.providerMeta.cacheHitCount ?? 0,
    diagnostics: {
      brain: previousDiagnostics?.brain ?? {
        reachable: true,
        fallbackReason: null,
        upstreamHost: null,
        statusCode: null,
        retryStrategy: "none",
        elapsedMs: null,
        timeoutMs: null,
      },
      image: {
        requestedProvider: "vivo",
        resolvedProvider: imageDelivery === "real" ? "vivo-story-image" : imageDelivery === "mixed" ? "vivo-story-image+storybook-dynamic-fallback" : "storybook-dynamic-fallback",
        liveEnabled: imageLiveEnabled,
        missingConfig: imageLiveEnabled ? [] : missingCoreEnv,
        jobStatus: channelStatus({
          liveEnabled: imageLiveEnabled,
          pendingSceneCount: imagePendingSceneCount,
          readySceneCount: imageReadySceneCount,
          errorSceneCount: imageErrorCount,
        }),
        pendingSceneCount: imagePendingSceneCount,
        readySceneCount: imageReadySceneCount,
        errorSceneCount: imageErrorCount,
        lastErrorStage: imageErrorCount > 0 || imageBackoffActive ? "next-vivo-image" : null,
        lastErrorReason: imageLastErrorReason,
        retryAfterMs: imageRetryAfterMs,
        nextRetryAtMs: imageNextRetryAtMs,
        rateLimited: imageRateLimited,
        elapsedMs: Date.now() - startedAt,
      },
      audio: {
        requestedProvider: "vivo",
        resolvedProvider: audioDelivery === "real" ? "vivo-story-tts" : audioDelivery === "mixed" ? "vivo-story-tts+storybook-mock-preview" : "storybook-mock-preview",
        liveEnabled: audioLiveEnabled,
        missingConfig: audioLiveEnabled ? [] : missingCoreEnv,
        jobStatus: channelStatus({
          liveEnabled: audioLiveEnabled,
          pendingSceneCount: audioPendingSceneCount,
          readySceneCount: audioReadySceneCount,
          errorSceneCount: audioErrorCount,
        }),
        pendingSceneCount: audioPendingSceneCount,
        readySceneCount: audioReadySceneCount,
        errorSceneCount: audioErrorCount,
        lastErrorStage: audioErrorCount > 0 ? "next-vivo-tts" : null,
        lastErrorReason: lastAudioError,
        elapsedMs: Date.now() - startedAt,
      },
    },
  };

  return prepareParentStoryBookResponseForDelivery(story, {
    cacheState: "bypass",
  });
}

async function parseRemoteStoryResponse(response: Response) {
  try {
    return (await response.json()) as ParentStoryBookResponse;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const authError = await authorizeAiRoute(request, {
    requiredRole: "parent",
    collectJsonClassNames: false,
  });
  if (authError) return authError;

  let payload: ParentStoryBookMediaStatusRequest;
  try {
    const parsed = (await request.clone().json()) as unknown;
    if (!isMediaStatusPayload(parsed)) {
      return NextResponse.json(
        { error: "Invalid parent storybook media status payload" },
        { status: 400, headers: { "cache-control": "no-store" } }
      );
    }
    payload = parsed;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: { "cache-control": "no-store" } }
    );
  }

  const sessionUser = (await requireDemoSession(request)).user;
  if (sessionUser.role !== ROLE_PARENT) {
    return NextResponse.json(
      { error: "Parent role required" },
      { status: 403, headers: { "cache-control": "no-store" } }
    );
  }
  if (!(sessionUser.childIds ?? []).includes(payload.childId)) {
    return NextResponse.json(
      { error: "Child is not authorized for current parent" },
      { status: 403, headers: { "cache-control": "no-store" } }
    );
  }

  const targetPath = "/api/v1/agents/parent/storybook/media-status";
  const brainForward = await forwardBrainRequest(request, targetPath, {
    timeoutMs: resolveMediaStatusTimeoutMs(),
  });
  if (!brainForward.response) {
    const preparedStory = await completeStoryMediaLocally({
      payload,
      targetPath,
      upstreamHost: brainForward.upstreamHost,
      routeFallbackReason: brainForward.fallbackReason ?? "brain-proxy-unavailable",
    });
    return NextResponse.json(preparedStory, {
      status: 200,
      headers: mergeHeaders(
        createBrainTransportHeaders({
          transport: "next-json-fallback",
          targetPath,
          upstreamHost: brainForward.upstreamHost,
          fallbackReason: null,
        })
      ),
    });
  }

  const remoteStory = await parseRemoteStoryResponse(brainForward.response.clone());
  if (!brainForward.response.ok || !remoteStory) {
    const preparedStory = await completeStoryMediaLocally({
      payload,
      targetPath,
      upstreamHost: brainForward.upstreamHost,
      routeFallbackReason: !brainForward.response.ok ? `brain-status-${brainForward.response.status}` : "brain-proxy-invalid-json",
    });
    return NextResponse.json(preparedStory, {
      status: 200,
      headers: mergeHeaders(
        createBrainTransportHeaders({
          transport: "next-json-fallback",
          targetPath,
          upstreamHost: brainForward.upstreamHost,
          fallbackReason: null,
        })
      ),
    });
  }

  const preparedStory = prepareParentStoryBookResponseForDelivery(remoteStory, {
    cacheState: "bypass",
  });

  return NextResponse.json(preparedStory, {
    status: 200,
    headers: mergeHeaders(
      brainForward.response.headers,
      createBrainTransportHeaders({
        transport: "remote-brain-proxy",
        targetPath,
        upstreamHost: brainForward.upstreamHost,
        fallbackReason: null,
      })
    ),
  });
}
