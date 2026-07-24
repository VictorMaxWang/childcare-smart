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
