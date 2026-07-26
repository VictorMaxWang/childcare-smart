import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  CHUNK_RECOVERY_BOOTSTRAP,
  CHUNK_RECOVERY_SERVICE_WORKER_PATH,
} from "./chunk-recovery.ts";

test("chunk recovery bootstrap is standalone and bounded", () => {
  assert.doesNotThrow(() => new Function(CHUNK_RECOVERY_BOOTSTRAP));
  assert.match(CHUNK_RECOVERY_BOOTSTRAP, /\/_next\/static\/chunks\//);
  assert.match(CHUNK_RECOVERY_BOOTSTRAP, /attempts >= 2/);
  assert.match(CHUNK_RECOVERY_BOOTSTRAP, /serviceWorker\.ready/);
  assert.equal(CHUNK_RECOVERY_SERVICE_WORKER_PATH, "/chunk-recovery-sw.js");
});

test("chunk recovery service worker only handles immutable Next.js chunks", () => {
  const workerPath = path.join(process.cwd(), "public", "chunk-recovery-sw.js");
  const source = fs.readFileSync(workerPath, "utf8");

  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /\/_next\/static\/chunks\//);
  assert.match(source, /response\.arrayBuffer\(\)/);
  assert.doesNotMatch(source, /\/api\//);
});
