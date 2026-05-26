import assert from "node:assert/strict";
import test from "node:test";

import type {
  ParentStoryBookMediaStatusRequest,
  ParentStoryBookResponse,
} from "@/lib/ai/types";
import {
  SMARTCHILDCARE_TARGET_HEADER,
  SMARTCHILDCARE_TRANSPORT_HEADER,
} from "@/lib/server/brain-client";
import { POST } from "./route.ts";

function withEnv(
  overrides: Partial<
    Record<
      "BRAIN_API_BASE_URL" | "NEXT_PUBLIC_BACKEND_BASE_URL" | "VIVO_APP_ID" | "VIVO_APP_KEY" | "VIVO_BASE_URL",
      string | undefined
    >
  >,
  fn: () => void | Promise<void>
) {
  const previous = {
    BRAIN_API_BASE_URL: process.env.BRAIN_API_BASE_URL,
    NEXT_PUBLIC_BACKEND_BASE_URL: process.env.NEXT_PUBLIC_BACKEND_BASE_URL,
    VIVO_APP_ID: process.env.VIVO_APP_ID,
    VIVO_APP_KEY: process.env.VIVO_APP_KEY,
    VIVO_BASE_URL: process.env.VIVO_BASE_URL,
  };

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return Promise.resolve(fn()).finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

function buildProgressiveStory(): ParentStoryBookResponse {
  return {
    storyId: "storybook-progressive-1",
    childId: "c-1",
    mode: "storybook",
    title: "Progressive story text",
    summary: "Text is ready before media finishes.",
    moral: "Try a small feeling word.",
    parentNote: "Keep reading while media finishes in the background.",
    source: "vivo",
    fallback: true,
    fallbackReason: null,
    generatedAt: "2026-05-26T00:00:00.000Z",
    stylePreset: "sunrise-watercolor",
    providerMeta: {
      provider: "vivo-llm",
      mode: "mixed",
      transport: "remote-brain-proxy",
      textProvider: "vivo-llm",
      textDelivery: "real",
      imageProvider: "vivo-story-image+storybook-dynamic-fallback",
      audioProvider: "vivo-story-tts+storybook-mock-preview",
      imageDelivery: "mixed",
      audioDelivery: "mixed",
      realProvider: true,
      highlightCount: 1,
      sceneCount: 2,
      cacheHitCount: 0,
      cacheWindowSeconds: 900,
      diagnostics: {
        brain: {
          reachable: true,
          fallbackReason: null,
          upstreamHost: "brain.example.com",
          statusCode: null,
          retryStrategy: "none",
          elapsedMs: 1300,
          timeoutMs: 45000,
        },
        image: {
          requestedProvider: "vivo",
          resolvedProvider: "vivo-story-image+storybook-dynamic-fallback",
          liveEnabled: true,
          missingConfig: [],
          jobStatus: "warming",
          pendingSceneCount: 1,
          readySceneCount: 1,
          errorSceneCount: 0,
          lastErrorStage: null,
          lastErrorReason: null,
          elapsedMs: 300,
        },
        audio: {
          requestedProvider: "vivo",
          resolvedProvider: "vivo-story-tts+storybook-mock-preview",
          liveEnabled: true,
          missingConfig: [],
          jobStatus: "warming",
          pendingSceneCount: 1,
          readySceneCount: 1,
          errorSceneCount: 0,
          lastErrorStage: null,
          lastErrorReason: null,
          elapsedMs: 300,
        },
      },
    },
    scenes: [
      {
        sceneIndex: 1,
        sceneTitle: "Scene 1",
        sceneText: "The first page has real media.",
        imagePrompt: "picture book first page",
        imageUrl: "https://cdn.example.com/story-1.png",
        assetRef: "https://cdn.example.com/story-1.png",
        imageStatus: "ready",
        imageSourceKind: "real",
        audioUrl: "/api/ai/parent-storybook/media/audio-1",
        audioRef: "audio-1",
        audioScript: "The first page has real audio.",
        audioStatus: "ready",
        captionTiming: {
          mode: "duration-derived",
          segmentTexts: ["The first page has real audio."],
          segmentDurationsMs: [2600],
        },
        voiceStyle: "warm-storytelling",
        engineId: "short_audio_synthesis_jovi",
        voiceName: "yige",
        highlightSource: "manualTheme",
        imageCacheHit: false,
        audioCacheHit: false,
      },
      {
        sceneIndex: 2,
        sceneTitle: "Scene 2",
        sceneText: "The second page is still warming.",
        imagePrompt: "picture book second page",
        imageUrl: "/api/ai/parent-storybook/media/fallback-2",
        assetRef: "/api/ai/parent-storybook/media/fallback-2",
        imageStatus: "ready",
        imageSourceKind: "dynamic-fallback",
        audioUrl: null,
        audioRef: "audio-2",
        audioScript: "The second page is still warming.",
        audioStatus: "fallback",
        captionTiming: {
          mode: "duration-derived",
          segmentTexts: ["The second page is still warming."],
          segmentDurationsMs: [2600],
        },
        voiceStyle: "warm-storytelling",
        highlightSource: "manualTheme",
        imageCacheHit: false,
        audioCacheHit: false,
      },
    ],
  };
}

function buildMediaStatusPayload(
  overrides: Partial<ParentStoryBookMediaStatusRequest> = {}
): ParentStoryBookMediaStatusRequest {
  const story = buildProgressiveStory();
  return {
    childId: story.childId,
    storyId: story.storyId,
    prioritySceneIndices: [2, 1],
    retryFailed: true,
    story,
    ...overrides,
  };
}

function buildMediaStatusRouteRequest(payload: ParentStoryBookMediaStatusRequest) {
  return new Request("http://localhost:3000/api/ai/parent-storybook/media-status", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-demo-account-id": "u-parent",
    },
    body: JSON.stringify(payload),
  });
}

async function readForwardedJson(body: BodyInit | null | undefined) {
  if (body instanceof ArrayBuffer) {
    return JSON.parse(new TextDecoder().decode(body)) as ParentStoryBookMediaStatusRequest;
  }
  if (typeof body === "string") {
    return JSON.parse(body) as ParentStoryBookMediaStatusRequest;
  }
  throw new Error("unexpected forwarded body");
}

test("parent storybook media-status route forwards media-only polling without story generation", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  let forwardedPayload: ParentStoryBookMediaStatusRequest | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    forwardedPayload = await readForwardedJson(init?.body);
    const story = forwardedPayload.story;
    return new Response(
      JSON.stringify({
        ...story,
        scenes: story.scenes.map((scene) =>
          scene.sceneIndex === 2
            ? {
                ...scene,
                imageUrl: "https://cdn.example.com/story-2.png",
                assetRef: "https://cdn.example.com/story-2.png",
                imageStatus: "ready",
                imageSourceKind: "real",
                audioUrl: "data:audio/wav;base64,UklGRg==",
                audioRef: "audio-2",
                audioStatus: "ready",
                engineId: "short_audio_synthesis_jovi",
                voiceName: "yige",
              }
            : scene
        ),
        providerMeta: {
          ...story.providerMeta,
          imageDelivery: "real",
          audioDelivery: "real",
          diagnostics: {
            ...story.providerMeta.diagnostics,
            image: {
              ...story.providerMeta.diagnostics?.image,
              jobStatus: "ready",
              pendingSceneCount: 0,
              readySceneCount: 2,
            },
            audio: {
              ...story.providerMeta.diagnostics?.audio,
              jobStatus: "ready",
              pendingSceneCount: 0,
              readySceneCount: 2,
            },
          },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    await withEnv(
      {
        BRAIN_API_BASE_URL: "http://brain.example.com",
        NEXT_PUBLIC_BACKEND_BASE_URL: undefined,
      },
      async () => {
        const response = await POST(buildMediaStatusRouteRequest(buildMediaStatusPayload()));
        const body = (await response.json()) as ParentStoryBookResponse;

        assert.equal(response.status, 200);
        assert.equal(calls.length, 1);
        assert.equal(
          calls[0],
          "http://brain.example.com/api/v1/agents/parent/storybook/media-status"
        );
        assert.equal(
          response.headers.get(SMARTCHILDCARE_TARGET_HEADER),
          "/api/v1/agents/parent/storybook/media-status"
        );
        assert.equal(response.headers.get(SMARTCHILDCARE_TRANSPORT_HEADER), "remote-brain-proxy");
        assert.equal(forwardedPayload?.story.title, "Progressive story text");
        assert.deepEqual(forwardedPayload?.prioritySceneIndices, [2, 1]);
        assert.equal(body.title, "Progressive story text");
        assert.equal(body.providerMeta.imageDelivery, "real");
        assert.equal(body.providerMeta.audioDelivery, "real");
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("parent storybook media-status route falls back to local media status when backend route is missing", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    return new Response(JSON.stringify({ detail: "Not Found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await withEnv(
      {
        BRAIN_API_BASE_URL: "http://brain.example.com",
        NEXT_PUBLIC_BACKEND_BASE_URL: undefined,
        VIVO_APP_ID: undefined,
        VIVO_APP_KEY: undefined,
        VIVO_BASE_URL: undefined,
      },
      async () => {
        const response = await POST(buildMediaStatusRouteRequest(buildMediaStatusPayload()));
        const body = (await response.json()) as ParentStoryBookResponse;

        assert.equal(response.status, 200);
        assert.equal(calls.length, 1);
        assert.equal(response.headers.get(SMARTCHILDCARE_TRANSPORT_HEADER), "next-json-fallback");
        assert.equal(body.title, "Progressive story text");
        assert.equal(body.providerMeta.textDelivery, "real");
        assert.equal(body.providerMeta.imageDelivery, "mixed");
        assert.equal(body.providerMeta.audioDelivery, "mixed");
        assert.deepEqual(body.providerMeta.diagnostics?.image.missingConfig, [
          "VIVO_APP_ID",
          "VIVO_APP_KEY",
        ]);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("parent storybook media-status route still rejects unauthorized child ids", async () => {
  const story = buildProgressiveStory();
  const response = await POST(
    buildMediaStatusRouteRequest(
      buildMediaStatusPayload({
        childId: "c-3",
        story: {
          ...story,
          childId: "c-3",
        },
      })
    )
  );
  const body = (await response.json()) as { error?: string };

  assert.equal(response.status, 403);
  assert.equal(body.error, "当前账号无权访问该儿童数据。");
});
