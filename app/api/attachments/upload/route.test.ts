import assert from "node:assert/strict";
import test from "node:test";

import type { PutBlobResult } from "@vercel/blob";
import type { SessionUser } from "@/lib/auth/accounts";
import type { ApiAttachment } from "@/lib/api/types";
import { ATTACHMENT_MAX_UPLOAD_BYTES } from "@/lib/attachments/constraints";
import {
  handleAttachmentUploadRequest,
  type AttachmentUploadRouteDependencies,
} from "./route.ts";

const NORMAL_TEACHER: SessionUser = {
  id: "normal-upload-teacher",
  username: "13900000021",
  name: "媒体测试教师",
  role: "教师",
  avatar: "",
  institutionId: "inst-private-media",
  classId: "class-private-media",
  className: "媒体测试班",
  accountKind: "normal",
};

const BLOB_RESULT: PutBlobResult = {
  url: "https://private.blob.vercel-storage.com/object",
  downloadUrl:
    "https://private.blob.vercel-storage.com/object?download=1",
  pathname:
    "smartchildcare/private-media/v1/institution-test/child-test/meal/object.png",
  contentType: "image/png",
  contentDisposition: 'inline; filename="object.png"',
  etag: "blob-etag-test",
};

const PNG_SIGNATURE = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const CONTENT_SHA256 = "a".repeat(64);

function buildAttachmentFixture(
  overrides: Partial<ApiAttachment> = {}
): ApiAttachment {
  return {
    attachmentId: "attachment-private-media",
    contentSha256: CONTENT_SHA256,
    institutionId: NORMAL_TEACHER.institutionId,
    childId: "child-private-media",
    relatedType: "meal",
    relatedId: "meal-private-media",
    kind: "image",
    fileName: "meal-photo.png",
    mimeType: "image/png",
    byteSize: 18,
    storageMode: "object_storage",
    uploadStatus: "uploaded",
    storageProvider: "vercel_blob",
    storageKey: BLOB_RESULT.pathname,
    storageEtag: BLOB_RESULT.etag,
    downloadUrl: "/api/attachments/attachment-private-media/content",
    metadataOnly: false,
    createdBy: NORMAL_TEACHER.id,
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
    ...overrides,
  };
}

function buildUploadRequest(
  mimeType = "image/png",
  bytes: BlobPart = PNG_SIGNATURE,
  declaredContentLength?: number,
  uploadRequestId?: string
) {
  const formData = new FormData();
  formData.set(
    "file",
    new File([bytes], "meal-photo.png", { type: mimeType })
  );
  formData.set("childId", "child-private-media");
  formData.set("relatedType", "meal");
  formData.set("relatedId", "meal-private-media");
  if (uploadRequestId) {
    formData.set("uploadRequestId", uploadRequestId);
  }
  const request = new Request("http://localhost:3000/api/attachments/upload", {
    method: "POST",
    body: formData,
  });
  if (declaredContentLength !== undefined) {
    request.headers.set("content-length", String(declaredContentLength));
  }
  return request;
}

function buildUnboundUploadRequest() {
  const formData = new FormData();
  formData.set(
    "file",
    new File([PNG_SIGNATURE], "meal-photo.png", { type: "image/png" })
  );
  formData.set("childId", "child-private-media");
  formData.set("relatedType", "meal");
  return new Request("http://localhost:3000/api/attachments/upload", {
    method: "POST",
    body: formData,
  });
}

function buildDependencies(options: {
  user?: SessionUser;
  configured?: boolean;
  metadataFailure?: boolean;
  replayAttachment?: ApiAttachment;
  readbackAttachment?: ApiAttachment;
  readbackFailure?: boolean;
  savedAttachment?: ApiAttachment;
} = {}) {
  const calls = {
    authorize: 0,
    findReplay: 0,
    upload: 0,
    save: 0,
    remove: 0,
  };
  const observed = {
    uploadRequestIds: [] as string[],
    contentSha256: [] as string[],
  };
  const attachment = buildAttachmentFixture();

  const dependencies: AttachmentUploadRouteDependencies = {
    async resolveSession() {
      return {
        user: options.user ?? NORMAL_TEACHER,
        source: "cookie",
      };
    },
    createService() {
      return {
        async authorizeAttachmentUpload() {
          calls.authorize += 1;
          return {
            childId: "child-private-media",
            relatedType: "meal",
            relatedId: "meal-private-media",
          };
        },
        async findUploadedAttachmentByRequestId(input) {
          calls.findReplay += 1;
          observed.uploadRequestIds.push(input.uploadRequestId);
          observed.contentSha256.push(input.contentSha256);
          if (calls.save > 0 && options.readbackFailure) {
            throw new Error("database readback unavailable");
          }
          if (calls.save > 0 && options.readbackAttachment) {
            return options.readbackAttachment;
          }
          return options.replayAttachment;
        },
        async createUploadedAttachment() {
          calls.save += 1;
          if (options.metadataFailure) {
            throw new Error("metadata write failed");
          }
          return options.savedAttachment ?? attachment;
        },
      };
    },
    storageConfigured() {
      return options.configured ?? true;
    },
    async upload() {
      calls.upload += 1;
      return BLOB_RESULT;
    },
    async remove() {
      calls.remove += 1;
    },
  };
  return { dependencies, calls, observed };
}

test("normal teacher upload stores scoped private media metadata", async () => {
  const { dependencies, calls } = buildDependencies();
  const response = await handleAttachmentUploadRequest(
    buildUploadRequest(),
    dependencies
  );
  const body = (await response.json()) as {
    ok: boolean;
    data?: ApiAttachment;
  };

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.equal(body.ok, true);
  assert.equal(body.data?.storageMode, "object_storage");
  assert.equal(body.data?.downloadUrl, "/api/attachments/attachment-private-media/content");
  assert.deepEqual(calls, {
    authorize: 1,
    findReplay: 1,
    upload: 1,
    save: 1,
    remove: 0,
  });
});

test("demo accounts cannot claim a private original-file upload", async () => {
  const { dependencies, calls } = buildDependencies({
    user: { ...NORMAL_TEACHER, id: "demo-upload-teacher", accountKind: "demo" },
  });
  const response = await handleAttachmentUploadRequest(
    buildUploadRequest(),
    dependencies
  );
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.code, "provider_unavailable");
  assert.equal(calls.upload, 0);
});

test("unconfigured private storage fails before reading or uploading file bytes", async () => {
  const { dependencies, calls } = buildDependencies({ configured: false });
  const response = await handleAttachmentUploadRequest(
    buildUploadRequest(),
    dependencies
  );

  assert.equal(response.status, 503);
  assert.equal(calls.authorize, 0);
  assert.equal(calls.upload, 0);
});

test("unsupported file types are rejected before storage upload", async () => {
  const { dependencies, calls } = buildDependencies();
  const response = await handleAttachmentUploadRequest(
    buildUploadRequest("text/html"),
    dependencies
  );

  assert.equal(response.status, 400);
  assert.equal(calls.upload, 0);
});

test("oversized Content-Length is rejected before multipart parsing or authorization", async () => {
  const { dependencies, calls } = buildDependencies();
  const response = await handleAttachmentUploadRequest(
    buildUploadRequest(
      "image/png",
      PNG_SIGNATURE,
      ATTACHMENT_MAX_UPLOAD_BYTES + 1024 * 1024
    ),
    dependencies
  );

  assert.equal(response.status, 413);
  assert.equal(calls.authorize, 0);
  assert.equal(calls.upload, 0);
});

test("actual multipart file bytes are capped even without a trustworthy Content-Length", async () => {
  const { dependencies, calls } = buildDependencies();
  const response = await handleAttachmentUploadRequest(
    buildUploadRequest(
      "image/png",
      new Uint8Array(ATTACHMENT_MAX_UPLOAD_BYTES + 512 * 1024)
    ),
    dependencies
  );

  assert.equal(response.status, 413);
  assert.equal(calls.authorize, 0);
  assert.equal(calls.upload, 0);
});

test("declared image MIME must match the uploaded file signature", async () => {
  const { dependencies, calls } = buildDependencies();
  const response = await handleAttachmentUploadRequest(
    buildUploadRequest("image/png", "<html>not an image</html>"),
    dependencies
  );

  assert.equal(response.status, 415);
  assert.equal(calls.authorize, 0);
  assert.equal(calls.upload, 0);
});

test("private uploads must be anchored to an existing business record", async () => {
  const { dependencies, calls } = buildDependencies();
  const response = await handleAttachmentUploadRequest(
    buildUnboundUploadRequest(),
    dependencies
  );

  assert.equal(response.status, 400);
  assert.equal(calls.authorize, 0);
  assert.equal(calls.upload, 0);
});

test("blob is removed when attachment metadata persistence fails", async () => {
  const { dependencies, calls } = buildDependencies({
    metadataFailure: true,
  });
  const response = await handleAttachmentUploadRequest(
    buildUploadRequest(),
    dependencies
  );

  assert.equal(response.status, 500);
  assert.equal(calls.upload, 1);
  assert.equal(calls.save, 1);
  assert.equal(calls.remove, 1);
});

test("ambiguous metadata failure returns a committed attachment without deleting its blob", async () => {
  const committedAttachment = buildAttachmentFixture({
    uploadRequestId: "attachment-request-ambiguous-01",
    byteSize: PNG_SIGNATURE.byteLength,
  });
  const { dependencies, calls } = buildDependencies({
    metadataFailure: true,
    readbackAttachment: committedAttachment,
  });
  const response = await handleAttachmentUploadRequest(
    buildUploadRequest(
      "image/png",
      PNG_SIGNATURE,
      undefined,
      committedAttachment.uploadRequestId
    ),
    dependencies
  );
  const body = (await response.json()) as {
    ok: boolean;
    data?: ApiAttachment;
  };

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("x-idempotent-replay"), "true");
  assert.equal(body.data?.attachmentId, committedAttachment.attachmentId);
  assert.equal(calls.save, 1);
  assert.equal(calls.remove, 0);
});

test("unavailable metadata readback preserves the blob instead of risking committed data", async () => {
  const { dependencies, calls } = buildDependencies({
    metadataFailure: true,
    readbackFailure: true,
  });
  const response = await handleAttachmentUploadRequest(
    buildUploadRequest(
      "image/png",
      PNG_SIGNATURE,
      undefined,
      "attachment-request-unknown-commit-01"
    ),
    dependencies
  );

  assert.equal(response.status, 500);
  assert.equal(calls.save, 1);
  assert.equal(calls.remove, 0);
});

test("completed upload request is replayed without writing another blob", async () => {
  const replayAttachment = buildAttachmentFixture({
    uploadRequestId: "attachment-request-replay-01",
    byteSize: PNG_SIGNATURE.byteLength,
  });
  const { dependencies, calls } = buildDependencies({ replayAttachment });
  const response = await handleAttachmentUploadRequest(
    buildUploadRequest(
      "image/png",
      PNG_SIGNATURE,
      undefined,
      replayAttachment.uploadRequestId
    ),
    dependencies
  );
  const body = (await response.json()) as {
    ok: boolean;
    data?: ApiAttachment;
  };

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("x-idempotent-replay"), "true");
  assert.equal(body.data?.attachmentId, replayAttachment.attachmentId);
  assert.equal(calls.findReplay, 1);
  assert.equal(calls.upload, 0);
  assert.equal(calls.save, 0);
});

test("legacy uploads without a client request id derive a stable server fingerprint", async () => {
  const { dependencies, observed } = buildDependencies();
  await handleAttachmentUploadRequest(buildUploadRequest(), dependencies);
  await handleAttachmentUploadRequest(buildUploadRequest(), dependencies);

  assert.equal(observed.uploadRequestIds.length, 2);
  assert.equal(
    observed.uploadRequestIds[0],
    observed.uploadRequestIds[1]
  );
  assert.match(
    observed.uploadRequestIds[0] ?? "",
    /^attachment-[a-f0-9]{64}$/u
  );
  assert.equal(observed.contentSha256[0], observed.contentSha256[1]);
  assert.match(observed.contentSha256[0] ?? "", /^[a-f0-9]{64}$/u);
});

test("concurrent replay removes the losing blob and returns the committed attachment", async () => {
  const committedAttachment = buildAttachmentFixture({
    attachmentId: "attachment-committed",
    uploadRequestId: "attachment-request-concurrent-01",
    byteSize: PNG_SIGNATURE.byteLength,
    storageKey: "smartchildcare/private-media/v1/committed.png",
    storageEtag: "committed-etag",
    downloadUrl: "/api/attachments/attachment-committed/content",
  });
  const { dependencies, calls } = buildDependencies({
    savedAttachment: committedAttachment,
  });
  const response = await handleAttachmentUploadRequest(
    buildUploadRequest(
      "image/png",
      PNG_SIGNATURE,
      undefined,
      committedAttachment.uploadRequestId
    ),
    dependencies
  );
  const body = (await response.json()) as {
    ok: boolean;
    data?: ApiAttachment;
  };

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("x-idempotent-replay"), "true");
  assert.equal(body.data?.attachmentId, committedAttachment.attachmentId);
  assert.equal(calls.findReplay, 1);
  assert.equal(calls.upload, 1);
  assert.equal(calls.save, 1);
  assert.equal(calls.remove, 1);
});
