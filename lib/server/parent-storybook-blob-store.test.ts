import assert from "node:assert/strict";
import test from "node:test";

import {
  BlobPreconditionFailedError,
  BlobRequestAbortedError,
  type GetBlobResult,
  type PutBlobResult,
} from "@vercel/blob";
import {
  buildParentStoryBookBlobManifestPath,
  persistParentStoryBookBlob,
  readParentStoryBookBlob,
} from "./parent-storybook-blob-store.ts";

type MemoryBlob = {
  bytes: Buffer;
  contentType: string;
  etag: string;
  streamError?: Error;
};

async function bodyToBuffer(body: unknown) {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof body === "string") return Buffer.from(body, "utf8");
  if (body instanceof Blob) return Buffer.from(await body.arrayBuffer());
  throw new Error("unsupported in-memory Blob body");
}

function createMemoryBlobStore() {
  const blobs = new Map<string, MemoryBlob>();
  const putCalls: string[] = [];
  const putAttempts: Array<{
    pathname: string;
    allowOverwrite?: boolean;
  }> = [];
  const getCalls: Array<{ pathname: string; useCache?: boolean }> = [];

  return {
    blobs,
    putCalls,
    putAttempts,
    getCalls,
    dependencies: {
      putObject: async (
        pathname: string,
        body: unknown,
        options?: { contentType?: string; allowOverwrite?: boolean }
      ) => {
        putAttempts.push({
          pathname,
          allowOverwrite: options?.allowOverwrite,
        });
        if (blobs.has(pathname) && options?.allowOverwrite === false) {
          throw new BlobPreconditionFailedError();
        }
        const bytes = await bodyToBuffer(body);
        const contentType =
          options?.contentType ?? "application/octet-stream";
        const etag = `etag-${putCalls.length + 1}`;
        blobs.set(pathname, { bytes, contentType, etag });
        putCalls.push(pathname);
        return {
          url: `https://blob.example/${pathname}`,
          downloadUrl: `https://blob.example/${pathname}?download=1`,
          pathname,
          contentType,
          contentDisposition: "inline",
          etag,
        } satisfies PutBlobResult;
      },
      getObject: async (
        pathname: string,
        options?: { useCache?: boolean }
      ) => {
        getCalls.push({ pathname, useCache: options?.useCache });
        const entry = blobs.get(pathname);
        if (!entry) return null;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            if (entry.streamError) {
              controller.error(entry.streamError);
              return;
            }
            controller.enqueue(entry.bytes);
            controller.close();
          },
        });
        return {
          statusCode: 200,
          stream,
          headers: new Headers(),
          blob: {
            url: `https://blob.example/${pathname}`,
            downloadUrl: `https://blob.example/${pathname}?download=1`,
            pathname,
            contentDisposition: "inline",
            cacheControl: "private",
            uploadedAt: new Date(0),
            etag: entry.etag,
            contentType: entry.contentType,
            size: entry.bytes.byteLength,
          },
        } satisfies GetBlobResult;
      },
    },
  };
}

test("private storybook Blob commits bytes before an opaque stable manifest", async () => {
  const store = createMemoryBlobStore();
  const bytes = Buffer.from("RIFF-private-storybook-WAVE");
  const mediaKey = "a".repeat(40);

  await persistParentStoryBookBlob(
    {
      institutionId: "visible-institution",
      childId: "visible-child",
      storybookId: "visible-story",
      mediaKey,
      contentType: "audio/wav",
      bytes,
      deadlineAtMs: Date.now() + 5_000,
    },
    store.dependencies
  );

  assert.equal(store.putCalls.length, 2);
  assert.equal(store.putAttempts[0]?.allowOverwrite, false);
  assert.equal(store.putAttempts[1]?.allowOverwrite, true);
  assert.match(store.putCalls[0] ?? "", /\/storybook\/[a-f0-9]{40}\//u);
  assert.equal(
    store.putCalls[1],
    buildParentStoryBookBlobManifestPath({
      institutionId: "visible-institution",
      mediaKey,
    })
  );
  assert.doesNotMatch(
    store.putCalls.join("\n"),
    /visible-institution|visible-child|visible-story/u
  );
});

test("private storybook Blob cold read verifies scope metadata and media digest", async () => {
  const store = createMemoryBlobStore();
  const bytes = Buffer.from("durable-private-image");
  const mediaKey = "b".repeat(40);

  await persistParentStoryBookBlob(
    {
      institutionId: "institution-1",
      childId: "child-1",
      storybookId: "story-1",
      mediaKey,
      contentType: "image/webp",
      bytes,
      deadlineAtMs: Date.now() + 5_000,
    },
    store.dependencies
  );
  const asset = await readParentStoryBookBlob(
    {
      institutionId: "institution-1",
      mediaKey,
      deadlineAtMs: Date.now() + 5_000,
    },
    store.dependencies
  );

  assert.equal(asset?.childId, "child-1");
  assert.equal(asset?.storybookId, "story-1");
  assert.equal(asset?.contentType, "image/webp");
  assert.deepEqual(asset?.bytes, bytes);
  assert.deepEqual(store.getCalls[0], {
    pathname: buildParentStoryBookBlobManifestPath({
      institutionId: "institution-1",
      mediaKey,
    }),
    useCache: false,
  });
  assert.equal(
    await readParentStoryBookBlob(
      {
        institutionId: "institution-2",
        mediaKey,
        deadlineAtMs: Date.now() + 5_000,
      },
      store.dependencies
    ),
    null
  );
});

test("immutable media replay keeps the prior manifest valid when a new manifest commit fails", async () => {
  const store = createMemoryBlobStore();
  const bytes = Buffer.from("RIFF-immutable-storybook-WAVE");
  const mediaKey = "d".repeat(40);
  const input = {
    institutionId: "institution-1",
    childId: "child-1",
    storybookId: "story-1",
    mediaKey,
    contentType: "audio/wav",
    bytes,
    deadlineAtMs: Date.now() + 5_000,
  };

  await persistParentStoryBookBlob(input, store.dependencies);
  const manifestPath = buildParentStoryBookBlobManifestPath({
    institutionId: input.institutionId,
    mediaKey,
  });
  const firstManifest = store.blobs.get(manifestPath);
  assert.ok(firstManifest);

  await assert.rejects(
    persistParentStoryBookBlob(
      { ...input, deadlineAtMs: Date.now() + 5_000 },
      {
        ...store.dependencies,
        putObject: async (pathname, body, options) => {
          if (pathname === manifestPath) {
            throw new Error("injected manifest commit failure");
          }
          return store.dependencies.putObject(pathname, body, options);
        },
      }
    ),
    /injected manifest commit failure/u
  );

  assert.equal(store.blobs.get(manifestPath)?.etag, firstManifest.etag);
  const recovered = await readParentStoryBookBlob(
    {
      institutionId: input.institutionId,
      mediaKey,
      deadlineAtMs: Date.now() + 5_000,
    },
    store.dependencies
  );
  assert.deepEqual(recovered?.bytes, bytes);
});

test("unauthorized child scope stops after the manifest without reading media bytes", async () => {
  const store = createMemoryBlobStore();
  const mediaKey = "e".repeat(40);
  await persistParentStoryBookBlob(
    {
      institutionId: "institution-1",
      childId: "child-1",
      storybookId: "story-1",
      mediaKey,
      contentType: "image/webp",
      bytes: Buffer.from("private-child-image"),
      deadlineAtMs: Date.now() + 5_000,
    },
    store.dependencies
  );
  store.getCalls.length = 0;

  await assert.rejects(
    readParentStoryBookBlob(
      {
        institutionId: "institution-1",
        mediaKey,
        authorizedChildIds: new Set(["child-2"]),
        deadlineAtMs: Date.now() + 5_000,
      },
      store.dependencies
    ),
    { name: "ParentStoryBookBlobScopeMismatchError" }
  );
  assert.equal(store.getCalls.length, 1);
  assert.match(store.getCalls[0]?.pathname ?? "", /storybook-manifests/u);
});

test("private Blob stream failures preserve their transient SDK cause", async () => {
  const store = createMemoryBlobStore();
  const mediaKey = "f".repeat(40);
  await persistParentStoryBookBlob(
    {
      institutionId: "institution-1",
      childId: "child-1",
      storybookId: "story-1",
      mediaKey,
      contentType: "audio/wav",
      bytes: Buffer.from("RIFF-stream-failure-WAVE"),
      deadlineAtMs: Date.now() + 5_000,
    },
    store.dependencies
  );
  const manifestPath = buildParentStoryBookBlobManifestPath({
    institutionId: "institution-1",
    mediaKey,
  });
  const manifestEntry = store.blobs.get(manifestPath);
  assert.ok(manifestEntry);
  const manifest = JSON.parse(manifestEntry.bytes.toString("utf8")) as {
    objectPath: string;
  };
  const objectEntry = store.blobs.get(manifest.objectPath);
  assert.ok(objectEntry);
  store.blobs.set(manifest.objectPath, {
    ...objectEntry,
    streamError: new BlobRequestAbortedError(),
  });

  await assert.rejects(
    readParentStoryBookBlob(
      {
        institutionId: "institution-1",
        mediaKey,
        deadlineAtMs: Date.now() + 5_000,
      },
      store.dependencies
    ),
    (error: unknown) =>
      error instanceof Error &&
      error.message === "storybook blob media could not be read" &&
      error.cause instanceof Error &&
      error.cause.cause instanceof BlobRequestAbortedError
  );
});

test("private storybook Blob rejects a manifest that redirects to another object", async () => {
  const store = createMemoryBlobStore();
  const mediaKey = "c".repeat(40);
  await persistParentStoryBookBlob(
    {
      institutionId: "institution-1",
      childId: "child-1",
      storybookId: "story-1",
      mediaKey,
      contentType: "audio/wav",
      bytes: Buffer.from("RIFF-audio-WAVE"),
      deadlineAtMs: Date.now() + 5_000,
    },
    store.dependencies
  );
  const manifestPath = buildParentStoryBookBlobManifestPath({
    institutionId: "institution-1",
    mediaKey,
  });
  const manifestEntry = store.blobs.get(manifestPath);
  assert.ok(manifestEntry);
  const manifest = JSON.parse(manifestEntry.bytes.toString("utf8")) as Record<
    string,
    unknown
  >;
  manifest.objectPath =
    "smartchildcare/private-media/v1/institution-other/private.wav";
  store.blobs.set(manifestPath, {
    ...manifestEntry,
    bytes: Buffer.from(JSON.stringify(manifest), "utf8"),
  });

  await assert.rejects(
    readParentStoryBookBlob(
      {
        institutionId: "institution-1",
        mediaKey,
        deadlineAtMs: Date.now() + 5_000,
      },
      store.dependencies
    ),
    /object path does not match/u
  );
});
