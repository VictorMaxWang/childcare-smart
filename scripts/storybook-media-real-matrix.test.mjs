import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { assertNoMediaFailure, assertStoryText, buildStoryRequest, canonicalStoryMediaType, executePaidStoryRequest, inspectMediaBytes, mediaReadiness, receivedStoryForReconciliation, validatePricing } from "./storybook-media-real-matrix.mjs";

function pricing() {
  return { currency: "CNY", provider: "maas", models: { text: "ZHIPU/GLM-5.3-Flash", image: "z-image-turbo", audio: "qwen3-tts-flash" }, verifiedAt: "2026-10-31T00:00:00Z", evidence: "synthetic-test-fixture-not-real-pricing", verifiedForFourPagesAndServerTokenLimits: true, maxCny: { text: 0.2, imagePerPage: 0.3, audioPerPage: 0.1 } };
}
test("a complete book reservation must stay inside the explicit five yuan cap and verified pricing identity", () => {
  const now = Date.parse("2026-10-31T01:00:00Z");
  assert.equal(validatePricing(pricing(), 5, now), 1.8);
  assert.throws(() => validatePricing(pricing(), 1, now));
  assert.throws(() => validatePricing(pricing(), 6, now));
  assert.throws(() => validatePricing({ ...pricing(), verifiedAt: "2026-01-01T00:00:00Z" }, 5, now));
  assert.throws(() => validatePricing({ ...pricing(), models: { ...pricing().models, image: "unverified-model" } }, 5, now));
});
test("verified Qwen text pricing is accepted while arbitrary text and changed media models remain rejected", () => {
  const now = Date.parse("2026-10-31T01:00:00Z"), qwen = { ...pricing(), models: { ...pricing().models, text: "qwen3.8-flash" } };
  assert.equal(validatePricing(qwen, 5, now), 1.8);
  for (const text of ["qwen3.8-flash-forged", "Qwen3.8Flash", "arbitrary-cheap-model", ""]) {
    assert.throws(() => validatePricing({ ...qwen, models: { ...qwen.models, text } }, 5, now));
  }
  assert.throws(() => validatePricing({ ...qwen, models: { ...qwen.models, audio: "browser-speech" } }, 5, now));
});

function story(textModel) {
  return { childId: "child-a", fallback: false, source: "ai", storyId: "synthetic-story", title: "合成故事",
    providerMeta: { provider: "maas", textProvider: "maas", textDelivery: "real", realProvider: true, diagnostics: { text: { model: textModel } } },
    scenes: [1, 2, 3, 4].map(sceneIndex => ({ sceneIndex, sceneText: "这是有实际内容的合成故事文字。", audioScript: "这是用于核验朗读的合成故事文字。" })) };
}
test("actual story text model must match the verified pricing identity across initial, media and reopened responses", () => {
  for (const model of ["ZHIPU/GLM-5.3-Flash", "qwen3.8-flash"]) assert.doesNotThrow(() => assertStoryText(story(model), "child-a", model));
  assert.throws(() => assertStoryText(story("ZHIPU/GLM-5.3-Flash"), "child-a", "qwen3.8-flash"));
  assert.throws(() => assertStoryText(story("qwen3.8-flash"), "child-a", "ZHIPU/GLM-5.3-Flash"));
  assert.throws(() => assertStoryText(story("invented-model"), "child-a", "invented-model"));
  const missingModel = story("qwen3.8-flash"); delete missingModel.providerMeta.diagnostics.text.model;
  assert.throws(() => assertStoryText(missingModel, "child-a", "qwen3.8-flash"));
  for (const key of ["model", "textModel"]) for (const position of ["story", "providerMeta"]) {
    const value = story("qwen3.8-flash"); (position === "story" ? value : value.providerMeta)[key] = "ZHIPU/GLM-5.3-Flash";
    assert.throws(() => assertStoryText(value, "child-a", "qwen3.8-flash"));
  }
  const fake = story("qwen3.8-flash"); fake.providerMeta.textDelivery = "preview-only";
  assert.throws(() => assertStoryText(fake, "child-a", "qwen3.8-flash"));
});

test("a received 2xx story body is persisted before strict validation and never retransmitted after model mismatch", async () => {
  const state = { calls: [], story: null }, snapshots = [], body = story("ZHIPU/GLM-5.3-Flash");
  let requests = 0, started = 0;
  const input = { state, stage: "text", amount: 0.1, action: async () => { requests++; return body; },
    validate: value => assertStoryText(value, "child-a", "qwen3.8-flash"), persist: async () => { snapshots.push(structuredClone(state)); }, onRequestStarted: () => { started++; } };
  await assert.rejects(executePaidStoryRequest(input), /模型/u);
  assert.equal(requests, 1); assert.equal(started, 1); assert.equal(state.story, null);
  assert.equal(state.calls[0].status, "received-needs-validation"); assert.equal(state.calls[0].validationStatus, "failed");
  assert.deepEqual(state.calls[0].responseBody, body); assert.equal(state.stage, "stopped:received-needs-validation");
  const firstBodySnapshot = snapshots.find(value => value.calls[0]?.responseBody);
  assert.equal(firstBodySnapshot.calls[0].status, "received-needs-validation"); assert.equal(firstBodySnapshot.calls[0].validationStatus, undefined);
  assert.ok(!snapshots.some(value => value.calls[0]?.status === "completed"));
  // 输入不变时只能再次严格验证已保存正文；错误模型持续失败，绝不顺手再生成一次。
  await assert.rejects(executePaidStoryRequest(input), /模型/u);
  assert.equal(requests, 1); assert.equal(started, 1); assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].status, "received-needs-validation"); assert.deepEqual(state.calls[0].responseBody, body);
});

test("a valid saved response can be revalidated after interruption without issuing a second paid request", async () => {
  const body = story("qwen3.8-flash"), state = { story: null, calls: [{ stage: "text", status: "received-needs-validation", responseBody: body }] };
  let requests = 0, started = 0;
  const value = await executePaidStoryRequest({ state, stage: "text", amount: 0.1, action: async () => { requests++; throw new Error("must not call"); },
    validate: response => assertStoryText(response, "child-a", "qwen3.8-flash"), persist: async () => {}, onRequestStarted: () => { started++; } });
  assert.equal(requests, 0); assert.equal(started, 0); assert.deepEqual(value, body); assert.deepEqual(state.story, body);
  assert.equal(state.calls[0].status, "completed"); assert.equal(state.calls[0].validationStatus, "passed");
});

test("a received malformed or nonobject body is retained privately and fails strict validation", async () => {
  const body = "synthetic non-JSON 2xx response", state = { calls: [], story: null };
  await assert.rejects(executePaidStoryRequest({ state, stage: "text", amount: 0.1, action: async () => body,
    validate: value => assertStoryText(value, "child-a", "qwen3.8-flash"), persist: async () => {} }));
  assert.equal(state.calls[0].status, "received-needs-validation"); assert.equal(state.calls[0].responseBody, body); assert.equal(state.story, null);
});

test("transport uncertainty remains unknown and prevents replay rather than masquerading as a received body", async () => {
  const state = { calls: [], story: null }; let requests = 0;
  const input = { state, stage: "text", amount: 0.1, action: async () => { requests++; throw new Error("synthetic transport failure"); },
    validate: value => assertStoryText(value, "child-a", "qwen3.8-flash"), persist: async () => {} };
  await assert.rejects(executePaidStoryRequest(input), /transport/u); assert.equal(state.calls[0].status, "unknown");
  assert.equal(Object.hasOwn(state.calls[0], "responseBody"), false);
  await assert.rejects(executePaidStoryRequest(input), /结果未知/u); assert.equal(requests, 1);
});

test("failed media validation preserves both the raw received body and the prior validated story", async () => {
  const previous = story("qwen3.8-flash"), body = structuredClone(previous);
  body.providerMeta.diagnostics.image = { jobStatus: "error", lastErrorReason: "media-result-unknown" };
  const state = { calls: [], story: previous }; let requests = 0;
  const input = { state, stage: "media", amount: 0.4, action: async () => { requests++; return body; },
    validate: value => { assertStoryText(value, "child-a", "qwen3.8-flash"); assertNoMediaFailure(value); }, persist: async () => {} };
  await assert.rejects(executePaidStoryRequest(input), /失败或结果未知/u);
  assert.deepEqual(state.story, previous); assert.deepEqual(state.calls[0].responseBody, body);
  assert.equal(state.calls[0].status, "received-needs-validation");
  await assert.rejects(executePaidStoryRequest(input), /失败或结果未知/u); assert.equal(requests, 1);
});

test("operator reconciliation requires saved real text and a received media body, preserving original failed evidence", () => {
  const text = story("qwen3.8-flash"), media = structuredClone(text); media.providerMeta.diagnostics.image = { jobStatus: "error", lastErrorReason: "original-failure" };
  const state = { childId: "child-a", saved: true, story: text, calls: [{ stage: "text", status: "completed" }, { requestId: "synthetic-media-receipt", stage: "media", status: "received-needs-validation", validationStatus: "failed", responseBody: media }] };
  const original = JSON.stringify(state), recovered = receivedStoryForReconciliation(state, "qwen3.8-flash");
  assert.equal(recovered.requestId, "synthetic-media-receipt"); recovered.story.providerMeta.diagnostics.image.jobStatus = "ready";
  assert.equal(JSON.stringify(state), original, "恢复输入必须复制原正文，不能把旧失败改成通过。");
  const unknown = structuredClone(state); unknown.calls[1].status = "unknown"; delete unknown.calls[1].responseBody;
  assert.throws(() => receivedStoryForReconciliation(unknown, "qwen3.8-flash"));
  const unsaved = structuredClone(state); unsaved.saved = false; assert.throws(() => receivedStoryForReconciliation(unsaved, "qwen3.8-flash"));
  const unverifiedText = structuredClone(state); unverifiedText.story.providerMeta.textDelivery = "preview-only"; assert.throws(() => receivedStoryForReconciliation(unverifiedText, "qwen3.8-flash"));
});

test("legacy x-wav is a WAV MIME alias while unrelated audio and image types remain distinct", () => {
  assert.equal(canonicalStoryMediaType("audio/x-wav; charset=binary"), "audio/wav"); assert.equal(canonicalStoryMediaType("audio/wav"), "audio/wav");
  assert.equal(canonicalStoryMediaType("audio/mpeg"), "audio/mpeg"); assert.equal(canonicalStoryMediaType("image/png"), "image/png");
});
test("unknown and failed media stop continuation; real readiness requires the exact provider and protected route", () => {
  assert.throws(() => assertNoMediaFailure({ providerMeta: { diagnostics: { image: { jobStatus: "error", lastErrorReason: "media-result-unknown" } } } }));
  const url = `/api/ai/parent-storybook/media/${"a".repeat(40)}`;
  const scene = { imageStatus: "ready", imageSourceKind: "real", imageProvider: "maas-z-image", imageUrl: url, audioStatus: "ready", audioProvider: "maas-tts", audioUrl: url };
  assert.deepEqual(mediaReadiness({ scenes: [scene] }), { image: 1, audio: 1 });
  assert.deepEqual(mediaReadiness({ scenes: [{ ...scene, imageUrl: "https://public.invalid/image.webp", audioProvider: "browser-speech" }] }), { image: 0, audio: 0 });
});
test("storybook context comes from the selected synthetic child and refuses an empty factual context", () => {
  const snapshot = { children: [{ id: "child-a", name: "合成儿童" }], growth: [{ id: "record-a", childId: "child-a", createdAt: "2026-10-31", description: "尝试使用勺子" }, { id: "record-b", childId: "child-b", description: "不允许混入" }] };
  const input = buildStoryRequest(snapshot, "child-a", "teacherA1");
  assert.deepEqual(input.sourceRecordIds, ["record-a"]); assert.equal(input.payload.pageCount, 4); assert.equal(input.payload.generationMode, "child-personalized");
  assert.doesNotMatch(JSON.stringify(input), /不允许混入/);
  assert.throws(() => buildStoryRequest({ children: snapshot.children }, "child-a", "parentA1"));
});
test("media validation decodes complete WebP and real nonempty WAV samples, rejecting fake headers", async () => {
  const webp = await sharp({ create: { width: 2, height: 3, channels: 3, background: "#557799" } }).webp().toBuffer();
  assert.equal((await inspectMediaBytes("image", webp)).height, 3);
  const samples = Buffer.alloc(400, 1), wav = Buffer.alloc(44 + samples.length);
  wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(samples.length, 40); samples.copy(wav, 44);
  assert.ok((await inspectMediaBytes("audio", wav)).durationSeconds > 0);
  await assert.rejects(inspectMediaBytes("image", Buffer.from("RIFF0000WEBP00000000000000000000")));
  await assert.rejects(inspectMediaBytes("audio", Buffer.from("RIFF0000WAVE00000000000000000000")));
});
