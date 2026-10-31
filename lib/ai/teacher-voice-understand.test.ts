import assert from "node:assert/strict";
import test from "node:test";
import { buildTeacherVoiceUnderstandFallback, type TeacherVoiceUnderstandFallbackInput } from "./teacher-voice-understand.ts";

function input(overrides: Partial<TeacherVoiceUnderstandFallbackInput> = {}): TeacherVoiceUnderstandFallbackInput {
  return { transcript: "合成儿童午餐尝试使用勺子，情绪平稳。", childId: "synthetic-child", inputMode: "multipart",
    asrProvider: "maas-asr", asrModel: "qwen-audio-3.0-asr-flash", asrIsRealProvider: true,
    asrMode: "live", asrSource: "provider", asrConfidence: null, asrFallback: false, ...overrides };
}

test("teacher understanding retains actual MaaS and legacy real ASR model without claiming its rule stages are LLM output", () => {
  for (const asrMode of ["live", "real"]) {
    const body = buildTeacherVoiceUnderstandFallback(input({ asrMode }));
    assert.equal(body.model.asr, "qwen-audio-3.0-asr-flash");
    assert.equal(body.providerTrace?.model, body.model.asr); assert.equal(body.providerTrace?.realProvider, true);
    assert.equal(body.providerTrace?.mode, "live"); assert.equal(body.providerTrace?.fallback, false);
    assert.equal(body.meta.asr.model, body.model.asr); assert.equal(body.meta.asr.realProvider, true);
    assert.equal(body.source.router, "rule"); assert.equal(body.source.chaining, "rule");
    assert.equal(body.model.router, "rule-router-v1"); assert.equal(body.model.chaining, "rule-chain-v1");
    assert.ok(body.draft_items.length && body.draft_items.every(item => item.source === "rule-chain"));
  }
});

test("configured, mock, provided transcript and explicit non-real outputs are never upgraded into real ASR", () => {
  for (const overrides of [
    { asrMode: "configured" }, { asrMode: "mock", asrProvider: "mock-asr", asrModel: null },
    { asrFallback: true, asrSource: "provided_transcript", asrModel: "local-text-fallback" },
    { asrSource: "text_fallback" }, { asrSource: "provider_unavailable" }, { asrSource: "mock" }, { asrIsRealProvider: false },
  ]) {
    const body = buildTeacherVoiceUnderstandFallback(input(overrides));
    assert.equal(body.providerTrace?.realProvider, false); assert.equal(body.meta.asr.realProvider, false);
    if (overrides.asrFallback) { assert.equal(body.mode, "fallback"); assert.equal(body.fallback, true); }
  }
  const noModel = buildTeacherVoiceUnderstandFallback(input({ asrModel: undefined }));
  assert.equal(noModel.model.asr, null); assert.equal(noModel.providerTrace?.model, null);
  assert.notEqual(noModel.model.asr, "maas-asr", "供应商标签不能伪装成实际模型。");
});
