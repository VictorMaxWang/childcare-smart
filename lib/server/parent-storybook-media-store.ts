import "server-only";

import {
  getStorybookMediaAsset,
  upsertStorybookMediaAsset,
  type PersistedStorybookMediaAsset,
  type UpsertStorybookMediaAssetInput,
} from "@/lib/db/storybook-media";
import {
  cacheParentStoryBookMediaBytes,
  markCachedParentStoryBookMediaPersisted,
  readCachedParentStoryBookMedia,
} from "@/lib/server/parent-storybook-cache";

export type ParentStoryBookMediaStorageMode =
  | "cached_media"
  | "database_media";

export interface ParentStoryBookMediaAsset {
  contentType: string;
  bytes: Buffer;
  expiresAt: string | null;
  ownerChildId: string | null;
  ownerStorybookId: string | null;
  storageMode: ParentStoryBookMediaStorageMode;
}

type ParentStoryBookMediaStoreDependencies = {
  upsertPersistent: (
    input: UpsertStorybookMediaAssetInput
  ) => Promise<void>;
  readPersistent: (input: {
    institutionId: string;
    mediaKey: string;
  }) => Promise<PersistedStorybookMediaAsset | null>;
};

const defaultDependencies: ParentStoryBookMediaStoreDependencies = {
  upsertPersistent: upsertStorybookMediaAsset,
  readPersistent: getStorybookMediaAsset,
};

export async function persistParentStoryBookMedia(
  input: {
    institutionId: string;
    childId: string;
    storybookId: string;
    contentType: string;
    bytes: Buffer;
    seed: string;
    deadlineAtMs?: number;
    signal?: AbortSignal;
  },
  dependencies: Partial<ParentStoryBookMediaStoreDependencies> = {}
) {
  const mediaUrl = cacheParentStoryBookMediaBytes(
    input.contentType,
    input.bytes,
    input.seed,
    {
      institutionId: input.institutionId,
      childId: input.childId,
      storybookId: input.storybookId,
    }
  );
  const mediaKey = mediaUrl.split("/").at(-1);
  if (!mediaKey) {
    throw new Error("storybook media cache did not return a media key");
  }
  const remainingMs = input.deadlineAtMs
    ? Math.floor(input.deadlineAtMs - Date.now())
    : null;
  if (remainingMs !== null && remainingMs <= 0) {
    throw new Error("storybook media persistence deadline exhausted");
  }

  // 数据库写入成功后才把媒体标成持久可用，防止将仅当前实例可读的 URL 返回给正常账号。
  await (dependencies.upsertPersistent ?? defaultDependencies.upsertPersistent)({
    institutionId: input.institutionId,
    mediaKey,
    childId: input.childId,
    storybookId: input.storybookId,
    contentType: input.contentType,
    bytes: input.bytes,
    signal: input.signal,
    ...(remainingMs !== null
      ? { timeoutMs: Math.max(1, Math.min(30_000, remainingMs)) }
      : {}),
  });
  markCachedParentStoryBookMediaPersisted(mediaKey);

  return { mediaUrl, mediaKey };
}

export async function readParentStoryBookMedia(
  input: {
    institutionId: string;
    mediaKey: string;
    allowPersistent?: boolean;
    bypassCache?: boolean;
  },
  dependencies: Partial<ParentStoryBookMediaStoreDependencies> = {}
): Promise<ParentStoryBookMediaAsset | null> {
  const cached = input.bypassCache
    ? null
    : readCachedParentStoryBookMedia(input.mediaKey, {
        institutionId: input.institutionId,
      });
  if (cached) return cached;
  if (input.allowPersistent === false) return null;
  if (!/^[a-f0-9]{40}$/u.test(input.mediaKey)) return null;

  const persisted = await (
    dependencies.readPersistent ?? defaultDependencies.readPersistent
  )({
    institutionId: input.institutionId,
    mediaKey: input.mediaKey,
  });
  if (!persisted) return null;

  return {
    contentType: persisted.contentType,
    bytes: persisted.bytes,
    expiresAt: null,
    ownerChildId: persisted.childId,
    ownerStorybookId: persisted.storybookId,
    storageMode: "database_media",
  };
}
