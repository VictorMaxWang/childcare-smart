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

function buildUploadRequest(
  mimeType = "image/png",
  bytes: BlobPart = PNG_SIGNATURE,
  declaredContentLength?: number
) {
  const formData = new FormData();
  formData.set(
    "file",
    new File([bytes], "meal-photo.png", { type: mimeType })
  );
  formData.set("childId", "child-private-media");
  formData.set("relatedType", "meal");
  formData.set("relatedId", "meal-private-media");
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
} = {}) {
  const calls = {
    authorize: 0,
    upload: 0,
    save: 0,
    remove: 0,
  };
  const attachment: ApiAttachment = {
    attachmentId: "attachment-private-media",
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
  };

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
        async createUploadedAttachment() {
          calls.save += 1;
          if (options.metadataFailure) {
            throw new Error("metadata write failed");
          }
          return attachment;
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
  return { dependencies, calls };
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
  assert.equal(body.ok, true);
  assert.equal(body.data?.storageMode, "object_storage");
  assert.equal(body.data?.downloadUrl, "/api/attachments/attachment-private-media/content");
  assert.deepEqual(calls, {
    authorize: 1,
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
