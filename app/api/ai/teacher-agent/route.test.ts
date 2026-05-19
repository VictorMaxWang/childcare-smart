import assert from "node:assert/strict";
import test from "node:test";

import type { TeacherAgentRequestPayload, TeacherAgentWorkflowType } from "@/lib/agent/teacher-agent";
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

function buildPayload(
  workflow: TeacherAgentWorkflowType,
  targetChildId?: string
): TeacherAgentRequestPayload {
  const today = getLocalToday();

  return {
    workflow,
    scope: workflow === "weekly-summary" ? "class" : "child",
    targetChildId,
    currentUser: {
      name: "李老师",
      className: "向阳班",
      institutionId: "inst-1",
      role: "教师",
    },
    visibleChildren: [
      {
        id: "c-1",
        name: "林小雨",
        birthDate: "2022-03-01",
        className: "向阳班",
        allergies: [],
        specialNotes: "走廊活动听到响声后容易害怕、退缩，需要勇敢表达与小步尝试。",
        guardians: [{ name: "林妈妈", relation: "妈妈", phone: "DEMO-PHONE-001" }],
      },
      {
        id: "c-12",
        name: "高远舟",
        birthDate: "2022-04-01",
        className: "向阳班",
        allergies: [],
        specialNotes: "午睡前焦虑，握水杯但主动饮水偏少，离园前需要复查。",
        guardians: [{ name: "高妈妈", relation: "妈妈", phone: "DEMO-PHONE-012" }],
      },
      {
        id: "c-5",
        name: "陈安安",
        birthDate: "2022-05-01",
        className: "向阳班",
        allergies: [],
        specialNotes: "午餐进食偏少，需要家园同步饮食观察。",
        guardians: [{ name: "陈妈妈", relation: "妈妈", phone: "DEMO-PHONE-005" }],
      },
    ],
    presentChildren: [],
    healthCheckRecords: [
      {
        id: "health-c-1",
        childId: "c-1",
        date: today,
        temperature: 36.7,
        mood: "走廊活动退缩",
        handMouthEye: "正常",
        isAbnormal: true,
        remark: "走廊活动听到推车响声后害怕、退缩。",
      },
      {
        id: "health-c-12",
        childId: "c-12",
        date: today,
        temperature: 36.6,
        mood: "午睡前焦虑",
        handMouthEye: "正常",
        isAbnormal: true,
        remark: "午睡前焦虑，主动饮水偏少，离园前需复查。",
      },
    ],
    mealRecords: [
      {
        id: "meal-c-12-water",
        childId: "c-12",
        date: today,
        meal: "午餐",
        foods: [{ name: "温水", category: "饮品", amount: "少量" }],
        intakeLevel: "适中",
        preference: "正常",
        waterMl: 80,
        nutritionScore: 82,
      },
      {
        id: "meal-c-5-lunch",
        childId: "c-5",
        date: today,
        meal: "午餐",
        foods: [
          { name: "软米饭", category: "主食", amount: "少量" },
          { name: "清炒时蔬", category: "蔬果", amount: "剩余较多" },
        ],
        intakeLevel: "少量",
        preference: "拒食",
        waterMl: 95,
        nutritionScore: 76,
      },
    ],
    growthRecords: [
      {
        id: "growth-c-1-hallway",
        childId: "c-1",
        createdAt: today,
        category: "情绪表现",
        tags: ["走廊活动", "勇敢表达", "小步尝试"],
        description: "林小雨在走廊活动听到响声后停住并退缩，老师引导说出我有点害怕。",
        needsAttention: true,
        followUpAction: "明天走廊活动前预告声音来源，引导牵手走一步。",
        reviewDate: today,
        reviewStatus: "待复查",
      },
      {
        id: "growth-c-12-nap",
        childId: "c-12",
        createdAt: today,
        category: "睡眠情况",
        tags: ["午睡前焦虑", "饮水偏少", "离园前复查"],
        description: "高远舟午睡前焦虑，握水杯但主动饮水偏少。",
        needsAttention: true,
        followUpAction: "午睡前安静过渡，午后补水记录，离园前复查。",
        reviewDate: today,
        reviewStatus: "待复查",
      },
      {
        id: "growth-c-5-lunch",
        childId: "c-5",
        createdAt: today,
        category: "独立进食",
        tags: ["午餐进食偏少", "家园同步饮食观察"],
        description: "陈安安午餐进食偏少，主食少量、蔬菜剩余较多。",
        needsAttention: true,
        followUpAction: "离园前请家长同步晚餐食量、饮水和次日入园状态。",
        reviewDate: today,
        reviewStatus: "待复查",
      },
    ],
    guardianFeedbacks: [],
  };
}

test("teacher-agent route returns demo-ready fallback content for three workflows", async () => {
  const originalFetch = globalThis.fetch;
  const memoryRequests: Array<Record<string, unknown>> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url.endsWith("/api/v1/agents/teacher/run")) {
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
      const cases: Array<{
        workflow: TeacherAgentWorkflowType;
        targetChildId?: string;
        expected: RegExp[];
      }> = [
        {
          workflow: "weekly-summary",
          expected: [
            /林小雨/,
            /高远舟/,
            /陈安安/,
            /走廊活动/,
            /午睡前焦虑/,
            /饮水偏少/,
            /午餐进食偏少/,
            /48 小时复查/,
          ],
        },
        {
          workflow: "follow-up",
          targetChildId: "c-12",
          expected: [/高远舟/, /午睡前焦虑/, /饮水偏少/, /离园前复查/, /48 小时/],
        },
        {
          workflow: "communication",
          targetChildId: "c-5",
          expected: [/陈安安/, /午餐进食偏少/, /家园同步饮食观察/, /晚餐食量/, /48 小时/],
        },
      ];
      const combinedTexts: string[] = [];

      for (const item of cases) {
        const response = await POST(
          new Request("http://localhost:3000/api/ai/teacher-agent", {
            method: "POST",
          headers: {
            "content-type": "application/json",
            "x-demo-account-id": "u-admin",
            "x-ai-force-fallback": "1",
          },
            body: JSON.stringify(buildPayload(item.workflow, item.targetChildId)),
          })
        );
        const body = (await response.json()) as Record<string, unknown>;
        const text = JSON.stringify(body);
        combinedTexts.push(text);

        assert.equal(response.status, 200);
        assert.equal(body.workflow, item.workflow);
        assert.ok(body.source);
        assert.ok(Object.hasOwn(body, "fallbackReason"));
        assert.ok(body.dataQuality);
        assert.ok(Array.isArray(body.reviewItems));
        assert.ok((body.reviewItems as unknown[]).length > 0);
        assert.match(text, /source|fallbackReason|dataQuality/);
        for (const expected of item.expected) {
          assert.match(text, expected);
        }
      }

      const combined = combinedTexts.join("\n");
      for (const expected of [
        /林小雨/,
        /高远舟/,
        /陈安安/,
        /走廊活动/,
        /午睡前焦虑/,
        /饮水偏少/,
        /午餐进食偏少/,
        /48 小时复查/,
      ]) {
        assert.match(combined, expected);
      }

      assert.ok(memoryRequests.length > 0);
      assert.ok(
        memoryRequests
          .filter((requestBody) => requestBody.workflow_type === "teacher-weekly-summary")
          .length > 0
      );
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
