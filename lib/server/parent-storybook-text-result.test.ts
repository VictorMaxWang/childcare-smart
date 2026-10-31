import assert from "node:assert/strict";
import test from "node:test";
import type { SessionUser } from "@/lib/auth/accounts";
import type { ParentStoryBookRequest } from "@/lib/ai/types";
import type { AiResultEntry, AiResultStore } from "@/lib/server/ai-result-cache";
import { withParentStoryBookTextResult } from "./parent-storybook-text-result";

function fixture() {
  const entries = new Map<string, AiResultEntry>();
  const persistedStore = (): AiResultStore => ({
    async read(key) { return entries.get(key) ?? null; },
    async claim(key, owner, expiresAt) {
      if (entries.has(key)) return false;
      entries.set(key, { state: "pending", owner, expiresAt, response: null });
      return true;
    },
    async finish(key, owner, state, response, expiresAt) {
      if (entries.get(key)?.owner === owner) entries.set(key, { state, owner, response, expiresAt });
    },
  });
  const input = { session: { id: "storybook-parent", institutionId: "institution-a", role: "家长", name: "合成家长", avatar: "", accountKind: "normal" } as SessionUser,
    childId: "child-a", payload: { childId: "child-a", snapshot: { child: { id: "child-a" } }, highlightCandidates: [] } as unknown as ParentStoryBookRequest, dataVersion: "synthetic-records-v1" };
  return { entries, persistedStore, input, now: () => Date.parse("2026-10-31T08:00:00Z") };
}

test("concurrent identical storybook intent invokes Brain once and durable output survives a new worker store", async () => {
  const state = fixture(); let brainCalls = 0;
  const body = { source: "ai", fallback: false, storyId: "synthetic-story", providerMeta: { textProvider: "maas", textDelivery: "real", diagnostics: { text: { model: "qwen3.8-flash", requestId: "synthetic-upstream-id" } } } };
  const generate = async () => { brainCalls++; await new Promise(resolve => setTimeout(resolve, 15)); return Response.json(body); };
  const options = { store: state.persistedStore(), now: state.now };
  const responses = await Promise.all(Array.from({ length: 4 }, () => withParentStoryBookTextResult(state.input, generate, options)));
  assert.equal(brainCalls, 1);
  for (const response of responses) { assert.equal(response.status, 200); assert.deepEqual(await response.json(), body); }
  // 新实例没有任何请求内 Promise，只能从共享持久记录读取上次已收费结果。
  const restarted = await withParentStoryBookTextResult(state.input, generate, { ...options, store: state.persistedStore() });
  assert.equal(restarted.headers.get("x-ai-cache"), "hit");
  assert.deepEqual(await restarted.json(), body);
  assert.equal(brainCalls, 1);
});

test("lost storybook text outcome remains unknown after a worker restart instead of submitting again", async () => {
  const state = fixture(); let brainCalls = 0;
  const generate = async () => { brainCalls++; throw new Error("upstream accepted request but connection ended"); };
  await withParentStoryBookTextResult(state.input, generate, { store: state.persistedStore(), now: state.now });
  assert.equal([...state.entries.values()][0].state, "unknown");
  const resumed = await withParentStoryBookTextResult(state.input, generate, { store: state.persistedStore(), now: state.now });
  assert.equal(resumed.status, 503);
  assert.equal((await resumed.json()).code, "generation_result_unknown");
  assert.equal(brainCalls, 1);
});

test("storybook cache-only gate never claims or generates, and changed authorized records form a new intent", async () => {
  const state = fixture(); let brainCalls = 0;
  const generate = async () => { brainCalls++; return Response.json({ source: "ai", storyId: "synthetic-story" }); };
  const options = { store: state.persistedStore(), now: state.now };
  const missing = await withParentStoryBookTextResult(state.input, generate, { ...options, cacheOnly: true });
  assert.equal((await missing.json()).cacheStatus, "miss");
  assert.equal(state.entries.size, 0); assert.equal(brainCalls, 0);
  await withParentStoryBookTextResult(state.input, generate, options);
  await withParentStoryBookTextResult({ ...state.input, dataVersion: "synthetic-records-v2" }, generate, options);
  assert.equal(brainCalls, 2); assert.equal(state.entries.size, 2);
});

test("persisted pending owner from a lost worker blocks another submission even after the lease expired", async () => {
  const state = fixture(); let brainCalls = 0;
  const store = state.persistedStore();
  const brokenFinish = { ...store, async finish() { throw new Error("database writeback unavailable"); } };
  await withParentStoryBookTextResult(state.input, async () => { brainCalls++; return Response.json({ source: "ai" }); }, { store: brokenFinish, now: state.now });
  const pending = [...state.entries.values()][0];
  pending.expiresAt = state.now() - 1;
  const response = await withParentStoryBookTextResult(state.input, async () => { brainCalls++; return Response.json({ source: "ai" }); }, { store: state.persistedStore(), now: state.now });
  assert.equal((await response.json()).code, "generation_result_unknown");
  assert.equal(brainCalls, 1);
});
