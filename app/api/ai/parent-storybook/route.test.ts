import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { ParentStoryBookRequest, ParentStoryBookResponse } from "@/lib/ai/types";
import {
  SMARTCHILDCARE_FALLBACK_REASON_HEADER,
  SMARTCHILDCARE_TARGET_HEADER,
  SMARTCHILDCARE_TRANSPORT_HEADER,
} from "@/lib/server/brain-client";
import { parentStoryBookCacheInternals } from "@/lib/server/parent-storybook-cache";
import { POST } from "./route.ts";

function withEnv(
  overrides: Partial<
    Record<
      "BACKEND_BASE_URL" | "BRAIN_API_BASE_URL" | "NEXT_PUBLIC_BACKEND_BASE_URL",
      string | undefined
    >
  >,
  fn: () => void | Promise<void>
) {
  const previous = {
    BACKEND_BASE_URL: process.env.BACKEND_BASE_URL,
    BRAIN_API_BASE_URL: process.env.BRAIN_API_BASE_URL,
    NEXT_PUBLIC_BACKEND_BASE_URL: process.env.NEXT_PUBLIC_BACKEND_BASE_URL,
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

function buildPayload(): ParentStoryBookRequest {
  const payload = JSON.parse(
    readFileSync(
      new URL(
        "../../../../backend/tests/fixtures/parent_storybook/page-recording-c1-bedtime.json",
        import.meta.url
      ),
      "utf8"
    )
  ) as ParentStoryBookRequest;
  return {
    ...payload,
    requestSource: "route-test",
  };
}

function buildStorybookRouteRequest(payload: ParentStoryBookRequest = buildPayload()) {
  return new Request("http://localhost:3000/api/ai/parent-storybook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-demo-account-id": "u-parent",
    },
    body: JSON.stringify(payload),
  });
}

function buildRemoteStory(): ParentStoryBookResponse {
  return {
    storyId: "storybook-remote-1",
    childId: "c-1",
    mode: "storybook",
    title: "Remote story",
    summary: "Remote story payload arrived from FastAPI.",
    moral: "Small bedtime rituals can stay steady.",
    parentNote: "Keep the same calm sequence tonight.",
    source: "vivo",
    fallback: false,
    fallbackReason: null,
    generatedAt: "2026-04-10T00:00:00.000Z",
    stylePreset: "sunrise-watercolor",
    providerMeta: {
      provider: "vivo-llm",
      mode: "live",
      textProvider: "vivo-llm",
      textDelivery: "real",
      imageProvider: "vivo-story-image",
      audioProvider: "vivo-story-tts",
      imageDelivery: "real",
      audioDelivery: "preview-only",
      realProvider: true,
      highlightCount: 2,
      sceneCount: 1,
      cacheHitCount: 0,
      cacheWindowSeconds: 900,
      diagnostics: {
        brain: {
          reachable: true,
          fallbackReason: null,
          upstreamHost: "brain.example.com",
          statusCode: null,
          retryStrategy: "none",
          elapsedMs: 120,
          timeoutMs: 45000,
        },
        image: {
          requestedProvider: "vivo",
          resolvedProvider: "vivo-story-image",
          liveEnabled: true,
          missingConfig: [],
          jobStatus: "ready",
          pendingSceneCount: 0,
          readySceneCount: 1,
          errorSceneCount: 0,
          lastErrorStage: null,
          lastErrorReason: null,
          elapsedMs: 120,
        },
        audio: {
          requestedProvider: "vivo",
          resolvedProvider: "vivo-story-tts",
          liveEnabled: true,
          missingConfig: [],
          jobStatus: "ready",
          pendingSceneCount: 0,
          readySceneCount: 1,
          errorSceneCount: 0,
          lastErrorStage: null,
          lastErrorReason: null,
          elapsedMs: 120,
        },
      },
    },
    scenes: [
      {
        sceneIndex: 1,
        sceneTitle: "Scene 1",
        sceneText: "Remote media is ready.",
        imagePrompt: "image prompt",
        imageUrl: "https://cdn.example.com/story-1.png",
        assetRef: "https://cdn.example.com/story-1.png",
        imageStatus: "ready",
        imageSourceKind: "real",
        audioUrl: "data:audio/wav;base64,UklGRg==",
        audioRef: "audio-1",
        audioScript: "Remote audio is ready.",
        audioStatus: "ready",
        captionTiming: {
          mode: "duration-derived",
          segmentTexts: ["Remote audio is ready."],
          segmentDurationsMs: [2600],
        },
        voiceStyle: "warm-storytelling",
        engineId: "short_audio_synthesis_jovi",
        voiceName: "yige",
        highlightSource: "todayGrowth",
        imageCacheHit: false,
        audioCacheHit: false,
      },
    ],
  };
}

function buildManualThemePayload(
  overrides: Partial<ParentStoryBookRequest> = {}
): ParentStoryBookRequest {
  const payload = buildPayload();
  return {
    ...payload,
    childId: "c-1",
    generationMode: "manual-theme",
    manualTheme: "emotion practice",
    manualPrompt: "Turn emotion practice into a bedtime story.",
    pageCount: 4,
    goalKeywords: ["emotion practice"],
    requestSource: "route-test-manual-theme",
    snapshot: {
      ...payload.snapshot,
      child: {
        ...payload.snapshot.child,
        id: "storybook-guest",
        name: "小朋友",
        className: undefined,
      },
    },
    highlightCandidates: [
      {
        kind: "manualTheme",
        title: "Theme: emotion practice",
        detail: "Turn emotion practice into a child-friendly story.",
        priority: 1,
        source: "manualTheme",
      },
    ],
    ...overrides,
  };
}

test("parent storybook route accepts manual-theme with authorized child id and synthetic snapshot", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  parentStoryBookCacheInternals.storyResponseCache.clear();
  parentStoryBookCacheInternals.mediaAssetCache.clear();

  globalThis.fetch = (async () => {
    callCount += 1;
    return new Response(JSON.stringify(buildRemoteStory()), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await withEnv(
      {
        BRAIN_API_BASE_URL: "http://brain.example.com",
        NEXT_PUBLIC_BACKEND_BASE_URL: undefined,
      },
      async () => {
        const response = await POST(
          buildStorybookRouteRequest(buildManualThemePayload())
        );
        const body = (await response.json()) as ParentStoryBookResponse;

        assert.equal(response.status, 200);
        assert.equal(callCount, 1);
        assert.equal(body.childId, "c-1");
        assert.equal(body.providerMeta.transport, "remote-brain-proxy");
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    parentStoryBookCacheInternals.storyResponseCache.clear();
    parentStoryBookCacheInternals.mediaAssetCache.clear();
  }
});

test("parent storybook route keeps child authorization across manual-theme page counts", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  parentStoryBookCacheInternals.storyResponseCache.clear();
  parentStoryBookCacheInternals.mediaAssetCache.clear();

  globalThis.fetch = (async () => {
    callCount += 1;
    return new Response(JSON.stringify(buildRemoteStory()), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await withEnv(
      {
        BRAIN_API_BASE_URL: "http://brain.example.com",
        NEXT_PUBLIC_BACKEND_BASE_URL: undefined,
      },
      async () => {
        for (const pageCount of [4, 5, 6, 8] as const) {
          const response = await POST(
            buildStorybookRouteRequest(
              buildManualThemePayload({
                pageCount,
                requestSource: `route-test-manual-theme-${pageCount}`,
              })
            )
          );

          assert.equal(response.status, 200);
        }
        assert.equal(callCount, 4);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    parentStoryBookCacheInternals.storyResponseCache.clear();
    parentStoryBookCacheInternals.mediaAssetCache.clear();
  }
});

test("parent storybook route still rejects unauthorized child ids", async () => {
  const response = await POST(
    buildStorybookRouteRequest(
      buildManualThemePayload({
        childId: "c-3",
      })
    )
  );
  const body = (await response.json()) as { code?: string; error?: string };

  assert.equal(response.status, 403);
  assert.equal(body.code, "forbidden_scope");
  assert.ok(body.error);
});

test("parent storybook route still rejects real snapshot child mismatch", async () => {
  const payload = buildPayload();
  const response = await POST(
    buildStorybookRouteRequest(
      buildManualThemePayload({
        childId: "c-1",
        snapshot: {
          ...payload.snapshot,
          child: {
            ...payload.snapshot.child,
            id: "c-4",
          },
        },
      })
    )
  );
  const body = (await response.json()) as { error?: string };

  assert.equal(response.status, 403);
  assert.equal(body.error, "Storybook snapshot child does not match requested child");
});

test("parent storybook route keeps remote brain diagnostics on successful proxy", async () => {
  const originalFetch = globalThis.fetch;
  parentStoryBookCacheInternals.storyResponseCache.clear();
  parentStoryBookCacheInternals.mediaAssetCache.clear();

  globalThis.fetch = (async () =>
    new Response(JSON.stringify(buildRemoteStory()), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

  try {
    await withEnv(
      {
        BRAIN_API_BASE_URL: "http://brain.example.com",
        NEXT_PUBLIC_BACKEND_BASE_URL: undefined,
      },
      async () => {
        const response = await POST(
          buildStorybookRouteRequest()
        );
        const body = (await response.json()) as ParentStoryBookResponse;

        assert.equal(response.status, 200);
        assert.equal(response.headers.get(SMARTCHILDCARE_TRANSPORT_HEADER), "remote-brain-proxy");
        assert.equal(body.providerMeta.transport, "remote-brain-proxy");
        assert.equal(body.providerMeta.diagnostics?.brain.reachable, true);
        assert.equal(body.providerMeta.diagnostics?.brain.fallbackReason, null);
        assert.equal(typeof body.providerMeta.diagnostics?.brain.timeoutMs, "number");
        assert.equal(typeof body.providerMeta.diagnostics?.brain.elapsedMs, "number");
        assert.equal(body.providerMeta.audioDelivery, "real");
        assert.equal(body.cacheMeta?.audioDelivery, "stream-url");
        assert.match(body.scenes[0].audioUrl ?? "", /^\/api\/ai\/parent-storybook\/media\//);
        assert.ok(body.scenes[0].audioRef);
        assert.equal(body.scenes[0].engineId, "short_audio_synthesis_jovi");
        assert.equal(body.scenes[0].voiceName, "yige");
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    parentStoryBookCacheInternals.storyResponseCache.clear();
    parentStoryBookCacheInternals.mediaAssetCache.clear();
  }
});

test("parent storybook route accepts BACKEND_BASE_URL as brain proxy base URL", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  parentStoryBookCacheInternals.storyResponseCache.clear();
  parentStoryBookCacheInternals.mediaAssetCache.clear();

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    return new Response(JSON.stringify(buildRemoteStory()), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await withEnv(
      {
        BACKEND_BASE_URL: "http://backend.example.com/api/v1",
        BRAIN_API_BASE_URL: undefined,
        NEXT_PUBLIC_BACKEND_BASE_URL: undefined,
      },
      async () => {
        const response = await POST(buildStorybookRouteRequest());
        const body = (await response.json()) as ParentStoryBookResponse;

        assert.equal(response.status, 200);
        assert.equal(calls[0], "http://backend.example.com/api/v1/api/v1/agents/parent/storybook");
        assert.equal(calls.length, 1);
        assert.equal(body.providerMeta.transport, "remote-brain-proxy");
        assert.equal(body.providerMeta.textDelivery, "real");
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    parentStoryBookCacheInternals.storyResponseCache.clear();
    parentStoryBookCacheInternals.mediaAssetCache.clear();
  }
});

test("parent storybook route returns 503 instead of a next-json-fallback story when brain is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  parentStoryBookCacheInternals.storyResponseCache.clear();
  parentStoryBookCacheInternals.mediaAssetCache.clear();

  globalThis.setTimeout = (((callback: TimerHandler) =>
    originalSetTimeout(callback, 0)) as unknown) as typeof globalThis.setTimeout;
  globalThis.fetch = (((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error("missing abort signal"));
        return;
      }
      signal.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      });
    })) as unknown) as typeof fetch;

  try {
    await withEnv(
      {
        BRAIN_API_BASE_URL: "http://brain.example.com",
        NEXT_PUBLIC_BACKEND_BASE_URL: undefined,
      },
      async () => {
        const response = await POST(
          buildStorybookRouteRequest()
        );
        const body = (await response.json()) as {
          code?: string;
          diagnostics?: Record<string, unknown>;
          error?: string;
          storyId?: string;
        };

        assert.equal(response.status, 503);
        assert.equal(response.headers.get(SMARTCHILDCARE_TRANSPORT_HEADER), "brain-proxy-error");
        assert.equal(
          response.headers.get(SMARTCHILDCARE_FALLBACK_REASON_HEADER),
          "brain-proxy-timeout"
        );
        assert.equal(
          response.headers.get(SMARTCHILDCARE_TARGET_HEADER),
          "/api/v1/agents/parent/storybook"
        );
        assert.equal(
          response.headers.get("x-smartchildcare-storybook-cache"),
          "bypass"
        );
        assert.equal(body.code, "brain-proxy-unavailable");
        assert.equal(body.storyId, undefined);
        assert.equal(body.diagnostics?.transport, "brain-proxy-error");
        assert.equal(body.diagnostics?.fallbackReason, "brain-proxy-timeout");
        assert.equal(typeof body.diagnostics?.timeoutMs, "number");
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    parentStoryBookCacheInternals.storyResponseCache.clear();
    parentStoryBookCacheInternals.mediaAssetCache.clear();
  }
});

test("parent storybook route serves cached remote story without re-entering the local fallback branch", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  parentStoryBookCacheInternals.storyResponseCache.clear();
  parentStoryBookCacheInternals.mediaAssetCache.clear();

  globalThis.fetch = (async () => {
    callCount += 1;
    return new Response(JSON.stringify(buildRemoteStory()), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await withEnv(
      {
        BRAIN_API_BASE_URL: "http://brain.example.com",
        NEXT_PUBLIC_BACKEND_BASE_URL: undefined,
      },
      async () => {
        const firstResponse = await POST(buildStorybookRouteRequest());
        const secondResponse = await POST(buildStorybookRouteRequest());
        const secondBody = (await secondResponse.json()) as ParentStoryBookResponse;

        assert.equal(firstResponse.status, 200);
        assert.equal(secondResponse.status, 200);
        assert.equal(callCount, 1);
        assert.equal(secondResponse.headers.get("x-smartchildcare-storybook-cache"), "hit");
        assert.equal(secondBody.providerMeta.transport, "remote-brain-proxy");
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    parentStoryBookCacheInternals.storyResponseCache.clear();
    parentStoryBookCacheInternals.mediaAssetCache.clear();
  }
});
