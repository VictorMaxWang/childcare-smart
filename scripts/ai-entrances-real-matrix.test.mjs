import assert from "node:assert/strict";
import test from "node:test";
import { ENTRANCE_STAGES, completedHealthParseRequest, entranceInputFingerprint, entrancesPlan, healthParsePersistence, inspectPcmWav, liveEntranceEvidence, summarizeEntranceRequests, validateEntrancesBudget, verifyIntentResult, verifyTrendNumbers } from "./ai-entrances-real-matrix.mjs";

const now = Date.parse("2026-10-31T12:00:00Z");
const budget = () => ({ budgetId: "offline-entrances", currency: "CNY", maxTotalCny: 3, confirmedAt: new Date(now - 1000).toISOString(), pricingEvidence: "root verified pricing artifact", requests: Object.fromEntries(Object.entries(ENTRANCE_STAGES).filter(([, value]) => value.modelCallsUpper).map(([stage, value]) => [stage, { reserveCny: value.maxReserveCny, includesAllInternalCalls: true, maxModelCalls: value.modelCallsUpper, maxOutputTokensTotal: 6000, maxInputTokensTotal: 6000, maxAudioSeconds: 3 }])) });
function wav(durationMs = 2320) {
  const length = durationMs * 48, bytes = Buffer.alloc(44 + length);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(24000, 24); bytes.writeUInt32LE(48000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(length, 40); return bytes;
}
test("entrance plan is read-only until explicit execute and covers deterministic intent separately", () => {
  const plan = entrancesPlan(); assert.equal(plan.defaultMode, "plan-only"); assert.equal(plan.actualModelCalls, 0); assert.equal(plan.browser, "none"); assert.equal(plan.stages.length, 11); assert.equal(plan.stages.find(item => item.stage === "intent").modelCallsUpper, 0);
  assert.throws(() => entrancesPlan(["unknown"]));
});
test("entry reservations cover all calls, full token allowance and real audio under the three CNY cap", () => {
  assert.equal(validateEntrancesBudget(budget(), Object.keys(ENTRANCE_STAGES), now), 2.3);
  const excessive = budget(); excessive.requests.diet.reserveCny = 0.3; assert.throws(() => validateEntrancesBudget(excessive, ["diet"], now));
  const incomplete = budget(); incomplete.requests.asr.maxAudioSeconds = 2; assert.throws(() => validateEntrancesBudget(incomplete, ["asr"], now));
  const short = budget(); short.requests.health.maxOutputTokensTotal = 1000; assert.throws(() => validateEntrancesBudget(short, ["health"], now));
  assert.throws(() => validateEntrancesBudget({ ...budget(), maxTotalCny: 3.01 }, ["vision"], now));
  assert.throws(() => validateEntrancesBudget({ ...budget(), confirmedAt: new Date(now - 86400000).toISOString() }, ["vision"], now));
});
test("normalized WAV reports real 2.32 second duration and rejects streaming placeholder lengths", () => {
  const bytes = wav(); const audio = inspectPcmWav(bytes); assert.equal(audio.durationMs, 2320); assert.equal(audio.dataBytes, 111360); assert.equal(audio.sampleRate, 24000);
  const broken = Buffer.from(bytes); broken.writeUInt32LE(0xffffffff, 4); assert.throws(() => inspectPcmWav(broken));
  assert.throws(() => inspectPcmWav(wav(3001)));
  const stereo = Buffer.from(bytes); stereo.writeUInt16LE(2, 22); assert.throws(() => inspectPcmWav(stereo));
});
test("configured or fallback traces cannot pass as actual MaaS output", () => {
  const body = { provider: "maas", model: "ZHIPU/GLM-5.3-Flash", source: "ai", live: true, fallback: false };
  assert.equal(liveEntranceEvidence(body).model, body.model);
  for (const patch of [{ live: false }, { fallback: true }, { mock: true }, { provider: "local-rules" }, { model: "mock-v1" }, { source: "provided_transcript" }]) assert.throws(() => liveEntranceEvidence({ ...body, ...patch }));
});
test("intent validation certifies a rule and never demands or invents a live model", () => {
  const result = { detectedRole: "parent", targetWorkflow: "parent.trend.query", ruleId: "intent-router:parent:query_trend:v1", matchedSignals: ["roleHint:parent"], previewCard: { title: "趋势", ctaLabel: "查看" }, deeplink: "/parent/agent?child=synthetic" };
  assert.equal(verifyIntentResult(result, "parent", "parent.trend.query").source, "deterministic-rule");
  assert.throws(() => verifyIntentResult({ ...result, realProvider: true }, "parent", "parent.trend.query"));
});
test("trend statistics are independently checked against persisted meal hydration instead of model prose", () => {
  const labels = Array.from({ length: 7 }, (_, index) => `2026-10-${String(25 + index).padStart(2, "0")}`);
  const meals = [{ date: labels[6], waterMl: 40 }, { date: labels[6], waterMl: 60 }];
  const body = { query: { childId: "synthetic" }, intent: "diet", metric: "diet_quality_score", windowDays: 7, providerTrace: { analyticsSource: "server-deterministic" }, dataQuality: { source: "request_snapshot", observedDays: 1 }, labels, series: [{ id: "hydration_ml", data: labels.map(date => ({ date, rawCount: date === labels[6] ? 2 : 0, missing: date !== labels[6], value: date === labels[6] ? 100 : null })) }, { id: "diet_quality_score", data: labels.map(date => ({ date, value: date === labels[6] ? 80 : null })) }], comparison: {}, trendScore: 0 };
  assert.equal(verifyTrendNumbers(body, meals, "synthetic").observedDays, 1);
  const tampered = structuredClone(body); tampered.series[0].data[6].value = 99; assert.throws(() => verifyTrendNumbers(tampered, meals, "synthetic"));
});
test("health material persistence keeps the server signed raw response and labels analysis provenance", () => {
  const result = { summary: "合成健康材料", fallback: true, provider: "local-health-rule-parser", extractedText: "Temperature 36.5 C", _aiProvenance: "original-server-signature", providerStatus: { files: [{ isRealProvider: true }] } };
  const parsed = healthParsePersistence(result, [{ attachmentId: "synthetic-attachment" }]);
  assert.equal(parsed.rawResponse, result); assert.equal(parsed.provenance.extractedText, result.extractedText); assert.equal(parsed.provenance.fallback, true); assert.equal(parsed.provenance.files[0].attachmentId, "synthetic-attachment");
});
test("completed OCR persistence uses the existing health-page status and preserves the signed body without rewriting provenance", () => {
  const result = { summary: "合成OCR已处理", extractedText: "Temperature 36.5 C", fallback: true, provider: "local-health-rule-parser", _aiProvenance: "original-server-signature", providerStatus: { files: [{ isRealProvider: true, live: true, fallback: false }] } };
  const payload = completedHealthParseRequest(result, [{ attachmentId: "synthetic-attachment" }]);
  assert.equal(payload.parseStatus, "completed"); assert.notEqual(payload.parseStatus, "parsed");
  assert.equal(payload.parseResult.rawResponse, result); assert.equal(payload.parseResult.rawResponse._aiProvenance, "original-server-signature");
  assert.equal(payload.parseResult.provenance.fallback, true); assert.equal(payload.parseResult.rawResponse.providerStatus.files[0].live, true);
});
test("saved stage inputs bind the exact uploaded audio bytes without persisting binary payload", async () => {
  const first = new FormData(); first.set("audio", new File([new Uint8Array([1, 2, 3])], "synthetic.wav", { type: "audio/wav" })); first.set("childId", "synthetic");
  const reordered = new FormData(); reordered.set("childId", "synthetic"); reordered.set("audio", new File([new Uint8Array([1, 2, 3])], "synthetic.wav", { type: "audio/wav" }));
  assert.equal(await entranceInputFingerprint(first), await entranceInputFingerprint(reordered));
  reordered.set("audio", new File([new Uint8Array([1, 2, 4])], "synthetic.wav", { type: "audio/wav" }));
  assert.notEqual(await entranceInputFingerprint(first), await entranceInputFingerprint(reordered));
});
test("request counters remain correct when provider evidence mode is live or a result remains unknown", () => {
  const calls = [
    { stage: "teacher-voice", mode: "live", actualRequestStarted: true, requestMode: "real-business-request", result: "completed" },
    { stage: "asr", mode: "live", actualRequestStarted: true, requestMode: "real-business-request", result: "completed" },
    { stage: "asr", mode: "live", actualRequestStarted: false, requestMode: "saved-result-revalidated-no-new-call" },
    { stage: "vision", actualRequestStarted: true, requestMode: "real-business-request", result: "unknown" },
  ];
  assert.deepEqual(summarizeEntranceRequests(calls), { newBusinessModelRequests: 3, savedResultsRevalidated: 1 });
  assert.equal(calls[0].mode, "live");
  assert.deepEqual(summarizeEntranceRequests([{ mode: "live" }]), { newBusinessModelRequests: 0, savedResultsRevalidated: 0 }, "legacy evidence without explicit start marker cannot be silently reclassified");
});
