import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMaasStoryWav } from "./parent-storybook-maas-media";
import { inspectMediaBytes } from "../../scripts/storybook-media-real-matrix.mjs";

/** 合成 16kHz 单声道 PCM；不读取真实音频或调用模型。 */
function pcmWav(totalBytes = 111_404) {
  const bytes = Buffer.alloc(totalBytes);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(totalBytes - 8, 4);
  bytes.write("WAVE", 8); bytes.write("fmt ", 12); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(16_000, 24);
  bytes.writeUInt32LE(32_000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36); bytes.writeUInt32LE(totalBytes - 44, 40);
  for (let offset = 44; offset + 1 < totalBytes; offset += 2) bytes.writeInt16LE(Math.round(10_000 * Math.sin(offset / 20)), offset);
  return bytes;
}

test("valid finite PCM WAV is returned unchanged and passes the strict delivery inspector", async () => {
  const original = pcmWav();
  const before = Buffer.from(original);
  const result = normalizeMaasStoryWav(original);
  assert.strictEqual(result, original, "有效有限 WAV 不需要复制或重写。");
  assert.deepEqual(result, before);
  const metadata = await inspectMediaBytes("audio", result);
  assert.ok("sampleRate" in metadata && "channels" in metadata && "durationSeconds" in metadata);
  assert.equal(metadata.bytes, 111_404); assert.equal(metadata.sampleRate, 16_000); assert.equal(metadata.channels, 1);
  assert.ok(metadata.durationSeconds > 3);
});

test("streaming RIFF/data sentinels are repaired to actual lengths without changing PCM samples", async () => {
  for (const [riffSentinel, dataSentinel] of [[0x7fffffbf, 0x7fffff9b], [0xffffffff, 0xffffffff]]) {
    const streaming = pcmWav();
    streaming.writeUInt32LE(riffSentinel, 4); streaming.writeUInt32LE(dataSentinel, 40);
    const before = Buffer.from(streaming);
    await assert.rejects(inspectMediaBytes("audio", streaming), /越界|截断/u, "原流式头必须先规范化，不能降低验收器严格性。");
    const normalized = normalizeMaasStoryWav(streaming);
    assert.notStrictEqual(normalized, streaming);
    assert.equal(normalized.readUInt32LE(4), normalized.length - 8);
    assert.equal(normalized.readUInt32LE(40), normalized.length - 44);
    assert.deepEqual(normalized.subarray(44), before.subarray(44));
    assert.deepEqual(streaming, before, "修复不修改调用方保存的原始输入。");
    const metadata = await inspectMediaBytes("audio", normalized);
    assert.ok("durationSeconds" in metadata);
    assert.equal(metadata.format, "wav"); assert.equal(metadata.bytes, 111_404); assert.ok(metadata.durationSeconds > 3);
  }
});

test("finite chunk or RIFF truncation is rejected rather than repaired as a streaming header", () => {
  const truncatedData = pcmWav().subarray(0, 111_402);
  assert.throws(() => normalizeMaasStoryWav(truncatedData), /Truncated/u);
  const badFiniteDataLength = pcmWav(); badFiniteDataLength.writeUInt32LE(badFiniteDataLength.length, 40);
  assert.throws(() => normalizeMaasStoryWav(badFiniteDataLength), /Truncated/u);
  const badFiniteRiffLength = pcmWav(); badFiniteRiffLength.writeUInt32LE(badFiniteRiffLength.length + 100, 4);
  assert.throws(() => normalizeMaasStoryWav(badFiniteRiffLength), /length mismatch/u);
  const riffSentinelOnly = pcmWav(); riffSentinelOnly.writeUInt32LE(0x7fffffbf, 4);
  assert.throws(() => normalizeMaasStoryWav(riffSentinelOnly), /length mismatch/u, "只有 data 明确为流式占位时才允许修复 RIFF。");
});

test("WAV without fmt or real sample data cannot be normalized into a successful audio result", () => {
  const noFormat = pcmWav(); noFormat.write("JUNK", 12);
  assert.throws(() => normalizeMaasStoryWav(noFormat), /valid samples/u);
  const empty = pcmWav(44);
  assert.throws(() => normalizeMaasStoryWav(empty), /valid samples/u);
  const tooShort = pcmWav(244);
  assert.throws(() => normalizeMaasStoryWav(tooShort), /valid samples/u, "不足 100 个 blockAlign 单位不能用 WAV 头冒充真实朗读。");
  const noData = pcmWav(); noData.write("JUNK", 36);
  assert.throws(() => normalizeMaasStoryWav(noData), /valid samples/u);
});
