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
  },
  dependencies: Partial<ParentStoryBookMediaStoreDependencies> = {}
) {
  const mediaUrl = cacheParentStoryBookMediaBytes(
    input.contentType,
    input.bytes,
    input.seed,
    {
      childId: input.childId,
      storybookId: input.storybookId,
    }
  );
  const mediaKey = mediaUrl.split("/").at(-1);
  if (!mediaKey) {
    throw new Error("storybook media cache did not return a media key");
  }

  // 数据库写入成功后才把媒体标成持久可用，防止将仅当前实例可读的 URL 返回给正常账号。
  await (dependencies.upsertPersistent ?? defaultDependencies.upsertPersistent)({
    institutionId: input.institutionId,
    mediaKey,
    childId: input.childId,
    storybookId: input.storybookId,
    contentType: input.contentType,
    bytes: input.bytes,
  });
  markCachedParentStoryBookMediaPersisted(mediaKey);

  return { mediaUrl, mediaKey };
}

export async function readParentStoryBookMedia(
  input: {
    institutionId: string;
    mediaKey: string;
    allowPersistent?: boolean;
  },
  dependencies: Partial<ParentStoryBookMediaStoreDependencies> = {}
): Promise<ParentStoryBookMediaAsset | null> {
  const cached = readCachedParentStoryBookMedia(input.mediaKey);
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
