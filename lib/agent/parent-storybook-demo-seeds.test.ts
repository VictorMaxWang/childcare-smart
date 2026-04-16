import assert from "node:assert/strict";
import test from "node:test";

import type { ParentStoryBookRequest } from "@/lib/ai/types";
import {
  applyParentStoryBookDemoSeed,
  getParentStoryBookDemoSeedPreset,
  resolveDefaultParentStoryBookDemoSeedId,
  resolveParentStoryBookDemoSeedId,
} from "./parent-storybook-demo-seeds.ts";

function buildRequest(childId = "c-1"): ParentStoryBookRequest {
  return {
    childId,
    storyMode: "storybook",
    requestSource: "parent-storybook-page",
    stylePreset: "sunrise-watercolor",
    stylePrompt: "默认晨光水彩风格",
    snapshot: {
      child: {
        id: childId,
        name: "林小雨",
        className: "向阳班",
      },
      summary: {
        health: {
          abnormalCount: 0,
          handMouthEyeAbnormalCount: 0,
        },
        meals: {
          recordCount: 3,
          hydrationAvg: 520,
          balancedRate: 86,
          monotonyDays: 0,
          allergyRiskCount: 0,
        },
        growth: {
          recordCount: 2,
          attentionCount: 1,
          pendingReviewCount: 0,
          topCategories: [{ category: "情绪安抚", count: 1 }],
        },
        feedback: {
          count: 1,
          statusCounts: { "在家已配合": 1 },
          keywords: ["睡前故事"],
        },
      },
      ruleFallback: [],
    },
    highlightCandidates: [
      {
        kind: "todayGrowth",
        title: "默认亮点",
        detail: "默认亮点详情",
        priority: 1,
        source: "todayGrowth",
      },
    ],
    latestInterventionCard: null,
    latestConsultation: null,
  };
}

test("resolveDefaultParentStoryBookDemoSeedId defaults demo parent c-1 to recording seed", () => {
  const demoSeedId = resolveDefaultParentStoryBookDemoSeedId({
    childId: "c-1",
    currentUserId: "u-parent",
    accountKind: "demo",
  });

  assert.equal(demoSeedId, "recording-c1-bedtime");
});

test("resolveParentStoryBookDemoSeedId recognizes explicit valid seed and preset", () => {
  assert.equal(resolveParentStoryBookDemoSeedId("sleep-repair"), "sleep-repair");
  assert.equal(getParentStoryBookDemoSeedPreset("sleep-repair"), "moonlit-cutout");
  assert.equal(resolveParentStoryBookDemoSeedId("unknown-seed"), null);
});

test("applyParentStoryBookDemoSeed injects stable richer request content without changing request shape", () => {
  const request = buildRequest();
  const seededRequest = applyParentStoryBookDemoSeed(
    request,
    "recording-c1-bedtime"
  );

  assert.equal(seededRequest.childId, "c-1");
  assert.equal(seededRequest.storyMode, "storybook");
  assert.equal(
    seededRequest.requestSource,
    "parent-storybook-demo-seed:recording-c1-bedtime"
  );
  assert.equal(seededRequest.stylePreset, "sunrise-watercolor");
  assert.equal(seededRequest.snapshot.child.id, request.snapshot.child.id);
  assert.ok(seededRequest.highlightCandidates.length >= 4);
  assert.ok(seededRequest.latestInterventionCard);
  assert.ok(seededRequest.latestConsultation);
  assert.match(
    seededRequest.highlightCandidates[0]?.detail ?? "",
    /林小雨|午睡|绘本/
  );
});

test("applyParentStoryBookDemoSeed leaves non-matching child requests unchanged", () => {
  const request = buildRequest("c-99");
  const seededRequest = applyParentStoryBookDemoSeed(
    request,
    "recording-c1-bedtime"
  );

  assert.deepEqual(seededRequest, request);
});

test("applyParentStoryBookDemoSeed preserves explicit v2 controls for hybrid requests", () => {
  const request = {
    ...buildRequest(),
    generationMode: "hybrid",
    manualTheme: "表达情绪",
    pageCount: 8,
    goalKeywords: ["表达情绪", "勇气"],
    protagonistArchetype: "bear",
  } satisfies ParentStoryBookRequest;

  const seededRequest = applyParentStoryBookDemoSeed(
    request,
    "recording-c1-bedtime"
  );

  assert.equal(seededRequest.generationMode, "hybrid");
  assert.equal(seededRequest.manualTheme, "表达情绪");
  assert.equal(seededRequest.pageCount, 8);
  assert.deepEqual(seededRequest.goalKeywords, ["表达情绪", "勇气"]);
  assert.equal(seededRequest.protagonistArchetype, "bear");
  assert.equal(seededRequest.requestSource, request.requestSource);
});

test("applyParentStoryBookDemoSeed keeps explicit custom style controls", () => {
  const request = {
    ...buildRequest(),
    styleMode: "custom",
    customStylePrompt: "梦幻3D儿童绘本",
    customStyleNegativePrompt: "不要照片感",
    stylePrompt: "儿童绘本风格方向：梦幻3D儿童绘本。负面约束：不要照片感。",
  } satisfies ParentStoryBookRequest;

  const seededRequest = applyParentStoryBookDemoSeed(
    request,
    "recording-c1-bedtime"
  );

  assert.equal(seededRequest.styleMode, "custom");
  assert.equal(seededRequest.customStylePrompt, "梦幻3D儿童绘本");
  assert.equal(seededRequest.customStyleNegativePrompt, "不要照片感");
  assert.equal(
    seededRequest.stylePrompt,
    "儿童绘本风格方向：梦幻3D儿童绘本。负面约束：不要照片感。"
  );
});
