import type {
  ParentStoryBookDiagnosticsChannel,
  ParentStoryBookImageDelivery,
  ParentStoryBookMediaStatusRequest,
  ParentStoryBookResponse,
  ParentStoryBookScene,
} from "@/lib/ai/types";
import { createHash } from "node:crypto";
import {
  attestAiResult,
  sanitizeStorybookResultForContinuation,
  verifyAiResultAttestation,
  type AiProvenanceContext,
} from "@/lib/ai/provenance-attestation";
import { buildAiProviderTraceFromProviderMeta } from "@/lib/ai/provider-trace";
import {
  DashScopeStoryImageProviderError,
  downloadDashScopeStoryImage,
  readDashScopeStoryImageTask,
  resolveDashScopeStoryImageConfig,
  submitDashScopeStoryImageTask,
} from "@/lib/providers/dashscope/dashscope-story-image-provider";
import { getVivoEnv, requestVivoTts } from "@/lib/providers/vivo";
import { aiRouteLimitedResponse, authorizeAiRouteSession } from "@/lib/server/ai-route-guard";
import { ApiRouteError } from "@/lib/server/api-errors";
import {
  createBrainTransportHeaders,
  forwardBrainRequest,
} from "@/lib/server/brain-client";
import {
  buildServiceScopeClaim,
  getSessionScope,
  requireScopedChild,
} from "@/lib/server/session-scope";
import {
  cacheParentStoryBookMediaDataUrl,
  prepareParentStoryBookResponseForDelivery,
} from "@/lib/server/parent-storybook-cache";
import {
  persistParentStoryBookMedia,
  readParentStoryBookMedia,
} from "@/lib/server/parent-storybook-media-store";
import { reconcileRemoteStoryBookMedia } from "@/lib/server/parent-storybook-remote-media";
import {
  getStorybookMediaTaskStore,
  type StorybookMediaTaskClaim,
  type StorybookMediaTaskIdentity,
  type StorybookMediaTaskStore,
} from "@/lib/server/storybook-media-task-store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;
const ROLE_PARENT = "家长";
const VIVO_IMAGE_GENERATION_PATH = "/api/v1/image_generation";
const VIVO_IMAGE_GENERATION_MODULE = "aigc";
const VIVO_IMAGE_RATE_LIMIT_BACKOFF_MS = 70_000;
const VIVO_IMAGE_ERROR_BACKOFF_MS = 20_000;
const VIVO_AUDIO_ERROR_BACKOFF_MS = 20_000;
const VIVO_IMAGE_GROUP_BATCH_SIZE = 4;
const DASHSCOPE_IMAGE_POLL_INTERVAL_MS = 3_000;
const DASHSCOPE_IMAGE_TASK_RETENTION_MS = 24 * 60 * 60 * 1_000;
const MEDIA_STATUS_BRAIN_TIMEOUT_MS = 12_000;
const MEDIA_STATUS_PROVIDER_TIMEOUT_MS = 25_000;
const MEDIA_STATUS_PROVIDER_TIMEOUT_MAX_MS = 30_000;
const MEDIA_STATUS_LOCAL_DEADLINE_MS = 22_000;
const MEDIA_TASK_COMMIT_BUDGET_MS = 5_000;

function resolveMediaStatusTimeoutMs() {
  const raw =
    process.env.PARENT_STORYBOOK_MEDIA_STATUS_TIMEOUT_MS ??
    process.env.PARENT_STORYBOOK_BACKEND_MEDIA_TIMEOUT_MS ??
    process.env.PARENT_STORYBOOK_BRAIN_TIMEOUT_MS;
  const parsed = Number(raw);
  const configured =
    Number.isFinite(parsed) && parsed >= 1_000
      ? parsed
      : MEDIA_STATUS_BRAIN_TIMEOUT_MS;
  // 浏览器轮询预算为 50 秒；Brain 查询必须给本地补全和响应序列化留出时间。
  return Math.min(configured, MEDIA_STATUS_BRAIN_TIMEOUT_MS);
}

function resolveLocalProviderTimeoutMs() {
  const parsed = Number(process.env.STORYBOOK_MEDIA_PROVIDER_TIMEOUT_MS);
  const configured =
    Number.isFinite(parsed) && parsed >= 1_000
      ? parsed
      : MEDIA_STATUS_PROVIDER_TIMEOUT_MS;
  return Math.min(configured, MEDIA_STATUS_PROVIDER_TIMEOUT_MAX_MS);
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

function summarizeReadySceneProviders(
  story: ParentStoryBookResponse,
  channel: "image" | "audio"
) {
  const providers = new Set<string>();
  for (const scene of story.scenes) {
    const ready =
      channel === "image" ? isRealImageScene(scene) : isRealAudioScene(scene);
    if (!ready) continue;
    const provider =
      channel === "image" ? scene.imageProvider : scene.audioProvider;
    providers.add(
      provider?.trim() ||
        (channel === "image"
          ? "unattributed-story-image"
          : "unattributed-story-audio")
    );
  }
  return [...providers].sort().join("+");
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

function resolveStoryImageProvider() {
  const dashscope = resolveDashScopeStoryImageConfig();
  if (dashscope.selected || process.env.NODE_ENV === "production") {
    return {
      kind: "dashscope" as const,
      enabled: dashscope.enabled,
      requestedProvider: "dashscope",
      providerName: "dashscope-qwen-image",
      missingConfig: dashscope.missingConfig,
    };
  }
  const missingConfig = missingVivoCoreEnv();
  return {
    kind: "vivo" as const,
    enabled: missingConfig.length === 0,
    requestedProvider: "vivo",
    providerName: "vivo-story-image",
    missingConfig,
  };
}

function normalizeErrorReason(error: unknown) {
  return error instanceof Error ? error.message : String(error || "unknown provider error");
}

function isImageRateLimitError(errorReason: string | null | undefined) {
  return /(?:\b1003\b|\b429\b|throttling|rate\s*limit|too many requests|限流|频率)/iu.test(
    String(errorReason ?? "")
  );
}

function resolveImageRetryBackoffMs(errorReason: string) {
  const envValue = Number(process.env.STORYBOOK_IMAGE_RETRY_BACKOFF_MS);
  const fallback = isImageRateLimitError(errorReason)
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

function stripRemoteStoryImageTasks(
  story: ParentStoryBookResponse
): ParentStoryBookResponse {
  return {
    ...story,
    scenes: story.scenes.map((scene) => {
      const sanitized = {
        ...scene,
      } as ParentStoryBookScene & Record<string, unknown>;
      delete sanitized.imageTaskId;
      delete sanitized.imageTaskProvider;
      delete sanitized.imageTaskSubmittedAtMs;
      delete sanitized.imageTaskPollErrorCount;
      return sanitized;
    }),
  };
}

function isProtectedStoryMediaUrl(value: string | null | undefined) {
  return /^\/api\/ai\/parent-storybook\/media\/[a-f0-9]{40}$/u.test(
    String(value ?? "")
  );
}

function readProtectedStoryMediaKey(value: string | null | undefined) {
  return String(value ?? "").match(
    /^\/api\/ai\/parent-storybook\/media\/([a-f0-9]{40})$/u
  )?.[1] ?? null;
}

function isDurableDashScopeImageScene(scene: ParentStoryBookScene) {
  return (
    isRealImageScene(scene) &&
    scene.imageProvider === "dashscope-qwen-image" &&
    isProtectedStoryMediaUrl(scene.imageUrl)
  );
}

function isDurableVivoAudioScene(scene: ParentStoryBookScene) {
  return (
    isRealAudioScene(scene) &&
    scene.audioProvider === "vivo-story-tts" &&
    isProtectedStoryMediaUrl(scene.audioUrl)
  );
}

function buildStoryMediaTaskIdentity(input: {
  institutionId: string;
  userId: string;
  story: ParentStoryBookResponse;
  scene: ParentStoryBookScene;
  channel: "image" | "audio";
}): StorybookMediaTaskIdentity {
  const imageConfig = resolveDashScopeStoryImageConfig();
  const vivoEnv = getVivoEnv();
  const inputDigest = createHash("sha256")
    .update(
      input.channel === "image"
        ? input.scene.imagePrompt
        : JSON.stringify({
            audioScript:
              input.scene.audioScript || input.scene.sceneText,
            voiceStyle: input.scene.voiceStyle,
          }),
      "utf8"
    )
    .digest("hex");
  return {
    institutionId: input.institutionId,
    userId: input.userId,
    childId: input.story.childId,
    storybookId: input.story.storyId,
    sceneIndex: input.scene.sceneIndex,
    channel: input.channel,
    provider:
      input.channel === "image"
        ? "dashscope-qwen-image"
        : "vivo-story-tts",
    providerModel:
      input.channel === "image"
        ? `${imageConfig.model}:${imageConfig.size}`
        : [
            vivoEnv.storybookTtsModel,
            vivoEnv.storybookTtsEngineId,
            vivoEnv.storybookTtsVoice,
          ].join(":"),
    inputDigest,
  };
}

function createMediaTaskCommitOperation() {
  return {
    // 上游已有明确结果后，短时账本提交不能再由浏览器断开信号取消。
    deadlineAtMs: Date.now() + MEDIA_TASK_COMMIT_BUDGET_MS,
  };
}

function resolveVivoImageUrl(baseUrl: string, path: string) {
  return new URL(path, `${baseUrl.replace(/\/+$/u, "")}/`);
}

function extractVivoImageUrls(payload: unknown) {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const data = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : root;
  const imageUrls: string[] = [];
  const images = data.images;
  if (Array.isArray(images)) {
    for (const item of images) {
      if (typeof item === "string" && item.trim()) {
        imageUrls.push(item.trim());
        continue;
      }
      if (item && typeof item === "object") {
        const url = String((item as Record<string, unknown>).url ?? "").trim();
        if (url) imageUrls.push(url);
      }
    }
  }
  const legacyUrl = String(data.image ?? data.url ?? "").trim();
  if (legacyUrl && !imageUrls.includes(legacyUrl)) imageUrls.push(legacyUrl);
  return imageUrls;
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

function resolveStoryImageModel() {
  return process.env.STORYBOOK_IMAGE_MODEL?.trim() || "Doubao-Seedream-4.5";
}

function resolveStoryImageSize() {
  return process.env.STORYBOOK_IMAGE_SIZE?.trim() || "2K";
}

function buildVivoStoryImagePrompt(scenes: ParentStoryBookScene[]) {
  if (scenes.length === 1) return scenes[0].imagePrompt;
  return [
    `Generate exactly ${scenes.length} separate children's picture-book illustrations in order.`,
    "Keep one coherent visual style across the set. Do not add text, captions, logos, watermarks, or UI.",
    "Each numbered item below must become one image:",
    ...scenes.map((scene) => `${scene.sceneIndex}. ${scene.imagePrompt}`),
  ].join("\n");
}

async function requestVivoStoryImages(
  scenes: ParentStoryBookScene[],
  deadlineAtMs?: number,
  signal?: AbortSignal
) {
  const env = getVivoEnv();
  if (!env.appKey || !env.appId) {
    throw new Error("VIVO_APP_ID/VIVO_APP_KEY missing for story image generation");
  }
  if (scenes.length === 0) return [];
  const requestId = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `img-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const url = resolveVivoImageUrl(env.baseUrl, VIVO_IMAGE_GENERATION_PATH);
  url.searchParams.set("module", VIVO_IMAGE_GENERATION_MODULE);
  url.searchParams.set("request_id", requestId);
  url.searchParams.set("system_time", String(Math.floor(Date.now() / 1000)));

  const parameters: Record<string, unknown> = {
    size: resolveStoryImageSize(),
  };
  if (scenes.length > 1) {
    parameters.sequential_image_generation = "auto";
  }

  const remainingMs = deadlineAtMs
    ? Math.floor(deadlineAtMs - Date.now())
    : Number.POSITIVE_INFINITY;
  if (remainingMs <= 0) {
    throw new Error("vivo image generation request deadline exhausted");
  }
  const timeoutMs = Math.max(
    250,
    Math.min(resolveLocalProviderTimeoutMs(), remainingMs)
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abortRequest = () => controller.abort(signal?.reason);
  if (signal?.aborted) abortRequest();
  else signal?.addEventListener("abort", abortRequest, { once: true });
  let response: Response;
  let payload: unknown;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.appKey}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        model: resolveStoryImageModel(),
        prompt: buildVivoStoryImagePrompt(scenes),
        parameters,
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    payload = await response.json().catch(() => null) as unknown;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        signal?.aborted
          ? "vivo image generation request aborted"
          : `vivo image generation timed out after ${timeoutMs}ms`
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortRequest);
  }
  if (!response.ok) {
    throw new Error(`vivo image generation HTTP ${response.status}`);
  }
  assertVivoBusinessSuccess(payload);
  const imageUrls = extractVivoImageUrls(payload);
  if (imageUrls.length === 0) {
    throw new Error("vivo image generation returned no image URL");
  }
  return imageUrls;
}

async function completeStoryMediaLocally(input: {
  payload: ParentStoryBookMediaStatusRequest;
  institutionId: string;
  userId: string;
  persistMedia: boolean;
  mediaTaskStore?: StorybookMediaTaskStore;
  signal?: AbortSignal;
}) {
  const startedAt = Date.now();
  const deadlineAtMs = startedAt + MEDIA_STATUS_LOCAL_DEADLINE_MS;
  const story = JSON.parse(JSON.stringify(input.payload.story)) as ParentStoryBookResponse;
  const imageConcurrency = boundedConcurrency(process.env.STORYBOOK_IMAGE_CONCURRENCY, 2, 3);
  const imageBatchSize = boundedConcurrency(process.env.STORYBOOK_IMAGE_BATCH_SIZE, VIVO_IMAGE_GROUP_BATCH_SIZE, VIVO_IMAGE_GROUP_BATCH_SIZE);
  const audioConcurrency = boundedConcurrency(process.env.STORYBOOK_TTS_CONCURRENCY, 4, 4);
  const imageProvider = resolveStoryImageProvider();
  const missingAudioConfig = missingVivoCoreEnv();
  const imageLiveEnabled = imageProvider.enabled;
  const audioLiveEnabled = missingAudioConfig.length === 0;
  const mediaTaskStore =
    imageProvider.kind === "dashscope" || audioLiveEnabled
      ? input.mediaTaskStore ?? getStorybookMediaTaskStore()
      : null;
  if (imageProvider.kind === "dashscope") {
    // 只接受本服务已持久化并标注来源的媒体，旧 Brain/Vivo URL 会被重新生成。
    story.scenes = story.scenes.map((scene) => ({
      ...scene,
      ...(isDurableDashScopeImageScene(scene)
        ? {}
        : {
            imageUrl: null,
            assetRef: null,
            imageStatus: "fallback" as const,
            imageSourceKind: "dynamic-fallback" as const,
            imageProvider: null,
          }),
      ...(isDurableVivoAudioScene(scene)
        ? {}
        : {
            audioUrl: null,
            audioRef: null,
            audioStatus: "fallback" as const,
            audioProvider: null,
          }),
    }));
  }
  if (audioLiveEnabled && imageProvider.kind !== "dashscope") {
    // 语音也只信任本服务持久化并标注来源的媒体，防止重放外部 URL 绕过去重账本。
    story.scenes = story.scenes.map((scene) => ({
      ...scene,
      ...(isDurableVivoAudioScene(scene)
        ? {}
        : {
            audioUrl: null,
            audioRef: null,
            audioStatus: "fallback" as const,
            audioProvider: null,
          }),
    }));
  }
  const prioritySceneIndices = normalizePrioritySceneIndices(story, input.payload.prioritySceneIndices);
  const scenesByIndex = new Map(story.scenes.map((scene, index) => [scene.sceneIndex, index]));
  const previousDiagnostics = story.providerMeta.diagnostics;
  const previousImageDiagnostics = previousDiagnostics?.image;
  const previousImageRetryAtMs = readEpochMs(previousImageDiagnostics?.nextRetryAtMs);
  const previousImageWasRateLimited = Boolean(
    previousImageDiagnostics?.rateLimited ||
      isImageRateLimitError(previousImageDiagnostics?.lastErrorReason)
  );
  const imageBackoffActive = Boolean(
    imageLiveEnabled &&
      previousImageRetryAtMs &&
      previousImageRetryAtMs > startedAt
  );
  const effectiveImageBatchSize =
    imageProvider.kind === "dashscope"
      ? VIVO_IMAGE_GROUP_BATCH_SIZE
      : imageBackoffActive && previousImageWasRateLimited
        ? 1
        : Math.max(imageConcurrency, imageBatchSize);
  let imageErrorCount = 0;
  let audioErrorCount = 0;
  const blockedImageSceneIndices = new Set<number>();
  const blockedAudioSceneIndices = new Set<number>();
  let lastImageError: string | null = null;
  let lastAudioError: string | null = null;
  let imageRetryAfterMs: number | null = imageBackoffActive && previousImageRetryAtMs
    ? Math.max(previousImageRetryAtMs - startedAt, 1_000)
    : null;
  let imageNextRetryAtMs: number | null = imageBackoffActive && previousImageRetryAtMs
    ? previousImageRetryAtMs
    : null;
  let imageRateLimited =
    imageBackoffActive && previousImageWasRateLimited;
  const scheduleImageRetry = (delayMs: number) => {
    imageRetryAfterMs = Math.max(imageRetryAfterMs ?? 0, delayMs);
    imageNextRetryAtMs = Math.max(
      imageNextRetryAtMs ?? 0,
      Date.now() + delayMs
    );
  };
  const registerImageFailure = (
    reason: string,
    count = 1,
    retryable = true
  ) => {
    imageErrorCount += count;
    lastImageError = reason;
    if (retryable) {
      scheduleImageRetry(resolveImageRetryBackoffMs(reason));
    }
    imageRateLimited =
      retryable &&
      (imageRateLimited || isImageRateLimitError(reason));
  };

  const imageCandidates = imageLiveEnabled
    ? imageBackoffActive
      ? []
      : orderedScenes(story, prioritySceneIndices).filter((scene) => !isRealImageScene(scene)).slice(0, effectiveImageBatchSize)
    : [];
  const audioCandidates = audioLiveEnabled
    ? orderedScenes(story, prioritySceneIndices).filter((scene) => !isRealAudioScene(scene)).slice(0, audioConcurrency)
    : [];

  let imageTasks: Array<Promise<void>> = [];
  if (imageProvider.kind === "dashscope") {
    imageTasks = imageCandidates.map(async (scene) => {
      const index = scenesByIndex.get(scene.sceneIndex);
      if (typeof index !== "number") return;
      const currentScene = story.scenes[index];
      const identity = buildStoryMediaTaskIdentity({
        institutionId: input.institutionId,
        userId: input.userId,
        story,
        scene: currentScene,
        channel: "image",
      });
      const operation = {
        deadlineAtMs,
        signal: input.signal,
      };
      let claim: StorybookMediaTaskClaim;
      try {
        claim = await mediaTaskStore!.claim(identity, operation);
      } catch (error) {
        registerImageFailure(normalizeErrorReason(error));
        return;
      }

      if (claim.action === "ready" && claim.mediaKey) {
        try {
          const media = await readParentStoryBookMedia({
            institutionId: input.institutionId,
            mediaKey: claim.mediaKey,
            allowPersistent: input.persistMedia,
            bypassCache: input.persistMedia,
          });
          const valid =
            media?.contentType === "image/webp" &&
            media.ownerChildId === story.childId &&
            media.ownerStorybookId === story.storyId;
          if (!valid) {
            await mediaTaskStore!.invalidateReadyMedia(
              identity,
              claim.mediaKey,
              "persistent story image is missing or has the wrong scope",
              operation
            );
            registerImageFailure(
              "persistent story image is missing or has the wrong scope"
            );
            return;
          }
          const imageUrl = `/api/ai/parent-storybook/media/${claim.mediaKey}`;
          story.scenes[index] = {
            ...currentScene,
            imageUrl,
            assetRef: imageUrl,
            imageStatus: "ready",
            imageSourceKind: "real",
            imageProvider: "dashscope-qwen-image",
            imageCacheHit: true,
          };
        } catch (error) {
          registerImageFailure(normalizeErrorReason(error));
        }
        return;
      }
      if (claim.action === "blocked") {
        blockedImageSceneIndices.add(scene.sceneIndex);
        registerImageFailure(
          claim.lastErrorReason ??
            "storybook image retry budget is exhausted",
          1,
          false
        );
        return;
      }
      if (claim.action === "wait") {
        const delayMs = claim.nextRetryAtMs
          ? Math.max(
              DASHSCOPE_IMAGE_POLL_INTERVAL_MS,
              claim.nextRetryAtMs - Date.now()
            )
          : DASHSCOPE_IMAGE_POLL_INTERVAL_MS;
        scheduleImageRetry(delayMs);
        return;
      }
      if (claim.action === "submit" && claim.leaseToken) {
        try {
          const submitted = await submitDashScopeStoryImageTask({
            prompt: currentScene.imagePrompt,
            deadlineAtMs,
            signal: input.signal,
          });
          const marked = await mediaTaskStore!.markAsyncSubmitted(
            identity,
            claim.leaseToken,
            submitted.taskId,
            createMediaTaskCommitOperation()
          );
          if (!marked) {
            blockedImageSceneIndices.add(scene.sceneIndex);
            registerImageFailure(
              "storybook image submission outcome could not be committed",
              1,
              false
            );
            return;
          }
          scheduleImageRetry(DASHSCOPE_IMAGE_POLL_INTERVAL_MS);
        } catch (error) {
          const reason = normalizeErrorReason(error);
          const retryable =
            error instanceof DashScopeStoryImageProviderError &&
            error.submissionState === "not-accepted" &&
            error.retryable &&
            claim.attemptCount < 2;
          try {
            const marked = await mediaTaskStore!.markSubmissionFailure(
              identity,
              claim.leaseToken,
              {
                retryable,
                nextRetryAtMs:
                  Date.now() + resolveImageRetryBackoffMs(reason),
                reason,
              },
              createMediaTaskCommitOperation()
            );
            if (!retryable || !marked) {
              blockedImageSceneIndices.add(scene.sceneIndex);
            }
            registerImageFailure(reason, 1, retryable && marked);
          } catch (storeError) {
            blockedImageSceneIndices.add(scene.sceneIndex);
            registerImageFailure(
              `${reason}; task store: ${normalizeErrorReason(storeError)}`,
              1,
              false
            );
          }
        }
        return;
      }

      if (
        claim.action !== "poll" ||
        !claim.taskId ||
        !claim.leaseToken
      ) {
        scheduleImageRetry(DASHSCOPE_IMAGE_POLL_INTERVAL_MS);
        return;
      }
      if (
        claim.submittedAtMs !== null &&
        Date.now() - claim.submittedAtMs >=
          DASHSCOPE_IMAGE_TASK_RETENTION_MS
      ) {
        const reason =
          "DashScope image task reached the 24-hour retention boundary; automatic resubmission is blocked";
        try {
          const marked = await mediaTaskStore!.markPollFailure(
            identity,
            claim.taskId,
            claim.leaseToken,
            {
              terminalTask: false,
              retryableSubmission: false,
              blockTask: true,
              nextRetryAtMs: Date.now(),
              reason,
            },
            createMediaTaskCommitOperation()
          );
          if (marked) {
            blockedImageSceneIndices.add(scene.sceneIndex);
          }
          registerImageFailure(reason, 1, false);
        } catch (storeError) {
          blockedImageSceneIndices.add(scene.sceneIndex);
          registerImageFailure(
            `${reason}; task store: ${normalizeErrorReason(storeError)}`,
            1,
            false
          );
        }
        return;
      }
      try {
        const task = await readDashScopeStoryImageTask({
          taskId: claim.taskId,
          deadlineAtMs,
          signal: input.signal,
        });
        if (task.status === "pending") {
          await mediaTaskStore!.markPending(
            identity,
            claim.taskId,
            claim.leaseToken,
            createMediaTaskCommitOperation()
          );
          scheduleImageRetry(DASHSCOPE_IMAGE_POLL_INTERVAL_MS);
          return;
        }
        if (task.status === "failed" || !task.imageUrl) {
          const reason = [
            task.errorCode || "DASHSCOPE_IMAGE_TASK_FAILED",
            task.errorMessage || "DashScope image task failed",
          ].join(": ");
          const retryDelayMs = resolveImageRetryBackoffMs(reason);
          const marked = await mediaTaskStore!.markPollFailure(
            identity,
            claim.taskId,
            claim.leaseToken,
            {
              terminalTask: true,
              retryableSubmission: true,
              nextRetryAtMs: Date.now() + retryDelayMs,
              reason,
            },
            createMediaTaskCommitOperation()
          );
          if (marked && claim.attemptCount >= 2) {
            blockedImageSceneIndices.add(scene.sceneIndex);
          }
          registerImageFailure(
            reason,
            1,
            marked && claim.attemptCount < 2
          );
          return;
        }

        const downloaded = await downloadDashScopeStoryImage({
          imageUrl: task.imageUrl,
          deadlineAtMs,
          signal: input.signal,
        });
        const mediaCommitOperation = createMediaTaskCommitOperation();
        const mediaSeed = `${story.storyId}:dashscope-qwen-image:${scene.sceneIndex}`;
        const imageDataUrl = `data:${downloaded.contentType};base64,${downloaded.bytes.toString("base64")}`;
        const persisted = input.persistMedia
          ? await persistParentStoryBookMedia({
              institutionId: input.institutionId,
              childId: story.childId,
              storybookId: story.storyId,
              contentType: downloaded.contentType,
              bytes: downloaded.bytes,
              seed: mediaSeed,
              deadlineAtMs: mediaCommitOperation.deadlineAtMs,
            })
          : null;
        const imageUrl =
          persisted?.mediaUrl ??
          cacheParentStoryBookMediaDataUrl(
            imageDataUrl,
            mediaSeed,
            {
              institutionId: input.institutionId,
              childId: story.childId,
              storybookId: story.storyId,
            }
          ) ??
          imageDataUrl;
        const mediaKey =
          persisted?.mediaKey ?? readProtectedStoryMediaKey(imageUrl);
        if (!mediaKey) {
          throw new Error(
            "DashScope story image did not produce a protected media key"
          );
        }
        const markedReady = await mediaTaskStore!.markReady(
          identity,
          {
            leaseToken: claim.leaseToken,
            taskId: claim.taskId,
            mediaKey,
          },
          mediaCommitOperation
        );
        if (!markedReady) {
          scheduleImageRetry(DASHSCOPE_IMAGE_POLL_INTERVAL_MS);
          return;
        }
        story.scenes[index] = {
          ...currentScene,
          imageUrl,
          assetRef: imageUrl,
          imageStatus: "ready",
          imageSourceKind: "real",
          imageProvider: "dashscope-qwen-image",
          imageCacheHit: false,
        };
      } catch (error) {
        const reason = normalizeErrorReason(error);
        const retryDelayMs = resolveImageRetryBackoffMs(reason);
        try {
          const marked = await mediaTaskStore!.markPollFailure(
            identity,
            claim.taskId,
            claim.leaseToken,
            {
              terminalTask: false,
              retryableSubmission: false,
              nextRetryAtMs: Date.now() + retryDelayMs,
              reason,
            },
            createMediaTaskCommitOperation()
          );
          registerImageFailure(reason, 1, marked);
        } catch (storeError) {
          registerImageFailure(
            `${reason}; task store: ${normalizeErrorReason(storeError)}`,
            1,
            false
          );
        }
      }
    });
  } else if (imageCandidates.length > 0) {
    imageTasks = [
      (async () => {
        try {
          const imageUrls = await requestVivoStoryImages(
            imageCandidates,
            deadlineAtMs,
            input.signal
          );
          for (const [
            candidateIndex,
            imageUrl,
          ] of imageUrls
            .slice(0, imageCandidates.length)
            .entries()) {
            const scene = imageCandidates[candidateIndex];
            const index = scenesByIndex.get(scene.sceneIndex);
            if (typeof index === "number") {
              story.scenes[index] = {
                ...story.scenes[index],
                imageUrl,
                assetRef: imageUrl,
                imageStatus: "ready",
                imageSourceKind: "real",
                imageProvider: "vivo-story-image",
                imageCacheHit: false,
              };
            }
          }
          if (imageUrls.length < imageCandidates.length) {
            registerImageFailure(
              `vivo image generation returned ${imageUrls.length}/${imageCandidates.length} images`,
              imageCandidates.length - imageUrls.length
            );
          }
        } catch (error) {
          registerImageFailure(
            normalizeErrorReason(error),
            imageCandidates.length
          );
        }
      })(),
    ];
  }

  const audioTasks = audioCandidates.map(async (scene) => {
    const index = scenesByIndex.get(scene.sceneIndex);
    if (typeof index !== "number") return;
    const currentScene = story.scenes[index];
    const identity = buildStoryMediaTaskIdentity({
      institutionId: input.institutionId,
      userId: input.userId,
      story,
      scene: currentScene,
      channel: "audio",
    });
    const operation = {
      deadlineAtMs,
      signal: input.signal,
    };
    let claim: StorybookMediaTaskClaim;
    try {
      claim = await mediaTaskStore!.claim(identity, operation);
    } catch (error) {
      audioErrorCount += 1;
      lastAudioError = normalizeErrorReason(error);
      return;
    }

    if (claim.action === "ready" && claim.mediaKey) {
      try {
        const media = await readParentStoryBookMedia({
          institutionId: input.institutionId,
          mediaKey: claim.mediaKey,
          allowPersistent: input.persistMedia,
          bypassCache: input.persistMedia,
        });
        const valid =
          media?.contentType === "audio/wav" &&
          media.ownerChildId === story.childId &&
          media.ownerStorybookId === story.storyId;
        if (!valid) {
          await mediaTaskStore!.invalidateReadyMedia(
            identity,
            claim.mediaKey,
            "persistent story audio is missing or has the wrong scope",
            operation
          );
          audioErrorCount += 1;
          blockedAudioSceneIndices.add(scene.sceneIndex);
          lastAudioError =
            "persistent story audio is missing or has the wrong scope";
          return;
        }
        const audioUrl = `/api/ai/parent-storybook/media/${claim.mediaKey}`;
        story.scenes[index] = {
          ...currentScene,
          audioUrl,
          audioRef: claim.mediaKey,
          audioStatus: "ready",
          audioProvider: "vivo-story-tts",
          audioCacheHit: true,
        };
      } catch (error) {
        audioErrorCount += 1;
        lastAudioError = normalizeErrorReason(error);
      }
      return;
    }
    if (claim.action === "blocked") {
      blockedAudioSceneIndices.add(scene.sceneIndex);
      audioErrorCount += 1;
      lastAudioError =
        claim.lastErrorReason ??
        "storybook audio retry budget is exhausted";
      return;
    }
    if (claim.action !== "submit" || !claim.leaseToken) {
      return;
    }

    try {
      const result = await requestVivoTts({
        text: currentScene.audioScript || currentScene.sceneText,
        childId: story.childId,
        storyId: story.storyId,
        page: currentScene.sceneIndex,
        voiceStyle: currentScene.voiceStyle,
        deadlineAtMs,
        signal: input.signal,
      });
      const mediaCommitOperation = createMediaTaskCommitOperation();
      const mediaSeed = `${story.storyId}:next-vivo-tts:${scene.sceneIndex}`;
      const audioDataUrl = `data:${result.audioContentType};base64,${result.audioBytes.toString("base64")}`;
      const persisted = input.persistMedia
        ? await persistParentStoryBookMedia({
            institutionId: input.institutionId,
            childId: story.childId,
            storybookId: story.storyId,
            contentType: result.audioContentType,
            bytes: result.audioBytes,
            seed: mediaSeed,
            deadlineAtMs: mediaCommitOperation.deadlineAtMs,
          })
        : null;
      const audioUrl =
        persisted?.mediaUrl ??
        cacheParentStoryBookMediaDataUrl(
            audioDataUrl,
            mediaSeed,
            {
              institutionId: input.institutionId,
              childId: story.childId,
              storybookId: story.storyId,
            }
          ) ??
        audioDataUrl;
      const mediaKey =
        persisted?.mediaKey ?? readProtectedStoryMediaKey(audioUrl);
      if (!mediaKey) {
        throw new Error("vivo story audio did not produce a protected media key");
      }
      const marked = await mediaTaskStore!.markReady(
        identity,
        {
          leaseToken: claim.leaseToken,
          mediaKey,
        },
        mediaCommitOperation
      );
      if (!marked) {
        blockedAudioSceneIndices.add(scene.sceneIndex);
        audioErrorCount += 1;
        lastAudioError =
          "storybook audio result could not be committed";
        return;
      }
      story.scenes[index] = {
        ...currentScene,
        audioUrl,
        audioRef: mediaKey,
        audioStatus: "ready",
        audioProvider: "vivo-story-tts",
        engineId: result.engineId,
        voiceName: result.voiceName,
        audioCacheHit: false,
      };
    } catch (error) {
      blockedAudioSceneIndices.add(scene.sceneIndex);
      audioErrorCount += 1;
      const reason = normalizeErrorReason(error);
      lastAudioError = reason;
      try {
        await mediaTaskStore!.markSubmissionFailure(
          identity,
          claim.leaseToken,
          {
            // 同一场景的同步 TTS 只允许一次付费调用。
            retryable: false,
            nextRetryAtMs: Date.now() + VIVO_AUDIO_ERROR_BACKOFF_MS,
            reason,
          },
          createMediaTaskCommitOperation()
        );
      } catch (storeError) {
        lastAudioError = `${reason}; task store: ${normalizeErrorReason(storeError)}`;
      }
    }
  });

  await Promise.all([...imageTasks, ...audioTasks]);

  const imageReadySceneCount = story.scenes.filter(isRealImageScene).length;
  const audioReadySceneCount = story.scenes.filter(isRealAudioScene).length;
  const imageBlockedSceneCount = blockedImageSceneIndices.size;
  const audioBlockedSceneCount = blockedAudioSceneIndices.size;
  const imagePendingSceneCount = imageLiveEnabled
    ? Math.max(
        0,
        story.scenes.length -
          imageReadySceneCount -
          imageBlockedSceneCount
      )
    : 0;
  const audioPendingSceneCount = audioLiveEnabled
    ? Math.max(
        0,
        story.scenes.length -
          audioReadySceneCount -
          audioBlockedSceneCount
      )
    : 0;
  const imageDelivery = resolveImageDelivery(story);
  const audioDelivery = resolveAudioDelivery(story);
  const readyImageProviders = summarizeReadySceneProviders(story, "image");
  const readyAudioProviders = summarizeReadySceneProviders(story, "audio");
  const textIsReal = story.providerMeta.textDelivery === "real";
  const allReal = textIsReal && imageDelivery === "real" && audioDelivery === "real";
  const imageLastErrorReason =
    lastImageError ??
    (imageBackoffActive ? previousImageDiagnostics?.lastErrorReason ?? null : null);
  const resolvedImageProvider =
    imageDelivery === "real"
      ? readyImageProviders
      : imageDelivery === "mixed"
        ? `${readyImageProviders}+storybook-dynamic-fallback`
        : "storybook-dynamic-fallback";
  const resolvedAudioProvider =
    audioDelivery === "real"
      ? readyAudioProviders
      : audioDelivery === "mixed"
        ? `${readyAudioProviders}+storybook-mock-preview`
        : "storybook-mock-preview";

  story.fallback = !allReal;
  story.fallbackReason = textIsReal ? null : story.fallbackReason ?? story.providerMeta.fallbackReason ?? null;
  story.providerMeta = {
    ...story.providerMeta,
    mode: allReal ? "live" : "mixed",
    imageProvider: resolvedImageProvider,
    audioProvider: resolvedAudioProvider,
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
        requestedProvider: imageProvider.requestedProvider,
        resolvedProvider: resolvedImageProvider,
        liveEnabled: imageLiveEnabled,
        missingConfig: imageLiveEnabled
          ? []
          : imageProvider.missingConfig,
        jobStatus: channelStatus({
          liveEnabled: imageLiveEnabled,
          pendingSceneCount: imagePendingSceneCount,
          readySceneCount: imageReadySceneCount,
          errorSceneCount: imageErrorCount,
        }),
        pendingSceneCount: imagePendingSceneCount,
        blockedSceneCount: imageBlockedSceneCount,
        readySceneCount: imageReadySceneCount,
        errorSceneCount: imageErrorCount,
        lastErrorStage:
          imageErrorCount > 0 || imageBackoffActive
            ? imageProvider.kind === "dashscope"
              ? "next-dashscope-image"
              : "next-vivo-image"
            : null,
        lastErrorReason: imageLastErrorReason,
        retryAfterMs: imageRetryAfterMs,
        nextRetryAtMs: imageNextRetryAtMs,
        rateLimited: imageRateLimited,
        elapsedMs: Date.now() - startedAt,
      },
      audio: {
        requestedProvider: "vivo",
        resolvedProvider: resolvedAudioProvider,
        liveEnabled: audioLiveEnabled,
        missingConfig: audioLiveEnabled ? [] : missingAudioConfig,
        jobStatus: channelStatus({
          liveEnabled: audioLiveEnabled,
          pendingSceneCount: audioPendingSceneCount,
          readySceneCount: audioReadySceneCount,
          errorSceneCount: audioErrorCount,
        }),
        pendingSceneCount: audioPendingSceneCount,
        blockedSceneCount: audioBlockedSceneCount,
        readySceneCount: audioReadySceneCount,
        errorSceneCount: audioErrorCount,
        lastErrorStage: audioErrorCount > 0 ? "next-vivo-tts" : null,
        lastErrorReason: lastAudioError,
        elapsedMs: Date.now() - startedAt,
      },
    },
  };
  story.provider = story.providerMeta.provider;
  story.providerTrace = buildAiProviderTraceFromProviderMeta({
    providerMeta: story.providerMeta,
    source: story.source,
    fallback: story.fallback,
    fallbackReason: story.fallbackReason,
    capability: "storybook-media",
  });

  return prepareParentStoryBookResponseForDelivery(story, {
    cacheState: "bypass",
    institutionId: input.institutionId,
  });
}

async function parseRemoteStoryResponse(response: Response) {
  try {
    return (await response.json()) as ParentStoryBookResponse;
  } catch {
    return null;
  }
}

async function prepareStoryMediaForDelivery(input: {
  story: ParentStoryBookResponse;
  allowPersistentMedia: boolean;
  institutionId: string;
  requestUrl: string;
  serviceScope: ReturnType<typeof buildServiceScopeClaim>;
}) {
  // Brain 状态接口回退到 Next 时也必须执行同一持久化检查，避免跨实例媒体键变成 404。
  const durableStory = input.allowPersistentMedia
    ? await reconcileRemoteStoryBookMedia({
        story: input.story,
        institutionId: input.institutionId,
        requestUrl: input.requestUrl,
        serviceScope: input.serviceScope,
      })
    : input.story;
  return prepareParentStoryBookResponseForDelivery(durableStory, {
    cacheState: "bypass",
    institutionId: input.institutionId,
  });
}

export const parentStoryBookMediaStatusRouteInternals = {
  resolveMediaStatusTimeoutMs,
  resolveLocalProviderTimeoutMs,
  buildStoryMediaTaskIdentity,
  localDeadlineMs: MEDIA_STATUS_LOCAL_DEADLINE_MS,
};

export async function POST(request: Request) {
  const authResult = await authorizeAiRouteSession(request, {
    requiredRole: "parent",
    collectJsonClassNames: false,
  });
  if (authResult instanceof Response) return authResult;

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

  const sessionUser = authResult.session.user;
  if (sessionUser.role !== ROLE_PARENT) {
    return aiRouteLimitedResponse(
      {
        reason: "role_mismatch",
        error: "Parent role required.",
        requiredRole: "parent",
      },
      { headers: { "cache-control": "no-store" } }
    );
  }
  if (!payload.childId) {
    return aiRouteLimitedResponse(
      {
        reason: "scope_required",
        error: "Child scope is required for parent storybook media.",
        requiredRole: "parent",
      },
      { headers: { "cache-control": "no-store" } }
    );
  }

  const sessionScope = await getSessionScope(authResult.session);
  try {
    requireScopedChild(sessionScope, payload.childId);
  } catch (error) {
    if (error instanceof ApiRouteError && (error.code === "forbidden_scope" || error.code === "not_found")) {
      return aiRouteLimitedResponse(
        {
          reason: "forbidden_child",
          error: "Current account cannot access this child storybook media scope.",
          requiredRole: "parent",
        },
        { headers: { "cache-control": "no-store" } }
      );
    }
    throw error;
  }
  const provenanceContext: AiProvenanceContext = {
    userId: sessionUser.id,
    institutionId: sessionUser.institutionId,
    capability: "parent-storybook",
    scopeId: payload.childId,
  };
  const trustedContinuation = verifyAiResultAttestation(
    payload.story,
    provenanceContext
  );
  payload = {
    ...payload,
    story: sanitizeStorybookResultForContinuation(
      payload.story,
      provenanceContext
    ) as ParentStoryBookResponse,
  };

  const targetPath = "/api/v1/agents/parent/storybook/media-status";
  const serviceScope = buildServiceScopeClaim(sessionScope);
  if (!trustedContinuation) {
    // 旧缓存仍可安全降级展示，但绝不能携带 task id 继续访问任何 provider。
    const preparedStory = prepareParentStoryBookResponseForDelivery(
      payload.story,
      {
        cacheState: "bypass",
        institutionId: sessionScope.institutionId,
      }
    );
    return NextResponse.json(
      preparedStory,
      {
        status: 200,
        headers: mergeHeaders(
          createBrainTransportHeaders({
            transport: "next-json-fallback",
            targetPath,
            fallbackReason: "unverified-story-continuation",
          })
        ),
      }
    );
  }
  payload = {
    ...payload,
    // 旧版已签名 continuation 也只保留媒体结果，绝不把 task id 再签名回浏览器。
    story: stripRemoteStoryImageTasks(payload.story),
  };

  const selectedImageProvider = resolveStoryImageProvider();
  const persistMedia =
    sessionUser.accountKind === "normal" ||
    Boolean(process.env.DATABASE_URL?.trim());
  if (selectedImageProvider.kind === "dashscope") {
    // 百炼 task 的提交、轮询和机构持久化统一由 Next 所有，避免 Brain 版本漂移改写 task。
    const preparedStory = await prepareStoryMediaForDelivery({
      story: await completeStoryMediaLocally({
        payload,
        institutionId: sessionUser.institutionId,
        userId: sessionUser.id,
        persistMedia,
        signal: request.signal,
      }),
      allowPersistentMedia: persistMedia,
      institutionId: sessionUser.institutionId,
      requestUrl: request.url,
      serviceScope,
    });
    return NextResponse.json(
      attestAiResult(preparedStory, provenanceContext),
      {
        status: 200,
        headers: mergeHeaders(
          createBrainTransportHeaders({
            transport: "next-json-fallback",
            targetPath,
            fallbackReason: null,
          })
        ),
      }
    );
  }

  const brainRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(payload),
  });
  const brainForward = await forwardBrainRequest(brainRequest, targetPath, {
    timeoutMs: resolveMediaStatusTimeoutMs(),
    serviceScope,
  });
  if (!brainForward.response) {
    const preparedStory = await prepareStoryMediaForDelivery({
      story: await completeStoryMediaLocally({
        payload,
        institutionId: authResult.session.user.institutionId,
        userId: authResult.session.user.id,
        persistMedia,
        signal: request.signal,
      }),
      allowPersistentMedia: persistMedia,
      institutionId: authResult.session.user.institutionId,
      requestUrl: request.url,
      serviceScope,
    });
    return NextResponse.json(
      attestAiResult(preparedStory, provenanceContext),
      {
        status: 200,
        headers: mergeHeaders(
          createBrainTransportHeaders({
            transport: "next-json-fallback",
            targetPath,
            upstreamHost: brainForward.upstreamHost,
            fallbackReason: null,
          })
        ),
      }
    );
  }

  const remoteStory = await parseRemoteStoryResponse(brainForward.response.clone());
  if (!brainForward.response.ok || !remoteStory) {
    const preparedStory = await prepareStoryMediaForDelivery({
      story: await completeStoryMediaLocally({
        payload,
        institutionId: authResult.session.user.institutionId,
        userId: authResult.session.user.id,
        persistMedia,
        signal: request.signal,
      }),
      allowPersistentMedia: persistMedia,
      institutionId: authResult.session.user.institutionId,
      requestUrl: request.url,
      serviceScope,
    });
    return NextResponse.json(
      attestAiResult(preparedStory, provenanceContext),
      {
        status: 200,
        headers: mergeHeaders(
          createBrainTransportHeaders({
            transport: "next-json-fallback",
            targetPath,
            upstreamHost: brainForward.upstreamHost,
            fallbackReason: null,
          })
        ),
      }
    );
  }

  const taskSafeRemoteStory = stripRemoteStoryImageTasks(remoteStory);
  const durableRemoteStory = await prepareStoryMediaForDelivery({
    story: taskSafeRemoteStory,
    allowPersistentMedia: persistMedia,
    institutionId: authResult.session.user.institutionId,
    requestUrl: request.url,
    serviceScope,
  });
  const preparedRemoteStory = {
    ...durableRemoteStory,
    provider: taskSafeRemoteStory.providerMeta.provider,
    providerTrace:
      durableRemoteStory.providerTrace ??
      buildAiProviderTraceFromProviderMeta({
        providerMeta: durableRemoteStory.providerMeta,
        source: durableRemoteStory.source,
        fallback: durableRemoteStory.fallback,
        fallbackReason: durableRemoteStory.fallbackReason,
        capability: "storybook-media",
      }),
  } satisfies ParentStoryBookResponse;
  const preparedStory = prepareParentStoryBookResponseForDelivery(
    preparedRemoteStory,
    {
      cacheState: "bypass",
      institutionId: sessionScope.institutionId,
    }
  );

  return NextResponse.json(
    attestAiResult(preparedStory, provenanceContext),
    {
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
    }
  );
}
