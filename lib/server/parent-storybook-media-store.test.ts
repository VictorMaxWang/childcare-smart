import assert from "node:assert/strict";
import test from "node:test";

import {
  parentStoryBookCacheInternals,
  readCachedParentStoryBookMedia,
} from "./parent-storybook-cache.ts";
import {
  buildParentStoryBookPersistentMediaKey,
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
        assert.equal(input.institutionId, "institution-1");
        assert.equal(input.mediaKey, persisted.mediaKey);
        assert.ok((input.timeoutMs ?? 0) > 0);
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

test("storybook media persistence retries a transient idempotent database timeout", async () => {
  parentStoryBookCacheInternals.mediaAssetCache.clear();
  const attempts: Array<{ timeoutMs: number | undefined; bytes: Buffer }> = [];

  const persisted = await persistParentStoryBookMedia(
    {
      institutionId: "institution-1",
      childId: "child-1",
      storybookId: "story-1",
      contentType: "audio/wav",
      bytes: Buffer.from("retryable-audio"),
      seed: "story-1:scene-1:retryable-audio",
      deadlineAtMs: Date.now() + 4_000,
    },
    {
      upsertPersistent: async (input) => {
        attempts.push({
          timeoutMs: input.timeoutMs,
          bytes: input.bytes,
        });
        if (attempts.length === 1) {
          throw new Error("storybook media database query timed out");
        }
      },
    }
  );

  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts[0]?.bytes, attempts[1]?.bytes);
  assert.ok((attempts[0]?.timeoutMs ?? 0) > 0);
  assert.ok((attempts[0]?.timeoutMs ?? 0) <= 2_000);
  assert.equal(
    readCachedParentStoryBookMedia(persisted.mediaKey)?.storageMode,
    "database_media"
  );
});

test("storybook media persistence does not retry a non-transient failure", async () => {
  parentStoryBookCacheInternals.mediaAssetCache.clear();
  let attempts = 0;

  await assert.rejects(
    persistParentStoryBookMedia(
      {
        institutionId: "institution-1",
        childId: "child-1",
        storybookId: "story-1",
        contentType: "audio/wav",
        bytes: Buffer.from("invalid-audio"),
        seed: "story-1:scene-1:invalid-audio",
        deadlineAtMs: Date.now() + 4_000,
      },
      {
        upsertPersistent: async () => {
          attempts += 1;
          throw new Error("storybook media row failed validation");
        },
      }
    ),
    /failed validation/u
  );

  assert.equal(attempts, 1);
});

test("storybook media persistence accepts an exact read-back after an unknown commit", async () => {
  parentStoryBookCacheInternals.mediaAssetCache.clear();
  const bytes = Buffer.from("unknown-commit-audio");
  let attempts = 0;
  let readBacks = 0;

  const persisted = await persistParentStoryBookMedia(
    {
      institutionId: "institution-1",
      childId: "child-1",
      storybookId: "story-1",
      contentType: "audio/wav",
      bytes,
      seed: "story-1:scene-1:unknown-commit",
      deadlineAtMs: Date.now() + 4_000,
    },
    {
      upsertPersistent: async () => {
        attempts += 1;
        const error = new Error("lock wait timed out") as Error & {
          code?: string;
        };
        error.code = "ER_LOCK_WAIT_TIMEOUT";
        throw error;
      },
      readPersistent: async (input) => {
        readBacks += 1;
        assert.equal(input.institutionId, "institution-1");
        assert.ok((input.timeoutMs ?? 0) > 0);
        assert.ok((input.timeoutMs ?? 0) <= 2_000);
        return {
          childId: "child-1",
          storybookId: "story-1",
          contentType: "audio/wav",
          bytes,
        };
      },
    }
  );

  assert.equal(attempts, 3);
  assert.equal(readBacks, 1);
  assert.equal(
    readCachedParentStoryBookMedia(persisted.mediaKey)?.storageMode,
    "database_media"
  );
});

test("storybook media persistence still reads back after a later non-transient error", async () => {
  parentStoryBookCacheInternals.mediaAssetCache.clear();
  const bytes = Buffer.from("mixed-outcome-audio");
  let attempts = 0;

  const persisted = await persistParentStoryBookMedia(
    {
      institutionId: "institution-1",
      childId: "child-1",
      storybookId: "story-1",
      contentType: "audio/wav",
      bytes,
      seed: "story-1:scene-1:mixed-outcome",
      deadlineAtMs: Date.now() + 4_000,
    },
    {
      upsertPersistent: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("storybook media database query timed out");
        }
        throw new Error("ECONNREFUSED");
      },
      readPersistent: async () => ({
        childId: "child-1",
        storybookId: "story-1",
        contentType: "audio/wav",
        bytes,
      }),
    }
  );

  assert.equal(attempts, 2);
  assert.match(persisted.mediaKey, /^[a-f0-9]{40}$/u);
});

test("storybook media persistence rejects a mismatched unknown-commit read-back", async () => {
  parentStoryBookCacheInternals.mediaAssetCache.clear();
  let attempts = 0;

  await assert.rejects(
    persistParentStoryBookMedia(
      {
        institutionId: "institution-1",
        childId: "child-1",
        storybookId: "story-1",
        contentType: "audio/wav",
        bytes: Buffer.from("expected-audio"),
        seed: "story-1:scene-1:mismatched-readback",
        deadlineAtMs: Date.now() + 4_000,
      },
      {
        upsertPersistent: async () => {
          attempts += 1;
          throw new Error("storybook media database query timed out");
        },
        readPersistent: async () => ({
          childId: "child-1",
          storybookId: "story-1",
          contentType: "audio/wav",
          bytes: Buffer.from("different-audio"),
        }),
      }
    ),
    /database query timed out/u
  );

  assert.equal(attempts, 3);
});

test("storybook media persistence stops retrying when cancellation wins", async () => {
  parentStoryBookCacheInternals.mediaAssetCache.clear();
  const controller = new AbortController();
  let attempts = 0;

  await assert.rejects(
    persistParentStoryBookMedia(
      {
        institutionId: "institution-1",
        childId: "child-1",
        storybookId: "story-1",
        contentType: "audio/wav",
        bytes: Buffer.from("cancelled-audio"),
        seed: "story-1:scene-1:cancelled",
        deadlineAtMs: Date.now() + 4_000,
        signal: controller.signal,
      },
      {
        upsertPersistent: async () => {
          attempts += 1;
          controller.abort();
          throw new Error("storybook media database query timed out");
        },
        readPersistent: async () => {
          throw new Error("cancelled requests must not read back");
        },
      }
    ),
    /operation aborted/u
  );

  assert.equal(attempts, 1);
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

test("cold media reads forward the shared deadline and cancellation signal", async () => {
  parentStoryBookCacheInternals.mediaAssetCache.clear();
  const controller = new AbortController();
  const deadlineAtMs = Date.now() + 1_500;
  let observedTimeoutMs = 0;
  let observedSignal: AbortSignal | undefined;

  const asset = await readParentStoryBookMedia(
    {
      institutionId: "institution-1",
      mediaKey: "c".repeat(40),
      bypassCache: true,
      deadlineAtMs,
      signal: controller.signal,
    },
    {
      readPersistent: async (input) => {
        observedTimeoutMs = input.timeoutMs ?? 0;
        observedSignal = input.signal;
        return null;
      },
    }
  );

  assert.equal(asset, null);
  assert.equal(observedSignal, controller.signal);
  assert.ok(observedTimeoutMs > 0);
  assert.ok(observedTimeoutMs <= 1_500);
});

test("cold media reads stop before querying when the shared deadline is exhausted", async () => {
  parentStoryBookCacheInternals.mediaAssetCache.clear();
  let persistentReadCount = 0;

  await assert.rejects(
    readParentStoryBookMedia(
      {
        institutionId: "institution-1",
        mediaKey: "d".repeat(40),
        bypassCache: true,
        deadlineAtMs: Date.now() - 1,
      },
      {
        readPersistent: async () => {
          persistentReadCount += 1;
          return null;
        },
      }
    ),
    /read deadline exhausted/u
  );

  assert.equal(persistentReadCount, 0);
});

test("persistent media keys are stable for one scoped scene and isolated by institution", () => {
  const first = buildParentStoryBookPersistentMediaKey({
    institutionId: "institution-1",
    seed: "story-1:audio:scene-1:digest",
  });
  const replay = buildParentStoryBookPersistentMediaKey({
    institutionId: "institution-1",
    seed: "story-1:audio:scene-1:digest",
  });
  const otherInstitution = buildParentStoryBookPersistentMediaKey({
    institutionId: "institution-2",
    seed: "story-1:audio:scene-1:digest",
  });

  assert.equal(first, replay);
  assert.notEqual(first, otherInstitution);
});
