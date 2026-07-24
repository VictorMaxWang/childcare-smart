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
  /^\/api\/ai\/parent-storybook\/media\/([a-f0-9]{40})(?:\?.*)?$/u;

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
  }) => Promise<LoadedMedia | null>;
};

async function loadRemoteMedia(input: {
  mediaKey: string;
  expectedKind: "audio" | "image";
  requestUrl: string;
  serviceScope: BrainServiceScopeClaim;
}): Promise<LoadedMedia | null> {
  const targetPath = `/api/v1/agents/parent/storybook/media/${encodeURIComponent(
    input.mediaKey
  )}`;
  const forwarded = await forwardBrainRequest(
    new Request(input.requestUrl, {
      method: "GET",
      headers: {
        accept: `${input.expectedKind}/*`,
      },
    }),
    targetPath,
    { serviceScope: input.serviceScope }
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
  return value.trim().match(MEDIA_ROUTE_PATTERN)?.[1] ?? null;
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
}) {
  const mediaKey = mediaKeyFromUrl(input.url);
  if (!mediaKey) return input.url;

  const existing = await input.dependencies
    .readLocal({
      institutionId: input.institutionId,
      mediaKey,
      allowPersistent: true,
    })
    .catch(() => null);
  if (
    existing &&
    existing.contentType.startsWith(`${input.expectedKind}/`) &&
    existing.ownerChildId === input.childId
  ) {
    if (existing.storageMode === "database_media") return input.url;
    const persistedExisting = await input.dependencies
      .persistLocal({
        institutionId: input.institutionId,
        childId: input.childId,
        storybookId: input.storybookId,
        contentType: existing.contentType,
        bytes: existing.bytes,
        seed: `${input.storybookId}:local-cache:${input.expectedKind}:${input.sceneIndex}:${mediaKey}`,
      })
      .catch(() => null);
    if (persistedExisting) return persistedExisting.mediaUrl;
  }

  const remote = await input.dependencies
    .loadRemote({
      mediaKey,
      expectedKind: input.expectedKind,
      requestUrl: input.requestUrl,
      serviceScope: input.serviceScope,
    })
    .catch(() => null);
  if (!remote) return null;

  const persisted = await input.dependencies
    .persistLocal({
      institutionId: input.institutionId,
      childId: input.childId,
      storybookId: input.storybookId,
      contentType: remote.contentType,
      bytes: remote.bytes,
      seed: `${input.storybookId}:remote-brain:${input.expectedKind}:${input.sceneIndex}:${mediaKey}`,
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
      })
    )
  );
  return story;
}
