import assert from "node:assert/strict";
import test from "node:test";
import { CachedAiRequestController, type CachedAiRequestOptions } from "./cached-ai-request.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("mount, feedback versions, refresh and returning to an earlier child only read cache", async () => {
  const controller = new CachedAiRequestController();
  const requests: CachedAiRequestOptions[] = [];
  for (const key of ["parent1:child1:v1", "parent1:child1:v2", "parent1:child1:v2", "parent1:child2:v1", "parent1:child1:v2"]) {
    const result = await controller.readCached(key, async (options) => { requests.push(options); return null; });
    assert.equal(result.status, "ready");
  }
  assert.equal(requests.length, 5);
  assert.ok(requests.every((options) => options.cacheOnly && !options.confirmRetryUnknown));
});

test("one explicit generate intent dispatches once and never authorizes later refreshes", async () => {
  const controller = new CachedAiRequestController();
  const pending = deferred<string>();
  const requests: CachedAiRequestOptions[] = [];
  const generate = controller.generate("admin1:institution1:v1", (options) => { requests.push(options); return pending.promise; });
  assert.deepEqual(await controller.generate("admin1:institution1:v1", async () => { throw new Error("duplicate paid call"); }), { status: "busy" });
  assert.deepEqual(await controller.readCached("admin1:institution1:v1", async () => { throw new Error("cache should not overwrite generation"); }), { status: "busy" });
  pending.resolve("generated");
  assert.deepEqual(await generate, { status: "ready", value: "generated" });
  await controller.readCached("admin1:institution1:v1", async (options) => { requests.push(options); return "cached"; });
  await controller.readCached("admin1:institution1:v2", async (options) => { requests.push(options); return null; });
  assert.deepEqual(requests.map((options) => options.cacheOnly), [false, true, true]);
});

test("an older free response cannot erase an explicitly generated result", async () => {
  const controller = new CachedAiRequestController();
  const pending = deferred<string | null>();
  const read = controller.readCached("child1:v1", () => pending.promise);
  assert.deepEqual(await controller.generate("child1:v1", async () => "new result"), { status: "ready", value: "new result" });
  pending.resolve(null);
  assert.deepEqual(await read, { status: "superseded" });
});

test("switching child or institution suppresses late results without repeating a paid request", async () => {
  const controller = new CachedAiRequestController();
  const old = deferred<string>();
  const generating = controller.generate("user1:institution1:child1", () => old.promise);
  await controller.readCached("user1:institution1:child2", async () => "child2 cache");
  old.resolve("private child1 result");
  assert.deepEqual(await generating, { status: "superseded" });
  controller.activate("user2:institution2:child3");
  assert.equal(controller.isGenerating("user1:institution1:child1"), false);
});

test("unknown provider result does not retry and confirmation is never added to automatic reads", async () => {
  const controller = new CachedAiRequestController();
  let paid = 0;
  await assert.rejects(controller.generate("child1:v1", async () => { paid++; throw Object.assign(new Error("unknown"), { code: "generation_result_unknown" }); }), /unknown/);
  assert.equal(paid, 1);
  await controller.readCached("child1:v1", async (options) => { assert.equal(options.confirmRetryUnknown, undefined); return null; });
  await controller.generate("child1:v1", async (options) => { paid++; assert.equal(options.confirmRetryUnknown, true); return "confirmed manual retry"; }, true);
  assert.equal(paid, 2);
});
