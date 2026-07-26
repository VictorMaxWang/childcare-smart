import assert from "node:assert/strict";
import test from "node:test";

import { verifyAiResultAttestation } from "@/lib/ai/provenance-attestation";
import { sanitizeAiPersistenceRequest } from "@/lib/ai/provenance-persistence";
import { POST } from "./route.ts";

const CONTEXT = {
  userId: "u-teacher2",
  institutionId: "inst-1",
  capability: "diet-evaluation",
  scopeId: "c-1",
} as const;

function buildDietRequest(
  headers: Record<string, string> = {}
) {
  const foods = [
    { name: "番茄炒蛋", category: "蛋白", amount: "80g" },
  ];
  return new Request("http://localhost:3000/api/ai/diet-evaluation", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-demo-account-id": "u-teacher2",
      ...headers,
    },
    body: JSON.stringify({
      childId: "c-1",
      input: {
        childName: "林小雨",
        ageText: "4岁",
        ageBand: "3-6岁",
        mealType: "午餐",
        mealFoods: foods,
        todayMeals: [{ meal: "午餐", foods, waterMl: 120 }],
        recentMeals: [
          {
            date: "2026-07-26",
            meal: "午餐",
            foods,
            waterMl: 120,
          },
        ],
      },
    }),
  });
}

test("diet evaluation receipt survives the real record persistence boundary", async () => {
  const originalFetch = globalThis.fetch;
  const previousBrainBaseUrl = process.env.BRAIN_API_BASE_URL;
  process.env.BRAIN_API_BASE_URL = "http://brain.example.com";
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        evaluation: {
          mealScore: 91,
          mealComment: "本餐结构均衡。",
          todayScore: 88,
          todayComment: "今日结构稳定。",
          recentScore: 86,
          recentComment: "近期保持良好。",
          suggestions: ["继续保持蔬果与蛋白搭配。"],
        },
        source: "ai",
        provider: "dashscope",
        model: "qwen-plus",
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    )) as typeof fetch;

  try {
    const response = await POST(buildDietRequest());
    const body = (await response.json()) as Record<string, unknown>;
    const evaluation = body.evaluation as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(
      verifyAiResultAttestation(evaluation, CONTEXT),
      true
    );
    assert.equal(evaluation.model, "qwen-plus");
    assert.equal(evaluation.realProvider, true);

    const persistenceRequest = await sanitizeAiPersistenceRequest(
      new Request("http://localhost:3000/api/records?type=meal", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-demo-account-id": "u-teacher2",
        },
        body: JSON.stringify({
          type: "meal",
          childId: "c-1",
          aiEvaluation: evaluation,
        }),
      }),
      "record"
    );
    const persistedBody = (await persistenceRequest.json()) as Record<
      string,
      unknown
    >;
    const persistedEvaluation = persistedBody.aiEvaluation as Record<
      string,
      unknown
    >;
    assert.equal(persistedEvaluation.model, "qwen-plus");
    assert.equal(persistedEvaluation.realProvider, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousBrainBaseUrl === undefined) {
      delete process.env.BRAIN_API_BASE_URL;
    } else {
      process.env.BRAIN_API_BASE_URL = previousBrainBaseUrl;
    }
  }
});

test("incomplete remote diet evaluation is rejected before attestation", async () => {
  const originalFetch = globalThis.fetch;
  const previousBrainBaseUrl = process.env.BRAIN_API_BASE_URL;
  process.env.BRAIN_API_BASE_URL = "http://brain.example.com";
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        evaluation: {
          mealScore: 91,
          mealComment: "缺少今日与近期评分。",
          suggestions: [],
        },
        source: "ai",
        provider: "dashscope",
        model: "qwen-plus",
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    )) as typeof fetch;

  try {
    const response = await POST(
      buildDietRequest({ "x-ai-force-fallback": "1" })
    );
    const body = (await response.json()) as Record<string, unknown>;
    const evaluation = body.evaluation as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(body.source, "fallback");
    assert.equal(evaluation.fallback, true);
    assert.equal(typeof evaluation.todayScore, "number");
    assert.equal(typeof evaluation.recentScore, "number");
    assert.equal(
      verifyAiResultAttestation(evaluation, CONTEXT),
      true
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (previousBrainBaseUrl === undefined) {
      delete process.env.BRAIN_API_BASE_URL;
    } else {
      process.env.BRAIN_API_BASE_URL = previousBrainBaseUrl;
    }
  }
});
