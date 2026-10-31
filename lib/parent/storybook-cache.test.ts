import assert from "node:assert/strict";
import test from "node:test";

import type { ParentStoryBookRequest, ParentStoryBookResponse } from "@/lib/ai/types";
import {
  buildParentStoryBookCacheKey,
  hasParentStoryBookMediaFailure,
  resolveParentStoryBookMediaPollDelayMs,
  shouldBypassParentStoryBookCacheOnFirstLoad,
  shouldPersistParentStoryBook,
  shouldPollParentStoryBookMedia,
} from "./storybook-cache.ts";

function buildStory(
  overrides: Omit<Partial<ParentStoryBookResponse>, "providerMeta" | "scenes"> & {
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
        image: {
          requestedProvider: "storybook-asset",
          resolvedProvider: "storybook-asset",
          liveEnabled: false,
          missingConfig: [],
        },
        audio: {
          requestedProvider: "storybook-mock-preview",
          resolvedProvider: "storybook-mock-preview",
          liveEnabled: false,
          missingConfig: [],
        },
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
  } as unknown as ParentStoryBookResponse;
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

test("media polling resumes pending pages but never retries a failed or unknown job just because live is enabled", () => {
  const warming = buildStory({ providerMeta: { textProvider: "maas", imageProvider: "maas-z-image", audioProvider: "maas-tts",
    diagnostics: { image: { liveEnabled: true, jobStatus: "warming", pendingSceneCount: 3 }, audio: { liveEnabled: true, jobStatus: "ready", pendingSceneCount: 0 } } } });
  assert.equal(shouldPollParentStoryBookMedia(warming), true);
  const failed = buildStory({ providerMeta: { imageDelivery: "mixed", audioDelivery: "preview-only",
    diagnostics: { image: { liveEnabled: true, jobStatus: "error", pendingSceneCount: 3, errorSceneCount: 1, lastErrorReason: "media-result-unknown" }, audio: { liveEnabled: true, jobStatus: "disabled" } } } });
  assert.equal(shouldPollParentStoryBookMedia(failed), false);
  assert.equal(hasParentStoryBookMediaFailure(failed), true);
  const inactive = buildStory({ providerMeta: { imageDelivery: "mixed", audioDelivery: "preview-only",
    diagnostics: { image: { liveEnabled: true, jobStatus: "idle", pendingSceneCount: 0 }, audio: { liveEnabled: true, jobStatus: "ready" } } } });
  assert.equal(shouldPollParentStoryBookMedia(inactive), false);
});

test("media polling respects image and audio retry delays with bounded backoff", () => {
  const pending = buildStory({ providerMeta: { diagnostics: { image: { jobStatus: "warming", retryAfterMs: 4_000 }, audio: { jobStatus: "warming", nextRetryAtMs: 12_000 } } } });
  assert.equal(resolveParentStoryBookMediaPollDelayMs(pending, 0, 10_000), 4_000);
  assert.equal(resolveParentStoryBookMediaPollDelayMs(pending, 8, 10_000), 8_000);
  const limited = buildStory({ providerMeta: { diagnostics: { audio: { retryAfterMs: 200_000 } } } });
  assert.equal(resolveParentStoryBookMediaPollDelayMs(limited, 0, 10_000), 70_000);
  assert.equal(resolveParentStoryBookMediaPollDelayMs(buildStory(), 100, 10_000), 32_000);
});

test("client story cache keys separate signed-in owners even when a child is shared", () => {
  const request = { childId: "child-1", snapshot: { child: { id: "child-1" } } } as ParentStoryBookRequest;
  assert.notEqual(buildParentStoryBookCacheKey(request, "forest-crayon", "org:parent-a:1"), buildParentStoryBookCacheKey(request, "forest-crayon", "org:parent-b:1"));
  assert.notEqual(buildParentStoryBookCacheKey(request, "forest-crayon", "org:parent-a:1"), buildParentStoryBookCacheKey(request, "forest-crayon", "org:parent-a:2"));
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
