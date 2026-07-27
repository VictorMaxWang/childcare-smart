import "server-only";

import type {
  ParentStoryBookResponse,
  ParentStoryBookScene,
} from "@/lib/ai/types";
import {
  forwardBrainRequest,
  type BrainServiceScopeClaim,
} from "@/lib/server/brain-client";
import {
  persistParentStoryBookMedia,
  readParentStoryBookMedia,
} from "@/lib/server/parent-storybook-media-store";

const MAX_REMOTE_MEDIA_BYTES = 4 * 1024 * 1024;
const MEDIA_ROUTE_PATTERN =
  /^\/api\/ai\/parent-storybook\/media\/([^/?#]+)(?:\?.*)?$/u;
const SAFE_REMOTE_MEDIA_KEY_PATTERN = /^[a-zA-Z0-9._-]{1,191}$/u;

type LoadedMedia = {
  contentType: string;
  bytes: Buffer;
};

type RemoteMediaDependencies = {
  readLocal: typeof readParentStoryBookMedia;
  persistLocal: typeof persistParentStoryBookMedia;
  loadRemote: (input: {
    mediaKey: string;
    expectedKind: "audio" | "image";
    requestUrl: string;
    serviceScope: BrainServiceScopeClaim;
    deadlineAtMs?: number;
    signal?: AbortSignal;
  }) => Promise<LoadedMedia | null>;
};

async function loadRemoteMedia(input: {
  mediaKey: string;
  expectedKind: "audio" | "image";
  requestUrl: string;
  serviceScope: BrainServiceScopeClaim;
  deadlineAtMs?: number;
  signal?: AbortSignal;
}): Promise<LoadedMedia | null> {
  const remainingMs = Math.floor(
    (input.deadlineAtMs ?? Date.now() + 10_000) - Date.now()
  );
  if (remainingMs <= 0 || input.signal?.aborted) return null;
  const targetPath = `/api/v1/agents/parent/storybook/media/${encodeURIComponent(
    input.mediaKey
  )}`;
  const forwarded = await forwardBrainRequest(
    new Request(input.requestUrl, {
      method: "GET",
      headers: {
        accept: `${input.expectedKind}/*`,
      },
      signal: input.signal,
    }),
    targetPath,
    {
      serviceScope: input.serviceScope,
      timeoutMs: remainingMs,
      bufferResponseBody: true,
    }
  );
  if (!forwarded.response?.ok) return null;

  const contentType = (
    forwarded.response.headers.get("content-type") ?? ""
  )
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!contentType.startsWith(`${input.expectedKind}/`)) return null;

  const declaredLength = Number(
    forwarded.response.headers.get("content-length")
  );
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_REMOTE_MEDIA_BYTES
  ) {
    return null;
  }
  const bytes = Buffer.from(await forwarded.response.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > MAX_REMOTE_MEDIA_BYTES) return null;
  return { contentType, bytes };
}

const defaultDependencies: RemoteMediaDependencies = {
  readLocal: readParentStoryBookMedia,
  persistLocal: persistParentStoryBookMedia,
  loadRemote: loadRemoteMedia,
};

function mediaKeyFromUrl(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const encoded = value.trim().match(MEDIA_ROUTE_PATTERN)?.[1];
  if (!encoded) return null;
  try {
    const decoded = decodeURIComponent(encoded);
    return SAFE_REMOTE_MEDIA_KEY_PATTERN.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

async function ensureDurableMediaUrl(input: {
  url: string;
  expectedKind: "audio" | "image";
  institutionId: string;
  childId: string;
  storybookId: string;
  sceneIndex: number;
  requestUrl: string;
  serviceScope: BrainServiceScopeClaim;
  dependencies: RemoteMediaDependencies;
  deadlineAtMs?: number;
  signal?: AbortSignal;
}) {
  const hasBudget = () =>
    !input.signal?.aborted &&
    (!input.deadlineAtMs || input.deadlineAtMs > Date.now());
  if (!hasBudget()) return null;
  const mediaKey = mediaKeyFromUrl(input.url);
  if (!mediaKey) return input.url;

  const existing = await input.dependencies
    .readLocal({
      institutionId: input.institutionId,
      mediaKey,
      allowPersistent: true,
      bypassCache: true,
      deadlineAtMs: input.deadlineAtMs,
      signal: input.signal,
    })
    .catch(() => null);
  if (
    existing &&
    existing.contentType.startsWith(`${input.expectedKind}/`) &&
    existing.ownerChildId === input.childId &&
    existing.ownerStorybookId === input.storybookId
  ) {
    if (existing.storageMode !== "cached_media") return input.url;
    if (!hasBudget()) return null;
    const persistedExisting = await input.dependencies
      .persistLocal({
        institutionId: input.institutionId,
        childId: input.childId,
        storybookId: input.storybookId,
        contentType: existing.contentType,
        bytes: existing.bytes,
        seed: `${input.storybookId}:local-cache:${input.expectedKind}:${input.sceneIndex}:${mediaKey}`,
        deadlineAtMs: input.deadlineAtMs,
        signal: input.signal,
      })
      .catch(() => null);
    if (persistedExisting) return persistedExisting.mediaUrl;
  }

  if (!hasBudget()) return null;
  const remote = await input.dependencies
    .loadRemote({
      mediaKey,
      expectedKind: input.expectedKind,
      requestUrl: input.requestUrl,
      serviceScope: input.serviceScope,
      deadlineAtMs: input.deadlineAtMs,
      signal: input.signal,
    })
    .catch(() => null);
  if (!remote) return null;

  if (!hasBudget()) return null;
  const persisted = await input.dependencies
    .persistLocal({
      institutionId: input.institutionId,
      childId: input.childId,
      storybookId: input.storybookId,
      contentType: remote.contentType,
      bytes: remote.bytes,
      seed: `${input.storybookId}:remote-brain:${input.expectedKind}:${input.sceneIndex}:${mediaKey}`,
      deadlineAtMs: input.deadlineAtMs,
      signal: input.signal,
    })
    .catch(() => null);
  return persisted?.mediaUrl ?? null;
}

async function reconcileScene(input: {
  scene: ParentStoryBookScene;
  story: ParentStoryBookResponse;
  institutionId: string;
  requestUrl: string;
  serviceScope: BrainServiceScopeClaim;
  dependencies: RemoteMediaDependencies;
  deadlineAtMs?: number;
  signal?: AbortSignal;
}) {
  let scene = { ...input.scene };
  const imageRoute =
    typeof scene.imageUrl === "string" && mediaKeyFromUrl(scene.imageUrl)
      ? scene.imageUrl
      : typeof scene.assetRef === "string" && mediaKeyFromUrl(scene.assetRef)
        ? scene.assetRef
        : null;
  if (imageRoute) {
    const durableImageUrl = await ensureDurableMediaUrl({
      url: imageRoute,
      expectedKind: "image",
      institutionId: input.institutionId,
      childId: input.story.childId,
      storybookId: input.story.storyId,
      sceneIndex: scene.sceneIndex,
      requestUrl: input.requestUrl,
      serviceScope: input.serviceScope,
      dependencies: input.dependencies,
      deadlineAtMs: input.deadlineAtMs,
      signal: input.signal,
    });
    scene = durableImageUrl
      ? {
          ...scene,
          imageUrl: durableImageUrl,
          assetRef: durableImageUrl,
        }
      : {
          ...scene,
          imageUrl: null,
          assetRef: null,
          imageStatus: "fallback",
          imageSourceKind:
            scene.imageSourceKind === "demo-art"
              ? "demo-art"
              : "svg-fallback",
        };
  }

  const audioRoute =
    typeof scene.audioUrl === "string" && mediaKeyFromUrl(scene.audioUrl)
      ? scene.audioUrl
      : typeof scene.audioRef === "string" && mediaKeyFromUrl(scene.audioRef)
        ? scene.audioRef
        : null;
  if (audioRoute) {
    const durableAudioUrl = await ensureDurableMediaUrl({
      url: audioRoute,
      expectedKind: "audio",
      institutionId: input.institutionId,
      childId: input.story.childId,
      storybookId: input.story.storyId,
      sceneIndex: scene.sceneIndex,
      requestUrl: input.requestUrl,
      serviceScope: input.serviceScope,
      dependencies: input.dependencies,
      deadlineAtMs: input.deadlineAtMs,
      signal: input.signal,
    });
    scene = durableAudioUrl
      ? {
          ...scene,
          audioUrl: durableAudioUrl,
          audioRef: durableAudioUrl,
        }
      : {
          ...scene,
          audioUrl: null,
          audioRef: null,
          audioStatus: "fallback",
        };
  }

  return scene;
}

/**
 * Brain 媒体缓存与 Next 实例不共享；普通账号收到远端媒体状态后，
 * 必须先复制到当前机构的持久化存储，才能把 ready URL 交给浏览器。
 */
export async function reconcileRemoteStoryBookMedia(
  input: {
    story: ParentStoryBookResponse;
    institutionId: string;
    requestUrl: string;
    serviceScope: BrainServiceScopeClaim;
    deadlineAtMs?: number;
    signal?: AbortSignal;
  },
  dependencies: Partial<RemoteMediaDependencies> = {}
) {
  const resolvedDependencies: RemoteMediaDependencies = {
    ...defaultDependencies,
    ...dependencies,
  };
  const story = JSON.parse(
    JSON.stringify(input.story)
  ) as ParentStoryBookResponse;
  story.scenes = await Promise.all(
    story.scenes.map((scene) =>
      reconcileScene({
        scene,
        story,
        institutionId: input.institutionId,
        requestUrl: input.requestUrl,
        serviceScope: input.serviceScope,
        dependencies: resolvedDependencies,
        deadlineAtMs: input.deadlineAtMs,
        signal: input.signal,
      })
    )
  );
  return story;
}
