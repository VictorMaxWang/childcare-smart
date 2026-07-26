import assert from "node:assert/strict";
import test from "node:test";

import type { GetBlobResult } from "@vercel/blob";
import type { ApiAttachment } from "@/lib/api/types";
import { ApiRouteError } from "@/lib/server/api-errors";
import { buildAttachmentContentResponse } from "./api-handlers.ts";

function attachment(
  patch: Partial<ApiAttachment> = {}
): ApiAttachment {
  return {
    attachmentId: "attachment-content-test",
    institutionId: "institution-content-test",
    childId: "child-content-test",
    relatedType: "meal",
    relatedId: "meal-content-test",
    kind: "image",
    fileName: "餐盘照片.png",
    mimeType: "image/png",
    byteSize: 13,
    storageMode: "object_storage",
    uploadStatus: "uploaded",
    storageProvider: "vercel_blob",
    storageKey: "smartchildcare/private-media/v1/test.png",
    storageEtag: "etag-private-media",
    createdBy: "teacher-content-test",
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
    ...patch,
  };
}

function privateBlobResult(statusCode: 200 | 304): GetBlobResult {
  const base = {
    url: "https://private.blob.vercel-storage.com/test.png",
    downloadUrl:
      "https://private.blob.vercel-storage.com/test.png?download=1",
    pathname: "smartchildcare/private-media/v1/test.png",
    contentDisposition: "inline",
    cacheControl: "max-age=300",
    uploadedAt: new Date("2026-07-25T00:00:00.000Z"),
    etag: "etag-private-media",
  };
  if (statusCode === 304) {
    return {
      statusCode: 304,
      stream: null,
      headers: new Headers(),
      blob: { ...base, contentType: null, size: null },
    };
  }
  return {
    statusCode: 200,
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("private-bytes"));
        controller.close();
      },
    }),
    headers: new Headers(),
    blob: { ...base, contentType: "image/png", size: 13 },
  };
}

test("private attachment content streams only through the scoped app response", async () => {
  let requestedKey = "";
  let requestedEtag: string | undefined;
  const response = await buildAttachmentContentResponse(
    new Request(
      "http://localhost:3000/api/attachments/attachment-content-test/content",
      { headers: { "if-none-match": "browser-etag" } }
    ),
    attachment(),
    async (storageKey, options) => {
      requestedKey = storageKey;
      requestedEtag = options?.ifNoneMatch;
      return privateBlobResult(200);
    }
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "private-bytes");
  assert.equal(
    requestedKey,
    "smartchildcare/private-media/v1/test.png"
  );
  assert.equal(requestedEtag, "browser-etag");
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(
    response.headers.get("cache-control") ?? "",
    /^private,/u
  );
  assert.match(response.headers.get("cache-control") ?? "", /no-store/u);
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.doesNotMatch(
    response.headers.get("content-disposition") ?? "",
    /private\.blob\.vercel-storage/u
  );
});

test("private attachment content supports conditional 304 responses", async () => {
  const response = await buildAttachmentContentResponse(
    new Request(
      "http://localhost:3000/api/attachments/attachment-content-test/content"
    ),
    attachment(),
    async () => privateBlobResult(304)
  );

  assert.equal(response.status, 304);
  assert.equal(response.headers.get("etag"), "etag-private-media");
});

test("metadata-only attachments still cannot claim readable content", async () => {
  await assert.rejects(
    () =>
      buildAttachmentContentResponse(
        new Request(
          "http://localhost:3000/api/attachments/attachment-content-test/content"
        ),
        attachment({
          storageMode: "metadata_only",
          uploadStatus: "metadata_saved",
          storageProvider: undefined,
          storageKey: undefined,
        })
      ),
    (error: unknown) =>
      error instanceof ApiRouteError && error.code === "not_found"
  );
});

test("legacy local demo data URLs remain readable without Blob access", async () => {
  const response = await buildAttachmentContentResponse(
    new Request(
      "http://localhost:3000/api/attachments/attachment-content-test/content"
    ),
    attachment({
      storageMode: "local_demo",
      uploadStatus: "metadata_saved",
      storageProvider: undefined,
      storageKey: undefined,
      localPreviewUrl:
        "data:text/plain;base64,bGVnYWN5LWRlbW8tY29udGVudA==",
      mimeType: "text/plain",
    })
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "legacy-demo-content");
  assert.equal(response.headers.get("cache-control"), "no-store");
});
