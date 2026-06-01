import assert from "node:assert/strict";
import test from "node:test";

import { DEMO_ACCOUNTS } from "@/lib/auth/accounts";
import type { ApiAttachment } from "@/lib/api/types";
import {
  buildAttachmentStorageObject,
  buildDeniedStorageObject,
  buildStorybookMediaStorageObject,
  decorateAttachmentStorage,
  isObjectStorageConfigured,
} from "@/lib/server/storage-contract";

const STORAGE_ENV_KEYS = [
  "OBJECT_STORAGE_PROVIDER",
  "STORAGE_PROVIDER",
  "OBJECT_STORAGE_UPLOAD_ENABLED",
  "OBJECT_STORAGE_ENABLED",
  "OBJECT_STORAGE_BUCKET",
  "OBJECT_STORAGE_ACCESS_KEY_ID",
  "OBJECT_STORAGE_TOKEN",
  "OBJECT_STORAGE_CONNECTION_STRING",
  "BLOB_READ_WRITE_TOKEN",
] as const;

function withNoObjectStorageEnv(run: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const key of STORAGE_ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  try {
    run();
  } finally {
    for (const key of STORAGE_ENV_KEYS) {
      const value = previous.get(key);
      if (typeof value === "string") process.env[key] = value;
      else delete process.env[key];
    }
  }
}

function demoUser(id: string) {
  const user = DEMO_ACCOUNTS.find((account) => account.id === id);
  assert.ok(user);
  return user;
}

function attachment(overrides: Partial<ApiAttachment> = {}): ApiAttachment {
  return {
    attachmentId: "att-storage-contract",
    institutionId: "inst-1",
    childId: "c-1",
    relatedType: "feedback",
    relatedId: "feedback-1",
    kind: "image",
    fileName: "demo.png",
    mimeType: "image/png",
    byteSize: 68,
    storageMode: "object_storage",
    uploadStatus: "uploaded",
    createdBy: "u-parent",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

test("absent object storage env never exposes object_storage or uploaded attachment status", () => {
  withNoObjectStorageEnv(() => {
    assert.equal(isObjectStorageConfigured(), false);

    const decorated = decorateAttachmentStorage(attachment(), demoUser("u-parent"));

    assert.equal(decorated.storageMode, "metadata_only");
    assert.equal(decorated.uploadStatus, "metadata_saved");
    assert.equal(decorated.metadataOnly, true);
    assert.equal(decorated.downloadUrl, undefined);
    assert.equal(decorated.storageObject?.storageMode, "metadata_only");
    assert.equal(decorated.storageObject?.url, null);
  });
});

test("local demo data URLs and static storybook assets are preview-capable but not object storage", () => {
  withNoObjectStorageEnv(() => {
    const dataUrlAttachment = buildAttachmentStorageObject(
      attachment({ storageMode: "metadata_only", uploadStatus: "metadata_saved", localPreviewUrl: "data:image/png;base64,iVBORw0KGgo=" }),
      demoUser("u-parent")
    );
    assert.equal(dataUrlAttachment.storageMode, "local_demo");
    assert.equal(dataUrlAttachment.metadataOnly, false);
    assert.equal(dataUrlAttachment.permissions.canPreview, true);
    assert.equal(dataUrlAttachment.permissions.canDownload, true);
    assert.equal(dataUrlAttachment.url, null);

    const storybookAsset = buildStorybookMediaStorageObject({
      id: "storybook-1:scene:1:image",
      kind: "storybook-image",
      institutionId: "inst-1",
      childId: "c-1",
      storybookId: "storybook-1",
      sourceUrl: "/storybook/card.svg",
      session: demoUser("u-parent"),
    });
    assert.equal(storybookAsset.storageMode, "local_demo");
    assert.equal(storybookAsset.permissions.canPreview, true);
    assert.equal(storybookAsset.url, null);
  });
});

test("metadata-only attachments have no URL and no served binary permission", () => {
  withNoObjectStorageEnv(() => {
    const object = buildAttachmentStorageObject(
      attachment({ storageMode: "metadata_only", uploadStatus: "metadata_saved", localPreviewUrl: undefined }),
      demoUser("u-parent")
    );

    assert.equal(object.storageMode, "metadata_only");
    assert.equal(object.metadataOnly, true);
    assert.equal(object.url, null);
    assert.equal(object.localPreviewUrl, null);
    assert.equal(object.permissions.canPreview, false);
    assert.equal(object.permissions.canDownload, false);
    assert.equal(object.permissions.reason, "metadata_only_waiting_object_storage");
  });
});

test("storybook cached media and fallback media are explicit storage modes", () => {
  withNoObjectStorageEnv(() => {
    const expiresAt = "2026-05-01T00:20:00.000Z";
    const cached = buildStorybookMediaStorageObject({
      id: "storybook-1:scene:1:audio",
      kind: "storybook-audio",
      institutionId: "inst-1",
      childId: "c-1",
      storybookId: "storybook-1",
      sourceUrl: "/api/ai/parent-storybook/media/abcdef",
      expiresAt,
      session: demoUser("u-parent"),
    });
    assert.equal(cached.storageMode, "cached_media");
    assert.equal(cached.expiresAt, expiresAt);
    assert.equal(cached.permissions.canPreview, true);
    assert.equal(cached.permissions.canDownload, true);

    const fallback = buildStorybookMediaStorageObject({
      id: "storybook-1:scene:2:image",
      kind: "storybook-image",
      institutionId: "inst-1",
      childId: "c-1",
      storybookId: "storybook-1",
      sourceUrl: "https://provider.example/generated.png",
      session: demoUser("u-parent"),
    });
    assert.equal(fallback.storageMode, "fallback");
    assert.equal(fallback.url, null);
    assert.equal(fallback.permissions.reason, "provider_or_fallback_media_not_persisted");
  });
});

test("permission denied storage object is readable as denied metadata", () => {
  const denied = buildDeniedStorageObject({
    id: "att-denied",
    kind: "attachment",
    institutionId: "inst-1",
    childId: "c-1",
    relatedType: "feedback",
    relatedId: "feedback-1",
    session: demoUser("u-teacher2"),
  });

  assert.equal(denied.metadataOnly, true);
  assert.equal(denied.permissions.canRead, false);
  assert.equal(denied.permissions.canPreview, false);
  assert.equal(denied.permissions.canDownload, false);
  assert.equal(denied.permissions.reason, "permission_denied");
});
