import assert from "node:assert/strict";
import test from "node:test";

import {
  executeFollowUp,
  executeSuggestion,
  executeWeeklyReport,
  getAiRuntimeOptions,
  isValidFollowUpPayload,
} from "@/lib/ai/server";
import type {
  ChildSuggestionSnapshot,
  WeeklyReportSnapshot,
} from "@/lib/ai/types";

function buildFollowUpSnapshot(): ChildSuggestionSnapshot {
  return {
    child: { id: "child-1", name: "Ava" },
    summary: {
      health: {
        abnormalCount: 0,
        handMouthEyeAbnormalCount: 0,
        moodKeywords: [],
      },
      meals: {
        recordCount: 1,
        hydrationAvg: 220,
        balancedRate: 80,
        monotonyDays: 0,
        allergyRiskCount: 0,
      },
      growth: {
        recordCount: 1,
        attentionCount: 1,
        pendingReviewCount: 1,
        topCategories: [],
      },
      feedback: {
        count: 1,
        statusCounts: { partial: 1 },
        keywords: ["sleep"],
      },
    },
    recentDetails: {
      health: [],
      meals: [],
      growth: [],
      feedback: [],
    },
    ruleFallback: [
      {
        title: "Sleep loop",
        description: "Keep the bedtime routine stable.",
        level: "warning",
      },
    ],
  };
}

function buildWeeklySnapshot(): WeeklyReportSnapshot {
  return {
    institutionName: "Test Institution",
    periodLabel: "last 7 days",
    role: "teacher",
    overview: {
      visibleChildren: 1,
      attendanceRate: 96,
      mealRecordCount: 5,
      healthAbnormalCount: 0,
      growthAttentionCount: 1,
      pendingReviewCount: 1,
      feedbackCount: 1,
    },
    diet: {
      balancedRate: 82,
      hydrationAvg: 220,
      monotonyDays: 0,
      vegetableDays: 5,
      proteinDays: 5,
    },
    topAttentionChildren: [],
    highlights: ["Records stayed continuous."],
    risks: ["One review remains open."],
  };
}

test("isValidFollowUpPayload accepts canonical structured latestFeedback", () => {
  const isValid = isValidFollowUpPayload({
    snapshot: buildFollowUpSnapshot(),
    suggestionTitle: "Sleep loop",
    question: "What should the parent do tonight?",
    latestFeedback: {
      feedbackId: "fb-1",
      childId: "child-1",
      sourceRole: "parent",
      sourceChannel: "manual",
      relatedTaskId: "task-parent-1",
      executionStatus: "partial",
      executorRole: "parent",
      childReaction: "accepted",
      improvementStatus: "slight_improvement",
      barriers: ["Needed one reminder"],
      notes: "The child completed the first two steps.",
      attachments: {},
      submittedAt: "2026-04-10T20:00:00.000Z",
      source: { kind: "structured", workflow: "manual" },
      fallback: {},
    },
  });

  assert.equal(isValid, true);
});

test("isValidFollowUpPayload rejects malformed latestFeedback payloads", () => {
  const isValid = isValidFollowUpPayload({
    snapshot: buildFollowUpSnapshot(),
    suggestionTitle: "Sleep loop",
    question: "What should the parent do tonight?",
    latestFeedback: {
      executionStatus: "partial",
    },
  });

  assert.equal(isValid, false);
});

test("global mock mode remains available to demo accounts but never forces normal accounts into mock", () => {
  const previous = process.env.NEXT_PUBLIC_FORCE_MOCK_MODE;
  process.env.NEXT_PUBLIC_FORCE_MOCK_MODE = "true";

  try {
    assert.equal(getAiRuntimeOptions().forceMock, false);
    assert.equal(
      getAiRuntimeOptions(undefined, { accountKind: "demo" }).forceMock,
      true
    );
    assert.equal(
      getAiRuntimeOptions(undefined, { accountKind: "normal" }).forceMock,
      false
    );
  } finally {
    if (previous === undefined) {
      delete process.env.NEXT_PUBLIC_FORCE_MOCK_MODE;
    } else {
      process.env.NEXT_PUBLIC_FORCE_MOCK_MODE = previous;
    }
  }
});

test("legacy Bailian model names never configure the Vivo provider", () => {
  const previousAiModel = process.env.AI_MODEL;
  const previousVivoModel = process.env.VIVO_LLM_MODEL;
  process.env.AI_MODEL = "qwen-plus";
  delete process.env.VIVO_LLM_MODEL;

  try {
    assert.equal(getAiRuntimeOptions().configuredModel, "Volc-DeepSeek-V3.2");
  } finally {
    if (previousAiModel === undefined) delete process.env.AI_MODEL;
    else process.env.AI_MODEL = previousAiModel;

    if (previousVivoModel === undefined) delete process.env.VIVO_LLM_MODEL;
    else process.env.VIVO_LLM_MODEL = previousVivoModel;
  }
});

test("suggestion execution falls back to Bailian when vivo chat is unavailable", async () => {
  const envKeys = [
    "BAILIAN_MODEL",
    "DASHSCOPE_API_KEY",
    "VIVO_APP_ID",
    "VIVO_APP_KEY",
  ] as const;
  const previous = Object.fromEntries(
    envKeys.map((key) => [key, process.env[key]])
  ) as Record<(typeof envKeys)[number], string | undefined>;
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];

  delete process.env.VIVO_APP_ID;
  delete process.env.VIVO_APP_KEY;
  process.env.DASHSCOPE_API_KEY = "test-bailian-key";
  process.env.BAILIAN_MODEL = "qwen-plus";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    });

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                riskLevel: "low",
                summary: "The child is stable this week.",
                highlights: ["Hydration improved."],
                concerns: ["Continue observing sleep."],
                actions: ["Review the routine tomorrow."],
                disclaimer: "Not medical advice.",
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    const result = await executeSuggestion(
      { snapshot: buildFollowUpSnapshot() },
      {
        configuredModel: "unused-vivo-model",
        forceMock: false,
        forceFallback: false,
      }
    );

    assert.equal(result.source, "ai");
    assert.equal(result.provider, "dashscope");
    assert.equal(result.model, "qwen-plus");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.model, "qwen-plus");
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of envKeys) {
      const value = previous[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("follow-up and weekly report both fall back from Vivo to Bailian", async () => {
  const envKeys = [
    "BAILIAN_MODEL",
    "DASHSCOPE_API_KEY",
    "VIVO_APP_ID",
    "VIVO_APP_KEY",
  ] as const;
  const previous = Object.fromEntries(
    envKeys.map((key) => [key, process.env[key]])
  ) as Record<(typeof envKeys)[number], string | undefined>;
  const originalFetch = globalThis.fetch;
  let callCount = 0;

  delete process.env.VIVO_APP_ID;
  delete process.env.VIVO_APP_KEY;
  process.env.DASHSCOPE_API_KEY = "test-bailian-key";
  process.env.BAILIAN_MODEL = "qwen-plus";
  globalThis.fetch = (async () => {
    callCount += 1;
    const content =
      callCount === 1
        ? {
            answer: "Keep the routine stable tonight.",
            keyPoints: ["Observe the same trigger."],
            nextSteps: ["Review tomorrow morning."],
            disclaimer: "Not medical advice.",
          }
        : {
            summary: "The class stayed stable this week.",
            highlights: ["Records remained continuous."],
            risks: ["One review remains open."],
            nextWeekActions: ["Close the review on Monday."],
            disclaimer: "Not medical advice.",
          };

    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(content) } }],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    const options = {
      configuredModel: "unused-vivo-model",
      forceMock: false,
      forceFallback: false,
    };
    const followUp = await executeFollowUp(
      {
        snapshot: buildFollowUpSnapshot(),
        suggestionTitle: "Sleep loop",
        question: "What should the parent do tonight?",
      },
      options
    );
    const weekly = await executeWeeklyReport(
      {
        role: "teacher",
        snapshot: buildWeeklySnapshot(),
      },
      options
    );

    for (const result of [followUp, weekly]) {
      assert.equal(result.source, "ai");
      assert.equal(result.provider, "dashscope");
      assert.equal(result.model, "qwen-plus");
    }
    assert.equal(callCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of envKeys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
