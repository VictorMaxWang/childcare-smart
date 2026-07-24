import assert from "node:assert/strict";
import test from "node:test";

import type { ParentStoryBookResponse } from "@/lib/ai/types";
import { reconcileRemoteStoryBookMedia } from "./parent-storybook-remote-media.ts";

const REMOTE_IMAGE_KEY = "a".repeat(40);
const REMOTE_AUDIO_KEY = "b".repeat(40);

function story(): ParentStoryBookResponse {
  return {
    storyId: "story-1",
    childId: "child-1",
    mode: "storybook",
    title: "Story",
    summary: "Summary",
    moral: "Moral",
    parentNote: "Note",
    source: "vivo",
    fallback: false,
    generatedAt: "2026-07-24T00:00:00.000Z",
    providerMeta: {
      provider: "vivo",
      imageProvider: "vivo-story-image",
      audioProvider: "vivo-story-tts",
      realProvider: true,
      highlightCount: 1,
      sceneCount: 1,
      mode: "live",
    },
    scenes: [
      {
        sceneIndex: 1,
        sceneTitle: "Scene",
        sceneText: "Text",
        imagePrompt: "Prompt",
        imageUrl: `/api/ai/parent-storybook/media/${REMOTE_IMAGE_KEY}`,
        assetRef: `/api/ai/parent-storybook/media/${REMOTE_IMAGE_KEY}`,
        imageStatus: "fallback",
        imageSourceKind: "dynamic-fallback",
        audioUrl: `/api/ai/parent-storybook/media/${REMOTE_AUDIO_KEY}`,
        audioRef: REMOTE_AUDIO_KEY,
        audioScript: "Audio",
        audioStatus: "ready",
        voiceStyle: "warm",
        highlightSource: "growth",
      },
    ],
  };
}

test("remote media routes are copied to durable institution storage", async () => {
  const persistedKinds: string[] = [];
  const result = await reconcileRemoteStoryBookMedia(
    {
      story: story(),
      institutionId: "institution-1",
      requestUrl: "http://localhost/api/ai/parent-storybook/media-status",
      serviceScope: { institutionId: "institution-1", childIds: ["child-1"] },
    },
    {
      readLocal: async () => null,
      loadRemote: async ({ expectedKind }) => ({
        contentType: `${expectedKind}/test`,
        bytes: Buffer.from(expectedKind),
      }),
      persistLocal: async (input) => {
        persistedKinds.push(input.contentType);
        return {
          mediaUrl: `/api/ai/parent-storybook/media/local-${input.contentType.split("/")[0]}`,
          mediaKey: "local",
        };
      },
    }
  );

  assert.deepEqual(persistedKinds.sort(), ["audio/test", "image/test"]);
  assert.equal(
    result.scenes[0].imageUrl,
    "/api/ai/parent-storybook/media/local-image"
  );
  assert.equal(
    result.scenes[0].audioUrl,
    "/api/ai/parent-storybook/media/local-audio"
  );
  assert.equal(result.scenes[0].audioStatus, "ready");
});

test("instance-only cached media is persisted before its URL is returned", async () => {
  let remoteReadCount = 0;
  let persistedCount = 0;
  const result = await reconcileRemoteStoryBookMedia(
    {
      story: story(),
      institutionId: "institution-1",
      requestUrl: "http://localhost/api/ai/parent-storybook/media-status",
      serviceScope: { institutionId: "institution-1", childIds: ["child-1"] },
    },
    {
      readLocal: async ({ mediaKey }) => ({
        contentType:
          mediaKey === REMOTE_AUDIO_KEY ? "audio/wav" : "image/png",
        bytes: Buffer.from(mediaKey),
        expiresAt: "2026-07-25T00:00:00.000Z",
        ownerChildId: "child-1",
        ownerStorybookId: "story-1",
        storageMode: "cached_media",
      }),
      loadRemote: async () => {
        remoteReadCount += 1;
        return null;
      },
      persistLocal: async (input) => {
        persistedCount += 1;
        return {
          mediaUrl: `/api/ai/parent-storybook/media/durable-${input.contentType.split("/")[0]}`,
          mediaKey: "durable",
        };
      },
    }
  );

  assert.equal(remoteReadCount, 0);
  assert.equal(persistedCount, 2);
  assert.match(result.scenes[0].imageUrl ?? "", /durable-image$/u);
  assert.match(result.scenes[0].audioUrl ?? "", /durable-audio$/u);
});

test("unreadable ready media is downgraded instead of returning a broken URL", async () => {
  const result = await reconcileRemoteStoryBookMedia(
    {
      story: story(),
      institutionId: "institution-1",
      requestUrl: "http://localhost/api/ai/parent-storybook/media-status",
      serviceScope: { institutionId: "institution-1", childIds: ["child-1"] },
    },
    {
      readLocal: async () => null,
      loadRemote: async () => null,
    }
  );

  assert.equal(result.scenes[0].imageUrl, null);
  assert.equal(result.scenes[0].imageStatus, "fallback");
  assert.equal(result.scenes[0].audioUrl, null);
  assert.equal(result.scenes[0].audioStatus, "fallback");
});
