import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { ParentStoryBookResponse } from "@/lib/ai/types";
import {
  cacheParentStoryBookAudioDataUrl,
  cacheParentStoryBookMediaDataUrl,
  parentStoryBookCacheInternals,
  prepareParentStoryBookResponseForDelivery,
  readCachedParentStoryBookMedia,
} from "./parent-storybook-cache.ts";

const mediaRouteRoot = fileURLToPath(
  new URL("../../app/api/ai/parent-storybook/media", import.meta.url)
);

test("parent storybook media keeps a single dynamic route directory", () => {
  const dynamicRouteDirectories = fs
    .readdirSync(mediaRouteRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\[.+\]$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(dynamicRouteDirectories, ["[mediaKey]"]);
  assert.equal(
    fs.existsSync(path.join(mediaRouteRoot, "[mediaKey]", "route.ts")),
    true
  );
});

test("parent storybook media cache keeps the opaque media URL contract", () => {
  const { mediaAssetCache } = parentStoryBookCacheInternals;
  mediaAssetCache.clear();

  const audioUrl = cacheParentStoryBookAudioDataUrl(
    "data:audio/wav;base64,UklGRg==",
    "storybook-1:scene-1"
  );

  assert.equal(typeof audioUrl, "string");
  assert.match(
    audioUrl ?? "",
    /^\/api\/ai\/parent-storybook\/media\/[a-f0-9]+$/
  );

  const mediaKey = audioUrl?.split("/").at(-1);
  assert.ok(mediaKey);

  const cachedAudio = readCachedParentStoryBookMedia(mediaKey);
  assert.ok(cachedAudio);
  assert.equal(cachedAudio.contentType, "audio/wav");
  assert.match(cachedAudio.expiresAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(
    Array.from(cachedAudio.bytes),
    Array.from(Buffer.from("UklGRg==", "base64"))
  );

  mediaAssetCache.clear();
});

test("parent storybook media cache also serves svg fallback assets", () => {
  const { mediaAssetCache } = parentStoryBookCacheInternals;
  mediaAssetCache.clear();

  const imageUrl = cacheParentStoryBookMediaDataUrl(
    `data:image/svg+xml;base64,${Buffer.from("<svg><text>Page 5</text></svg>").toString("base64")}`,
    "storybook-1:image:5"
  );

  assert.equal(typeof imageUrl, "string");
  const mediaKey = imageUrl?.split("/").at(-1);
  assert.ok(mediaKey);

  const cachedImage = readCachedParentStoryBookMedia(mediaKey);
  assert.ok(cachedImage);
  assert.equal(cachedImage.contentType, "image/svg+xml");
  assert.match(cachedImage.expiresAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(cachedImage.bytes.toString("utf8"), /Page 5/);

  mediaAssetCache.clear();
});

test("parent storybook delivery annotates local demo and cached media storage objects", () => {
  const { mediaAssetCache } = parentStoryBookCacheInternals;
  mediaAssetCache.clear();

  const story: ParentStoryBookResponse = {
    storyId: "storybook-storage-contract",
    childId: "c-1",
    mode: "storybook",
    title: "Storage contract story",
    summary: "Storage contract story summary",
    moral: "Be honest about storage.",
    parentNote: "Local preview only.",
    source: "fallback",
    fallback: true,
    generatedAt: "2026-05-01T00:00:00.000Z",
    providerMeta: {
      provider: "unit-test",
      mode: "fallback",
      transport: "next-json-fallback",
      imageProvider: "storybook-asset",
      audioProvider: "storybook-mock-preview",
      imageDelivery: "demo-art",
      audioDelivery: "preview-only",
      realProvider: false,
      highlightCount: 1,
      sceneCount: 1,
    },
    scenes: [
      {
        sceneIndex: 1,
        sceneTitle: "Scene one",
        sceneText: "Scene one text",
        imagePrompt: "local demo storybook card",
        imageUrl: "/storybook/card.svg",
        assetRef: "/storybook/card.svg",
        imageSourceKind: "demo-art",
        imageStatus: "ready",
        audioUrl: "data:audio/wav;base64,UklGRg==",
        audioScript: "Scene one text",
        audioStatus: "ready",
        voiceStyle: "gentle-bedtime",
        highlightSource: "unit-test",
      },
    ],
  };

  const prepared = prepareParentStoryBookResponseForDelivery(story, {
    cacheState: "miss",
  });
  const scene = prepared.scenes[0];

  assert.equal(scene.imageStorageObject?.storageMode, "local_demo");
  assert.equal(scene.imageStorageObject?.permissions.canPreview, true);
  assert.equal(scene.audioStorageObject?.storageMode, "cached_media");
  assert.match(scene.audioStorageObject?.expiresAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
  assert.match(scene.audioUrl ?? "", /^\/api\/ai\/parent-storybook\/media\/[a-f0-9]+$/);

  mediaAssetCache.clear();
});
