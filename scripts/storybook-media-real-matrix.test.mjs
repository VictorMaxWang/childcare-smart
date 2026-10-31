import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { assertNoMediaFailure, buildStoryRequest, inspectMediaBytes, mediaReadiness, validatePricing } from "./storybook-media-real-matrix.mjs";

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
