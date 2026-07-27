import assert from "node:assert/strict";
import test from "node:test";

import { ApiClientError } from "./errors.ts";
import { uploadAttachmentFile } from "./communication.ts";

function successResponse() {
  const now = "2026-07-27T00:00:00.000Z";
  return new Response(
    JSON.stringify({
      ok: true,
      data: {
        attachmentId: "attachment-network-retry",
        uploadRequestId: "attachment-request-network-retry-01",
        contentSha256: "a".repeat(64),
        institutionId: "institution-test",
        childId: "child-test",
        relatedType: "growth",
        relatedId: "growth-test",
        kind: "image",
        fileName: "growth.png",
        mimeType: "image/png",
        byteSize: 8,
        storageMode: "object_storage",
        uploadStatus: "uploaded",
        createdBy: "teacher-test",
        createdAt: now,
        updatedAt: now,
      },
    }),
    {
      status: 201,
      headers: { "content-type": "application/json" },
    }
  );
}

test("attachment upload retries a network disconnect with the same request id", async () => {
  const originalFetch = globalThis.fetch;
  const requestIds: string[] = [];
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls += 1;
    assert.ok(init?.body instanceof FormData);
    requestIds.push(String(init.body.get("uploadRequestId")));
    if (calls === 1) {
      throw new TypeError("fetch failed");
    }
    return successResponse();
  };

  try {
    const attachment = await uploadAttachmentFile({
      file: new File(["png-data"], "growth.png", { type: "image/png" }),
      childId: "child-test",
      relatedType: "growth",
      relatedId: "growth-test",
      uploadRequestId: "attachment-request-network-retry-01",
    });

    assert.equal(attachment.attachmentId, "attachment-network-retry");
    assert.equal(calls, 2);
    assert.deepEqual(requestIds, [
      "attachment-request-network-retry-01",
      "attachment-request-network-retry-01",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("attachment upload does not retry an explicit API failure", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(
      JSON.stringify({
        ok: false,
        code: "provider_unavailable",
        error: "storage unavailable",
      }),
      {
        status: 503,
        headers: { "content-type": "application/json" },
      }
    );
  };

  try {
    await assert.rejects(
      () =>
        uploadAttachmentFile({
          file: new File(["png-data"], "growth.png", {
            type: "image/png",
          }),
          childId: "child-test",
          relatedType: "growth",
          relatedId: "growth-test",
        }),
      (error: unknown) =>
        error instanceof ApiClientError && error.status === 503
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("manual retries derive the same request id from the same scoped file", async () => {
  const originalFetch = globalThis.fetch;
  const requestIds: string[] = [];
  globalThis.fetch = async (_input, init) => {
    assert.ok(init?.body instanceof FormData);
    requestIds.push(String(init.body.get("uploadRequestId")));
    return new Response(
      JSON.stringify({
        ok: false,
        code: "provider_unavailable",
        error: "storage unavailable",
      }),
      {
        status: 503,
        headers: { "content-type": "application/json" },
      }
    );
  };

  const upload = () =>
    uploadAttachmentFile({
      file: new File(["same-png-data"], "growth.png", {
        type: "image/png",
      }),
      childId: "child-test",
      relatedType: "growth",
      relatedId: "growth-test",
    });

  try {
    await assert.rejects(upload, ApiClientError);
    await assert.rejects(upload, ApiClientError);
    assert.equal(requestIds.length, 2);
    assert.equal(requestIds[0], requestIds[1]);
    assert.match(requestIds[0] ?? "", /^attachment-[a-f0-9]{64}$/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
