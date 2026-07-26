import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPrivateAttachmentPath,
  isPrivateBlobConfigured,
} from "./private-blob.ts";

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
