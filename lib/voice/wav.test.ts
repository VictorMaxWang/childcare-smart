import assert from "node:assert/strict";
import test from "node:test";

import { encodePcm16Wav, resampleMonoPcm } from "./wav.ts";

test("PCM encoder writes a valid 16-bit mono WAV header and clamps samples", () => {
  const bytes = encodePcm16Wav(
    new Float32Array([-2, -0.5, 0, 0.5, 2]),
    16_000
  );
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength
  );

  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "RIFF");
  assert.equal(new TextDecoder().decode(bytes.slice(8, 12)), "WAVE");
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 16_000);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), 10);
  assert.equal(view.getInt16(44, true), -32768);
  assert.equal(view.getInt16(52, true), 32767);
});

test("PCM resampler produces the expected bounded target length", () => {
  const source = new Float32Array(48_000);
  source[24_000] = 1;
  const result = resampleMonoPcm(source, 48_000, 16_000);

  assert.equal(result.length, 16_000);
  assert.ok(result.some((sample) => sample > 0));
});
