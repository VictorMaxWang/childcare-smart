import assert from "node:assert/strict";
import test from "node:test";

import {
  parentStoryBookCacheInternals,
  readCachedParentStoryBookMedia,
} from "./parent-storybook-cache.ts";
import {
  persistParentStoryBookMedia,
  readParentStoryBookMedia,
} from "./parent-storybook-media-store.ts";

test("persisted storybook media survives a cold in-memory cache", async () => {
  parentStoryBookCacheInternals.mediaAssetCache.clear();
  const bytes = Buffer.from("durable-audio");
  let persistedInstitutionId: string | null = null;
  let persistedBytes: Buffer | null = null;

  const persisted = await persistParentStoryBookMedia(
    {
      institutionId: "institution-1",
      childId: "child-1",
      storybookId: "story-1",
      contentType: "audio/wav",
      bytes,
      seed: "story-1:scene-1",
    },
    {
      upsertPersistent: async (input) => {
        persistedInstitutionId = input.institutionId;
        persistedBytes = input.bytes;
      },
    }
  );

  assert.match(
    persisted.mediaUrl,
    /^\/api\/ai\/parent-storybook\/media\/[a-f0-9]+$/
  );
  assert.equal(persistedInstitutionId, "institution-1");
  assert.deepEqual(persistedBytes, bytes);

  const warmAsset = readCachedParentStoryBookMedia(persisted.mediaKey);
  assert.equal(warmAsset?.storageMode, "database_media");
  assert.equal(warmAsset?.expiresAt, null);

  parentStoryBookCacheInternals.mediaAssetCache.clear();
  const coldAsset = await readParentStoryBookMedia(
    {
      institutionId: "institution-1",
      mediaKey: persisted.mediaKey,
    },
    {
      readPersistent: async (input) => {
        assert.deepEqual(input, {
          institutionId: "institution-1",
          mediaKey: persisted.mediaKey,
        });
        return {
          contentType: "audio/wav",
          bytes,
          childId: "child-1",
          storybookId: "story-1",
        };
      },
    }
  );

  assert.equal(coldAsset?.storageMode, "database_media");
  assert.equal(coldAsset?.ownerChildId, "child-1");
  assert.equal(coldAsset?.ownerStorybookId, "story-1");
  assert.deepEqual(coldAsset?.bytes, bytes);
});

test("invalid storybook media keys do not reach persistent storage", async () => {
  parentStoryBookCacheInternals.mediaAssetCache.clear();
  let persistentReadCalled = false;

  const asset = await readParentStoryBookMedia(
    {
      institutionId: "institution-1",
      mediaKey: "legacy-or-invalid-key",
    },
    {
      readPersistent: async () => {
        persistentReadCalled = true;
        return null;
      },
    }
  );

  assert.equal(asset, null);
  assert.equal(persistentReadCalled, false);
});

test("storybook media persistence forwards the remaining request deadline to MySQL", async () => {
  parentStoryBookCacheInternals.mediaAssetCache.clear();
  let timeoutMs: number | undefined;
  let signal: AbortSignal | undefined;
  const controller = new AbortController();

  await persistParentStoryBookMedia(
    {
      institutionId: "institution-1",
      childId: "child-1",
      storybookId: "story-1",
      contentType: "image/webp",
      bytes: Buffer.from("durable-image"),
      seed: "story-1:scene-1:image",
      deadlineAtMs: Date.now() + 5_000,
      signal: controller.signal,
    },
    {
      upsertPersistent: async (input) => {
        timeoutMs = input.timeoutMs;
        signal = input.signal;
      },
    }
  );

  assert.equal(typeof timeoutMs, "number");
  assert.ok((timeoutMs ?? 0) > 0);
  assert.ok((timeoutMs ?? 0) <= 5_000);
  assert.equal(signal, controller.signal);
});

test("storybook media reads can bypass a warm cache to prove persistent storage", async () => {
  parentStoryBookCacheInternals.mediaAssetCache.clear();
  const persisted = await persistParentStoryBookMedia(
    {
      institutionId: "institution-1",
      childId: "child-1",
      storybookId: "story-1",
      contentType: "audio/wav",
      bytes: Buffer.from("warm-cache-bytes"),
      seed: "story-1:scene-1:bypass",
    },
    {
      upsertPersistent: async () => undefined,
    }
  );

  const coldBytes = Buffer.from("database-bytes");
  const asset = await readParentStoryBookMedia(
    {
      institutionId: "institution-1",
      mediaKey: persisted.mediaKey,
      bypassCache: true,
    },
    {
      readPersistent: async () => ({
        contentType: "audio/wav",
        bytes: coldBytes,
        childId: "child-1",
        storybookId: "story-1",
      }),
    }
  );

  assert.equal(asset?.storageMode, "database_media");
  assert.deepEqual(asset?.bytes, coldBytes);
});

test("a warm media cache entry is never served across institutions", async () => {
  parentStoryBookCacheInternals.mediaAssetCache.clear();
  const persisted = await persistParentStoryBookMedia(
    {
      institutionId: "institution-1",
      childId: "shared-child-id",
      storybookId: "shared-story-id",
      contentType: "image/webp",
      bytes: Buffer.from("institution-1-private-image"),
      seed: "shared-story-id:scene-1:image",
    },
    {
      upsertPersistent: async () => undefined,
    }
  );
  const otherInstitution = await persistParentStoryBookMedia(
    {
      institutionId: "institution-2",
      childId: "shared-child-id",
      storybookId: "shared-story-id",
      contentType: "image/webp",
      bytes: Buffer.from("institution-1-private-image"),
      seed: "shared-story-id:scene-1:image",
    },
    {
      upsertPersistent: async () => undefined,
    }
  );
  assert.notEqual(otherInstitution.mediaKey, persisted.mediaKey);
  let persistentReadCount = 0;

  const crossInstitutionAsset = await readParentStoryBookMedia(
    {
      institutionId: "institution-2",
      mediaKey: persisted.mediaKey,
    },
    {
      readPersistent: async (input) => {
        persistentReadCount += 1;
        assert.equal(input.institutionId, "institution-2");
        return null;
      },
    }
  );

  assert.equal(crossInstitutionAsset, null);
  assert.equal(persistentReadCount, 1);
});
