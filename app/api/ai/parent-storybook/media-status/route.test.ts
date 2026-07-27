import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { WebSocketServer } from "ws";

import type {
  ParentStoryBookMediaStatusRequest,
  ParentStoryBookResponse,
} from "@/lib/ai/types";
import {
  attestAiResult,
  UNVERIFIED_AI_PROVIDER,
  verifyAiResultAttestation,
} from "@/lib/ai/provenance-attestation";
import {
  SMARTCHILDCARE_TARGET_HEADER,
  SMARTCHILDCARE_TRANSPORT_HEADER,
} from "@/lib/server/brain-client";
import {
  parentStoryBookMediaStatusRouteInternals,
  POST,
} from "./route.ts";
import {
  getStorybookMediaTaskStore,
  resetStorybookMediaTaskStoreForTests,
} from "@/lib/server/storybook-media-task-store";

test.beforeEach(() => {
  resetStorybookMediaTaskStoreForTests();
});

function withEnv(
  overrides: Partial<
    Record<
      | "BRAIN_API_BASE_URL"
      | "DASHSCOPE_API_KEY"
      | "NEXT_STORYBOOK_IMAGE_PROVIDER"
      | "NEXT_PUBLIC_BACKEND_BASE_URL"
      | "STORYBOOK_DASHSCOPE_IMAGE_ENDPOINT"
      | "STORYBOOK_IMAGE_PROVIDER"
      | "VIVO_APP_ID"
      | "VIVO_APP_KEY"
      | "VIVO_BASE_URL"
      | "STORYBOOK_IMAGE_RETRY_BACKOFF_MS"
      | "PARENT_STORYBOOK_MEDIA_STATUS_TIMEOUT_MS"
      | "STORYBOOK_MEDIA_PROVIDER_TIMEOUT_MS",
      string | undefined
    >
  >,
  fn: () => void | Promise<void>
) {
  // 测试必须显式选择图片提供方，避免开发机或 CI 的线上环境变量改变旧 Vivo 用例语义。
  const effectiveOverrides = {
    DASHSCOPE_API_KEY: undefined,
    NEXT_STORYBOOK_IMAGE_PROVIDER: undefined,
    STORYBOOK_DASHSCOPE_IMAGE_ENDPOINT: undefined,
    STORYBOOK_IMAGE_PROVIDER: undefined,
    ...overrides,
  };
  const previous = {
    BRAIN_API_BASE_URL: process.env.BRAIN_API_BASE_URL,
    DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY,
    NEXT_STORYBOOK_IMAGE_PROVIDER:
      process.env.NEXT_STORYBOOK_IMAGE_PROVIDER,
    NEXT_PUBLIC_BACKEND_BASE_URL: process.env.NEXT_PUBLIC_BACKEND_BASE_URL,
    STORYBOOK_DASHSCOPE_IMAGE_ENDPOINT:
      process.env.STORYBOOK_DASHSCOPE_IMAGE_ENDPOINT,
    STORYBOOK_IMAGE_PROVIDER: process.env.STORYBOOK_IMAGE_PROVIDER,
    VIVO_APP_ID: process.env.VIVO_APP_ID,
    VIVO_APP_KEY: process.env.VIVO_APP_KEY,
    VIVO_BASE_URL: process.env.VIVO_BASE_URL,
    STORYBOOK_IMAGE_RETRY_BACKOFF_MS: process.env.STORYBOOK_IMAGE_RETRY_BACKOFF_MS,
    PARENT_STORYBOOK_MEDIA_STATUS_TIMEOUT_MS:
      process.env.PARENT_STORYBOOK_MEDIA_STATUS_TIMEOUT_MS,
    STORYBOOK_MEDIA_PROVIDER_TIMEOUT_MS:
      process.env.STORYBOOK_MEDIA_PROVIDER_TIMEOUT_MS,
  };

  for (const [key, value] of Object.entries(effectiveOverrides)) {
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

test("media status budgets stay below the browser polling deadline", async () => {
  await withEnv(
    {
      PARENT_STORYBOOK_MEDIA_STATUS_TIMEOUT_MS: "60000",
      STORYBOOK_MEDIA_PROVIDER_TIMEOUT_MS: "45000",
    },
    () => {
      assert.equal(
        parentStoryBookMediaStatusRouteInternals.resolveMediaStatusTimeoutMs(),
        12_000
      );
      assert.equal(
        parentStoryBookMediaStatusRouteInternals.resolveLocalProviderTimeoutMs(),
        30_000
      );
      assert.equal(
        parentStoryBookMediaStatusRouteInternals.localDeadlineMs,
        22_000
      );
    }
  );
});

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

function buildAudioReadyStory(overrides: Partial<ParentStoryBookResponse> = {}) {
  const story = buildProgressiveStory();
  const baseDiagnostics = story.providerMeta.diagnostics!;
  const overrideDiagnostics = overrides.providerMeta?.diagnostics;
  return {
    ...story,
    ...overrides,
    providerMeta: {
      ...story.providerMeta,
      ...(overrides.providerMeta ?? {}),
      audioDelivery: "real" as const,
      diagnostics: {
        brain: overrideDiagnostics?.brain ?? baseDiagnostics.brain,
        image: overrideDiagnostics?.image ?? baseDiagnostics.image,
        audio: {
          ...baseDiagnostics.audio,
          ...(overrideDiagnostics?.audio ?? {}),
          jobStatus: "ready",
          pendingSceneCount: 0,
          readySceneCount: story.scenes.length,
          errorSceneCount: 0,
        },
      },
    },
    scenes: story.scenes.map((scene) => {
      const mediaKey = scene.sceneIndex
        .toString(16)
        .padStart(40, "a");
      return {
        ...scene,
        audioUrl: `/api/ai/parent-storybook/media/${mediaKey}`,
        audioRef: mediaKey,
        audioStatus: "ready" as const,
        audioProvider: "vivo-story-tts",
      };
    }),
  } satisfies ParentStoryBookResponse;
}

const STORYBOOK_PROVENANCE_CONTEXT = {
  userId: "u-parent",
  institutionId: "inst-1",
  capability: "parent-storybook",
  scopeId: "c-1",
} as const;

async function seedDashScopeImageTask(input: {
  story: ParentStoryBookResponse;
  sceneIndex: number;
  taskId: string;
  submittedAtMs: number;
  pollErrorCount?: number;
}) {
  const scene = input.story.scenes.find(
    (candidate) => candidate.sceneIndex === input.sceneIndex
  );
  assert.ok(scene);
  const identity =
    parentStoryBookMediaStatusRouteInternals.buildStoryMediaTaskIdentity({
      institutionId: STORYBOOK_PROVENANCE_CONTEXT.institutionId,
      userId: STORYBOOK_PROVENANCE_CONTEXT.userId,
      story: input.story,
      scene,
      channel: "image",
    });
  const store = getStorybookMediaTaskStore();
  const claim = await store.claim(identity, {
    nowMs: input.submittedAtMs - 10,
  });
  assert.equal(claim.action, "submit");
  assert.ok(claim.leaseToken);
  assert.equal(
    await store.markAsyncSubmitted(
      identity,
      claim.leaseToken,
      input.taskId,
      { nowMs: input.submittedAtMs }
    ),
    true
  );
  let pollNow = input.submittedAtMs + 3_001;
  for (
    let errorCount = 0;
    errorCount < (input.pollErrorCount ?? 0);
    errorCount += 1
  ) {
    const poll = await store.claim(identity, { nowMs: pollNow });
    assert.equal(poll.action, "poll");
    assert.ok(poll.leaseToken);
    assert.equal(
      await store.markPollFailure(
        identity,
        input.taskId,
        poll.leaseToken,
        {
          terminalTask: false,
          retryableSubmission: false,
          nextRetryAtMs: pollNow + 1,
          reason: "seeded transient poll error",
        },
        { nowMs: pollNow }
      ),
      true
    );
    pollNow += 2;
  }
  return { identity, store };
}

function buildMediaStatusRouteRequest(
  payload: ParentStoryBookMediaStatusRequest,
  options: { attestStory?: boolean } = {}
) {
  const story =
    options.attestStory === false
      ? payload.story
      : (attestAiResult(
          { ...payload.story },
          {
            ...STORYBOOK_PROVENANCE_CONTEXT,
            scopeId: payload.childId,
          }
        ) as unknown as ParentStoryBookResponse);
  return new Request("http://localhost:3000/api/ai/parent-storybook/media-status", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-demo-account-id": "u-parent",
    },
    body: JSON.stringify({
      ...payload,
      story,
    }),
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

test("parent storybook media-status route batches pending vivo images into one group task", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  let imageRequestBody: Record<string, unknown> | null = null;
  const story = buildAudioReadyStory();
  story.providerMeta.imageDelivery = "dynamic-fallback";
  story.providerMeta.diagnostics!.image = {
    ...story.providerMeta.diagnostics!.image,
    jobStatus: "warming",
    pendingSceneCount: 2,
    readySceneCount: 0,
    errorSceneCount: 0,
  };
  story.scenes = story.scenes.map((scene) => ({
    ...scene,
    imageUrl: `/api/ai/parent-storybook/media/fallback-${scene.sceneIndex}`,
    assetRef: `/api/ai/parent-storybook/media/fallback-${scene.sceneIndex}`,
    imageStatus: "fallback",
    imageSourceKind: "dynamic-fallback",
  }));

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    if (url.includes("/api/v1/agents/parent/storybook/media-status")) {
      return new Response(JSON.stringify({ detail: "Not Found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    imageRequestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        code: 0,
        message: "success",
        data: {
          images: [
            { url: "https://cdn.example.com/group-1.png", size: "2048x2048" },
            { url: "https://cdn.example.com/group-2.png", size: "2048x2048" },
          ],
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
        VIVO_APP_ID: "app-id",
        VIVO_APP_KEY: "app-key",
        VIVO_BASE_URL: "https://api-ai.vivo.com.cn",
      },
      async () => {
        const response = await POST(
          buildMediaStatusRouteRequest(
            buildMediaStatusPayload({
              prioritySceneIndices: [1, 2],
              story,
            })
          )
        );
        const body = (await response.json()) as ParentStoryBookResponse;

        assert.equal(response.status, 200);
        assert.equal(calls.filter((url) => url.includes("/api/v1/image_generation")).length, 1);
        assert.equal((imageRequestBody?.parameters as { sequential_image_generation?: string })?.sequential_image_generation, "auto");
        assert.match(String(imageRequestBody?.prompt ?? ""), /exactly 2/u);
        assert.equal(body.providerMeta.imageDelivery, "real");
        assert.equal(body.scenes[0].imageSourceKind, "real");
        assert.equal(body.scenes[1].imageSourceKind, "real");
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("parent storybook media-status route submits DashScope image tasks without waiting for generation", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  const submittedPrompts: string[] = [];
  let taskSequence = 0;
  const story = buildAudioReadyStory();
  story.providerMeta.imageDelivery = "dynamic-fallback";
  story.providerMeta.diagnostics!.image = {
    ...story.providerMeta.diagnostics!.image,
    jobStatus: "warming",
    pendingSceneCount: 2,
    readySceneCount: 0,
    errorSceneCount: 0,
  };
  story.scenes = story.scenes.map((scene) => ({
    ...scene,
    imageUrl: `/api/ai/parent-storybook/media/fallback-${scene.sceneIndex}`,
    assetRef: `/api/ai/parent-storybook/media/fallback-${scene.sceneIndex}`,
    imageStatus: "fallback",
    imageSourceKind: "dynamic-fallback",
  }));

  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    calls.push(url);
    if (url.includes("/api/v1/agents/parent/storybook/media-status")) {
      return Response.json({ detail: "Not Found" }, { status: 404 });
    }
    const requestBody = JSON.parse(
      String(init?.body ?? "{}")
    ) as Record<string, unknown>;
    const requestInput = requestBody.input as
      | Record<string, unknown>
      | undefined;
    submittedPrompts.push(String(requestInput?.prompt ?? ""));
    taskSequence += 1;
    return Response.json({
      request_id: `request-submit-${taskSequence}`,
      output: {
        task_id: `task-image-0000000${taskSequence}`,
        task_status: "PENDING",
      },
    });
  }) as typeof fetch;

  try {
    await withEnv(
      {
        BRAIN_API_BASE_URL: "http://brain.example.com",
        DASHSCOPE_API_KEY: "dashscope-test-key",
        NEXT_PUBLIC_BACKEND_BASE_URL: undefined,
        STORYBOOK_DASHSCOPE_IMAGE_ENDPOINT:
          "https://dashscope.example.com/api/v1/services/aigc/text2image/image-synthesis",
        NEXT_STORYBOOK_IMAGE_PROVIDER: "dashscope",
        STORYBOOK_IMAGE_PROVIDER: "mock",
        VIVO_APP_ID: undefined,
        VIVO_APP_KEY: undefined,
        VIVO_BASE_URL: undefined,
      },
      async () => {
        const response = await POST(
          buildMediaStatusRouteRequest(
            buildMediaStatusPayload({
              prioritySceneIndices: [1, 2],
              story,
            })
          )
        );
        const body = (await response.json()) as ParentStoryBookResponse;
        const firstScene = body.scenes[0] as unknown as Record<
          string,
          unknown
        >;

        assert.equal(response.status, 200);
        assert.equal(calls.length, 2);
        assert.equal(
          calls.filter((url) =>
            url.includes("/api/v1/agents/parent/storybook/media-status")
          ).length,
          0
        );
        assert.equal(
          calls.filter((url) => url.includes("/image-synthesis")).length,
          2
        );
        assert.equal(
          calls.filter((url) => url.includes("/image_generation")).length,
          0
        );
        assert.deepEqual(submittedPrompts, [
          "picture book first page",
          "picture book second page",
        ]);
        assert.equal(firstScene.imageTaskId, undefined);
        assert.equal(firstScene.imageTaskProvider, undefined);
        assert.equal(
          body.providerMeta.diagnostics?.image.requestedProvider,
          "dashscope"
        );
        assert.equal(
          body.providerMeta.diagnostics?.image.jobStatus,
          "warming"
        );
        assert.equal(
          body.providerMeta.diagnostics?.image.errorSceneCount,
          0
        );
        assert.ok(
          (body.providerMeta.diagnostics?.image.retryAfterMs ?? 0) >=
            1_000
        );
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("concurrent replay of a signed taskless story submits each DashScope scene once", async () => {
  const originalFetch = globalThis.fetch;
  const submissionCalls: string[] = [];
  let taskSequence = 0;
  const story = buildAudioReadyStory();
  story.providerMeta.imageDelivery = "dynamic-fallback";
  story.scenes = story.scenes.map((scene) => ({
    ...scene,
    imageStatus: "fallback" as const,
    imageSourceKind: "dynamic-fallback" as const,
  }));

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (!url.includes("/image-synthesis")) {
      throw new Error(`unexpected upstream: ${url}`);
    }
    submissionCalls.push(url);
    taskSequence += 1;
    return Response.json({
      output: {
        task_id: `task-replay-0000000${taskSequence}`,
        task_status: "PENDING",
      },
    });
  }) as typeof fetch;

  try {
    await withEnv(
      {
        DASHSCOPE_API_KEY: "dashscope-test-key",
        NEXT_STORYBOOK_IMAGE_PROVIDER: "dashscope",
        STORYBOOK_DASHSCOPE_IMAGE_ENDPOINT:
          "https://dashscope.example.com/api/v1/services/aigc/text2image/image-synthesis",
        VIVO_APP_ID: undefined,
        VIVO_APP_KEY: undefined,
        VIVO_BASE_URL: undefined,
      },
      async () => {
        const payload = buildMediaStatusPayload({ story });
        const responses = await Promise.all([
          POST(buildMediaStatusRouteRequest(payload)),
          POST(buildMediaStatusRouteRequest(payload)),
        ]);

        assert.deepEqual(
          responses.map((response) => response.status),
          [200, 200]
        );
        assert.equal(submissionCalls.length, story.scenes.length);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("concurrent replay synthesizes each missing story audio scene once", async () => {
  const originalFetch = globalThis.fetch;
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  let connectionCount = 0;
  server.on("connection", (socket) => {
    connectionCount += 1;
    socket.once("message", () => {
      socket.send(
        JSON.stringify({
          error_code: 0,
          data: {
            audio: Buffer.from([0, 0, 1, 0]).toString("base64"),
            status: 2,
          },
        })
      );
    });
  });

  const story = buildProgressiveStory();
  story.providerMeta.imageDelivery = "real";
  story.providerMeta.audioDelivery = "preview-only";
  story.scenes = story.scenes.map((scene) => ({
    ...scene,
    imageUrl: `https://cdn.example.com/story-${scene.sceneIndex}.png`,
    assetRef: `https://cdn.example.com/story-${scene.sceneIndex}.png`,
    imageStatus: "ready" as const,
    imageSourceKind: "real" as const,
    imageProvider: "vivo-story-image",
    audioUrl: null,
    audioRef: null,
    audioStatus: "fallback" as const,
    audioProvider: null,
  }));
  globalThis.fetch = (async () => {
    throw new Error("ready images and local TTS must not use HTTP upstreams");
  }) as typeof fetch;

  try {
    await withEnv(
      {
        VIVO_APP_ID: "test-app-id",
        VIVO_APP_KEY: "test-app-key",
        VIVO_BASE_URL: `http://127.0.0.1:${address.port}`,
      },
      async () => {
        const payload = buildMediaStatusPayload({ story });
        const concurrentBodies = await Promise.all(
          [
            POST(buildMediaStatusRouteRequest(payload)),
            POST(buildMediaStatusRouteRequest(payload)),
          ].map(async (responsePromise) => {
            const response = await responsePromise;
            assert.equal(response.status, 200);
            return (await response.json()) as ParentStoryBookResponse;
          })
        );
        const finalResponse = await POST(
          buildMediaStatusRouteRequest(
            buildMediaStatusPayload({ story: concurrentBodies[0] })
          )
        );
        const finalBody =
          (await finalResponse.json()) as ParentStoryBookResponse;

        assert.equal(finalResponse.status, 200);
        assert.equal(connectionCount, story.scenes.length);
        assert.equal(finalBody.providerMeta.audioDelivery, "real");
        assert.equal(finalBody.providerMeta.audioProvider, "vivo-story-tts");
        for (const scene of finalBody.scenes) {
          assert.equal(scene.audioProvider, "vivo-story-tts");
          assert.match(
            scene.audioUrl ?? "",
            /^\/api\/ai\/parent-storybook\/media\/[a-f0-9]{40}$/u
          );
        }
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const client of server.clients) client.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("DashScope pending task backoff is not reported as provider rate limiting", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  let taskSequence = 0;
  const story = buildAudioReadyStory();
  story.providerMeta.imageDelivery = "dynamic-fallback";
  story.providerMeta.diagnostics!.image = {
    ...story.providerMeta.diagnostics!.image,
    jobStatus: "warming",
    pendingSceneCount: 2,
    readySceneCount: 0,
    errorSceneCount: 0,
  };
  story.scenes = story.scenes.map((scene) => ({
    ...scene,
    imageUrl: `/api/ai/parent-storybook/media/fallback-${scene.sceneIndex}`,
    assetRef: `/api/ai/parent-storybook/media/fallback-${scene.sceneIndex}`,
    imageStatus: "fallback",
    imageSourceKind: "dynamic-fallback",
  }));

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    calls.push(url);
    if (url.includes("/api/v1/agents/parent/storybook/media-status")) {
      return Response.json({ detail: "Not Found" }, { status: 404 });
    }
    taskSequence += 1;
    return Response.json({
      request_id: `request-submit-${taskSequence}`,
      output: {
        task_id: `task-image-1000000${taskSequence}`,
        task_status: "PENDING",
      },
    });
  }) as typeof fetch;

  try {
    await withEnv(
      {
        BRAIN_API_BASE_URL: "http://brain.example.com",
        DASHSCOPE_API_KEY: "dashscope-test-key",
        NEXT_PUBLIC_BACKEND_BASE_URL: undefined,
        STORYBOOK_DASHSCOPE_IMAGE_ENDPOINT:
          "https://dashscope.example.com/api/v1/services/aigc/text2image/image-synthesis",
        NEXT_STORYBOOK_IMAGE_PROVIDER: "dashscope",
        STORYBOOK_IMAGE_PROVIDER: "mock",
        VIVO_APP_ID: undefined,
        VIVO_APP_KEY: undefined,
        VIVO_BASE_URL: undefined,
      },
      async () => {
        const firstResponse = await POST(
          buildMediaStatusRouteRequest(
            buildMediaStatusPayload({ story })
          )
        );
        const firstBody =
          (await firstResponse.json()) as ParentStoryBookResponse;
        const secondResponse = await POST(
          buildMediaStatusRouteRequest(
            buildMediaStatusPayload({ story: firstBody })
          )
        );
        const secondBody =
          (await secondResponse.json()) as ParentStoryBookResponse;

        assert.equal(firstResponse.status, 200);
        assert.equal(secondResponse.status, 200);
        assert.equal(
          calls.filter((url) => url.includes("/image-synthesis")).length,
          2
        );
        assert.equal(
          secondBody.providerMeta.diagnostics?.image.jobStatus,
          "warming"
        );
        assert.equal(
          secondBody.providerMeta.diagnostics?.image.rateLimited,
          false
        );
        assert.equal(
          secondBody.providerMeta.diagnostics?.image.lastErrorReason,
          null
        );
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("DashScope completed image tasks become protected ready story media", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
  const story = buildAudioReadyStory();
  story.providerMeta.imageDelivery = "dynamic-fallback";
  story.providerMeta.diagnostics!.image = {
    ...story.providerMeta.diagnostics!.image,
    jobStatus: "warming",
    pendingSceneCount: 2,
    readySceneCount: 0,
    errorSceneCount: 0,
    retryAfterMs: null,
    nextRetryAtMs: null,
  };
  story.scenes = story.scenes.map((scene) => ({
    ...scene,
    imageUrl: `/api/ai/parent-storybook/media/fallback-${scene.sceneIndex}`,
    assetRef: `/api/ai/parent-storybook/media/fallback-${scene.sceneIndex}`,
    imageStatus: "fallback",
    imageSourceKind: "dynamic-fallback",
  }));
  for (const scene of story.scenes) {
    await seedDashScopeImageTask({
      story,
      sceneIndex: scene.sceneIndex,
      taskId: `task-image-2000000${scene.sceneIndex}`,
      submittedAtMs: Date.now() - 10_000,
    });
  }

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    calls.push(url);
    if (url.includes("/api/v1/agents/parent/storybook/media-status")) {
      return Response.json({ detail: "Not Found" }, { status: 404 });
    }
    if (url.includes("/api/v1/tasks/")) {
      const sceneIndex = url.endsWith("1") ? 1 : 2;
      return Response.json({
        request_id: `request-poll-${sceneIndex}`,
        output: {
          task_id: `task-image-2000000${sceneIndex}`,
          task_status: "SUCCEEDED",
          results: [
            {
              url: `https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/story-${sceneIndex}.png`,
            },
          ],
        },
      });
    }
    return new Response(png, {
      status: 200,
      headers: {
        "content-type": "image/png",
        "content-length": String(png.byteLength),
      },
    });
  }) as typeof fetch;

  try {
    await withEnv(
      {
        BRAIN_API_BASE_URL: "http://brain.example.com",
        DASHSCOPE_API_KEY: "dashscope-test-key",
        NEXT_PUBLIC_BACKEND_BASE_URL: undefined,
        STORYBOOK_DASHSCOPE_IMAGE_ENDPOINT:
          "https://dashscope.example.com/api/v1/services/aigc/text2image/image-synthesis",
        NEXT_STORYBOOK_IMAGE_PROVIDER: "dashscope",
        STORYBOOK_IMAGE_PROVIDER: "mock",
        VIVO_APP_ID: undefined,
        VIVO_APP_KEY: undefined,
        VIVO_BASE_URL: undefined,
      },
      async () => {
        const response = await POST(
          buildMediaStatusRouteRequest(
            buildMediaStatusPayload({ story })
          )
        );
        const body = (await response.json()) as ParentStoryBookResponse;

        assert.equal(response.status, 200);
        assert.equal(calls.length, 4);
        assert.equal(
          calls.filter((url) => url.includes("/api/v1/tasks/")).length,
          2
        );
        assert.equal(
          body.providerMeta.imageProvider,
          "dashscope-qwen-image"
        );
        assert.equal(body.providerMeta.imageDelivery, "real");
        assert.equal(
          body.providerMeta.diagnostics?.image.jobStatus,
          "ready"
        );
        for (const scene of body.scenes) {
          const taskSafeScene = scene as unknown as Record<string, unknown>;
          assert.equal(scene.imageStatus, "ready");
          assert.equal(scene.imageSourceKind, "real");
          assert.equal(scene.imageProvider, "dashscope-qwen-image");
          assert.match(
            scene.imageUrl ?? "",
            /^\/api\/ai\/parent-storybook\/media\/[a-f0-9]{40}$/u
          );
          assert.equal(taskSafeScene.imageTaskId, undefined);
          assert.equal(taskSafeScene.imageTaskProvider, undefined);
        }
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("DashScope tasks younger than 24 hours retain their id when polling is ambiguous", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  const story = buildAudioReadyStory();
  story.providerMeta.imageDelivery = "dynamic-fallback";
  story.scenes = story.scenes.map((scene) => ({
    ...scene,
    imageStatus: "fallback" as const,
    imageSourceKind: "dynamic-fallback" as const,
  }));
  const seededTasks: Array<
    Awaited<ReturnType<typeof seedDashScopeImageTask>>
  > = [];
  for (const scene of story.scenes) {
    seededTasks.push(
      await seedDashScopeImageTask({
        story,
        sceneIndex: scene.sceneIndex,
        taskId: `task-expired-0000000${scene.sceneIndex}`,
        submittedAtMs:
          Date.now() - (24 * 60 * 60 * 1_000 - 60_000),
      })
    );
  }

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    calls.push(url);
    return Response.json({
      request_id: "request-expired-task",
      output: {
        task_id: url.split("/").at(-1),
        task_status: "UNKNOWN",
      },
    });
  }) as typeof fetch;

  try {
    await withEnv(
      {
        DASHSCOPE_API_KEY: "dashscope-test-key",
        NEXT_STORYBOOK_IMAGE_PROVIDER: "dashscope",
        STORYBOOK_DASHSCOPE_IMAGE_ENDPOINT:
          "https://dashscope.example.com/api/v1/services/aigc/text2image/image-synthesis",
        VIVO_APP_ID: undefined,
        VIVO_APP_KEY: undefined,
        VIVO_BASE_URL: undefined,
      },
      async () => {
        const response = await POST(
          buildMediaStatusRouteRequest(
            buildMediaStatusPayload({ story })
          )
        );
        const body = (await response.json()) as ParentStoryBookResponse;

        assert.equal(response.status, 200);
        assert.equal(
          calls.filter((url) => url.includes("/api/v1/tasks/")).length,
          2
        );
        for (const { identity, store } of seededTasks) {
          const taskState = await store.claim(identity);
          assert.equal(taskState.action, "wait");
          assert.match(
            taskState.taskId ?? "",
            /^task-expired-/u
          );
        }
        assert.equal(
          body.providerMeta.diagnostics?.image.jobStatus,
          "partial"
        );
        assert.match(
          body.providerMeta.diagnostics?.image.lastErrorReason ?? "",
          /UNKNOWN/u
        );
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("DashScope tasks at the 24 hour boundary are blocked without automatic resubmission", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  const story = buildAudioReadyStory();
  story.providerMeta.imageDelivery = "dynamic-fallback";
  story.scenes = story.scenes.map((scene) => ({
    ...scene,
    imageStatus: "fallback" as const,
    imageSourceKind: "dynamic-fallback" as const,
  }));
  const seededTasks: Array<
    Awaited<ReturnType<typeof seedDashScopeImageTask>>
  > = [];
  for (const scene of story.scenes) {
    seededTasks.push(
      await seedDashScopeImageTask({
        story,
        sceneIndex: scene.sceneIndex,
        taskId: `task-retained-000000${scene.sceneIndex}`,
        submittedAtMs:
          Date.now() - 24 * 60 * 60 * 1_000 - 1_000,
      })
    );
  }

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    throw new Error("expired tasks must not be polled or resubmitted");
  }) as typeof fetch;

  try {
    await withEnv(
      {
        DASHSCOPE_API_KEY: "dashscope-test-key",
        NEXT_STORYBOOK_IMAGE_PROVIDER: "dashscope",
        STORYBOOK_DASHSCOPE_IMAGE_ENDPOINT:
          "https://dashscope.example.com/api/v1/services/aigc/text2image/image-synthesis",
        VIVO_APP_ID: undefined,
        VIVO_APP_KEY: undefined,
        VIVO_BASE_URL: undefined,
      },
      async () => {
        const response = await POST(
          buildMediaStatusRouteRequest(
            buildMediaStatusPayload({ story })
          )
        );
        const body = (await response.json()) as ParentStoryBookResponse;

        assert.equal(response.status, 200);
        assert.equal(calls.length, 0);
        for (const { identity, store } of seededTasks) {
          const taskState = await store.claim(identity);
          assert.equal(taskState.action, "blocked");
          assert.match(
            taskState.taskId ?? "",
            /^task-retained-/u
          );
        }
        assert.equal(
          body.providerMeta.diagnostics?.image.pendingSceneCount,
          0
        );
        assert.equal(
          body.providerMeta.diagnostics?.image.blockedSceneCount,
          story.scenes.length
        );
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ambiguous DashScope submission failures become terminal instead of polling forever", async () => {
  const originalFetch = globalThis.fetch;
  const story = buildAudioReadyStory();
  story.providerMeta.imageDelivery = "dynamic-fallback";
  story.scenes = story.scenes.map((scene) => ({
    ...scene,
    imageUrl: null,
    assetRef: null,
    imageStatus: "fallback" as const,
    imageSourceKind: "dynamic-fallback" as const,
  }));
  let submissionCount = 0;
  globalThis.fetch = (async () => {
    submissionCount += 1;
    return Response.json(
      { code: "InternalError", message: "outcome unknown" },
      { status: 503 }
    );
  }) as typeof fetch;

  try {
    await withEnv(
      {
        DASHSCOPE_API_KEY: "dashscope-test-key",
        NEXT_STORYBOOK_IMAGE_PROVIDER: "dashscope",
        STORYBOOK_DASHSCOPE_IMAGE_ENDPOINT:
          "https://dashscope.example.com/api/v1/services/aigc/text2image/image-synthesis",
        VIVO_APP_ID: undefined,
        VIVO_APP_KEY: undefined,
        VIVO_BASE_URL: undefined,
      },
      async () => {
        const firstResponse = await POST(
          buildMediaStatusRouteRequest(
            buildMediaStatusPayload({ story })
          )
        );
        const firstBody =
          (await firstResponse.json()) as ParentStoryBookResponse;
        const secondResponse = await POST(
          buildMediaStatusRouteRequest(
            buildMediaStatusPayload({ story: firstBody })
          )
        );
        const secondBody =
          (await secondResponse.json()) as ParentStoryBookResponse;

        assert.equal(firstResponse.status, 200);
        assert.equal(secondResponse.status, 200);
        assert.equal(submissionCount, story.scenes.length);
        assert.equal(
          firstBody.providerMeta.diagnostics?.image.jobStatus,
          "error"
        );
        assert.equal(
          firstBody.providerMeta.diagnostics?.image.pendingSceneCount,
          0
        );
        assert.equal(
          firstBody.providerMeta.diagnostics?.image.blockedSceneCount,
          story.scenes.length
        );
        assert.equal(
          secondBody.providerMeta.diagnostics?.image.pendingSceneCount,
          0
        );
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("DashScope image tasks retain their id after 20 consecutive ambiguous poll errors", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  const story = buildAudioReadyStory();
  story.providerMeta.imageDelivery = "mixed";
  const readyMediaKey = "b".repeat(40);
  story.scenes[0] = {
    ...story.scenes[0],
    imageUrl: `/api/ai/parent-storybook/media/${readyMediaKey}`,
    assetRef: `/api/ai/parent-storybook/media/${readyMediaKey}`,
    imageStatus: "ready",
    imageSourceKind: "real",
    imageProvider: "dashscope-qwen-image",
  };
  story.scenes[1] = {
    ...story.scenes[1],
    imageStatus: "fallback",
    imageSourceKind: "dynamic-fallback",
  };
  const seededTask = await seedDashScopeImageTask({
    story,
    sceneIndex: 2,
    taskId: "task-retry-12345678",
    submittedAtMs: Date.now() - 10_000,
    pollErrorCount: 19,
  });

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    calls.push(url);
    return Response.json(
      { code: "InternalError", message: "temporary failure" },
      { status: 503 }
    );
  }) as typeof fetch;

  try {
    await withEnv(
      {
        DASHSCOPE_API_KEY: "dashscope-test-key",
        NEXT_STORYBOOK_IMAGE_PROVIDER: "dashscope",
        STORYBOOK_DASHSCOPE_IMAGE_ENDPOINT:
          "https://dashscope.example.com/api/v1/services/aigc/text2image/image-synthesis",
        VIVO_APP_ID: undefined,
        VIVO_APP_KEY: undefined,
        VIVO_BASE_URL: undefined,
      },
      async () => {
        const response = await POST(
          buildMediaStatusRouteRequest(
            buildMediaStatusPayload({
              prioritySceneIndices: [2],
              story,
            })
          )
        );
        const body = (await response.json()) as ParentStoryBookResponse;

        assert.equal(response.status, 200);
        assert.equal(calls.length, 1);
        assert.match(calls[0], /\/api\/v1\/tasks\/task-retry-12345678$/u);
        const taskState = await seededTask.store.claim(seededTask.identity);
        assert.equal(taskState.action, "wait");
        assert.equal(taskState.taskId, "task-retry-12345678");
        assert.equal(taskState.pollErrorCount, 20);
        assert.match(
          body.providerMeta.diagnostics?.image.lastErrorReason ?? "",
          /InternalError/u
        );
        assert.equal(
          body.providerMeta.diagnostics?.image.pendingSceneCount,
          1
        );
        assert.equal(
          body.providerMeta.diagnostics?.image.blockedSceneCount,
          0
        );
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("parent storybook media-status route backs off vivo image rate limits", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  const startedAt = Date.now();
  const story = buildAudioReadyStory();

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    if (url.includes("/api/v1/agents/parent/storybook/media-status")) {
      return new Response(JSON.stringify({ detail: "Not Found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({ code: 1003, msg: "Rate limit exceeded for model Doubao-Seedream-4.5" }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    await withEnv(
      {
        BRAIN_API_BASE_URL: "http://brain.example.com",
        NEXT_PUBLIC_BACKEND_BASE_URL: undefined,
        VIVO_APP_ID: "app-id",
        VIVO_APP_KEY: "app-key",
        VIVO_BASE_URL: "https://api-ai.vivo.com.cn",
        STORYBOOK_IMAGE_RETRY_BACKOFF_MS: "5000",
      },
      async () => {
        const response = await POST(
          buildMediaStatusRouteRequest(
            buildMediaStatusPayload({
              story,
            })
          )
        );
        const body = (await response.json()) as ParentStoryBookResponse;

        assert.equal(response.status, 200);
        assert.equal(calls.length, 2);
        assert.match(calls[1], /\/api\/v1\/image_generation/u);
        assert.equal(body.providerMeta.imageDelivery, "mixed");
        assert.equal(body.providerMeta.audioDelivery, "real");
        assert.equal(body.providerMeta.diagnostics?.image.rateLimited, true);
        assert.equal(body.providerMeta.diagnostics?.image.retryAfterMs, 5000);
        assert.ok((body.providerMeta.diagnostics?.image.nextRetryAtMs ?? 0) >= startedAt + 5000);
        assert.match(body.providerMeta.diagnostics?.image.lastErrorReason ?? "", /1003/u);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("parent storybook media-status route honors vivo image retry backoff", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  const nextRetryAtMs = Date.now() + 60_000;
  const baseStory = buildProgressiveStory();
  const baseDiagnostics = baseStory.providerMeta.diagnostics!;
  const story = buildAudioReadyStory({
    providerMeta: {
      ...baseStory.providerMeta,
      diagnostics: {
        ...baseDiagnostics,
        image: {
          ...baseDiagnostics.image,
          lastErrorStage: "next-vivo-image",
          lastErrorReason: "vivo image generation failed: 1003 Rate limit exceeded",
          retryAfterMs: 60_000,
          nextRetryAtMs,
          rateLimited: true,
        },
      },
    },
  });

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    if (url.includes("/api/v1/image_generation")) {
      throw new Error("image generation should wait for retry backoff");
    }
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
        VIVO_APP_ID: "app-id",
        VIVO_APP_KEY: "app-key",
        VIVO_BASE_URL: "https://api-ai.vivo.com.cn",
      },
      async () => {
        const response = await POST(
          buildMediaStatusRouteRequest(
            buildMediaStatusPayload({
              story,
            })
          )
        );
        const body = (await response.json()) as ParentStoryBookResponse;

        assert.equal(response.status, 200);
        assert.equal(calls.length, 1);
        assert.equal(body.providerMeta.imageDelivery, "mixed");
        assert.equal(body.providerMeta.diagnostics?.image.pendingSceneCount, 1);
        assert.equal(body.providerMeta.diagnostics?.image.errorSceneCount, 0);
        assert.equal(body.providerMeta.diagnostics?.image.rateLimited, true);
        assert.equal(body.providerMeta.diagnostics?.image.nextRetryAtMs, nextRetryAtMs);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("parent storybook media-status route clears an expired rate-limit diagnostic after recovery", async () => {
  const originalFetch = globalThis.fetch;
  const story = buildAudioReadyStory();
  story.scenes[0].imageProvider = "vivo-story-image";
  story.providerMeta.diagnostics!.image = {
    ...story.providerMeta.diagnostics!.image,
    lastErrorStage: "next-vivo-image",
    lastErrorReason: "vivo image generation failed: 1003 Rate limit exceeded",
    retryAfterMs: 5_000,
    nextRetryAtMs: Date.now() - 1_000,
    rateLimited: true,
  };

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (url.includes("/api/v1/agents/parent/storybook/media-status")) {
      return Response.json({ detail: "Not Found" }, { status: 404 });
    }
    assert.match(url, /\/api\/v1\/image_generation/u);
    return Response.json({
      code: 0,
      data: {
        images: [{ url: "https://cdn.example.com/recovered-scene.png" }],
      },
    });
  }) as typeof fetch;

  try {
    await withEnv(
      {
        BRAIN_API_BASE_URL: "http://brain.example.com",
        VIVO_APP_ID: "app-id",
        VIVO_APP_KEY: "app-key",
        VIVO_BASE_URL: "https://api-ai.vivo.com.cn",
      },
      async () => {
        const response = await POST(
          buildMediaStatusRouteRequest(
            buildMediaStatusPayload({ story })
          )
        );
        const body = (await response.json()) as ParentStoryBookResponse;

        assert.equal(response.status, 200);
        assert.equal(body.providerMeta.imageDelivery, "real");
        assert.equal(body.providerMeta.diagnostics?.image.rateLimited, false);
        assert.equal(
          body.providerMeta.diagnostics?.image.lastErrorReason,
          null
        );
        assert.equal(
          body.providerMeta.diagnostics?.image.nextRetryAtMs,
          null
        );
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("parent storybook media-status route never forwards or polls tasks from an unsigned continuation", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  const unsignedStory = buildAudioReadyStory();
  const forgedScene = unsignedStory.scenes[1] as unknown as Record<
    string,
    unknown
  >;
  forgedScene.imageTaskId = "forged-task-12345678";
  forgedScene.imageTaskProvider = "dashscope-qwen-image";
  forgedScene.imageTaskSubmittedAtMs = Date.now();

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    calls.push(url);
    throw new Error("unsigned continuation must not reach an upstream");
  }) as typeof fetch;

  try {
    await withEnv(
      {
        BRAIN_API_BASE_URL: "http://brain.example.com",
        DASHSCOPE_API_KEY: "dashscope-test-key",
        NEXT_STORYBOOK_IMAGE_PROVIDER: "dashscope",
        NEXT_PUBLIC_BACKEND_BASE_URL: undefined,
        STORYBOOK_DASHSCOPE_IMAGE_ENDPOINT:
          "https://dashscope.example.com/api/v1/services/aigc/text2image/image-synthesis",
        VIVO_APP_ID: undefined,
        VIVO_APP_KEY: undefined,
        VIVO_BASE_URL: undefined,
      },
      async () => {
        const response = await POST(
          buildMediaStatusRouteRequest(
            buildMediaStatusPayload({ story: unsignedStory }),
            {
            attestStory: false,
            }
          )
        );
        const body = (await response.json()) as ParentStoryBookResponse;

        assert.equal(response.status, 200);
        assert.deepEqual(calls, []);
        assert.equal(
          body.providerMeta.provider,
          UNVERIFIED_AI_PROVIDER
        );
        assert.notEqual(body.providerMeta.textDelivery, "real");
        assert.equal(body.providerMeta.realProvider, false);
        const taskSafeScene = body.scenes[1] as unknown as Record<
          string,
          unknown
        >;
        assert.equal(taskSafeScene.imageTaskId, undefined);
        assert.equal(taskSafeScene.imageTaskProvider, undefined);
        assert.equal(
          verifyAiResultAttestation(body, STORYBOOK_PROVENANCE_CONTEXT),
          false
        );
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
