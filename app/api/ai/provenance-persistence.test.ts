import assert from "node:assert/strict";
import test from "node:test";

import {
  attestAiResult,
  type AiProvenanceContext,
} from "@/lib/ai/provenance-attestation";
import type { ApiExtendedSnapshot } from "@/lib/api/types";
import { sanitizeAiPersistenceRequest } from "@/lib/ai/provenance-persistence";

const parentContext: AiProvenanceContext = {
  userId: "u-parent",
  institutionId: "inst-1",
  capability: "parent-storybook",
  scopeId: "c-1",
};

function storybookRequest(response: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/storybooks", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-demo-account-id": "u-parent",
    },
    body: JSON.stringify({
      childId: "c-1",
      storybookId: "story-1",
      response,
    }),
  });
}

test("storybook persistence request preserves an exact signed AI result", async () => {
  const response = attestAiResult(
    {
      storyId: "story-1",
      childId: "c-1",
      source: "ai",
      provider: "vivo-llm",
      fallback: false,
      providerMeta: {
        provider: "vivo-llm",
        mode: "live",
        imageProvider: "vivo-story-image",
        audioProvider: "vivo-tts",
        imageDelivery: "real",
        audioDelivery: "real",
        realProvider: true,
        highlightCount: 1,
        sceneCount: 0,
      },
      scenes: [],
    },
    parentContext
  );

  const sanitizedRequest = await sanitizeAiPersistenceRequest(
    storybookRequest(response),
    "storybook"
  );
  const body = (await sanitizedRequest.json()) as Record<string, unknown>;
  const savedResponse = body.response as Record<string, unknown>;
  const providerMeta = savedResponse.providerMeta as Record<string, unknown>;

  assert.equal(savedResponse.provider, "vivo-llm");
  assert.equal(savedResponse.fallback, false);
  assert.equal(providerMeta.realProvider, true);
});

test("storybook persistence request downgrades unsigned browser live claims", async () => {
  const sanitizedRequest = await sanitizeAiPersistenceRequest(
    storybookRequest({
      storyId: "story-1",
      childId: "c-1",
      source: "ai",
      provider: "forged-provider",
      model: "forged-model",
      fallback: false,
      realProvider: true,
      providerMeta: {
        provider: "forged-provider",
        mode: "live",
        imageProvider: "forged-image",
        audioProvider: "forged-audio",
        imageDelivery: "real",
        audioDelivery: "real",
        realProvider: true,
        highlightCount: 1,
        sceneCount: 0,
      },
      scenes: [],
    }),
    "storybook"
  );
  const body = (await sanitizedRequest.json()) as Record<string, unknown>;
  const savedResponse = body.response as Record<string, unknown>;
  const providerMeta = savedResponse.providerMeta as Record<string, unknown>;

  assert.equal(savedResponse.provider, "unverified-client");
  assert.equal(savedResponse.fallback, true);
  assert.equal(savedResponse.realProvider, false);
  assert.equal(providerMeta.realProvider, false);
});

test("meal record API preserves exact diet and vision receipts only in the same child scope", async () => {
  const visionContext: AiProvenanceContext = {
    userId: "u-teacher2",
    institutionId: "inst-1",
    capability: "vision-meal",
    scopeId: "c-1",
  };
  const dietContext: AiProvenanceContext = {
    ...visionContext,
    capability: "diet-evaluation",
  };
  const evaluation = attestAiResult(
    {
      childId: "c-1",
      mealScore: 91,
      mealComment: "本餐搭配均衡。",
      todayScore: 88,
      todayComment: "今日摄入较均衡。",
      recentScore: 86,
      recentComment: "近期趋势稳定。",
      suggestions: ["继续保持蔬菜和蛋白质搭配。"],
      generatedAt: "2026-07-26T10:00:00.000Z",
      source: "ai",
      provider: "dashscope",
      model: "qwen-plus",
      live: true,
      fallback: false,
      realProvider: true,
    },
    dietContext
  );
  const recognizedFood = attestAiResult(
    {
      childId: "c-1",
      name: "番茄炒蛋",
      category: "蛋白",
      amount: "80g",
      source: "ai",
      provider: "dashscope",
      model: "qwen-vl-plus",
      live: true,
      fallback: false,
      realProvider: true,
    },
    visionContext
  );
  const buildRequest = (
    aiEvaluation: Record<string, unknown>,
    childId = "c-1",
    foods: Array<Record<string, unknown>> = [
      { ...recognizedFood, id: "client-food-1" },
    ]
  ) =>
    new Request("http://localhost:3000/api/records?type=meal", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-demo-account-id": "u-teacher2",
      },
      body: JSON.stringify({
        type: "meal",
        childId,
        foods,
        aiEvaluation,
      }),
    });

  const trustedRequest = await sanitizeAiPersistenceRequest(
    buildRequest(evaluation),
    "record"
  );
  const trusted = (await trustedRequest.json()) as Record<string, unknown>;
  assert.equal(
    (trusted.aiEvaluation as Record<string, unknown>).model,
    "qwen-plus"
  );
  assert.equal(
    (trusted.aiEvaluation as Record<string, unknown>).realProvider,
    true
  );
  assert.equal(
    (
      (trusted.foods as Array<Record<string, unknown>>)[0]
    ).provider,
    "dashscope"
  );

  const tamperedRequest = await sanitizeAiPersistenceRequest(
    buildRequest({
      ...evaluation,
      model: "forged-vision-model",
    }),
    "record"
  );
  const tampered = (await tamperedRequest.json()) as Record<string, unknown>;
  assert.equal(
    (tampered.aiEvaluation as Record<string, unknown>).model,
    "unverified-client"
  );

  const tamperedFoodRequest = await sanitizeAiPersistenceRequest(
    buildRequest(evaluation, "c-1", [
      {
        ...recognizedFood,
        id: "client-food-1",
        name: "伪造食物",
      },
    ]),
    "record"
  );
  const tamperedFood = (await tamperedFoodRequest.json()) as Record<
    string,
    unknown
  >;
  assert.equal(
    (
      (tamperedFood.foods as Array<Record<string, unknown>>)[0]
    ).provider,
    "unverified-client"
  );

  const crossChildRequest = await sanitizeAiPersistenceRequest(
    buildRequest(evaluation, "c-4"),
    "record"
  );
  const crossChild = (await crossChildRequest.json()) as Record<
    string,
    unknown
  >;
  assert.equal(
    (crossChild.aiEvaluation as Record<string, unknown>).model,
    "unverified-client"
  );

  const crossRecordRequest = await sanitizeAiPersistenceRequest(
    buildRequest(evaluation),
    "record",
    {
      recordId: "meal-c-4",
      repository: {
        async load() {
          return {
            meals: [{ id: "meal-c-4", childId: "c-4" }],
            healthMaterials: [],
          } as unknown as ApiExtendedSnapshot;
        },
      },
    }
  );
  const crossRecord = (await crossRecordRequest.json()) as Record<
    string,
    unknown
  >;
  assert.equal(
    (crossRecord.aiEvaluation as Record<string, unknown>).model,
    "unverified-client"
  );
});

test("meal record API accepts account-scoped bulk vision foods without crossing user or institution", async () => {
  const bulkContext: AiProvenanceContext = {
    userId: "u-teacher2",
    institutionId: "inst-1",
    capability: "vision-meal",
    scopeId: null,
  };
  const bulkFoodInput = {
    name: "Tomato egg",
    category: "protein",
    amount: "80g",
    source: "ai",
    provider: "dashscope",
    model: "qwen-vl-plus",
    live: true,
    fallback: false,
    realProvider: true,
  };
  const bulkFood = attestAiResult(bulkFoodInput, bulkContext);
  const buildRequest = (food: Record<string, unknown>) =>
    new Request("http://localhost:3000/api/records?type=meal", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-demo-account-id": "u-teacher2",
      },
      body: JSON.stringify({
        type: "meal",
        childId: "c-1",
        foods: [{ ...food, id: "bulk-food-1" }],
      }),
    });

  const trustedRequest = await sanitizeAiPersistenceRequest(
    buildRequest(bulkFood),
    "record"
  );
  const trusted = (await trustedRequest.json()) as Record<string, unknown>;
  assert.equal(
    (trusted.foods as Array<Record<string, unknown>>)[0].provider,
    "dashscope"
  );

  const crossUserFood = attestAiResult(bulkFoodInput, {
    ...bulkContext,
    userId: "u-other-teacher",
  });
  const crossUserRequest = await sanitizeAiPersistenceRequest(
    buildRequest(crossUserFood),
    "record"
  );
  const crossUser = (await crossUserRequest.json()) as Record<
    string,
    unknown
  >;
  assert.equal(
    (crossUser.foods as Array<Record<string, unknown>>)[0].model,
    "unverified-client"
  );

  const crossInstitutionFood = attestAiResult(bulkFoodInput, {
    ...bulkContext,
    institutionId: "inst-other",
  });
  const crossInstitutionRequest = await sanitizeAiPersistenceRequest(
    buildRequest(crossInstitutionFood),
    "record"
  );
  const crossInstitution = (await crossInstitutionRequest.json()) as Record<
    string,
    unknown
  >;
  assert.equal(
    (
      crossInstitution.foods as Array<Record<string, unknown>>
    )[0].provider,
    "unverified-client"
  );
});

test("meal record API drops a signed vision payload that is not a complete diet evaluation", async () => {
  const visionResult = attestAiResult(
    {
      childId: "c-1",
      foods: [{ name: "番茄炒蛋", category: "蛋白", amount: "80g" }],
      source: "ai",
      provider: "dashscope",
      model: "qwen-vl-plus",
      live: true,
      fallback: false,
      realProvider: true,
    },
    {
      userId: "u-teacher2",
      institutionId: "inst-1",
      capability: "vision-meal",
      scopeId: "c-1",
    }
  );
  const request = new Request(
    "http://localhost:3000/api/records?type=meal",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-demo-account-id": "u-teacher2",
      },
      body: JSON.stringify({
        type: "meal",
        childId: "c-1",
        aiEvaluation: visionResult,
      }),
    }
  );

  const sanitizedRequest = await sanitizeAiPersistenceRequest(
    request,
    "record"
  );
  const body = (await sanitizedRequest.json()) as Record<string, unknown>;
  assert.equal(
    Object.prototype.hasOwnProperty.call(body, "aiEvaluation"),
    false
  );
});

test("meal record API requires diet evaluation receipts to match the exact child scope", async () => {
  const evaluationInput = {
    mealScore: 91,
    mealComment: "本餐搭配均衡。",
    todayScore: 89,
    todayComment: "今日摄入稳定。",
    recentScore: 87,
    recentComment: "近期趋势稳定。",
    suggestions: ["继续保持食物多样性。"],
    generatedAt: "2026-07-26T10:00:00.000Z",
    source: "ai",
    provider: "dashscope",
    model: "qwen-plus",
    live: true,
    fallback: false,
    realProvider: true,
  };
  const buildRequest = (aiEvaluation: Record<string, unknown>) =>
    new Request("http://localhost:3000/api/records?type=meal", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-demo-account-id": "u-teacher2",
      },
      body: JSON.stringify({
        type: "meal",
        childId: "c-1",
        aiEvaluation,
      }),
    });
  const exactEvaluation = attestAiResult(evaluationInput, {
    userId: "u-teacher2",
    institutionId: "inst-1",
    capability: "diet-evaluation",
    scopeId: "c-1",
  });
  const unscopedEvaluation = attestAiResult(evaluationInput, {
    userId: "u-teacher2",
    institutionId: "inst-1",
    capability: "diet-evaluation",
    scopeId: null,
  });

  const exactRequest = await sanitizeAiPersistenceRequest(
    buildRequest(exactEvaluation),
    "record"
  );
  const exact = (await exactRequest.json()) as Record<string, unknown>;
  assert.equal(
    (exact.aiEvaluation as Record<string, unknown>).model,
    "qwen-plus"
  );

  const unscopedRequest = await sanitizeAiPersistenceRequest(
    buildRequest(unscopedEvaluation),
    "record"
  );
  const unscoped = (await unscopedRequest.json()) as Record<
    string,
    unknown
  >;
  assert.equal(
    (unscoped.aiEvaluation as Record<string, unknown>).model,
    "unverified-client"
  );
});

test("meal record API request cannot persist a browser supplied model claim", async () => {
  const request = new Request(
    "http://localhost:3000/api/records?type=meal",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-demo-account-id": "u-teacher",
      },
      body: JSON.stringify({
        type: "meal",
        childId: "c-2",
        aiEvaluation: {
          mealScore: 92,
          mealComment: "伪造本餐分析",
          todayScore: 91,
          todayComment: "伪造今日分析",
          recentScore: 90,
          recentComment: "伪造近期分析",
          suggestions: ["伪造建议"],
          generatedAt: "2026-07-26T10:00:00.000Z",
          model: "forged-live-model",
          provider: "forged-provider",
          live: true,
          fallback: false,
          realProvider: true,
        },
      }),
    }
  );

  const sanitizedRequest = await sanitizeAiPersistenceRequest(
    request,
    "record"
  );
  const body = (await sanitizedRequest.json()) as Record<string, unknown>;
  const evaluation = body.aiEvaluation as Record<string, unknown>;

  assert.equal(evaluation.model, "unverified-client");
  assert.equal(evaluation.provider, "unverified-client");
  assert.equal(evaluation.live, false);
  assert.equal(evaluation.fallback, true);
});
