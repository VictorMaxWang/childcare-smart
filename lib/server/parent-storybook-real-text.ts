import "server-only";

import type {
  ParentStoryBookRequest,
  ParentStoryBookResponse,
  ParentStoryBookScene,
} from "@/lib/ai/types";
import {
  DashscopeChatProviderError,
  isDashscopeChatConfigured,
  requestDashscopeChat,
} from "@/lib/providers/dashscope/dashscope-chat-provider";
import {
  getVivoEnv,
  requestVivoChat,
  VivoProviderError,
} from "@/lib/providers/vivo";

type StoryTextScene = {
  sceneTitle: string;
  sceneText: string;
  audioScript?: string;
  imagePrompt?: string;
  voiceStyle?: string;
  highlightSource?: string;
};

type StoryTextPayload = {
  title: string;
  summary: string;
  moral: string;
  parentNote: string;
  scenes: StoryTextScene[];
};

const VIVO_STORY_TEXT_MAX_ATTEMPTS = 2;
const DASHSCOPE_STORY_TEXT_MAX_ATTEMPTS = 1;
const MIN_STORY_TEXT_PROVIDER_START_BUDGET_MS = 5_000;
const RETRYABLE_STORY_TEXT_FALLBACK_REASONS = new Set([
  "provider-invalid-json",
  "provider-invalid-page-count",
  "provider-fixed-demo-content",
]);

export class ParentStoryBookRealTextError extends Error {
  fallbackReason: string;
  statusCode: number;
  attemptCount: number;
  attemptedProviders: string[];
  provider: string | null;
  providerHttpStatus: number | null;
  failureKind: string | null;

  constructor(
    message: string,
    options: {
      fallbackReason: string;
      statusCode?: number;
      attemptCount?: number;
      attemptedProviders?: string[];
      provider?: string | null;
      providerHttpStatus?: number | null;
      failureKind?: string | null;
    }
  ) {
    super(message);
    this.name = "ParentStoryBookRealTextError";
    this.fallbackReason = options.fallbackReason;
    this.statusCode = options.statusCode ?? 503;
    this.attemptCount = options.attemptCount ?? 1;
    this.attemptedProviders = options.attemptedProviders ?? [];
    this.provider = options.provider ?? null;
    this.providerHttpStatus = options.providerHttpStatus ?? null;
    this.failureKind = options.failureKind ?? null;
  }
}

function normalizeText(value: unknown) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function compactJson(value: unknown) {
  return JSON.stringify(value, null, 0);
}

function compactTextList(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return normalizeText(item).slice(0, 160);
    }
    const record = item as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(record)
        .filter(([, entryValue]) => {
          const valueType = typeof entryValue;
          return (
            entryValue === null ||
            valueType === "string" ||
            valueType === "number" ||
            valueType === "boolean"
          );
        })
        .slice(0, 8)
        .map(([key, entryValue]) => [
          key,
          typeof entryValue === "string" ? normalizeText(entryValue).slice(0, 160) : entryValue,
        ])
    );
  });
}

function compactRecentDetails(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record).map(([key, entryValue]) => [key, compactTextList(entryValue, 3)])
  );
}

function compactHighlights(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return normalizeText(item).slice(0, 160);
    const record = item as Record<string, unknown>;
    return {
      kind: normalizeText(record.kind).slice(0, 40),
      title: normalizeText(record.title).slice(0, 80),
      detail: normalizeText(record.detail).slice(0, 180),
      source: normalizeText(record.source).slice(0, 80),
    };
  });
}

function compactOptionalObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record)
      .filter(([, entryValue]) => {
        const valueType = typeof entryValue;
        return (
          entryValue === null ||
          valueType === "string" ||
          valueType === "number" ||
          valueType === "boolean" ||
          Array.isArray(entryValue)
        );
      })
      .slice(0, 10)
      .map(([key, entryValue]) => [
        key,
        Array.isArray(entryValue)
          ? compactTextList(entryValue, 3)
          : typeof entryValue === "string"
            ? normalizeText(entryValue).slice(0, 220)
            : entryValue,
      ])
  );
}

function stripJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "")
    .trim();
}

function extractJsonObject(value: string): Record<string, unknown> {
  const text = stripJsonFence(value);
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Try extracting the first object from provider text below.
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new ParentStoryBookRealTextError("vivo storybook text response was not JSON", {
      fallbackReason: "provider-invalid-json",
      statusCode: 502,
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new ParentStoryBookRealTextError("vivo storybook text response contained invalid JSON", {
      fallbackReason: "provider-invalid-json",
      statusCode: 502,
    });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ParentStoryBookRealTextError("vivo storybook text response was not an object", {
      fallbackReason: "provider-invalid-json",
      statusCode: 502,
    });
  }
  return parsed as Record<string, unknown>;
}

function containsFixedDemo(value: unknown) {
  const text = compactJson(value);
  return (
    text.includes("林小雨的一小步勇敢") ||
    text.includes("lin-xiaoyu-one-small-brave-step") ||
    text.includes("Lin Xiaoyu")
  );
}

function asSceneArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (scene): scene is Record<string, unknown> =>
      Boolean(scene) && typeof scene === "object" && !Array.isArray(scene)
  );
}

function readSceneText(scene: Record<string, unknown>, key: string, fallbackKey?: string) {
  return normalizeText(scene[key] ?? (fallbackKey ? scene[fallbackKey] : undefined));
}

function validateStoryTextPayload(
  raw: Record<string, unknown>,
  expectedSceneCount: number
): StoryTextPayload {
  if (containsFixedDemo(raw)) {
    throw new ParentStoryBookRealTextError("vivo storybook text returned fixed demo content", {
      fallbackReason: "provider-fixed-demo-content",
      statusCode: 502,
    });
  }

  const rawScenes = asSceneArray(raw.scenes);
  if (rawScenes.length !== expectedSceneCount) {
    throw new ParentStoryBookRealTextError("vivo storybook text returned wrong page count", {
      fallbackReason: "provider-invalid-page-count",
      statusCode: 502,
    });
  }

  const scenes = rawScenes.map((scene, index) => {
    const sceneTitle = readSceneText(scene, "sceneTitle", "scene_title");
    const sceneText = readSceneText(scene, "sceneText", "scene_text");
    if (!sceneTitle || !sceneText) {
      throw new ParentStoryBookRealTextError(`vivo storybook text scene ${index + 1} is incomplete`, {
        fallbackReason: "provider-invalid-json",
        statusCode: 502,
      });
    }
    return {
      sceneTitle,
      sceneText,
      audioScript: readSceneText(scene, "audioScript", "audio_script"),
      imagePrompt: readSceneText(scene, "imagePrompt", "image_prompt"),
      voiceStyle: readSceneText(scene, "voiceStyle", "voice_style"),
      highlightSource: readSceneText(scene, "highlightSource", "highlight_source"),
    };
  });

  return {
    title: normalizeText(raw.title),
    summary: normalizeText(raw.summary),
    moral: normalizeText(raw.moral),
    parentNote: normalizeText(raw.parentNote ?? raw.parent_note),
    scenes,
  };
}

function buildStoryTextPrompt(input: {
  payload: ParentStoryBookRequest;
  story: ParentStoryBookResponse;
  expectedSceneCount: number;
}) {
  const { payload, story, expectedSceneCount } = input;
  const context = {
    childId: payload.childId,
    child: payload.snapshot.child,
    snapshotSummary: payload.snapshot.summary,
    recentDetails: compactRecentDetails(payload.snapshot.recentDetails),
    generationMode: payload.generationMode,
    manualTheme: payload.manualTheme,
    manualPrompt: payload.manualPrompt,
    pageCount: expectedSceneCount,
    goalKeywords: payload.goalKeywords,
    stylePreset: payload.stylePreset,
    styleMode: payload.styleMode,
    stylePrompt: normalizeText(payload.stylePrompt).slice(0, 260),
    customStylePrompt: normalizeText(payload.customStylePrompt).slice(0, 180),
    customStyleNegativePrompt: normalizeText(payload.customStyleNegativePrompt).slice(0, 180),
    highlightCandidates: compactHighlights(payload.highlightCandidates),
    latestInterventionCard: compactOptionalObject(payload.latestInterventionCard),
    latestConsultation: compactOptionalObject(payload.latestConsultation),
    ruleDraft: {
      title: story.title,
      summary: story.summary,
      parentNote: story.parentNote,
      sceneTitles: story.scenes.map((scene) => scene.sceneTitle),
      sceneTexts: story.scenes.map((scene) => scene.sceneText),
    },
  };
  const schema = {
    title: "string",
    summary: "string",
    moral: "string",
    parentNote: "string",
    scenes: [
      {
        sceneTitle: "string",
        sceneText: "string",
        audioScript: "string",
        imagePrompt: "string",
        voiceStyle: "gentle-bedtime | warm-storytelling | calm-encouraging",
        highlightSource: "string",
      },
    ],
  };

  return [
    "Generate an original childcare picture book in Simplified Chinese.",
    "Return strict JSON only. Do not return Markdown, comments, or code fences.",
    `The JSON must contain exactly ${expectedSceneCount} scenes.`,
    "Keep the output compact. Each sceneText should be 35-70 Simplified Chinese characters, warm, concrete, age-appropriate for a 3-6 year old, and different when theme, style, child, or page count changes.",
    "Do not use the fixed Lin Xiaoyu demo story or its title.",
    "Use the child context, selected theme, page count, style, teacher observations, growth highlights, parent feedback, intervention card, and consultation summary when present.",
    `JSON schema: ${compactJson(schema)}`,
    `Input context: ${compactJson(context)}`,
  ].join("\n");
}

function mergeScenesWithRealText(
  originalScenes: ParentStoryBookScene[],
  generatedScenes: StoryTextScene[]
): ParentStoryBookScene[] {
  return originalScenes.map((scene, index) => {
    const generated = generatedScenes[index];
    return {
      ...scene,
      sceneTitle: generated.sceneTitle || scene.sceneTitle,
      sceneText: generated.sceneText || scene.sceneText,
      audioScript: generated.audioScript || generated.sceneText || scene.audioScript,
      imagePrompt: generated.imagePrompt || scene.imagePrompt,
      voiceStyle: generated.voiceStyle || scene.voiceStyle,
      highlightSource: generated.highlightSource || scene.highlightSource,
      captionTiming: scene.captionTiming
        ? {
            ...scene.captionTiming,
            segmentTexts: [generated.audioScript || generated.sceneText || scene.audioScript],
          }
        : scene.captionTiming,
    };
  });
}

type StoryTextErrorClassification = {
  fallbackReason: string;
  statusCode: number;
  provider: string | null;
  providerHttpStatus: number | null;
  failureKind: string | null;
};

function classifyStoryTextError(
  error: unknown,
  context?: {
    signal?: AbortSignal;
    deadlineAtMs?: number;
  }
): StoryTextErrorClassification {
  if (
    typeof context?.deadlineAtMs === "number" &&
    Date.now() >= context.deadlineAtMs
  ) {
    return {
      fallbackReason: "provider-deadline-exceeded",
      statusCode: 504,
      provider: null,
      providerHttpStatus: null,
      failureKind: "request-timeout",
    };
  }
  if (context?.signal?.aborted) {
    return {
      fallbackReason: "provider-request-cancelled",
      statusCode: 408,
      provider: null,
      providerHttpStatus: null,
      failureKind: "request-cancelled",
    };
  }
  if (error instanceof ParentStoryBookRealTextError) {
    return {
      fallbackReason: error.fallbackReason,
      statusCode: error.statusCode,
      provider: error.provider,
      providerHttpStatus: error.providerHttpStatus,
      failureKind: error.failureKind,
    };
  }
  if (error instanceof VivoProviderError) {
    if (error.failureKind === "request-cancelled") {
      return {
        fallbackReason: "provider-request-cancelled",
        statusCode: 408,
        provider: "vivo-chat",
        providerHttpStatus: error.httpStatus ?? null,
        failureKind: error.failureKind,
      };
    }
    if (error.failureKind === "request-timeout") {
      return {
        fallbackReason: "provider-deadline-exceeded",
        statusCode: 504,
        provider: "vivo-chat",
        providerHttpStatus: error.httpStatus ?? null,
        failureKind: error.failureKind,
      };
    }
    if (error.status === "missing-env") {
      return {
        fallbackReason: "provider-unconfigured",
        statusCode: 503,
        provider: "vivo-chat",
        providerHttpStatus: error.httpStatus ?? null,
        failureKind: "missing-env",
      };
    }
    if (error.httpStatus === 401 || error.httpStatus === 403) {
      return {
        fallbackReason: "provider-authentication-error",
        statusCode: 502,
        provider: "vivo-chat",
        providerHttpStatus: error.httpStatus,
        failureKind: "authentication",
      };
    }
    if (error.httpStatus === 429) {
      return {
        fallbackReason: "provider-rate-limited",
        statusCode: 503,
        provider: "vivo-chat",
        providerHttpStatus: error.httpStatus,
        failureKind: "rate-limited",
      };
    }
    return {
      fallbackReason: "provider-response-error",
      statusCode: 502,
      provider: "vivo-chat",
      providerHttpStatus: error.httpStatus ?? null,
      failureKind: error.failureKind ?? "provider-response",
    };
  }
  if (error instanceof DashscopeChatProviderError) {
    if (error.failureKind === "request-cancelled") {
      return {
        fallbackReason: "provider-request-cancelled",
        statusCode: 408,
        provider: "dashscope",
        providerHttpStatus: error.httpStatus ?? null,
        failureKind: error.failureKind,
      };
    }
    if (error.failureKind === "request-timeout") {
      return {
        fallbackReason: "provider-deadline-exceeded",
        statusCode: 504,
        provider: "dashscope",
        providerHttpStatus: error.httpStatus ?? null,
        failureKind: error.failureKind,
      };
    }
    if (error.failureKind === "missing-env") {
      return {
        fallbackReason: "provider-unconfigured",
        statusCode: 503,
        provider: "dashscope",
        providerHttpStatus: null,
        failureKind: error.failureKind,
      };
    }
    if (error.failureKind === "authentication") {
      return {
        fallbackReason: "provider-authentication-error",
        statusCode: 502,
        provider: "dashscope",
        providerHttpStatus: error.httpStatus ?? null,
        failureKind: error.failureKind,
      };
    }
    if (error.failureKind === "rate-limited") {
      return {
        fallbackReason: "provider-rate-limited",
        statusCode: 503,
        provider: "dashscope",
        providerHttpStatus: error.httpStatus ?? null,
        failureKind: error.failureKind,
      };
    }
    return {
      fallbackReason: "provider-response-error",
      statusCode: 502,
      provider: "dashscope",
      providerHttpStatus: error.httpStatus ?? null,
      failureKind: error.failureKind,
    };
  }
  return {
    fallbackReason: "provider-response-error",
    statusCode: 502,
    provider: null,
    providerHttpStatus: null,
    failureKind: "provider-response",
  };
}

function shouldRetryStoryTextError(error: unknown) {
  return (
    error instanceof ParentStoryBookRealTextError &&
    RETRYABLE_STORY_TEXT_FALLBACK_REASONS.has(error.fallbackReason)
  );
}

function shouldStopStoryTextFailover(
  error: unknown,
  context: {
    signal?: AbortSignal;
    deadlineAtMs?: number;
  }
) {
  return (
    Boolean(context.signal?.aborted) ||
    (
      typeof context.deadlineAtMs === "number" &&
      context.deadlineAtMs <= Date.now()
    ) ||
    (
      error instanceof VivoProviderError &&
      (
        error.failureKind === "request-cancelled" ||
        error.failureKind === "request-timeout" ||
        error.failureKind === "transport"
      )
    )
  );
}

function hasStoryTextProviderStartBudget(deadlineAtMs?: number) {
  return (
    typeof deadlineAtMs !== "number" ||
    deadlineAtMs - Date.now() >= MIN_STORY_TEXT_PROVIDER_START_BUDGET_MS
  );
}

function shouldFailOverToDashscope(
  error: unknown,
  context: {
    signal?: AbortSignal;
    deadlineAtMs?: number;
  }
) {
  if (
    !isDashscopeChatConfigured() ||
    !hasStoryTextProviderStartBudget(context.deadlineAtMs) ||
    shouldStopStoryTextFailover(error, context)
  ) {
    return false;
  }

  // 仅在上游明确拒绝、限流、返回错误或本地未配置时切换。
  // 连接中断的结果可能不确定，自动改投另一供应商会造成重复付费。
  return (
    error instanceof VivoProviderError &&
    (
      error.status === "missing-env" ||
      error.failureKind === "authentication" ||
      error.failureKind === "rate-limited" ||
      error.failureKind === "provider-response"
    )
  );
}

export function isParentStoryBookRealText(story: ParentStoryBookResponse) {
  const textProvider = story.providerMeta.textProvider ?? story.providerMeta.provider;
  return (
    story.providerMeta.textDelivery === "real" &&
    /(?:vivo|qwen|dashscope|llm|ai)/iu.test(textProvider ?? "") &&
    !story.fallbackReason &&
    !story.providerMeta.fallbackReason
  );
}

export function shouldRequireNextRealStoryText(story: ParentStoryBookResponse) {
  if (isParentStoryBookRealText(story)) return false;
  const textProvider = story.providerMeta.textProvider ?? story.providerMeta.provider ?? "";
  const fallbackReason =
    story.fallbackReason ??
    story.providerMeta.fallbackReason ??
    story.providerMeta.diagnostics?.brain?.fallbackReason;
  return (
    story.providerMeta.textDelivery !== "real" ||
    /(?:mock|fallback|rule|parent-storybook-rule)/iu.test(textProvider) ||
    Boolean(fallbackReason)
  );
}

function buildRealStoryTextResponse(input: {
  story: ParentStoryBookResponse;
  generated: StoryTextPayload;
  expectedSceneCount: number;
  provider: "vivo-chat" | "dashscope";
  model: string | null;
  attemptCount: number;
  attemptedProviders: string[];
  elapsedMs: number;
}) {
  const diagnostics = input.story.providerMeta.diagnostics;
  return {
    ...input.story,
    title: input.generated.title || input.story.title,
    summary: input.generated.summary || input.story.summary,
    moral: input.generated.moral || input.story.moral,
    parentNote: input.generated.parentNote || input.story.parentNote,
    source: input.provider === "vivo-chat" ? "vivo" : "dashscope",
    fallback: false,
    fallbackReason: null,
    providerMeta: {
      ...input.story.providerMeta,
      provider: input.provider,
      mode: input.story.providerMeta.mode === "live" ? "live" : "mixed",
      textProvider: input.provider,
      textDelivery: "real",
      textAttemptCount: input.attemptCount,
      fallbackReason: null,
      realProvider: true,
      sceneCount: input.expectedSceneCount,
      diagnostics: diagnostics
        ? {
            ...diagnostics,
            text: {
              requestedProvider: "vivo-chat+dashscope",
              resolvedProvider: input.provider,
              attemptedProviders: [...input.attemptedProviders],
              attemptCount: input.attemptCount,
              fallbackReason: null,
              statusCode: null,
              failureKind: null,
              model: input.model,
              elapsedMs: input.elapsedMs,
            },
          }
        : diagnostics,
    },
    scenes: mergeScenesWithRealText(
      input.story.scenes,
      input.generated.scenes
    ),
  } satisfies ParentStoryBookResponse;
}

export async function enhanceParentStoryBookWithRealText(input: {
  payload: ParentStoryBookRequest;
  story: ParentStoryBookResponse;
  signal?: AbortSignal;
  deadlineAtMs?: number;
}): Promise<ParentStoryBookResponse> {
  const startedAt = Date.now();
  const expectedSceneCount = input.story.scenes.length || input.payload.pageCount || 6;
  const prompt = buildStoryTextPrompt({
    payload: input.payload,
    story: input.story,
    expectedSceneCount,
  });

  let lastError: unknown = null;
  let attemptCount = 0;
  const attemptedProviders: string[] = [];
  for (let attempt = 0; attempt < VIVO_STORY_TEXT_MAX_ATTEMPTS; attempt += 1) {
    try {
      // 只有已收到但结构不合约的模型响应才重试；传输结果不明时禁止再次付费调用。
      const isRetry = attempt > 0;
      const result = await requestVivoChat({
        taskType: "parent-storybook-real-text",
        temperature: isRetry ? 0.1 : 0.35,
        maxTokens: expectedSceneCount >= 8 ? 2200 : 1800,
        signal: input.signal,
        // Vivo 是首选文本供应商，未配置备用供应商时必须保留完整剩余预算。
        deadlineAtMs: input.deadlineAtMs,
        onRequestStart: () => {
          attemptCount += 1;
          if (!attemptedProviders.includes("vivo-chat")) {
            attemptedProviders.push("vivo-chat");
          }
        },
        messages: [
          {
            role: "system",
            content: isRetry
              ? "You are a professional early-childhood picture-book writer. Return one valid JSON object only, with exactly the requested number of scenes."
              : "You are a professional early-childhood picture-book writer. You output valid JSON only.",
          },
          {
            role: "user",
            content: isRetry
              ? `${prompt}\nThis is a structured-output retry. Return no prose outside the JSON object.`
              : prompt,
          },
        ],
      });
      const parsed = extractJsonObject(result.text);
      const generated = validateStoryTextPayload(parsed, expectedSceneCount);
      const elapsedMs = Date.now() - startedAt;
      return buildRealStoryTextResponse({
        story: input.story,
        generated,
        expectedSceneCount,
        provider: "vivo-chat",
        model: result.model || getVivoEnv().llmModel,
        attemptCount,
        attemptedProviders,
        elapsedMs,
      });
    } catch (error) {
      const providerError =
        error instanceof ParentStoryBookRealTextError && !error.provider
          ? new ParentStoryBookRealTextError(error.message, {
              fallbackReason: error.fallbackReason,
              statusCode: error.statusCode,
              attemptCount,
              attemptedProviders: [...attemptedProviders],
              provider: "vivo-chat",
              failureKind: "invalid-structured-output",
            })
          : error;
      lastError = providerError;
      if (shouldStopStoryTextFailover(providerError, input)) {
        break;
      }
      if (
        attempt >= VIVO_STORY_TEXT_MAX_ATTEMPTS - 1 ||
        !shouldRetryStoryTextError(providerError)
      ) {
        break;
      }
    }
  }

  if (
    shouldFailOverToDashscope(lastError, input)
  ) {
    for (
      let attempt = 0;
      attempt < DASHSCOPE_STORY_TEXT_MAX_ATTEMPTS;
      attempt += 1
    ) {
      try {
        const result = await requestDashscopeChat({
          temperature: 0.2,
          maxTokens: expectedSceneCount >= 8 ? 2200 : 1800,
          signal: input.signal,
          deadlineAtMs: input.deadlineAtMs,
          onRequestStart: () => {
            attemptCount += 1;
            if (!attemptedProviders.includes("dashscope")) {
              attemptedProviders.push("dashscope");
            }
          },
          messages: [
            {
              role: "system",
              content:
                "You are a professional early-childhood picture-book writer. Return one valid JSON object only, with exactly the requested number of scenes.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
        });
        const parsed = extractJsonObject(result.text);
        const generated = validateStoryTextPayload(
          parsed,
          expectedSceneCount
        );
        return buildRealStoryTextResponse({
          story: input.story,
          generated,
          expectedSceneCount,
          provider: "dashscope",
          model: result.model,
          attemptCount,
          attemptedProviders,
          elapsedMs: Date.now() - startedAt,
        });
      } catch (error) {
        lastError =
          error instanceof ParentStoryBookRealTextError && !error.provider
            ? new ParentStoryBookRealTextError(error.message, {
                fallbackReason: error.fallbackReason,
                statusCode: error.statusCode,
                attemptCount,
                attemptedProviders: [...attemptedProviders],
                provider: "dashscope",
                failureKind: "invalid-structured-output",
              })
            : error;
        if (shouldStopStoryTextFailover(lastError, input)) break;
      }
    }
  }

  const classified = classifyStoryTextError(lastError, {
    signal: input.signal,
    deadlineAtMs: input.deadlineAtMs,
  });
  throw new ParentStoryBookRealTextError(
    lastError instanceof Error
      ? lastError.message
      : "storybook text providers failed",
    {
      ...classified,
      attemptCount,
      attemptedProviders,
      provider:
        classified.provider ??
        attemptedProviders[attemptedProviders.length - 1] ??
        null,
    }
  );
}
