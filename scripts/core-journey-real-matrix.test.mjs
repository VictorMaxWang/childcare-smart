import assert from "node:assert/strict";
import test from "node:test";
import { assertLiveAi, cookieExpiry, coreJourneyPlan, parseSseBlock, responseContentHash, validateAiBudgetPlan } from "./core-journey-real-matrix.mjs";

const now = Date.parse("2026-10-31T12:00:00Z");
const budget = () => ({ budgetId: "offline-verified-budget", currency: "CNY", maxTotalCny: 10, pricingEvidence: "local pricing verification artifact", confirmedAt: new Date(now - 1000).toISOString(), requests: Object.fromEntries(["suggestions-initial", "suggestions-update", "teacher-communication", "weekly-report", "consultation-sse"].map(step => [step, { reserveCny: 2, includesAllInternalCalls: true }])) });
test("default journey plan contains no AI execution or independent browser", () => {
  const plan = coreJourneyPlan();
  assert.equal(plan.defaultActualAiCalls, 0); assert.equal(plan.browser, "none"); assert.ok(!plan.stages.includes("ai"));
  assert.ok(plan.actors.includes("teacherA2") && plan.actors.includes("parentB1"));
  assert.throws(() => coreJourneyPlan(["unknown"])); assert.throws(() => coreJourneyPlan(["ai"], ["unbudgeted-model-call"]));
});
test("AI budget reserves all internal requests and caps the complete batch at ten CNY", () => {
  assert.equal(validateAiBudgetPlan(budget(), Object.keys(budget().requests), now), 10);
  const exceeded = budget(); exceeded.requests["suggestions-initial"].reserveCny = 3;
  assert.throws(() => validateAiBudgetPlan(exceeded, Object.keys(exceeded.requests), now));
  const incomplete = budget(); incomplete.requests["teacher-communication"].includesAllInternalCalls = false;
  assert.throws(() => validateAiBudgetPlan(incomplete, ["teacher-communication"], now));
  assert.throws(() => validateAiBudgetPlan(budget(), ["parent-reflexion"], now));
});
test("stale, future and unconfirmed pricing cannot authorize paid tests", () => {
  for (const confirmedAt of [new Date(now - 24 * 3600 * 1000).toISOString(), new Date(now + 1).toISOString(), "invalid"]) assert.throws(() => validateAiBudgetPlan({ ...budget(), confirmedAt }, ["suggestions-initial"], now));
  assert.throws(() => validateAiBudgetPlan({ ...budget(), pricingEvidence: "" }, ["suggestions-initial"], now));
});
test("SSE parser retains event names and multiline JSON without inventing done", () => {
  assert.deepEqual(parseSseBlock('event: status\r\ndata: {"stage":"accepted"}\r\n'), { event: "status", data: { stage: "accepted" } });
  assert.deepEqual(parseSseBlock('event: done\ndata: {\ndata: "realProvider": true\ndata: }'), { event: "done", data: { realProvider: true } });
  assert.equal(parseSseBlock(": heartbeat"), null);
  assert.throws(() => parseSseBlock("event: done\ndata: invalid"));
});
test("an expired-cookie fixture is inspected without reading a server signing secret", () => {
  const payload = Buffer.from(JSON.stringify({ userId: "synthetic-parent", exp: 123 })).toString("base64url");
  assert.deepEqual(cookieExpiry(`ccs_session=${payload}.fixture-signature`), { userId: "synthetic-parent", expiresAt: 123000 });
  assert.throws(() => cookieExpiry("other_cookie=value")); assert.throws(() => cookieExpiry("ccs_session=bad.signature"));
});
test("AI evidence rejects fallback, mock, empty output and missing model identity", () => {
  const live = { source: "ai", provider: "maas", model: "ZHIPU/GLM-5.3-Flash", fallback: false, summary: "依据实际保存记录给出具体照护动作。", actions: ["观察实际回应"], realProvider: true };
  assert.equal(assertLiveAi(live).model, live.model);
  for (const altered of [{ fallback: true }, { source: "mock" }, { model: "rule-fallback" }, { summary: "" }, { source: "unknown", realProvider: false }]) assert.throws(() => assertLiveAi({ ...live, ...altered }));
});
test("semantic response hash ignores nested object key order but detects changed values and array order", () => {
  const first = { source: "ai", data: { summary: "具体建议", actions: [{ when: "今晚", action: "温和回应" }, { action: "记录观察", when: "明早" }] } };
  const reordered = { data: { actions: [{ action: "温和回应", when: "今晚" }, { when: "明早", action: "记录观察" }], summary: "具体建议" }, source: "ai" };
  assert.equal(responseContentHash(first), responseContentHash(reordered));
  assert.notEqual(responseContentHash(first), responseContentHash({ ...first, source: "fallback" }));
  assert.notEqual(responseContentHash(first), responseContentHash({ ...first, data: { ...first.data, actions: [...first.data.actions].reverse() } }));
});
test("binary hashes use identical original bytes across Buffer, typed arrays and ArrayBuffer", () => {
  const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00]);
  assert.equal(responseContentHash(bytes), responseContentHash(Buffer.from(bytes)));
  assert.equal(responseContentHash(bytes), responseContentHash(bytes.buffer));
  assert.notEqual(responseContentHash(bytes), responseContentHash(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x01])));
});
test("updated suggestion cache verification is explicit and does not reserve a new model request", () => {
  const plan = coreJourneyPlan(["ai"], ["suggestions-cache-update"]);
  assert.deepEqual(plan.aiSteps, ["suggestions-cache-update"]);
  assert.equal(validateAiBudgetPlan(budget(), ["suggestions-cache-update"], now), 0);
});
