import assert from "node:assert/strict";
import test from "node:test";
import { CachedAiRequestController } from "../ai/cached-ai-request.ts";
import type { ChildSuggestionSnapshot } from "../ai/types.ts";
import { fetchSuggestionResponse } from "./suggestion-client.ts";
import { fetchWeeklyReport } from "./weekly-report-client.ts";

const snapshot = { child: { id: "synthetic-child" } } as ChildSuggestionSnapshot;

test("parent suggestion HTTP flow: cache miss, one manual generation, feedback and refresh remain free", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const calls: Array<{ cacheOnly: boolean; confirmedRetry: boolean }> = [];
  globalThis.fetch = async (input, options) => {
    assert.equal(input, "/api/ai/suggestions");
    const headers = new Headers(options?.headers);
    const cacheOnly = headers.get("x-ai-cache-only") === "1";
    calls.push({ cacheOnly, confirmedRetry: headers.get("x-ai-confirm-retry") === "1" });
    assert.deepEqual(JSON.parse(String(options?.body)), { snapshot });
    return cacheOnly ? Response.json({ ok: true, data: null }, { headers: { "x-ai-cache": "miss" } })
      : Response.json({ source: "ai", summary: "explicitly requested synthetic response" });
  };
  const controller = new CachedAiRequestController();
  const request = (options: Parameters<typeof fetchSuggestionResponse>[1]) => fetchSuggestionResponse(snapshot, options);
  assert.deepEqual(await controller.readCached("child1:v1", request), { status: "ready", value: null });
  const result = await controller.generate("child1:v1", request);
  assert.equal(result.status === "ready" && result.value?.source, "ai");
  await controller.readCached("child1:v2-feedback", request);
  await controller.readCached("child1:v2-feedback", request);
  await controller.readCached("child2:v1", request);
  assert.deepEqual(calls.map((call) => call.cacheOnly), [true, false, true, true, true]);
  assert.ok(calls.every((call) => !call.confirmedRetry));
});

test("admin weekly HTTP flow never promotes a missing cache to generation", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const calls: boolean[] = [];
  globalThis.fetch = async (input, options) => {
    assert.equal(input, "/api/ai/weekly-report");
    const cacheOnly = new Headers(options?.headers).get("x-ai-cache-only") === "1";
    calls.push(cacheOnly);
    if (cacheOnly) return Response.json({ ok: true, data: null }, { headers: { "x-ai-cache": "miss" } });
    return Response.json({ schemaVersion: "v2-actionized", role: "admin", summary: "本周记录摘要", highlights: [], risks: [],
      nextWeekActions: [], trendPrediction: "stable", sections: [], disclaimer: "照护参考", source: "ai" });
  };
  const controller = new CachedAiRequestController();
  const payload = { role: "admin", snapshot: {} } as Parameters<typeof fetchWeeklyReport>[0];
  const request = (options: Parameters<typeof fetchSuggestionResponse>[1]) => fetchWeeklyReport(payload, options);
  await assert.rejects(controller.readCached("admin:inst1:v1", request), /尚未生成/);
  assert.deepEqual(calls, [true]);
  assert.equal((await controller.generate("admin:inst1:v1", request)).status, "ready");
  await assert.rejects(controller.readCached("admin:inst1:v2-feedback", request), /尚未生成/);
  await assert.rejects(controller.readCached("admin:inst2:v1", request), /尚未生成/);
  assert.deepEqual(calls, [true, false, true, true]);
});

test("unknown generation result remains visible to the caller without automatic confirmation or retry", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let count = 0;
  globalThis.fetch = async (_input, options) => {
    count++;
    assert.equal(new Headers(options?.headers).get("x-ai-confirm-retry"), null);
    return Response.json({ code: "generation_result_unknown", error: "结果尚未确认，请勿重复生成" }, { status: 409 });
  };
  const controller = new CachedAiRequestController();
  await assert.rejects(controller.generate("child1:v1", (options) => fetchSuggestionResponse(snapshot, options)),
    (error: unknown) => (error as { code?: string }).code === "generation_result_unknown");
  assert.equal(count, 1);
});
