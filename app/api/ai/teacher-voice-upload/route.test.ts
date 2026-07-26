import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "./route.ts";

const WEBM_SIGNATURE = new Uint8Array([
  0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x86, 0x81, 0x01,
]);

test("teacher voice upload rejects oversized Content-Length before authorization", async () => {
  const response = await POST(
    new Request("http://localhost:3000/api/ai/teacher-voice-upload", {
      method: "POST",
      headers: {
        "content-length": String(5 * 1024 * 1024),
        "content-type": "multipart/form-data; boundary=voice",
      },
      body: "--voice--\r\n",
    })
  );

  assert.equal(response.status, 413);
});

test("teacher voice upload enforces the actual audio byte limit without Content-Length", async () => {
  const formData = new FormData();
  formData.set(
    "audio",
    new File([new Uint8Array(4 * 1024 * 1024 + 1)], "too-large.wav", {
      type: "audio/wav",
    })
  );

  const response = await POST(
    new Request("http://localhost:3000/api/ai/teacher-voice-upload", {
      method: "POST",
      headers: { "x-demo-account-id": "u-teacher" },
      body: formData,
    })
  );
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 413);
  assert.equal(body.code, "invalid_request");
});

test("teacher voice upload rejects audio MIME that does not match its signature", async () => {
  const formData = new FormData();
  formData.set(
    "audio",
    new File(["<html>not audio</html>"], "voice.wav", {
      type: "audio/wav",
    })
  );

  const response = await POST(
    new Request("http://localhost:3000/api/ai/teacher-voice-upload", {
      method: "POST",
      headers: { "x-demo-account-id": "u-teacher" },
      body: formData,
    })
  );
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 415);
  assert.equal(body.code, "invalid_request");
});

test("teacher voice upload keeps valid WebM fallback usable and reports detected MIME", async () => {
  const formData = new FormData();
  formData.set(
    "audio",
    new File([WEBM_SIGNATURE], "voice.webm", {
      type: "audio/webm;codecs=opus",
    })
  );
  formData.set("mimeType", "audio/wav");
  formData.set("fallbackText", "记录林小雨晨检正常");

  const response = await POST(
    new Request("http://localhost:3000/api/ai/teacher-voice-upload", {
      method: "POST",
      headers: { "x-demo-account-id": "u-teacher" },
      body: formData,
    })
  );
  const body = (await response.json()) as Record<string, unknown>;
  const raw = body.raw as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.transcript, "记录林小雨晨检正常");
  assert.equal(raw.mimeType, "audio/webm");
});
