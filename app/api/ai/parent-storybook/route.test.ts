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
      | "BACKEND_BASE_URL"
      | "BRAIN_API_BASE_URL"
      | "NEXT_PUBLIC_BACKEND_BASE_URL"
      | "NODE_ENV"
      | "PARENT_STORYBOOK_REQUIRE_REAL_TEXT"
      | "VIVO_APP_ID"
      | "VIVO_APP_KEY"
      | "VIVO_BASE_URL"
      | "VIVO_LLM_MODEL",
      string | undefined
    >
  >,
  fn: () => void | Promise<void>
) {
  const previous = {
    BACKEND_BASE_URL: process.env.BACKEND_BASE_URL,
    BRAIN_API_BASE_URL: process.env.BRAIN_API_BASE_URL,
    NEXT_PUBLIC_BACKEND_BASE_URL: process.env.NEXT_PUBLIC_BACKEND_BASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    PARENT_STORYBOOK_REQUIRE_REAL_TEXT: process.env.PARENT_STORYBOOK_REQUIRE_REAL_TEXT,
    VIVO_APP_ID: process.env.VIVO_APP_ID,
    VIVO_APP_KEY: process.env.VIVO_APP_KEY,
    VIVO_BASE_URL: process.env.VIVO_BASE_URL,
    VIVO_LLM_MODEL: process.env.VIVO_LLM_MODEL,
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

function buildRemoteFallbackStory(): ParentStoryBookResponse {
  const story = buildRemoteStory();
  return {
    ...story,
    source: "fallback",
    fallback: true,
    fallbackReason: "mock-storybook-pipeline",
    providerMeta: {
      ...story.providerMeta,
      provider: "parent-storybook-rule",
      mode: "fallback",
      textProvider: "parent-storybook-rule",
      textDelivery: undefined,
      imageProvider: "storybook-dynamic-fallback",
      audioProvider: "storybook-mock-preview",
      imageDelivery: "dynamic-fallback",
      audioDelivery: "preview-only",
      fallbackReason: "mock-storybook-pipeline",
      realProvider: false,
      diagnostics: story.providerMeta.diagnostics
        ? {
            ...story.providerMeta.diagnostics,
            brain: {
              ...story.providerMeta.diagnostics.brain,
              reachable: true,
              fallbackReason: null,
              upstreamHost: "brain.example.com",
            },
          }
        : story.providerMeta.diagnostics,
    },
  };
}

function buildVivoStoryText(sceneCount: number) {
  return JSON.stringify({
    title: "AI emotion story",
    summary: "A real provider wrote a custom story.",
    moral: "Feelings can be named and shared.",
    parentNote: "Invite the child to name one feeling after reading.",
    scenes: Array.from({ length: sceneCount }, (_, index) => ({
      sceneTitle: `AI Scene ${index + 1}`,
      sceneText: `AI generated scene ${index + 1} about naming feelings and asking for help.`,
      audioScript: `AI audio scene ${index + 1}.`,
      imagePrompt: `warm picture book scene ${index + 1}`,
      voiceStyle: "warm-storytelling",
      highlightSource: "manualTheme",
    })),
  });
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

test("parent storybook route upgrades backend rule fallback to real vivo text when required", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  parentStoryBookCacheInternals.storyResponseCache.clear();
  parentStoryBookCacheInternals.mediaAssetCache.clear();

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    if (url.includes("api-ai.vivo.com.cn")) {
      return new Response(
        JSON.stringify({
          model: "vivo-test-model",
          choices: [{ message: { content: buildVivoStoryText(1) } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    return new Response(JSON.stringify(buildRemoteFallbackStory()), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await withEnv(
      {
        BRAIN_API_BASE_URL: "http://brain.example.com",
        NEXT_PUBLIC_BACKEND_BASE_URL: undefined,
        PARENT_STORYBOOK_REQUIRE_REAL_TEXT: "1",
        VIVO_APP_ID: "app-id",
        VIVO_APP_KEY: "app-key",
        VIVO_BASE_URL: "https://api-ai.vivo.com.cn",
        VIVO_LLM_MODEL: "vivo-test-model",
      },
      async () => {
        const response = await POST(buildStorybookRouteRequest());
        const body = (await response.json()) as ParentStoryBookResponse;

        assert.equal(response.status, 200);
        assert.equal(calls.length, 2);
        assert.equal(body.title, "AI emotion story");
        assert.equal(body.source, "vivo");
        assert.equal(body.fallbackReason, null);
        assert.equal(body.providerMeta.textDelivery, "real");
        assert.equal(body.providerMeta.textProvider, "vivo-chat");
        assert.equal(body.providerMeta.fallbackReason, null);
        assert.equal(body.providerMeta.diagnostics?.brain.fallbackReason, null);
        assert.equal(body.providerMeta.diagnostics?.brain.upstreamHost, "api-ai.vivo.com.cn");
        assert.equal(body.scenes[0].sceneText, "AI generated scene 1 about naming feelings and asking for help.");
        assert.equal(response.headers.get(SMARTCHILDCARE_TRANSPORT_HEADER), "remote-brain-proxy");
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    parentStoryBookCacheInternals.storyResponseCache.clear();
    parentStoryBookCacheInternals.mediaAssetCache.clear();
  }
});

test("parent storybook route reports provider failure instead of successful rule fallback when real text is required", async () => {
  const originalFetch = globalThis.fetch;
  parentStoryBookCacheInternals.storyResponseCache.clear();
  parentStoryBookCacheInternals.mediaAssetCache.clear();

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("api-ai.vivo.com.cn")) {
      return new Response(JSON.stringify({ error: "model permission missing" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify(buildRemoteFallbackStory()), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await withEnv(
      {
        BRAIN_API_BASE_URL: "http://brain.example.com",
        NEXT_PUBLIC_BACKEND_BASE_URL: undefined,
        PARENT_STORYBOOK_REQUIRE_REAL_TEXT: "1",
        VIVO_APP_ID: "app-id",
        VIVO_APP_KEY: "app-key",
        VIVO_BASE_URL: "https://api-ai.vivo.com.cn",
        VIVO_LLM_MODEL: "vivo-test-model",
      },
      async () => {
        const response = await POST(buildStorybookRouteRequest());
        const body = (await response.json()) as {
          code?: string;
          fallbackReason?: string;
          diagnostics?: Record<string, unknown>;
          storyId?: string;
        };

        assert.equal(response.status, 502);
        assert.equal(body.code, "storybook-text-provider-unavailable");
        assert.equal(body.fallbackReason, "provider-authentication-error");
        assert.equal(body.storyId, undefined);
        assert.equal(
          response.headers.get(SMARTCHILDCARE_FALLBACK_REASON_HEADER),
          "provider-authentication-error"
        );
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    parentStoryBookCacheInternals.storyResponseCache.clear();
    parentStoryBookCacheInternals.mediaAssetCache.clear();
  }
});

test("parent storybook route uses local scaffold plus real vivo text when backend is too slow", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  parentStoryBookCacheInternals.storyResponseCache.clear();
  parentStoryBookCacheInternals.mediaAssetCache.clear();

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    if (url.includes("api-ai.vivo.com.cn")) {
      return new Response(
        JSON.stringify({
          model: "vivo-test-model",
          choices: [{ message: { content: buildVivoStoryText(6) } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    throw new DOMException("Aborted", "AbortError");
  }) as typeof fetch;

  try {
    await withEnv(
      {
        BRAIN_API_BASE_URL: "http://brain.example.com",
        NEXT_PUBLIC_BACKEND_BASE_URL: undefined,
        PARENT_STORYBOOK_REQUIRE_REAL_TEXT: "1",
        VIVO_APP_ID: "app-id",
        VIVO_APP_KEY: "app-key",
        VIVO_BASE_URL: "https://api-ai.vivo.com.cn",
        VIVO_LLM_MODEL: "vivo-test-model",
      },
      async () => {
        const response = await POST(
          buildStorybookRouteRequest({
            ...buildPayload(),
            pageCount: 6,
          })
        );
        const body = (await response.json()) as ParentStoryBookResponse;

        assert.equal(response.status, 200);
        assert.equal(calls.length, 2);
        assert.equal(response.headers.get(SMARTCHILDCARE_TRANSPORT_HEADER), "next-json-fallback");
        assert.equal(body.providerMeta.transport, "next-json-fallback");
        assert.equal(body.providerMeta.textDelivery, "real");
        assert.equal(body.providerMeta.textProvider, "vivo-chat");
        assert.equal(body.fallbackReason, null);
        assert.equal(body.providerMeta.fallbackReason, null);
        assert.equal(body.scenes.length, 6);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    parentStoryBookCacheInternals.storyResponseCache.clear();
    parentStoryBookCacheInternals.mediaAssetCache.clear();
  }
});

test("parent storybook route returns a next-json-fallback story when brain is unavailable", async () => {
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
        const body = (await response.json()) as ParentStoryBookResponse;

        assert.equal(response.status, 200);
        assert.equal(response.headers.get(SMARTCHILDCARE_TRANSPORT_HEADER), "next-json-fallback");
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
        assert.equal(typeof body.storyId, "string");
        assert.equal(body.providerMeta.transport, "next-json-fallback");
        assert.equal(body.providerMeta.fallbackReason, "brain-proxy-timeout");
        assert.equal(body.provider, body.providerMeta.provider);
        assert.equal(body.providerTrace?.mode, "fallback");
        assert.equal(body.providerTrace?.fallback, true);
        assert.equal(body.providerTrace?.fallbackReason, body.providerMeta.fallbackReason);
        assert.equal(body.providerTrace?.provider, body.providerMeta.provider);
        assert.equal(body.providerMeta.diagnostics?.brain.fallbackReason, "brain-proxy-timeout");
        assert.equal(typeof body.providerMeta.diagnostics?.brain.timeoutMs, "number");
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
