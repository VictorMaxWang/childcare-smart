import assert from "node:assert/strict";
import test from "node:test";
import type { SessionUser } from "@/lib/auth/accounts";
import { buildAiResultKey, withPersistentAiResult, type AiResultEntry, type AiResultStore } from "@/lib/server/ai-result-cache";

function context(user = "parent-a", input = { childId: "child-a", records: ["record-a"] }) {
  return { session: { id: user, name: "测试家长", avatar: "", role: "家长", accountKind: "normal", institutionId: "institution-a" } as SessionUser, capability: "suggestions" as const, scopeId: "child-a", input };
}
function fixture() {
  const entries = new Map<string, AiResultEntry>();
  let clock = Date.parse("2026-10-31T08:00:00Z");
  const store: AiResultStore = {
    async read(key) { return entries.get(key) ?? null; },
    async claim(key, owner, expiresAt) {
      const previous = entries.get(key);
      if (previous && ["failed", "completed"].includes(previous.state) && previous.expiresAt < clock) entries.delete(key);
      if (entries.has(key)) return false;
      entries.set(key, { state: "pending", owner, expiresAt, response: null });
      return true;
    },
    async finish(key, owner, state, response, expiresAt) {
      if (entries.get(key)?.owner === owner) entries.set(key, { state, owner, response, expiresAt });
    },
    async reclaimUnknown(key, owner, expiresAt) {
      const previous = entries.get(key);
      if (!previous || previous.state !== "unknown" && !(previous.state === "pending" && previous.expiresAt <= clock)) return false;
      entries.set(key, { state: "pending", owner, response: null, expiresAt });
      return true;
    },
  };
  return { entries, options: { store, now: () => clock }, tick(ms: number) { clock += ms; } };
}

test("AI result keys separate user, institution, input version and model while canonicalizing object order", () => {
  const now = new Date("2026-10-31T08:00:00Z");
  const identity = { provider: "maas", model: "glm", endpoint: "https://example.test/v1" };
  const key = buildAiResultKey(context(), identity, now);
  assert.notEqual(key, buildAiResultKey(context("parent-b"), identity, now));
  assert.notEqual(key, buildAiResultKey({ ...context(), session: { ...context().session, institutionId: "institution-b" } }, identity, now));
  assert.notEqual(key, buildAiResultKey(context("parent-a", { childId: "child-a", records: ["record-b"] }), identity, now));
  assert.notEqual(key, buildAiResultKey(context(), { ...identity, model: "changed" }, now));
  assert.equal(key, buildAiResultKey({ ...context(), input: { records: ["record-a"], childId: "child-a" } }, identity, now));
});

test("cache-only reads do not create a task or call a provider", async () => {
  const cache = fixture(); let calls = 0;
  const response = await withPersistentAiResult(context(), async () => { calls++; return Response.json({ answer: "new" }); }, { ...cache.options, cacheOnly: true });
  assert.equal(response.status, 200); assert.equal((await response.json()).cacheStatus, "miss"); assert.equal(calls, 0); assert.equal(cache.entries.size, 0);
});

test("completed results persist across callers and simultaneous intent performs only one generation", async () => {
  const cache = fixture(); let calls = 0;
  const generate = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return Response.json({ answer: "record-a based plan" }, { headers: { "x-smartchildcare-transport": "remote-brain-proxy" } }); };
  const results = await Promise.all(Array.from({ length: 4 }, () => withPersistentAiResult(context(), generate, cache.options)));
  assert.equal(calls, 1);
  for (const response of results) assert.equal(response.status, 200);
  const cached = await withPersistentAiResult(context(), generate, cache.options);
  assert.equal(cached.headers.get("x-ai-cache"), "hit");
  assert.equal(cached.headers.get("x-smartchildcare-transport"), "remote-brain-proxy");
  assert.equal(cached.headers.get("cache-control"), "private, no-store");
  assert.equal(calls, 1);
});

test("read-only cache lookup reports an active task without waiting for the provider", async () => {
  const cache = fixture();
  let release!: () => void;
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const generation = withPersistentAiResult(context("lookup-parent"), async () => {
    started(); await blocked; return Response.json({ source: "ai", answer: "done" });
  }, cache.options);
  await ready;
  try {
    const lookup = await withPersistentAiResult(context("lookup-parent"), async () => { throw new Error("must not generate"); }, { ...cache.options, cacheOnly: true });
    assert.equal(lookup.headers.get("x-ai-cache"), "pending");
    assert.equal((await lookup.json()).code, "generation_in_progress");
  } finally { release(); await generation; }
});

test("an expired pending lease remains unknown and cannot replay a potentially billed call", async () => {
  const cache = fixture(); const key = buildAiResultKey(context(), undefined, new Date(cache.options.now()));
  cache.entries.set(key, { state: "pending", owner: "lost-worker", expiresAt: cache.options.now() - 1, response: null });
  let calls = 0;
  const response = await withPersistentAiResult(context(), async () => { calls++; return Response.json({}); }, cache.options);
  assert.equal(response.status, 503); assert.equal((await response.json()).code, "generation_result_unknown"); assert.equal(calls, 0);
});

test("completed output expires and rule fallback never becomes a completed AI result", async () => {
  const cache = fixture(); let calls = 0;
  const generate = async () => { calls++; return Response.json({ source: "fallback", fallback: true, answer: "记录提示" }); };
  await withPersistentAiResult(context(), generate, cache.options);
  assert.equal([...cache.entries.values()][0].state, "failed");
  cache.tick(31_000);
  await withPersistentAiResult(context(), async () => { calls++; return Response.json({ source: "ai", answer: "真实服务结果" }); }, cache.options);
  assert.equal(calls, 2); assert.equal([...cache.entries.values()][0].state, "completed");
  cache.tick(60_000);
  const lookup = await withPersistentAiResult(context(), async () => { throw new Error("must not generate"); }, { ...cache.options, cacheOnly: true });
  assert.equal(lookup.headers.get("x-ai-cache"), "hit");
});

test("failed durable storage prevents an upstream call and unconfirmed calls remain non-replayable", async () => {
  const cache = fixture(); let calls = 0;
  const unavailable = { ...cache.options.store, async read() { throw new Error("storage unavailable"); } };
  const failed = await withPersistentAiResult(context(), async () => { calls++; return Response.json({}); }, { ...cache.options, store: unavailable });
  assert.equal(failed.status, 503); assert.equal(calls, 0);
  const generate = async () => { calls++; throw new Error("result lost"); };
  await withPersistentAiResult(context(), generate, cache.options);
  const next = await withPersistentAiResult(context(), generate, cache.options);
  assert.equal((await next.json()).code, "generation_result_unknown"); assert.equal(calls, 1);
});

test("only an explicit confirmed retry can reclaim an unknown task and active tasks are never preempted", async () => {
  const cache = fixture(); let calls = 0;
  await withPersistentAiResult(context(), async () => { calls++; throw new Error("response lost"); }, cache.options);
  const readOnly = await withPersistentAiResult(context(), async () => { calls++; return Response.json({ source: "ai" }); }, { ...cache.options, cacheOnly: true, confirmRetryUnknown: true });
  assert.equal(readOnly.status, 503); assert.equal(calls, 1);
  const retry = await withPersistentAiResult(context(), async () => { calls++; return Response.json({ source: "ai", answer: "confirmed retry result" }); }, { ...cache.options, confirmRetryUnknown: true });
  assert.equal(retry.status, 200); assert.equal(calls, 2);
  const other = context("active-parent");
  const key = buildAiResultKey(other, undefined, new Date(cache.options.now()));
  cache.entries.set(key, { state: "pending", owner: "active-worker", response: null, expiresAt: cache.options.now() + 60_000 });
  const active = await withPersistentAiResult(other, async () => { calls++; return Response.json({}); }, { ...cache.options, confirmRetryUnknown: true });
  assert.equal(active.status, 503); assert.equal((await active.json()).code, "generation_in_progress"); assert.equal(calls, 2);
});
