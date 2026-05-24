import "server-only";

import type {
  ParentStoryBookRequest,
  ParentStoryBookResponse,
  ParentStoryBookScene,
} from "@/lib/ai/types";
import { requestVivoChat, VivoProviderError } from "@/lib/providers/vivo";

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

export class ParentStoryBookRealTextError extends Error {
  fallbackReason: string;
  statusCode: number;

  constructor(message: string, options: { fallbackReason: string; statusCode?: number }) {
    super(message);
    this.name = "ParentStoryBookRealTextError";
    this.fallbackReason = options.fallbackReason;
    this.statusCode = options.statusCode ?? 503;
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
  const parsed = JSON.parse(text.slice(start, end + 1));
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

function classifyVivoTextError(error: unknown) {
  if (error instanceof ParentStoryBookRealTextError) {
    return { fallbackReason: error.fallbackReason, statusCode: error.statusCode };
  }
  if (error instanceof VivoProviderError) {
    if (error.status === "missing-env") {
      return { fallbackReason: "provider-unconfigured", statusCode: 503 };
    }
    if (error.httpStatus === 401 || error.httpStatus === 403) {
      return { fallbackReason: "provider-authentication-error", statusCode: 502 };
    }
    if (error.httpStatus === 429) {
      return { fallbackReason: "provider-rate-limited", statusCode: 503 };
    }
    return { fallbackReason: "provider-response-error", statusCode: 502 };
  }
  return { fallbackReason: "provider-response-error", statusCode: 502 };
}

export function isParentStoryBookRealText(story: ParentStoryBookResponse) {
  const textProvider = story.providerMeta.textProvider ?? story.providerMeta.provider;
  return (
    story.providerMeta.textDelivery === "real" &&
    /(?:vivo|qwen|dashscope|llm|ai)/iu.test(textProvider ?? "") &&
    !story.fallbackReason &&
    !story.providerMeta.fallbackReason &&
    !story.providerMeta.diagnostics?.brain?.fallbackReason
  );
}

export function shouldRequireNextVivoStoryText(story: ParentStoryBookResponse) {
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

export async function enhanceParentStoryBookWithVivoText(input: {
  payload: ParentStoryBookRequest;
  story: ParentStoryBookResponse;
}): Promise<ParentStoryBookResponse> {
  const startedAt = Date.now();
  const expectedSceneCount = input.story.scenes.length || input.payload.pageCount || 6;
  const prompt = buildStoryTextPrompt({
    payload: input.payload,
    story: input.story,
    expectedSceneCount,
  });

  try {
    const result = await requestVivoChat({
      taskType: "parent-storybook-real-text",
      temperature: 0.35,
      maxTokens: expectedSceneCount >= 8 ? 2200 : 1800,
      messages: [
        {
          role: "system",
          content:
            "You are a professional early-childhood picture-book writer. You output valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
    });
    const parsed = extractJsonObject(result.text);
    const generated = validateStoryTextPayload(parsed, expectedSceneCount);
    const elapsedMs = Date.now() - startedAt;
    const diagnostics = input.story.providerMeta.diagnostics;

    return {
      ...input.story,
      title: generated.title || input.story.title,
      summary: generated.summary || input.story.summary,
      moral: generated.moral || input.story.moral,
      parentNote: generated.parentNote || input.story.parentNote,
      source: "vivo",
      fallback: false,
      fallbackReason: null,
      providerMeta: {
        ...input.story.providerMeta,
        provider: "vivo-chat",
        mode: input.story.providerMeta.mode === "live" ? "live" : "mixed",
        textProvider: "vivo-chat",
        textDelivery: "real",
        fallbackReason: null,
        realProvider: true,
        sceneCount: expectedSceneCount,
        diagnostics: diagnostics
          ? {
              ...diagnostics,
              brain: {
                ...diagnostics.brain,
                reachable: true,
                fallbackReason: null,
                upstreamHost: "api-ai.vivo.com.cn",
                statusCode: null,
                retryStrategy: "none",
                elapsedMs,
              },
            }
          : diagnostics,
      },
      scenes: mergeScenesWithRealText(input.story.scenes, generated.scenes),
    };
  } catch (error) {
    const classified = classifyVivoTextError(error);
    throw new ParentStoryBookRealTextError(
      error instanceof Error ? error.message : "vivo storybook text provider failed",
      classified
    );
  }
}
