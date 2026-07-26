import assert from "node:assert/strict";
import test from "node:test";
import { isChunkLoadError } from "./chunk-load.ts";

test("isChunkLoadError recognizes common Next.js chunk failures", () => {
  const named = new Error("Failed to load chunk /_next/static/chunks/example.js");
  named.name = "ChunkLoadError";

  assert.equal(isChunkLoadError(named), true);
  assert.equal(isChunkLoadError(new Error("Loading chunk 42 failed")), true);
  assert.equal(isChunkLoadError("CSS_CHUNK_LOAD_FAILED"), true);
});

test("isChunkLoadError does not classify ordinary application errors", () => {
  assert.equal(isChunkLoadError(new Error("request returned 500")), false);
  assert.equal(isChunkLoadError(null), false);
});
