import assert from "node:assert/strict";
import test from "node:test";

import { buildStorybookMediaResponse } from "../../app/api/ai/parent-storybook/media/[mediaKey]/route.ts";

const media = {
  contentType: "audio/wav",
  bytes: Buffer.from([0, 1, 2, 3, 4, 5]),
  expiresAt: null,
  ownerChildId: "child-1",
  ownerStorybookId: "story-1",
  storageMode: "database_media" as const,
};

test("storybook media route serves durable media with byte ranges", async () => {
  const response = buildStorybookMediaResponse(
    new Request("http://localhost/api/ai/parent-storybook/media/key", {
      headers: { range: "bytes=1-3" },
    }),
    media
  );

  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-type"), "audio/wav");
  assert.equal(response.headers.get("content-length"), "3");
  assert.equal(response.headers.get("content-range"), "bytes 1-3/6");
  assert.equal(
    response.headers.get("x-smartchildcare-storage-mode"),
    "database_media"
  );
  assert.deepEqual(
    Array.from(new Uint8Array(await response.arrayBuffer())),
    [1, 2, 3]
  );
});

test("storybook media route rejects an unsatisfiable byte range", async () => {
  const response = buildStorybookMediaResponse(
    new Request("http://localhost/api/ai/parent-storybook/media/key", {
      headers: { range: "bytes=20-30" },
    }),
    media
  );

  assert.equal(response.status, 416);
  assert.equal(response.headers.get("content-range"), "bytes */6");
});

