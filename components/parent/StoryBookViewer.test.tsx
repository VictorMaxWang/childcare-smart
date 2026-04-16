import assert from "node:assert/strict";
import test from "node:test";

import type { ParentStoryBookResponse, ParentStoryBookScene } from "@/lib/ai/types";

import {
  buildCaptionTimeline,
  getCaptionIndexForCharIndex,
  getCaptionIndexForElapsedMs,
  getRuntimeBannerItemsHotfix,
  resolveLocalSpeechHandoffSceneIndexHotfix,
  resolveRuntimeAudioDeliveryHotfix,
  resolveRuntimeSceneImageDeliveryHotfix,
  resolveRuntimeStoryModeHotfix,
  resolveSceneCaptionTiming,
} from "./StoryBookViewer.tsx";

function buildScene(
  overrides: Partial<ParentStoryBookScene> = {}
): ParentStoryBookScene {
  return {
    sceneIndex: 1,
    sceneTitle: "Scene 1",
    sceneText: "Bunny pauses, names the feeling, and tries one small bedtime step.",
    imagePrompt: "image prompt",
    imageUrl: "https://cdn.example.com/scene-1.png",
    assetRef: "https://cdn.example.com/scene-1-fallback.svg",
    imageStatus: "ready",
    imageSourceKind: "real",
    audioUrl: null,
    audioRef: "scene-1-audio",
    audioScript:
      "Page one. Bunny pauses. Bunny names the feeling. Tonight we try one small bedtime step.",
    audioStatus: "fallback",
    voiceStyle: "warm-storytelling",
    highlightSource: "manualTheme",
    ...overrides,
  };
}

function buildStory(
  overrides: Partial<ParentStoryBookResponse> = {}
): ParentStoryBookResponse {
  const scenes = overrides.scenes ?? [buildScene()];
  return {
    storyId: "storybook-1",
    childId: "child-1",
    mode: "storybook",
    title: "Bedtime Story",
    summary: "A short story about naming feelings before bed.",
    moral: "Small steps still count.",
    parentNote: "Repeat the same calm bedtime sequence tonight.",
    source: "rule",
    fallback: true,
    fallbackReason: null,
    generatedAt: "2026-04-10T00:00:00.000Z",
    stylePreset: "sunrise-watercolor",
    providerMeta: {
      provider: "parent-storybook-rule",
      mode: "fallback",
      transport: "remote-brain-proxy",
      imageProvider: "vivo-story-image",
      audioProvider: "vivo-story-tts",
      imageDelivery: "real",
      audioDelivery: "real",
      diagnostics: {
        brain: {
          reachable: true,
          fallbackReason: null,
          upstreamHost: "brain.example.com",
          statusCode: null,
          retryStrategy: "none",
          elapsedMs: 820,
          timeoutMs: 45000,
        },
        image: {
          requestedProvider: "vivo",
          resolvedProvider: "vivo-story-image",
          liveEnabled: true,
          missingConfig: [],
          jobStatus: "ready",
          pendingSceneCount: 0,
          readySceneCount: scenes.length,
          errorSceneCount: 0,
          lastErrorStage: null,
          lastErrorReason: null,
          elapsedMs: 1200,
        },
        audio: {
          requestedProvider: "vivo",
          resolvedProvider: "vivo-story-tts",
          liveEnabled: true,
          missingConfig: [],
          jobStatus: "ready",
          pendingSceneCount: 0,
          readySceneCount: scenes.length,
          errorSceneCount: 0,
          lastErrorStage: null,
          lastErrorReason: null,
          elapsedMs: 900,
        },
      },
      realProvider: true,
      highlightCount: 1,
      sceneCount: scenes.length,
      cacheHitCount: 0,
      cacheWindowSeconds: 900,
    },
    scenes,
    ...overrides,
  };
}

test("resolveSceneCaptionTiming prefers scene captionTiming and preserves per-segment durations", () => {
  const scene = buildScene({
    captionTiming: {
      mode: "duration-derived",
      segmentTexts: ["Page one.", "Bunny pauses.", "Bunny names the feeling."],
      segmentDurationsMs: [2500, 3200, 4100],
    },
  });

  const timing = resolveSceneCaptionTiming(scene);

  assert.equal(timing.mode, "duration-derived");
  assert.deepEqual(timing.segmentTexts, [
    "Page one.",
    "Bunny pauses.",
    "Bunny names the feeling.",
  ]);
  assert.deepEqual(timing.segmentDurationsMs, [2500, 3200, 4100]);
});

test("buildCaptionTimeline falls back to a readable caption timeline when captionTiming is missing", () => {
  const scene = buildScene({
    captionTiming: undefined,
    audioScript: "Page one. Bunny pauses. Bunny names the feeling.",
  });

  const timeline = buildCaptionTimeline(scene);

  assert.ok(timeline.segments.length >= 1);
  assert.ok(timeline.segments.every((segment) => segment.length > 0));
  assert.ok(timeline.durationsMs.every((duration) => duration >= 2400));
  assert.equal(timeline.startsMs.length, timeline.segments.length);
  assert.ok(timeline.totalDurationMs >= 2400 * timeline.segments.length);
});

test("caption helpers map elapsed time and speech boundaries onto the correct segment", () => {
  const scene = buildScene({
    audioScript: "Page one. Bunny pauses. Bunny names the feeling.",
    captionTiming: {
      mode: "speech-boundary",
      segmentTexts: ["Page one.", "Bunny pauses.", "Bunny names the feeling."],
      segmentDurationsMs: [2600, 2800, 3400],
    },
  });

  const timeline = buildCaptionTimeline(scene);
  const boundaryIndex = scene.audioScript.indexOf("Bunny names");

  assert.equal(getCaptionIndexForElapsedMs(timeline, 1200), 0);
  assert.equal(getCaptionIndexForElapsedMs(timeline, 3200), 1);
  assert.equal(getCaptionIndexForElapsedMs(timeline, 6800), 2);
  assert.equal(getCaptionIndexForCharIndex(timeline, boundaryIndex), 2);
});

test("runtime story mode hotfix keeps backend capability even when browser previously fell back to local speech", () => {
  const story = buildStory();

  assert.equal(resolveRuntimeStoryModeHotfix(story), "live");
  assert.equal(resolveRuntimeAudioDeliveryHotfix(story), "real");
  assert.equal(
    resolveRuntimeStoryModeHotfix(story, {
      canUseLocalSpeech: true,
      playbackSource: "local",
    }),
    "live"
  );
});

test("local speech handoff hotfix targets the active scene once real audio arrives for the same story", () => {
  const baseStory = buildStory();
  const story = buildStory({
    providerMeta: {
      ...baseStory.providerMeta,
      audioDelivery: "mixed",
      sceneCount: 2,
      diagnostics: {
        ...baseStory.providerMeta.diagnostics,
        audio: {
          ...baseStory.providerMeta.diagnostics!.audio,
          jobStatus: "partial",
          readySceneCount: 1,
          pendingSceneCount: 0,
        },
      },
    },
    scenes: [
      buildScene({
        sceneIndex: 1,
        audioStatus: "ready",
        audioUrl: "/api/ai/parent-storybook/media/audio-1",
        audioRef: "audio-1",
        engineId: "short_audio_synthesis_jovi",
        voiceName: "yige",
      }),
      buildScene({
        sceneIndex: 2,
        imageUrl: "https://cdn.example.com/scene-2.png",
        audioStatus: "fallback",
        audioUrl: null,
        audioRef: "scene-2-audio",
      }),
    ],
  });

  assert.equal(resolveRuntimeAudioDeliveryHotfix(story), "mixed");
  assert.equal(resolveLocalSpeechHandoffSceneIndexHotfix(story, "local", 0), 0);
  assert.equal(resolveLocalSpeechHandoffSceneIndexHotfix(story, "preview", 0), null);
  assert.equal(resolveLocalSpeechHandoffSceneIndexHotfix(story, "local", 1), null);
});

test("runtime scene image delivery hotfix degrades to fallback when browser swaps to assetRef", () => {
  const scene = buildScene({
    imageSourceKind: "real",
    imageUrl: "https://cdn.example.com/live.png",
    assetRef: "/api/ai/parent-storybook/media/fallback-scene-1",
  });

  assert.equal(resolveRuntimeSceneImageDeliveryHotfix(scene), "real");
  assert.equal(
    resolveRuntimeSceneImageDeliveryHotfix(scene, { useAssetFallback: true }),
    "dynamic-fallback"
  );
});

test("runtime banners hotfix maps brain 504 and local speech honestly", () => {
  const baseStory = buildStory();
  const story = buildStory({
    providerMeta: {
      ...baseStory.providerMeta,
      transport: "next-json-fallback",
      imageDelivery: "dynamic-fallback",
      audioDelivery: "preview-only",
      diagnostics: {
        ...baseStory.providerMeta.diagnostics,
        brain: {
          ...baseStory.providerMeta.diagnostics!.brain,
          reachable: false,
          fallbackReason: "brain-status-504",
        },
        image: {
          ...baseStory.providerMeta.diagnostics!.image,
          jobStatus: "warming",
          readySceneCount: 1,
          pendingSceneCount: 2,
        },
        audio: {
          ...baseStory.providerMeta.diagnostics!.audio,
          jobStatus: "warming",
          readySceneCount: 0,
          pendingSceneCount: 3,
        },
      },
    },
  });

  const items = getRuntimeBannerItemsHotfix(story, true, {
    playbackSource: "local",
  });

  assert.ok(items.some((item) => item.label.includes("FastAPI brain")));
  assert.ok(items.some((item) => item.detail.includes("504")));
  assert.ok(items.some((item) => item.detail.includes("ready 1")));
  assert.ok(items.some((item) => item.label.includes("local speech")));
  assert.ok(items.every((item) => !item.label.includes("mixed")));
});

test("runtime banners hotfix keeps mixed backend audio visible even if current playback was local", () => {
  const baseStory = buildStory();
  const story = buildStory({
    providerMeta: {
      ...baseStory.providerMeta,
      mode: "mixed",
      audioDelivery: "mixed",
      sceneCount: 2,
      diagnostics: {
        ...baseStory.providerMeta.diagnostics,
        audio: {
          ...baseStory.providerMeta.diagnostics!.audio,
          jobStatus: "partial",
          readySceneCount: 1,
          pendingSceneCount: 0,
        },
      },
    },
    scenes: [
      buildScene({
        sceneIndex: 1,
        audioStatus: "ready",
        audioUrl: "/api/ai/parent-storybook/media/audio-1",
        audioRef: "audio-1",
        engineId: "short_audio_synthesis_jovi",
        voiceName: "yige",
      }),
      buildScene({
        sceneIndex: 2,
        imageUrl: "https://cdn.example.com/scene-2.png",
        audioStatus: "fallback",
        audioUrl: null,
        audioRef: "scene-2-audio",
      }),
    ],
  });

  const items = getRuntimeBannerItemsHotfix(story, true, {
    playbackSource: "local",
    playbackSceneIndex: 0,
  });

  assert.equal(resolveRuntimeAudioDeliveryHotfix(story), "mixed");
  assert.ok(items.some((item) => item.label.includes("mixed")));
  assert.ok(items.every((item) => !item.label.includes("local speech")));
});
