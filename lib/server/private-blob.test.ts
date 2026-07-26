import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPrivateAttachmentPath,
  isPrivateBlobConfigured,
  validatePrivateAttachmentFile,
} from "./private-blob.ts";
import { UploadSecurityError } from "./upload-security.ts";

const PNG_SIGNATURE = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

test("private attachment paths contain opaque tenant and child scopes", () => {
  const path = buildPrivateAttachmentPath({
    institutionId: "institution-visible-id",
    childId: "child-visible-id",
    relatedType: "growth",
    mimeType: "image/webp",
    objectId: "fixed-object-id",
  });

  assert.match(
    path,
    /^smartchildcare\/private-media\/v1\/institution-[a-f0-9]{20}\/child-[a-f0-9]{20}\/growth\/fixed-object-id\.webp$/u
  );
  assert.doesNotMatch(path, /institution-visible-id|child-visible-id/u);
});

test("private Blob configuration accepts token or OIDC store credentials only", () => {
  assert.equal(isPrivateBlobConfigured({}), false);
  assert.equal(
    isPrivateBlobConfigured({ BLOB_READ_WRITE_TOKEN: "configured" }),
    true
  );
  assert.equal(
    isPrivateBlobConfigured({
      VERCEL_OIDC_TOKEN: "oidc",
      BLOB_STORE_ID: "store",
    }),
    true
  );
  assert.equal(
    isPrivateBlobConfigured({ VERCEL_OIDC_TOKEN: "oidc" }),
    false
  );
});

test("private Blob validation rejects a MIME and magic-signature mismatch", async () => {
  await assert.rejects(
    () =>
      validatePrivateAttachmentFile(
        new File(["<html>not an image</html>"], "meal.png", {
          type: "image/png",
        })
      ),
    (error: unknown) =>
      error instanceof UploadSecurityError && error.status === 415
  );
});

test("private Blob validation accepts a matching supported signature", async () => {
  await validatePrivateAttachmentFile(
    new File([PNG_SIGNATURE], "meal.png", { type: "image/png" })
  );
});
