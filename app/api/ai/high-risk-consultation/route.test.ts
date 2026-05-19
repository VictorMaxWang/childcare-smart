import assert from "node:assert/strict";
import test from "node:test";

import type { HighRiskConsultationRequestPayload } from "@/lib/agent/high-risk-consultation";
import { getLocalToday } from "@/lib/date";
import { POST } from "./route.ts";

function withEnv(
  overrides: Partial<Record<"BRAIN_API_BASE_URL", string | undefined>>,
  fn: () => void | Promise<void>
) {
  const previous = {
    BRAIN_API_BASE_URL: process.env.BRAIN_API_BASE_URL,
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

function buildPayload(): HighRiskConsultationRequestPayload {
  const today = getLocalToday();

  return {
    targetChildId: "c-1",
    currentUser: {
      name: "周老师",
      className: "晨曦班",
      institutionId: "inst-1",
      role: "教师",
    },
    visibleChildren: [
      {
        id: "c-1",
        name: "林小雨",
        birthDate: "2022-03-01",
        className: "晨曦班",
        allergies: [],
        specialNotes: "走廊活动听到推车声后害怕退缩，需要勇敢表达与小步尝试。",
        guardians: [{ name: "林小雨妈妈", relation: "妈妈", phone: "DEMO-PHONE-001" }],
      },
    ],
    presentChildren: [],
    healthCheckRecords: [
      {
        id: `health-c-1-${today}`,
        childId: "c-1",
        date: today,
        temperature: 36.6,
        mood: "走廊活动退缩",
        handMouthEye: "正常",
        isAbnormal: true,
        remark: "走廊活动听到推车声后害怕退缩，周老师引导林小雨说出“我害怕”。",
      },
    ],
    mealRecords: [],
    growthRecords: [
      {
        id: "growth-defense-c-1-bravery",
        childId: "c-1",
        createdAt: today,
        category: "情绪表现",
        tags: ["走廊活动", "勇敢表达", "小步尝试"],
        description: "林小雨在走廊活动听到推车声后停在门口退缩，老师陪她说出“我害怕”，再牵手向前走了一小步。",
        needsAttention: true,
        followUpAction: "明天走廊活动前先预告声音来源，引导她选择牵手一步或站在门口看一看。",
        reviewDate: today,
        reviewStatus: "待复查",
      },
    ],
    guardianFeedbacks: [
      {
        feedbackId: "feedback-api-high-risk-writeback",
        id: "feedback-api-high-risk-writeback",
        childId: "c-1",
        sourceRole: "parent",
        sourceChannel: "parent-agent",
        executionStatus: "completed",
        executionCount: 1,
        executorRole: "parent",
        childReaction: "improved",
        improvementStatus: "clear_improvement",
        barriers: [],
        notes: "高风险会诊写回测试：完成共读，孩子愿意复述我害怕并走到门口。",
        attachments: {},
        submittedAt: `${today}T21:00:00.000Z`,
        source: { kind: "structured", workflow: "parent-agent" },
        fallback: {},
        date: `${today}T21:00:00.000Z`,
        status: "completed",
        content: "高风险会诊写回测试：完成共读，孩子愿意复述我害怕并走到门口。",
        createdBy: "u-parent",
        createdByRole: "家长",
        executed: true,
        improved: true,
      },
    ],
    teacherNote:
      "走廊活动听到推车声后害怕退缩，已能在老师陪伴下说出“我害怕”，希望生成勇敢表达与小步尝试支持方案。",
  };
}

test("high-risk consultation route returns complete Lin Xiaoyu fallback when external AI is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  const memoryRequests: Array<Record<string, unknown>> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url.endsWith("/api/v1/agents/consultations/high-risk")) {
      return new Response(JSON.stringify({ error: "not implemented" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.endsWith("/api/v1/memory/context")) {
      memoryRequests.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
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
        new Request("http://localhost:3000/api/ai/high-risk-consultation", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-demo-account-id": "u-teacher2",
            "x-ai-force-fallback": "1",
          },
          body: JSON.stringify(buildPayload()),
        })
      );
      const body = (await response.json()) as Record<string, unknown>;
      const text = JSON.stringify(body);
      const evidenceItems = body.evidenceItems as Array<Record<string, unknown>>;
      const sourceLabels = evidenceItems.map((item) => String(item.sourceLabel));
      const traceMeta = body.traceMeta as Record<string, unknown>;
      const dataQuality = traceMeta.dataQuality as Record<string, unknown>;

      assert.equal(response.status, 200);
      assert.equal(body.childId, "c-1");
      assert.equal(body.riskLevel, "high");
      assert.equal(body.shouldEscalateToAdmin, true);
      assert.ok(evidenceItems.length >= 4);
      assert.ok(sourceLabels.includes("教师观察"));
      assert.ok(sourceLabels.includes("成长记录"));
      assert.ok(sourceLabels.includes("家长反馈"));
      assert.ok(sourceLabels.includes("记忆快照 / 历史跟进"));
      assert.equal(dataQuality.status, "complete");
      assert.match(text, /林小雨/);
      assert.match(text, /走廊活动/);
      assert.match(text, /勇敢表达/);
      assert.match(text, /小步尝试/);
      assert.match(text, /家庭反馈已回流/);
      assert.match(text, /高风险会诊写回测试/);
      assert.match(text, /48 小时/);
      assert.ok(memoryRequests.length > 0);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
