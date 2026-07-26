import assert from "node:assert/strict";
import test from "node:test";

import { persistAttachmentDrafts } from "./attachment-persistence.ts";
import type { ApiAttachment } from "./types.ts";

function attachment(id: string): ApiAttachment {
  const now = new Date().toISOString();
  return {
    attachmentId: id,
    institutionId: "inst-test",
    childId: "child-test",
    relatedType: "message",
    relatedId: "message-test",
    kind: "image",
    fileName: "note.png",
    mimeType: "image/png",
    storageMode: "object_storage",
    uploadStatus: "uploaded",
    createdBy: "user-test",
    createdAt: now,
    updatedAt: now,
  };
}

test("normal attachment persistence uploads the original file and never stores a data URL", async () => {
  let metadataCalls = 0;
  const uploads: Array<{ file: File; relatedId?: string }> = [];
  const file = new File(["image"], "note.png", { type: "image/png" });

  const result = await persistAttachmentDrafts(
    {
      drafts: [
        {
          kind: "image",
          fileName: file.name,
          mimeType: file.type,
          byteSize: file.size,
          localPreviewUrl: "data:image/png;base64,aW1hZ2U=",
          file,
        },
      ],
      accountKind: "normal",
      childId: "child-test",
      relatedType: "message",
      relatedId: "message-test",
    },
    {
      createMetadata: async () => {
        metadataCalls += 1;
        return attachment("metadata");
      },
      uploadFile: async (input) => {
        uploads.push(input);
        return attachment("uploaded");
      },
    }
  );

  assert.equal(metadataCalls, 0);
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0]?.file, file);
  assert.equal(uploads[0]?.relatedId, "message-test");
  assert.equal(result[0]?.attachmentId, "uploaded");
});

test("demo attachment persistence keeps the explicit local preview contract", async () => {
  let uploadCalls = 0;
  let previewUrl = "";

  await persistAttachmentDrafts(
    {
      drafts: [
        {
          kind: "image",
          fileName: "demo.png",
          mimeType: "image/png",
          byteSize: 5,
          localPreviewUrl: "data:image/png;base64,ZGVtbw==",
        },
      ],
      accountKind: "demo",
      childId: "child-test",
      relatedType: "feedback",
      relatedId: "feedback-test",
    },
    {
      createMetadata: async (input) => {
        previewUrl = input.localPreviewUrl ?? "";
        return attachment("demo");
      },
      uploadFile: async () => {
        uploadCalls += 1;
        return attachment("unexpected");
      },
    }
  );

  assert.equal(uploadCalls, 0);
  assert.match(previewUrl, /^data:image\/png;base64,/);
});

test("attachment retry skips matching files already saved on the related record", async () => {
  let uploadCalls = 0;
  const existing = {
    ...attachment("existing"),
    byteSize: 5,
  };

  await persistAttachmentDrafts(
    {
      drafts: [
        {
          kind: "image",
          fileName: "note.png",
          mimeType: "image/png",
          byteSize: 5,
          localPreviewUrl: "data:image/png;base64,aW1hZ2U=",
          file: new File(["image"], "note.png", { type: "image/png" }),
        },
      ],
      accountKind: "normal",
      childId: "child-test",
      relatedType: "message",
      relatedId: "message-test",
      existingAttachments: [existing],
    },
    {
      createMetadata: async () => attachment("unexpected-metadata"),
      uploadFile: async () => {
        uploadCalls += 1;
        return attachment("unexpected-upload");
      },
    }
  );

  assert.equal(uploadCalls, 0);
});
