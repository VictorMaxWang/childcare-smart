import assert from "node:assert/strict";
import test from "node:test";

import {
  UploadSecurityError,
  inspectBase64Media,
  readRequestWithBodyLimit,
  validateMediaBytes,
} from "./upload-security.ts";

const PNG_SIGNATURE = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const OGG_SIGNATURE = new Uint8Array([
  0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00,
]);

test("bounded request reader cancels a streaming body as soon as the server limit is crossed", async () => {
  let pullCount = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pullCount += 1;
      controller.enqueue(new Uint8Array(64 * 1024));
      if (pullCount >= 100) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request(
    "http://localhost:3000/api/upload-security-test",
    {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" }
  );

  await assert.rejects(
    () => readRequestWithBodyLimit(request, 128 * 1024),
    (error: unknown) =>
      error instanceof UploadSecurityError && error.status === 413
  );
  assert.equal(cancelled, true);
  assert.ok(pullCount < 100);
});

test("media inspection uses bytes rather than a claimed Content-Type", () => {
  assert.throws(
    () =>
      validateMediaBytes({
        bytes: Buffer.from("<html>not a png</html>", "utf8"),
        claimedMimeType: "image/png",
        allowedMimeTypes: new Set(["image/png"]),
      }),
    (error: unknown) =>
      error instanceof UploadSecurityError && error.status === 415
  );
});

test("strict base64 media inspection accepts matching PNG bytes", () => {
  const inspected = inspectBase64Media({
    base64: Buffer.from(PNG_SIGNATURE).toString("base64"),
    claimedMimeType: "image/png",
    allowedMimeTypes: new Set(["image/png"]),
    maxBytes: 1024,
  });

  assert.equal(inspected.mimeType, "image/png");
  assert.equal(inspected.bytes.byteLength, PNG_SIGNATURE.byteLength);
});

test("audio inspection canonicalizes codec parameters and recognizes Ogg bytes", () => {
  const inspected = validateMediaBytes({
    bytes: OGG_SIGNATURE,
    claimedMimeType: "audio/ogg;codecs=opus",
    allowedMimeTypes: new Set(["audio/ogg"]),
  });

  assert.equal(inspected.mimeType, "audio/ogg");
});

test("audio inspection recognizes every browser-supported container signature", () => {
  const fixtures = [
    {
      mimeType: "audio/wav",
      bytes: new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
        0x57, 0x41, 0x56, 0x45,
      ]),
    },
    {
      mimeType: "audio/webm",
      bytes: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
    },
    {
      mimeType: "audio/mp4",
      bytes: new Uint8Array([
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
      ]),
    },
    {
      mimeType: "audio/mpeg",
      bytes: new Uint8Array([0x49, 0x44, 0x33, 0x04]),
    },
    {
      mimeType: "audio/ogg",
      bytes: OGG_SIGNATURE,
    },
  ] as const;

  for (const fixture of fixtures) {
    const inspected = validateMediaBytes({
      bytes: fixture.bytes,
      claimedMimeType: fixture.mimeType,
      allowedMimeTypes: new Set([fixture.mimeType]),
    });
    assert.equal(inspected.mimeType, fixture.mimeType);
  }
});
