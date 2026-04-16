import assert from "node:assert/strict";
import test from "node:test";

import type { ParentStoryBookPageCount, ParentStoryBookRequest } from "@/lib/ai/types";
import { buildParentStoryBookCacheKey } from "../parent/storybook-cache.ts";
import {
  buildCaptionTimeline,
  getCaptionIndexForCharIndex,
  getCaptionIndexForElapsedMs,
  resolveSceneCaptionTiming,
} from "../../components/parent/StoryBookViewer.tsx";

import {
  buildParentStoryBookRequestFromFeed,
  buildParentStoryBookResponse,
} from "./parent-storybook.ts";

function decodeSvgDataUrl(dataUrl: string) {
  const encoded = dataUrl.replace(/^data:image\/svg\+xml;base64,/, "");
  return Buffer.from(encoded, "base64").toString("utf8");
}

function buildRequest(
  overrides: Partial<ParentStoryBookRequest> = {}
): ParentStoryBookRequest {
  return {
    childId: "child-1",
    storyMode: "storybook",
    generationMode: "child-personalized",
    requestSource: "storybook-test",
    stylePreset: "sunrise-watercolor",
    styleMode: "preset",
    stylePrompt: "默认晨光水彩风格",
    pageCount: 6,
    goalKeywords: [],
    snapshot:
      overrides.snapshot ?? {
        child: {
          id: "child-1",
          name: "安安",
          className: "小一班",
          specialNotes: "喜欢先观察，再慢慢加入。",
        },
        summary: {
          health: {
            abnormalCount: 0,
            handMouthEyeAbnormalCount: 0,
          },
          meals: {
            recordCount: 2,
            hydrationAvg: 420,
            balancedRate: 84,
            monotonyDays: 0,
            allergyRiskCount: 0,
          },
          growth: {
            recordCount: 2,
            attentionCount: 0,
            pendingReviewCount: 0,
            topCategories: [{ category: "情绪表达", count: 2 }],
          },
          feedback: {
            count: 1,
            statusCounts: { "在家已配合": 1 },
            keywords: ["睡前安抚"],
          },
        },
        ruleFallback: [],
      },
    highlightCandidates:
      overrides.highlightCandidates ?? [
        {
          kind: "todayGrowth",
          title: "今天的小亮点",
          detail: "今天愿意主动说早安，也愿意轻轻挥手。",
          priority: 1,
          source: "todayGrowth",
        },
        {
          kind: "consultationAction",
          title: "今晚可以做的小事",
          detail: "睡前一起回顾今天最安心的一个瞬间。",
          priority: 2,
          source: "interventionCard",
        },
        {
          kind: "weeklyTrend",
          title: "一周趋势",
          detail: "最近一周的节奏都在慢慢稳定下来。",
          priority: 3,
          source: "weeklyTrend",
        },
      ],
    latestInterventionCard: overrides.latestInterventionCard ?? null,
    latestConsultation: overrides.latestConsultation ?? null,
    ...overrides,
  };
}

test("buildParentStoryBookRequestFromFeed supports manual-theme without child data", () => {
  const request = buildParentStoryBookRequestFromFeed({
    feed: null,
    healthCheckRecords: [],
    mealRecords: [],
    growthRecords: [],
    guardianFeedbacks: [],
    taskCheckInRecords: [],
    requestSource: "storybook-test",
    generationMode: "manual-theme",
    manualTheme: "独立入睡",
    manualPrompt: "把睡前分离讲成轻柔的晚安绘本。",
    pageCount: 6,
    goalKeywords: ["独立入睡", "睡前安抚"],
    stylePreset: "moonlit-cutout",
  });

  const response = buildParentStoryBookResponse(request);

  assert.equal(request.generationMode, "manual-theme");
  assert.equal(request.childId, undefined);
  assert.equal(request.pageCount, 6);
  assert.equal(request.snapshot.child.id, "storybook-guest");
  assert.equal(request.highlightCandidates[0]?.kind, "manualTheme");
  assert.equal(response.mode, "storybook");
  assert.equal(response.scenes.length, 6);
  assert.equal(response.providerMeta.sceneCount, 6);
  assert.ok(response.scenes.every((scene) => scene.audioScript.length > 0));
  assert.ok(
    response.scenes.every(
      (scene) =>
        scene.captionTiming?.mode === "duration-derived" &&
        (scene.captionTiming?.segmentTexts.length ?? 0) > 0
    )
  );
  assert.match(response.scenes.at(-1)?.sceneText ?? "", /今晚|明天/);
});

test("buildParentStoryBookResponse honors page count variants", () => {
  const pageCounts: ParentStoryBookPageCount[] = [4, 6, 8];
  for (const pageCount of pageCounts) {
    const response = buildParentStoryBookResponse(
      buildRequest({ pageCount, requestSource: `storybook-${pageCount}` })
    );

    assert.equal(response.mode, "storybook");
    assert.equal(response.scenes.length, pageCount);
    assert.equal(response.providerMeta.sceneCount, pageCount);
  }
});

test("hybrid storybook threads theme and child context into scene text prompt and audio", () => {
  const childContextDetail = "它先停一停，再轻轻说出“我有点难过”。";
  const response = buildParentStoryBookResponse(
    buildRequest({
      generationMode: "hybrid",
      manualTheme: "表达情绪",
      manualPrompt: "让孩子知道情绪可以被轻轻说出来。",
      pageCount: 4,
      goalKeywords: ["表达情绪"],
      highlightCandidates: [
        {
          kind: "manualTheme",
          title: "主题：表达情绪",
          detail: "把“表达情绪”讲成孩子能听懂的小故事。",
          priority: 1,
          source: "manualTheme",
        },
        {
          kind: "warningSuggestion",
          title: "先停一停",
          detail: childContextDetail,
          priority: 2,
          source: "suggestions",
        },
        {
          kind: "consultationAction",
          title: "今晚可以做的小事",
          detail: "睡前一起练习一句“我现在有点难过”。",
          priority: 3,
          source: "interventionCard",
        },
        {
          kind: "todayGrowth",
          title: "今天的小亮点",
          detail: "今天已经愿意先抱一抱，再慢慢说出自己的需要。",
          priority: 4,
          source: "todayGrowth",
        },
      ],
    })
  );

  assert.equal(response.scenes.length, 4);
  assert.ok(response.scenes.some((scene) => scene.sceneText.includes("表达情绪")));
  assert.ok(response.scenes.some((scene) => scene.sceneText.includes("先停一停")));
  assert.ok(response.scenes.some((scene) => scene.imagePrompt.includes("表达情绪")));
  assert.ok(response.scenes.every((scene) => scene.imagePrompt.includes("不要任何中文")));
  assert.ok(response.scenes.every((scene) => scene.imagePrompt.includes("image-only composition")));
  assert.ok(response.scenes.every((scene) => !scene.imagePrompt.includes("本页画面目标")));
  assert.ok(response.scenes.every((scene) => !scene.imagePrompt.includes("叙事锚点")));
  assert.ok(response.scenes.every((scene) => !scene.imagePrompt.includes("必须出现")));
  assert.ok(response.scenes.some((scene) => scene.audioScript.includes("表达情绪")));
  assert.ok(response.scenes.some((scene) => scene.audioScript.includes("先停一停")));
});

test("custom style overrides preset prompt and reaches image prompt", () => {
  const response = buildParentStoryBookResponse(
    buildRequest({
      styleMode: "custom",
      stylePreset: "moonlit-cutout",
      customStylePrompt: "梦幻3D儿童绘本，柔焦，浅景深，电影级光影",
      customStyleNegativePrompt: "不要照片感、不要复杂背景",
      stylePrompt:
        "儿童绘本风格方向：梦幻3D儿童绘本，柔焦，浅景深，电影级光影。负面约束：不要照片感、不要复杂背景。",
    })
  );

  assert.ok(response.scenes[0]?.imagePrompt.includes("梦幻3D儿童绘本"));
  assert.ok(response.scenes[0]?.imagePrompt.includes("不要照片感"));
  assert.ok(response.scenes[0]?.imagePrompt.includes("不要任何中文"));
  assert.ok(response.scenes[0]?.imagePrompt.includes("不要任何英文"));
  assert.ok(response.scenes[0]?.imagePrompt.includes("不要任何数字"));
  assert.ok(response.scenes[0]?.imagePrompt.includes("不要任何对话气泡"));
  assert.ok(response.scenes[0]?.imagePrompt.includes("image-only composition"));
  assert.ok(!response.scenes[0]?.imagePrompt.includes("分镜标题"));
  assert.ok(!response.scenes[0]?.imagePrompt.includes("文案核心"));
  assert.ok(!response.scenes[0]?.imagePrompt.includes("本页画面目标"));
  assert.ok(!response.scenes[0]?.imagePrompt.includes("月夜剪纸"));
});

test("storybook fallback scenes build page-specific dynamic story illustration assets instead of static scene svgs", () => {
  const response = buildParentStoryBookResponse(buildRequest({ pageCount: 8 }));
  const imageUrls = response.scenes.map((scene) => scene.imageUrl ?? "");

  assert.equal(response.providerMeta.transport, "next-json-fallback");
  assert.equal(response.providerMeta.imageDelivery, "dynamic-fallback");
  assert.equal(response.providerMeta.audioDelivery, "preview-only");
  assert.equal(response.scenes.length, 8);
  assert.ok(imageUrls.every((url) => url.startsWith("data:image/svg+xml;base64,")));
  assert.ok(imageUrls.every((url) => !url.includes("/storybook/scene-")));
  assert.equal(new Set(imageUrls).size, 8);
  assert.ok(response.scenes.every((scene) => scene.imageSourceKind === "dynamic-fallback"));
  assert.ok(
    response.scenes.every(
      (scene) =>
        scene.captionTiming?.mode === "duration-derived" &&
        (scene.captionTiming?.segmentDurationsMs?.length ?? 0) ===
          (scene.captionTiming?.segmentTexts.length ?? 0)
    )
  );
  assert.equal(response.providerMeta.diagnostics?.brain.reachable, false);
});

test("dynamic fallback art changes with different story themes instead of only reusing demo-art", () => {
  const honestyResponse = buildParentStoryBookResponse(
    buildRequest({
      generationMode: "manual-theme",
      manualTheme: "诚实",
      manualPrompt: "把诚实讲成孩子能听懂的小故事。",
      goalKeywords: ["诚实"],
      pageCount: 4,
    })
  );
  const sleepResponse = buildParentStoryBookResponse(
    buildRequest({
      generationMode: "manual-theme",
      manualTheme: "独立入睡",
      manualPrompt: "把睡前分离讲成温柔可读的晚安故事。",
      goalKeywords: ["独立入睡"],
      pageCount: 4,
    })
  );
  const honestySvg = decodeSvgDataUrl(honestyResponse.scenes[0]?.imageUrl ?? "");
  const sleepSvg = decodeSvgDataUrl(sleepResponse.scenes[0]?.imageUrl ?? "");

  assert.equal(honestyResponse.scenes[0]?.imageSourceKind, "dynamic-fallback");
  assert.equal(sleepResponse.scenes[0]?.imageSourceKind, "dynamic-fallback");
  assert.notEqual(honestySvg, sleepSvg);
  assert.match(honestySvg, /诚实/);
  assert.match(sleepSvg, /独立入睡/);
});

test("storybook cache key changes when mode theme and page count change", () => {
  const baseRequest = buildRequest();
  const baseKey = buildParentStoryBookCacheKey(baseRequest, "sunrise-watercolor");
  const themeKey = buildParentStoryBookCacheKey(
    buildRequest({
      generationMode: "manual-theme",
      manualTheme: "勇气",
      pageCount: 6,
    }),
    "sunrise-watercolor"
  );
  const pageKey = buildParentStoryBookCacheKey(
    buildRequest({ pageCount: 8 }),
    "sunrise-watercolor"
  );
  const modeKey = buildParentStoryBookCacheKey(
    buildRequest({
      generationMode: "hybrid",
      manualTheme: "分享",
      goalKeywords: ["分享"],
    }),
    "sunrise-watercolor"
  );

  const customStyleKey = buildParentStoryBookCacheKey(
    buildRequest({
      styleMode: "custom",
      customStylePrompt: "梦幻3D儿童绘本",
      customStyleNegativePrompt: "不要照片感",
    }),
    "sunrise-watercolor"
  );

  assert.notEqual(baseKey, themeKey);
  assert.notEqual(baseKey, pageKey);
  assert.notEqual(baseKey, modeKey);
  assert.notEqual(baseKey, customStyleKey);
  assert.equal(
    new Set([baseKey, themeKey, pageKey, modeKey, customStyleKey]).size,
    5
  );
});

test("caption timing prefers explicit scene timing and falls back to duration derived segments", () => {
  const explicitScene = {
    sceneText: "第一句。第二句。",
    audioScript: "第一句。第二句。",
    captionTiming: {
      mode: "speech-boundary",
      segmentTexts: ["第一句。", "第二句。"],
      segmentDurationsMs: [3200, 5100],
    },
  };

  const explicitTimeline = buildCaptionTimeline(explicitScene as never);
  assert.deepEqual(explicitTimeline.segments, ["第一句。", "第二句。"]);
  assert.deepEqual(explicitTimeline.durationsMs, [3200, 5100]);
  assert.equal(getCaptionIndexForElapsedMs(explicitTimeline, 0), 0);
  assert.equal(getCaptionIndexForElapsedMs(explicitTimeline, 3500), 1);
  assert.equal(
    getCaptionIndexForCharIndex(explicitTimeline, "第一句。第二句。".indexOf("第二句")),
    1
  );

  const fallbackTimeline = buildCaptionTimeline({
    sceneText: "小兔点点先停一下，再轻轻往前走。",
    audioScript: "小兔点点先停一下，再轻轻往前走。",
  } as never);

  assert.ok(fallbackTimeline.segments.length > 0);
  assert.ok(
    fallbackTimeline.durationsMs.every((duration) => duration >= 2400),
    "duration-derived segments should never be faster than the minimum preview cadence"
  );

  const fallbackTiming = resolveSceneCaptionTiming({
    sceneText: "小兔点点先停一下，再轻轻往前走。",
    audioScript: "小兔点点先停一下，再轻轻往前走。",
  } as never);

  assert.equal(fallbackTiming.mode, "duration-derived");
  assert.equal(fallbackTiming.segmentTexts.length, fallbackTimeline.segments.length);
});
