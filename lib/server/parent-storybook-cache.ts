import crypto from "node:crypto";
import type {
  BrainTransport,
} from "@/lib/server/brain-client";
import type {
  ParentStoryBookCacheMeta,
  ParentStoryBookImageDelivery,
  ParentStoryBookProviderMeta,
  ParentStoryBookResponse,
  ParentStoryBookScene,
} from "@/lib/ai/types";

const STORYBOOK_CACHE_NAMESPACE = "storybook-v2-dual-track-2";
const STORYBOOK_RESPONSE_TTL_SECONDS = 12 * 60;
const STORYBOOK_MEDIA_TTL_SECONDS = 20 * 60;
type StoryBookCacheTransport = Exclude<BrainTransport, "brain-proxy-error">;

type StoryBookResponseCacheEntry = {
  expiresAt: number;
  value: {
    story: ParentStoryBookResponse;
    transport: StoryBookCacheTransport;
    targetPath: string;
    upstreamHost: string | null;
    fallbackReason: string | null;
  };
};

type StoryBookMediaCacheEntry = {
  expiresAt: number;
  contentType: string;
  bytes: Buffer;
};

const storyResponseCache = new Map<string, StoryBookResponseCacheEntry>();
const mediaAssetCache = new Map<string, StoryBookMediaCacheEntry>();

function now() {
  return Date.now();
}

function cleanupExpired() {
  const current = now();

  for (const [key, entry] of storyResponseCache.entries()) {
    if (entry.expiresAt <= current) {
      storyResponseCache.delete(key);
    }
  }

  for (const [key, entry] of mediaAssetCache.entries()) {
    if (entry.expiresAt <= current) {
      mediaAssetCache.delete(key);
    }
  }
}

function resolveMediaIdFromUrl(url: string) {
  return url.split("/").pop() || null;
}

function cloneStory(story: ParentStoryBookResponse) {
  return JSON.parse(JSON.stringify(story)) as ParentStoryBookResponse;
}

function parseDataUrl(dataUrl: string) {
  const matched = dataUrl.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/i);
  if (!matched) return null;

  const contentType = matched[1] || "application/octet-stream";
  const encodedPayload = matched[2] || "";

  try {
    return {
      contentType,
      bytes: Buffer.from(encodedPayload, "base64"),
    };
  } catch {
    return null;
  }
}

function countRealScenes(story: ParentStoryBookResponse) {
  return story.scenes.filter(
    (scene) => scene.imageStatus === "ready" || scene.audioStatus === "ready"
  ).length;
}

function hasActiveMediaWarming(story: ParentStoryBookResponse) {
  const diagnostics = story.providerMeta.diagnostics;
  const imagePending = diagnostics?.image?.pendingSceneCount ?? 0;
  const audioPending = diagnostics?.audio?.pendingSceneCount ?? 0;
  return (
    diagnostics?.image?.jobStatus === "warming" ||
    diagnostics?.audio?.jobStatus === "warming" ||
    imagePending > 0 ||
    audioPending > 0
  );
}

function resolveAudioDelivery(story: ParentStoryBookResponse): ParentStoryBookCacheMeta["audioDelivery"] {
  const hasReadyAudio = story.scenes.some(
    (scene) => scene.audioStatus === "ready" && Boolean(scene.audioUrl)
  );

  if (!hasReadyAudio) return "preview-only";

  return "stream-url";
}

function resolveProviderAudioDelivery(
  story: ParentStoryBookResponse
): ParentStoryBookProviderMeta["audioDelivery"] {
  const readySceneCount = story.scenes.filter(
    (scene) => scene.audioStatus === "ready" && Boolean(scene.audioUrl)
  ).length;

  if (readySceneCount === 0) return "preview-only";
  if (readySceneCount === story.scenes.length) return "real";
  return "mixed";
}

function resolveSceneImageSourceKind(scene: ParentStoryBookScene) {
  if (scene.imageSourceKind) {
    return scene.imageSourceKind;
  }
  if (scene.imageStatus === "ready" && scene.imageUrl) {
    return "real" as const;
  }
  if (
    typeof scene.imageUrl === "string" &&
    scene.imageUrl.includes("/storybook/demo-v3/")
  ) {
    return "demo-art" as const;
  }
  if (
    typeof scene.assetRef === "string" &&
    scene.assetRef.includes("/storybook/demo-v3/")
  ) {
    return "demo-art" as const;
  }
  return "svg-fallback" as const;
}

function resolveProviderImageDelivery(
  story: ParentStoryBookResponse
): ParentStoryBookImageDelivery {
  const kinds = new Set(story.scenes.map((scene) => resolveSceneImageSourceKind(scene)));
  if (kinds.size === 1) {
    return kinds.values().next().value ?? "svg-fallback";
  }
  return "mixed";
}

export function buildParentStoryBookRequestCacheKey(payload: unknown) {
  return crypto
    .createHash("sha1")
    .update(`${STORYBOOK_CACHE_NAMESPACE}:${JSON.stringify(payload)}`)
    .digest("hex");
}

export function shouldCacheParentStoryBookResponse(story: ParentStoryBookResponse) {
  return countRealScenes(story) > 0 && !hasActiveMediaWarming(story);
}

export function getCachedParentStoryBookResponse(cacheKey: string) {
  cleanupExpired();
  const entry = storyResponseCache.get(cacheKey);
  if (!entry) return null;

  return {
    ...entry.value,
    story: cloneStory(entry.value.story),
  };
}

export function setCachedParentStoryBookResponse(
  cacheKey: string,
  value: StoryBookResponseCacheEntry["value"],
  ttlSeconds = STORYBOOK_RESPONSE_TTL_SECONDS
) {
  cleanupExpired();
  storyResponseCache.set(cacheKey, {
    expiresAt: now() + ttlSeconds * 1000,
    value: {
      ...value,
      story: cloneStory(value.story),
    },
  });
}

export function cacheParentStoryBookMediaDataUrl(dataUrl: string, seed: string) {
  cleanupExpired();
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;

  const mediaId = crypto
    .createHash("sha1")
    .update(`${seed}:${dataUrl.slice(0, 128)}:${parsed.bytes.length}`)
    .digest("hex");

  mediaAssetCache.set(mediaId, {
    expiresAt: now() + STORYBOOK_MEDIA_TTL_SECONDS * 1000,
    contentType: parsed.contentType,
    bytes: parsed.bytes,
  });

  return `/api/ai/parent-storybook/media/${mediaId}`;
}

export function cacheParentStoryBookAudioDataUrl(dataUrl: string, seed: string) {
  return cacheParentStoryBookMediaDataUrl(dataUrl, seed);
}

export function cacheParentStoryBookSvgContent(svg: string, seed: string) {
  const encoded = Buffer.from(svg, "utf8").toString("base64");
  return cacheParentStoryBookMediaDataUrl(
    `data:image/svg+xml;base64,${encoded}`,
    seed
  );
}

export function readCachedParentStoryBookMedia(mediaId: string) {
  cleanupExpired();
  const entry = mediaAssetCache.get(mediaId);
  if (!entry) return null;

  return {
    contentType: entry.contentType,
    bytes: entry.bytes,
  };
}

export function readCachedParentStoryBookAudio(mediaId: string) {
  return readCachedParentStoryBookMedia(mediaId);
}

export function prepareParentStoryBookResponseForDelivery(
  story: ParentStoryBookResponse,
  options: {
    cacheState: ParentStoryBookCacheMeta["storyResponse"];
    ttlSeconds?: number;
  }
) {
  const nextStory = cloneStory(story);
  let audioDelivery: ParentStoryBookCacheMeta["audioDelivery"] =
    resolveAudioDelivery(nextStory);

  nextStory.scenes = nextStory.scenes.map((scene) => {
    let nextScene = {
      ...scene,
      imageSourceKind: scene.imageSourceKind ?? resolveSceneImageSourceKind(scene),
    };

    if (
      nextScene.audioStatus === "ready" &&
      typeof nextScene.audioUrl === "string" &&
      nextScene.audioUrl.startsWith("data:audio/")
    ) {
      const cachedUrl = cacheParentStoryBookMediaDataUrl(
        nextScene.audioUrl,
        `${nextStory.storyId}:${nextScene.sceneIndex}`
      );
      if (cachedUrl) {
        audioDelivery = "stream-url";
        nextScene = {
          ...nextScene,
          audioUrl: cachedUrl,
          audioRef: resolveMediaIdFromUrl(cachedUrl) ?? nextScene.audioRef,
        };
      }
    }

    if (
      nextScene.audioStatus === "ready" &&
      typeof nextScene.audioUrl === "string" &&
      nextScene.audioUrl.startsWith("/api/ai/parent-storybook/media/") &&
      !nextScene.audioRef
    ) {
      nextScene = {
        ...nextScene,
        audioRef: resolveMediaIdFromUrl(nextScene.audioUrl),
      };
    }

    if (
      typeof nextScene.imageUrl === "string" &&
      nextScene.imageUrl.startsWith("data:image/svg+xml")
    ) {
      const cachedImageUrl = cacheParentStoryBookMediaDataUrl(
        nextScene.imageUrl,
        `${nextStory.storyId}:image:${nextScene.sceneIndex}`
      );
      if (cachedImageUrl) {
        nextScene = {
          ...nextScene,
          imageUrl: cachedImageUrl,
          assetRef:
            nextScene.imageSourceKind === "demo-art"
              ? nextScene.assetRef
              : cachedImageUrl,
          imageSourceKind: nextScene.imageSourceKind ?? "svg-fallback",
        };
      }
    }

    if (
      typeof nextScene.assetRef === "string" &&
      nextScene.assetRef.startsWith("data:image/svg+xml")
    ) {
      const cachedAssetUrl = cacheParentStoryBookMediaDataUrl(
        nextScene.assetRef,
        `${nextStory.storyId}:asset:${nextScene.sceneIndex}`
      );
      if (cachedAssetUrl) {
        nextScene = {
          ...nextScene,
          assetRef: cachedAssetUrl,
        };
      }
    }

    return nextScene;
  });

  nextStory.providerMeta = {
    ...nextStory.providerMeta,
    imageDelivery:
      nextStory.providerMeta.imageDelivery ??
      resolveProviderImageDelivery(nextStory),
    audioDelivery: resolveProviderAudioDelivery(nextStory),
  };

  nextStory.cacheMeta = {
    storyResponse: options.cacheState,
    audioDelivery,
    ttlSeconds: options.ttlSeconds ?? STORYBOOK_RESPONSE_TTL_SECONDS,
    realSceneCount: countRealScenes(nextStory),
  };

  return nextStory;
}

export const parentStoryBookCacheInternals = {
  storyResponseCache,
  mediaAssetCache,
  hasActiveMediaWarming,
};
