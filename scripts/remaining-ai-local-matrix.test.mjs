import assert from "node:assert/strict";
import test from "node:test";
import { anonymousAudit, localOrigin, validateRemainingBudget, verifyQuality, verifyUnderstanding } from "./remaining-ai-local-matrix.mjs";

test("remaining acceptance only targets the isolated local candidate, never production or credential URLs", () => {
  assert.equal(localOrigin("http://localhost:18080"), "http://localhost:18080");
  for (const value of ["https://www.smartchildcare.cn", "http://localhost:3000", "http://127.0.0.1:18080", "http://user:pass@localhost:18080", "http://localhost:18080/path"]) assert.throws(() => localOrigin(value));
});
test("anonymous plan reviews all current AI and related method guards before sending empty requests", async () => {
  const audit = await anonymousAudit(); assert.equal(audit.sourceAiRoutes, 24); assert.equal(audit.routes, 31); assert.equal(audit.operations, 32);
  assert.ok(audit.requests.every(item => item.expected === 401 && item.guardReviewedBeforeModel === true && !item.endpoint.includes("[")));
  assert.equal(audit.requests.filter(item => item.path === "/api/storybooks/lin-xiaoyu/tts").length, 2);
});
test("two paid business requests are bound to approved exact models, internal call allowance and 0.7 CNY cumulative cap", () => {
  const stamp = Date.parse("2026-10-31T12:00:00Z"), budget = { currency: "CNY", budgetId: "synthetic-policy", pricingEvidence: "synthetic-test-only", confirmedAt: "2026-10-31T11:00:00Z", maxTotalCny: 0.7,
    models: { text: "qwen3.8-flash", asr: "qwen-audio-3.0-asr-flash" }, requests: {
      "teacher-understand": { reserveCny: 0.2, callsUpper: 1, includesAllInternalCalls: true, maxAudioSeconds: 3 },
      "consultation-json": { reserveCny: 0.5, callsUpper: 1, includesAllInternalCalls: true, maxInputTokensTotal: 20000, maxOutputTokensTotal: 6000 },
    } };
  assert.doesNotThrow(() => validateRemainingBudget(budget, ["teacher-understand", "consultation-json"], stamp));
  for (const overrides of [{ maxTotalCny: 1 }, { confirmedAt: "2026-10-25T11:00:00Z" }, { models: { ...budget.models, asr: "configured-provider-name" } }]) assert.throws(() => validateRemainingBudget({ ...budget, ...overrides }, ["teacher-understand"], stamp));
  const underReserved = structuredClone(budget); underReserved.requests["consultation-json"].maxOutputTokensTotal = 1000;
  assert.throws(() => validateRemainingBudget(underReserved, ["consultation-json"], stamp));
});
test("teacher understanding requires actual ASR model/live and separates deterministic rule stages", () => {
  const body = { fallback: false, providerTrace: { provider: "maas-asr", realProvider: true, mode: "live", model: "qwen-audio-3.0-asr-flash" },
    model: { asr: "qwen-audio-3.0-asr-flash", router: "rule-router-v1", chaining: "rule-chain-v1" }, source: { asr: "provider", router: "rule", chaining: "rule" },
    transcript: { text: "合成儿童午餐情绪平稳。", fallback: false }, draft_items: [{ source: "rule-chain", summary: "合成午餐" }] };
  assert.equal(verifyUnderstanding(body, "qwen-audio-3.0-asr-flash").router, "rule");
  for (const change of [value => { value.providerTrace.realProvider = false; }, value => { value.model.asr = "maas-asr"; }, value => { value.source.router = "llm"; }, value => { value.transcript.fallback = true; }]) {
    const value = structuredClone(body); change(value); assert.throws(() => verifyUnderstanding(value, "qwen-audio-3.0-asr-flash"));
  }
});
test("quality metrics reject foreign tenant counts and demo snapshots instead of equating HTTP200 with scoped success", () => {
  const keys = ["consultationClosureRate", "followUp48hCompletionRate", "guardianFeedbackRate", "homeTaskExecutionRate", "teacherLowConfidenceRate", "morningCheckResponseLatency", "recurringIssueHeat", "suggestionEffectiveness"];
  const body = { schemaVersion: "v1-admin-quality-metrics", source: "request_snapshot", dataQuality: { totalChildren: 3, demoOnly: false },
    ...Object.fromEntries(keys.map(key => [key, { id: key, value: 0, source: { demoOnly: false }, coverage: { eligibleCount: 0, observedCount: 0 } }])) };
  assert.equal(verifyQuality(body, 3).actualModelCalls, 0); assert.throws(() => verifyQuality(body, 1));
  const demo = structuredClone(body); demo.dataQuality.demoOnly = true; assert.throws(() => verifyQuality(demo, 3));
});
