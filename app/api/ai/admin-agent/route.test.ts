import assert from "node:assert/strict";
import test from "node:test";

import type { AdminAgentRequestPayload, AdminAgentResult } from "@/lib/agent/admin-types";
import { POST } from "./route.ts";

function withEnv(
  overrides: Partial<Record<"BRAIN_API_BASE_URL" | "DASHSCOPE_API_KEY", string | undefined>>,
  fn: () => void | Promise<void>
) {
  const previous = {
    BRAIN_API_BASE_URL: process.env.BRAIN_API_BASE_URL,
    DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY,
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

function buildPayload(): AdminAgentRequestPayload {
  return {
    workflow: "weekly-ops-report",
    currentUser: {
      name: "Director Chen",
      institutionName: "SmartChildcare",
      institutionId: "inst-1",
      role: "机构管理员",
    },
    visibleChildren: [
      {
        id: "child-1",
        name: "Ava",
        birthDate: "2021-02-01",
        className: "Sun Class",
        allergies: [],
        specialNotes: "",
        parentUserId: "parent-1",
      },
      {
        id: "child-2",
        name: "Ben",
        birthDate: "2021-03-01",
        className: "Sun Class",
        allergies: [],
        specialNotes: "",
        parentUserId: "parent-2",
      },
    ],
    attendanceRecords: [
      { id: "att-1", childId: "child-1", date: "2026-04-10", isPresent: true },
      { id: "att-2", childId: "child-2", date: "2026-04-10", isPresent: true },
    ],
    healthCheckRecords: [],
    growthRecords: [
      {
        id: "growth-1",
        childId: "child-1",
        createdAt: "2026-04-10 09:00:00",
        category: "emotion",
        tags: ["follow-up"],
        description: "Needs follow-up",
        needsAttention: true,
        followUpAction: "Review tomorrow",
        reviewDate: "2026-04-11",
      },
    ],
    guardianFeedbacks: [
      {
        id: "feedback-1",
        childId: "child-1",
        date: "2026-04-10",
        status: "已反馈",
        content: "Will coordinate tonight.",
      },
    ],
    mealRecords: [
      {
        id: "meal-1",
        childId: "child-1",
        date: "2026-04-10",
        meal: "lunch",
        foods: [{ name: "Rice", category: "staple", amount: "1 bowl" }],
        waterMl: 320,
        preference: "good",
      },
    ],
    adminBoardData: {
      highAttentionChildren: [{ childId: "child-1", childName: "Ava", count: 2 }],
      lowHydrationChildren: [{ childId: "child-1", childName: "Ava", hydrationAvg: 260 }],
      lowVegTrendChildren: [{ childId: "child-2", childName: "Ben", vegetableDays: 3 }],
    },
    weeklyTrend: {
      balancedRate: 82,
      vegetableDays: 4,
      proteinDays: 5,
      stapleDays: 7,
      hydrationAvg: 310,
      monotonyDays: 1,
    },
    smartInsights: [
      {
        id: "insight-1",
        title: "Ava needs follow-up",
        description: "Ava still needs follow-up",
        level: "warning",
        tags: ["follow-up"],
        childId: "child-1",
      },
    ],
    notificationEvents: [],
  };
}

function assertIsAdminAgentResult(value: unknown): asserts value is AdminAgentResult {
  assert.equal(typeof value, "object");
  assert.ok(value);

  const record = value as Record<string, unknown>;
  assert.equal(typeof record.title, "string");
  assert.equal(typeof record.summary, "string");
  assert.equal(typeof record.assistantAnswer, "string");
  assert.equal(typeof record.generatedAt, "string");
  assert.equal(Array.isArray(record.priorityTopItems), true);
  assert.equal(Array.isArray(record.riskChildren), true);
  assert.equal(Array.isArray(record.actionItems), true);
  assert.equal(typeof record.institutionScope, "object");
  assert.ok(record.institutionScope);
}

function assertNoRawWeeklyPayload(text: string) {
  assert.doesNotMatch(text, /teacher-agent|workflow|objectScope|targetChildId|actionItems/i);
  assert.doesNotMatch(text, /[{[]/);
}

function buildDirtyProxyWeeklyAdminResult(): AdminAgentResult {
  return {
    title: "本周机构运营周报",
    summary:
      'teacher-agent: {"workflow":"communication","objectScope":"child","targetChildId":"child-1","actionItems":[{"id":"a1"}]}',
    assistantAnswer:
      'Recent context: {"workflow":"weekly-ops-report","actionItems":[{"id":"a1"}]}',
    title:
      'teacher-agent: {"workflow":"communication","objectScope":"child","targetChildId":"child-1"}',
    institutionScope: {
      institutionName: "SmartChildcare",
      date: "2026-04-13",
      visibleChildren: 26,
      classCount: 4,
      todayPresentCount: 24,
      todayAttendanceRate: 92,
      attendanceRate: 91,
      healthAbnormalCount: 3,
      growthAttentionCount: 2,
      pendingReviewCount: 2,
      feedbackCount: 16,
      feedbackCompletionRate: 62,
      riskChildrenCount: 2,
      riskClassCount: 1,
      pendingDispatchCount: 2,
    },
    priorityTopItems: [],
    riskChildren: [],
    riskClasses: [],
    feedbackRiskItems: [],
    highlights: ['workflow: {"objectScope":"child"}'],
    actionItems: [],
    recommendedOwnerMap: [],
    quickQuestions: [],
    notificationEvents: [],
    continuityNotes: ['Recent consultation: {"targetChildId":"child-1"}'],
    source: "ai",
    model: "test-model",
    generatedAt: "2026-04-13T08:00:00.000Z",
  };
}

function buildDirtyProxyWeeklyReport() {
  return {
    workflow: "weekly-ops-report",
    schemaVersion: "v2-actionized",
    role: "admin",
    summary:
      'teacher-agent: {"workflow":"communication","objectScope":"child","targetChildId":"child-1","actionItems":[{"id":"a1"}]}',
    highlights: ['{"objectScope":"child"}', "本周反馈回流与复查闭环已成为机构级重点。"],
    risks: ['Recent context: {"targetChildId":"child-1"}'],
    nextWeekActions: ['actionItems: [{"title":"补齐复查"}]', "先收敛下周治理重点并明确责任人。"],
    trendPrediction: "stable",
    sections: [],
    continuityNotes: ['workflow: {"targetChildId":"child-1"}'],
    disclaimer: "仅用于运营复盘参考。",
    source: "ai",
    model: "test-model",
    generatedAt: "2026-04-13T08:00:00.000Z",
  };
}

test("admin agent weekly route falls back to local AdminAgentResult when proxy body cannot be normalized", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.endsWith("/api/v1/agents/admin/run")) {
      return new Response(JSON.stringify({ malformed: true, reason: "not-normalizable" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.endsWith("/api/v1/memory/context")) {
      return new Response(JSON.stringify({ error: "memory unavailable" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch url: ${url}`);
  }) as typeof fetch;

  try {
    await withEnv({ BRAIN_API_BASE_URL: "http://brain.example.com" }, async () => {
      const response = await POST(
        new Request("http://localhost:3000/api/ai/admin-agent", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-ai-force-fallback": "1",
          },
          body: JSON.stringify(buildPayload()),
        })
      );
      const body = (await response.json()) as unknown;

      assert.equal(response.status, 200);
      assertIsAdminAgentResult(body);
      assert.equal((body as Record<string, unknown>).malformed, undefined);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin agent weekly route falls back to local AdminAgentResult when proxy body is invalid json", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.endsWith("/api/v1/agents/admin/run")) {
      return new Response("not-json", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.endsWith("/api/v1/memory/context")) {
      return new Response(JSON.stringify({ error: "memory unavailable" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch url: ${url}`);
  }) as typeof fetch;

  try {
    await withEnv({ BRAIN_API_BASE_URL: "http://brain.example.com" }, async () => {
      const response = await POST(
        new Request("http://localhost:3000/api/ai/admin-agent", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-ai-force-fallback": "1",
          },
          body: JSON.stringify(buildPayload()),
        })
      );
      const body = (await response.json()) as unknown;

      assert.equal(response.status, 200);
      assertIsAdminAgentResult(body);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin agent weekly route sanitizes dirty proxied AdminAgentResult before returning it", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.endsWith("/api/v1/agents/admin/run")) {
      return new Response(JSON.stringify(buildDirtyProxyWeeklyAdminResult()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch url: ${url}`);
  }) as typeof fetch;

  try {
    await withEnv({ BRAIN_API_BASE_URL: "http://brain.example.com" }, async () => {
      const response = await POST(
        new Request("http://localhost:3000/api/ai/admin-agent", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(buildPayload()),
        })
      );
      const body = (await response.json()) as unknown;

      assert.equal(response.status, 200);
      assertIsAdminAgentResult(body);
      assertNoRawWeeklyPayload(body.title);
      assertNoRawWeeklyPayload(body.summary);
      assertNoRawWeeklyPayload(body.assistantAnswer);
      body.continuityNotes?.forEach((item) => assertNoRawWeeklyPayload(item));
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin agent weekly route sanitizes dirty proxied WeeklyReportResponse before mapping it", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.endsWith("/api/v1/agents/admin/run")) {
      return new Response(JSON.stringify(buildDirtyProxyWeeklyReport()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch url: ${url}`);
  }) as typeof fetch;

  try {
    await withEnv({ BRAIN_API_BASE_URL: "http://brain.example.com" }, async () => {
      const response = await POST(
        new Request("http://localhost:3000/api/ai/admin-agent", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(buildPayload()),
        })
      );
      const body = (await response.json()) as unknown;

      assert.equal(response.status, 200);
      assertIsAdminAgentResult(body);
      assertNoRawWeeklyPayload(body.summary);
      body.highlights.forEach((item) => assertNoRawWeeklyPayload(item));
      body.continuityNotes?.forEach((item) => assertNoRawWeeklyPayload(item));
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin agent weekly route sanitizes dirty local continuity memory before returning fallback weekly result", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.endsWith("/api/v1/agents/admin/run")) {
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.endsWith("/api/v1/memory/context")) {
      return new Response(
        JSON.stringify({
          child_id: "child-1",
          workflow_type: "admin-weekly-ops-report",
          prompt_context: {
            recent_continuity_signals: [
              'teacher-agent: {"workflow":"communication","objectScope":"child"}',
            ],
            last_consultation_takeaways: [
              'Recent consultation: {"targetChildId":"child-1","actionItems":[{"id":"a1"}]}',
            ],
            open_loops: ['{"actionItems":[{"id":"a1"}],"workflow":"communication"}'],
          },
          meta: {
            backend: "test",
            degraded: false,
            used_sources: ["memory_search"],
            errors: [],
            matched_snapshot_ids: [],
            matched_trace_ids: [],
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    }

    throw new Error(`Unexpected fetch url: ${url}`);
  }) as typeof fetch;

  try {
    await withEnv(
      {
        BRAIN_API_BASE_URL: "http://brain.example.com",
        DASHSCOPE_API_KEY: undefined,
      },
      async () => {
        const response = await POST(
          new Request("http://localhost:3000/api/ai/admin-agent", {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify(buildPayload()),
          })
        );
        const body = (await response.json()) as unknown;

        assert.equal(response.status, 200);
        assertIsAdminAgentResult(body);
        assertNoRawWeeklyPayload(body.summary);
        body.continuityNotes?.forEach((item) => assertNoRawWeeklyPayload(item));
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
