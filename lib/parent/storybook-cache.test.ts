import assert from "node:assert/strict";
import test from "node:test";

import type { ParentStoryBookResponse } from "@/lib/ai/types";
import {
  shouldBypassParentStoryBookCacheOnFirstLoad,
  shouldPersistParentStoryBook,
} from "./storybook-cache.ts";

function buildStory(
  overrides: Partial<ParentStoryBookResponse> & {
    providerMeta?: Record<string, unknown>;
    scenes?: Array<Record<string, unknown>>;
  } = {}
) {
  return {
    storyId: "story-1",
    childId: "child-1",
    mode: "storybook",
    title: "示例绘本",
    summary: "示例摘要",
    moral: "示例启发",
    parentNote: "示例建议",
    source: "fallback",
    fallback: false,
    generatedAt: "2026-04-08T00:00:00.000Z",
    providerMeta: {
      provider: "parent-storybook-rule",
      mode: "fallback",
      imageProvider: "storybook-asset",
      audioProvider: "storybook-mock-preview",
      realProvider: false,
      highlightCount: 1,
      sceneCount: 1,
      transport: "remote-brain-proxy",
      imageDelivery: "real",
      audioDelivery: "real",
      diagnostics: {
        brain: { reachable: true, fallbackReason: null, upstreamHost: "api.example.com" },
      },
      ...overrides.providerMeta,
    },
    scenes: [
      {
        sceneIndex: 1,
        sceneTitle: "第一页",
        sceneText: "第一页内容",
        imagePrompt: "image prompt",
        imageUrl: "https://cdn.example.com/story.png",
        assetRef: "https://cdn.example.com/story.png",
        imageStatus: "ready",
        imageSourceKind: "real",
        audioUrl: "https://cdn.example.com/story.wav",
        audioRef: "audio-1",
        audioScript: "audio script",
        audioStatus: "ready",
        voiceStyle: "warm-storytelling",
        highlightSource: "todayGrowth",
      },
      ...(overrides.scenes ?? []),
    ],
    ...overrides,
  } as ParentStoryBookResponse;
}

test("storybook cache bypasses stale demo or preview-only results on first load", () => {
  assert.equal(
    shouldBypassParentStoryBookCacheOnFirstLoad(
      buildStory({
        providerMeta: {
          transport: "next-json-fallback",
          imageDelivery: "svg-fallback",
          audioDelivery: "preview-only",
        },
      })
    ),
    true
  );

  assert.equal(
    shouldBypassParentStoryBookCacheOnFirstLoad(
      buildStory({
        providerMeta: {
          transport: "remote-brain-proxy",
          imageDelivery: "dynamic-fallback",
          audioDelivery: "preview-only",
        },
      })
    ),
    true
  );

  assert.equal(
    shouldBypassParentStoryBookCacheOnFirstLoad(
      buildStory({
        providerMeta: {
          transport: "remote-brain-proxy",
          imageDelivery: "real",
          audioDelivery: "real",
          realProvider: true,
          diagnostics: { brain: { reachable: true, fallbackReason: null, upstreamHost: "api.example.com" } },
        },
      })
    ),
    false
  );
});

test("storybook cache persists dynamic-fallback stories so the main fallback stays stable", () => {
  assert.equal(
    shouldPersistParentStoryBook(
      buildStory({
        providerMeta: {
          transport: "remote-brain-proxy",
          imageDelivery: "dynamic-fallback",
          audioDelivery: "preview-only",
          realProvider: false,
        },
        scenes: [
          {
            sceneIndex: 1,
            sceneTitle: "第一页",
            sceneText: "第一页内容",
            imagePrompt: "image prompt",
            imageUrl: "/api/ai/parent-storybook/media/dynamic-fallback-1",
            assetRef: "/api/ai/parent-storybook/media/dynamic-fallback-1",
            imageStatus: "fallback",
            imageSourceKind: "dynamic-fallback",
            audioUrl: null,
            audioRef: "audio-1",
            audioScript: "audio script",
            audioStatus: "fallback",
            voiceStyle: "warm-storytelling",
            highlightSource: "manualTheme",
          },
        ],
      })
    ),
    true
  );
});

test("storybook cache does not persist legacy demo-art stories by default", () => {
  assert.equal(
    shouldPersistParentStoryBook(
      buildStory({
        providerMeta: {
          transport: "remote-brain-proxy",
          imageDelivery: "demo-art",
          audioDelivery: "preview-only",
          realProvider: false,
        },
        scenes: [
          {
            sceneIndex: 1,
            sceneTitle: "第一页",
            sceneText: "第一页内容",
            imagePrompt: "image prompt",
            imageUrl: "/api/ai/parent-storybook/media/demo-art-1",
            assetRef: "/api/ai/parent-storybook/media/demo-art-1",
            imageStatus: "fallback",
            imageSourceKind: "demo-art",
            audioUrl: null,
            audioRef: "audio-1",
            audioScript: "audio script",
            audioStatus: "fallback",
            voiceStyle: "warm-storytelling",
            highlightSource: "manualTheme",
          },
        ],
      })
    ),
    false
  );
});
