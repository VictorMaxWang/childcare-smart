import type {
  ParentStoryBookRequest,
  ParentStoryBookResponse,
  ParentStoryBookStylePreset,
} from "@/lib/ai/types";
import { stableStorybookHash } from "./storybook-presets";

const STORYBOOK_CACHE_PREFIX = "smartchildcare:parent-storybook:v5-scene-renderer-1";
export const STORYBOOK_CACHE_TTL_MS = 15 * 60 * 1000;

export interface ParentStoryBookClientCacheState {
  kind: "none" | "hit" | "saved";
  savedAt?: number;
}

interface ParentStoryBookClientCacheEntry {
  savedAt: number;
  presetId: ParentStoryBookStylePreset;
  story: ParentStoryBookResponse;
}

type ParentStoryBookRuntimeProviderMeta = ParentStoryBookResponse["providerMeta"] & {
  transport?: string;
  imageDelivery?: "real" | "mixed" | "dynamic-fallback" | "demo-art" | "svg-fallback";
  diagnostics?: {
    brain?: {
      reachable?: boolean;
      fallbackReason?: string | null;
      upstreamHost?: string | null;
      elapsedMs?: number | null;
      timeoutMs?: number | null;
    } | null;
    image?: {
      jobStatus?: string | null;
      pendingSceneCount?: number;
      liveEnabled?: boolean;
      retryAfterMs?: number | null;
      nextRetryAtMs?: number | null;
      errorSceneCount?: number;
      lastErrorReason?: string | null;
    } | null;
    audio?: {
      jobStatus?: string | null;
      pendingSceneCount?: number;
      liveEnabled?: boolean;
      retryAfterMs?: number | null;
      nextRetryAtMs?: number | null;
      errorSceneCount?: number;
      lastErrorReason?: string | null;
    } | null;
  } | null;
};

type ParentStoryBookRuntimeScene = ParentStoryBookResponse["scenes"][number] & {
  imageSourceKind?: "real" | "dynamic-fallback" | "demo-art" | "svg-fallback";
};

type ParentStoryBookRuntimeStory = ParentStoryBookResponse & {
  providerMeta: ParentStoryBookRuntimeProviderMeta;
  scenes: ParentStoryBookRuntimeScene[];
};

export function hasActiveParentStoryBookMediaWarming(
  story: ParentStoryBookResponse | null | undefined
) {
  if (!story) return false;
  const runtime = story as ParentStoryBookRuntimeStory;
  return [runtime.providerMeta.diagnostics?.image, runtime.providerMeta.diagnostics?.audio]
    .some((diagnostics) => diagnostics &&
      diagnostics.jobStatus !== "error" && diagnostics.jobStatus !== "disabled" &&
      (diagnostics.jobStatus === "warming" || (diagnostics.pendingSceneCount ?? 0) > 0));
}

export function buildParentStoryBookCacheKey(
  request: ParentStoryBookRequest,
  presetId: ParentStoryBookStylePreset,
  ownerScope?: string,
) {
  const seed = JSON.stringify({
    ownerScope,
    childId: request.childId,
    requestSource: request.requestSource,
    storyMode: request.storyMode,
    generationMode: request.generationMode,
    manualTheme: request.manualTheme,
    manualPrompt: request.manualPrompt,
    pageCount: request.pageCount,
    goalKeywords: request.goalKeywords,
    protagonistArchetype: request.protagonistArchetype,
    stylePreset: presetId,
    styleMode: request.styleMode,
    customStylePrompt: request.customStylePrompt,
    customStyleNegativePrompt: request.customStyleNegativePrompt,
    stylePrompt: request.stylePrompt,
    snapshot: request.snapshot,
    highlightCandidates: request.highlightCandidates,
  });
  return `${STORYBOOK_CACHE_PREFIX}:${stableStorybookHash(seed)}`;
}

export function shouldPersistParentStoryBook(
  story: ParentStoryBookResponse | null | undefined
) {
  if (!story) return false;

  const runtime = story as ParentStoryBookRuntimeStory;
  if (runtime.providerMeta.realProvider) return true;
  if (runtime.providerMeta.imageDelivery === "dynamic-fallback") return true;
  if (runtime.scenes.some((scene) => scene.imageSourceKind === "dynamic-fallback")) return true;

  return runtime.scenes.some(
    (scene) =>
      scene.imageStatus === "ready" || scene.audioStatus === "ready"
  );
}

export function shouldBypassParentStoryBookCacheOnFirstLoad(
  story: ParentStoryBookResponse | null | undefined
) {
  if (!story) return false;

  const runtime = story as ParentStoryBookRuntimeStory;
  const transport = runtime.providerMeta.transport;
  const imageDelivery = runtime.providerMeta.imageDelivery;
  const audioDelivery = runtime.providerMeta.audioDelivery;
  const brainReachable = runtime.providerMeta.diagnostics?.brain?.reachable;

  if (brainReachable === false) return true;
  if (hasActiveParentStoryBookMediaWarming(runtime)) return true;
  if (transport && transport !== "remote-brain-proxy") return true;
  if (imageDelivery && imageDelivery !== "real") return true;
  if (audioDelivery === "preview-only") return true;

  if (!transport && !runtime.providerMeta.realProvider) return true;
  return false;
}

export function shouldPollParentStoryBookMedia(
  story: ParentStoryBookResponse | null | undefined
) {
  if (!story) return false;
  // 已启用能力不代表还有安全可执行的任务；失败/结果未知必须由用户明确处理。
  return hasActiveParentStoryBookMediaWarming(story);
}

export function hasParentStoryBookMediaFailure(story: ParentStoryBookResponse | null | undefined) {
  if (!story) return false;
  return [story.providerMeta.diagnostics?.image, story.providerMeta.diagnostics?.audio]
    .some((diagnostics) => diagnostics?.jobStatus === "error" || (diagnostics?.errorSceneCount ?? 0) > 0);
}

/** 遵从两种媒体的限流时间，并逐渐降低空轮询频率；后台页面由调用方暂停。 */
export function resolveParentStoryBookMediaPollDelayMs(
  story: ParentStoryBookResponse,
  attempt = 0,
  now = Date.now(),
) {
  const diagnostics = [story.providerMeta.diagnostics?.image, story.providerMeta.diagnostics?.audio];
  const serverDelay = Math.max(0, ...diagnostics.flatMap((item) => {
    const after = Number(item?.retryAfterMs);
    const at = Number(item?.nextRetryAtMs);
    return [Number.isFinite(after) ? Math.max(after, 0) : 0, Number.isFinite(at) ? Math.max(at - now + 500, 0) : 0];
  }));
  const backoff = 2_000 * 2 ** Math.min(Math.floor(Math.max(attempt, 0) / 4), 4);
  return Math.min(70_000, Math.max(backoff, serverDelay));
}

export function readParentStoryBookCache(cacheKey: string) {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(cacheKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as ParentStoryBookClientCacheEntry;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.savedAt !== "number" ||
      !parsed.story
    ) {
      window.sessionStorage.removeItem(cacheKey);
      return null;
    }

    if (Date.now() - parsed.savedAt > STORYBOOK_CACHE_TTL_MS) {
      window.sessionStorage.removeItem(cacheKey);
      return null;
    }

    return parsed;
  } catch {
    window.sessionStorage.removeItem(cacheKey);
    return null;
  }
}

export function writeParentStoryBookCache(
  cacheKey: string,
  presetId: ParentStoryBookStylePreset,
  story: ParentStoryBookResponse
) {
  if (typeof window === "undefined") return null;
  if (!shouldPersistParentStoryBook(story)) return null;

  const entry: ParentStoryBookClientCacheEntry = {
    savedAt: Date.now(),
    presetId,
    story,
  };

  try {
    window.sessionStorage.setItem(cacheKey, JSON.stringify(entry));
    return entry;
  } catch {
    return null;
  }
}

export function clearParentStoryBookCache(cacheKey: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(cacheKey);
}
