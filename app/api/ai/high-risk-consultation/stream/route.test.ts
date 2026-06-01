import assert from "node:assert/strict";
import test from "node:test";

import type { HighRiskConsultationRequestPayload } from "@/lib/agent/high-risk-consultation";
import { getLocalToday } from "@/lib/date";
import { POST } from "./route.ts";

type TestEnvKey =
  | "BRAIN_API_BASE_URL"
  | "HIGH_RISK_CONSULTATION_BRAIN_TIMEOUT_MS"
  | "HIGH_RISK_CONSULTATION_STREAM_DONE_TIMEOUT_MS";

function withEnv(overrides: Partial<Record<TestEnvKey, string | undefined>>, fn: () => void | Promise<void>) {
  const previous: Record<TestEnvKey, string | undefined> = {
    BRAIN_API_BASE_URL: process.env.BRAIN_API_BASE_URL,
    HIGH_RISK_CONSULTATION_BRAIN_TIMEOUT_MS: process.env.HIGH_RISK_CONSULTATION_BRAIN_TIMEOUT_MS,
    HIGH_RISK_CONSULTATION_STREAM_DONE_TIMEOUT_MS: process.env.HIGH_RISK_CONSULTATION_STREAM_DONE_TIMEOUT_MS,
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
        remark: "听到推车声后退缩，老师引导后能说出我害怕。",
      },
    ],
    mealRecords: [],
    growthRecords: [
      {
        id: "growth-c-1-bravery",
        childId: "c-1",
        createdAt: today,
        category: "情绪表现",
        tags: ["走廊活动", "勇敢表达", "小步尝试"],
        description: "老师陪伴下完成牵手向前走一步。",
        needsAttention: true,
        followUpAction: "明天继续记录是否愿意靠近门口。",
        reviewDate: today,
        reviewStatus: "待复查",
      },
    ],
    guardianFeedbacks: [
      {
        feedbackId: "feedback-stream-timeout",
        id: "feedback-stream-timeout",
        childId: "c-1",
        sourceRole: "parent",
        sourceChannel: "parent-agent",
        executionStatus: "completed",
        executionCount: 1,
        executorRole: "parent",
        childReaction: "improved",
        improvementStatus: "clear_improvement",
        barriers: [],
        notes: "今晚完成共读，孩子愿意复述我害怕并走到门口。",
        attachments: {},
        submittedAt: `${today}T21:00:00.000Z`,
        source: { kind: "structured", workflow: "parent-agent" },
        fallback: {},
        date: `${today}T21:00:00.000Z`,
        status: "completed",
        content: "今晚完成共读，孩子愿意复述我害怕并走到门口。",
        createdBy: "u-parent",
        createdByRole: "家长",
        executed: true,
        improved: true,
      },
    ],
    teacherNote: "请生成勇敢表达与小步尝试的高风险会诊方案。",
  };
}

function parseSse(text: string) {
  return text
    .split("\n\n")
    .filter((chunk) => chunk.trim())
    .map((chunk) => {
      const event = chunk
        .split("\n")
        .find((line) => line.startsWith("event: "))
        ?.slice("event: ".length)
        .trim();
      const data = chunk
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice("data: ".length))
        .join("\n");
      return { event, data: data ? (JSON.parse(data) as Record<string, unknown>) : null };
    });
}

function buildStreamRequest() {
  return new Request("http://localhost:3000/api/ai/high-risk-consultation/stream", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-demo-account-id": "u-teacher2",
    },
    body: JSON.stringify(buildPayload()),
  });
}

test("high-risk consultation stream appends local fallback done when brain SSE never finishes", async () => {
  const originalFetch = globalThis.fetch;
  let cancelCalled = false;
  const encoder = new TextEncoder();

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!url.endsWith("/api/v1/agents/consultations/high-risk/stream")) {
      throw new Error(`Unexpected fetch url: ${url}`);
    }

    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode('event: status\ndata: {"stage":"long_term_profile","message":"remote opened"}\n\n')
          );
        },
        cancel() {
          cancelCalled = true;
        },
      }),
      {
        status: 200,
        headers: { "content-type": "text/event-stream; charset=utf-8" },
      }
    );
  }) as typeof fetch;

  try {
    await withEnv(
      {
        BRAIN_API_BASE_URL: "http://brain.example.com",
        HIGH_RISK_CONSULTATION_BRAIN_TIMEOUT_MS: "1000",
        HIGH_RISK_CONSULTATION_STREAM_DONE_TIMEOUT_MS: "20",
      },
      async () => {
        const response = await POST(buildStreamRequest());
        const text = await response.text();
        const events = parseSse(text);
        const done = events.findLast((event) => event.event === "done")?.data;
        const result = done?.result as Record<string, unknown>;

        assert.equal(response.status, 200);
        assert.equal(cancelCalled, true);
        assert.ok(text.includes("已切换本地会诊兜底"));
        assert.ok(text.includes("证据链生成完成"));
        assert.equal(done?.fallback, true);
        assert.equal(result.childId, "c-1");
        const providerTrace = result.providerTrace as Record<string, unknown>;
        const ttsTrace = providerTrace.tts as Record<string, unknown>;
        const modes = providerTrace.modes as Record<string, unknown>;
        assert.equal(providerTrace.mode, "fallback");
        assert.equal(providerTrace.fallback, true);
        assert.equal(providerTrace.provider, "local-rules-llm");
        assert.equal(ttsTrace.state, "fallback");
        assert.equal(ttsTrace.live, false);
        assert.equal(ttsTrace.mock, false);
        assert.equal(modes.tts, "fallback");
        assert.ok((result.evidenceItems as unknown[]).length >= 4);
        assert.ok((result.followUp48h as unknown[]).length > 0);
        assert.equal(result.humanReviewRequired, true);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("high-risk consultation stream returns local fallback when brain fetch times out", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      });
    })) as unknown) as typeof fetch;

  try {
    await withEnv(
      {
        BRAIN_API_BASE_URL: "http://brain.example.com",
        HIGH_RISK_CONSULTATION_BRAIN_TIMEOUT_MS: "20",
        HIGH_RISK_CONSULTATION_STREAM_DONE_TIMEOUT_MS: "1000",
      },
      async () => {
        const response = await POST(buildStreamRequest());
        const text = await response.text();
        const done = parseSse(text).findLast((event) => event.event === "done")?.data;
        const result = done?.result as Record<string, unknown>;

        assert.equal(response.status, 200);
        assert.equal(done?.fallback, true);
        const providerTrace = result.providerTrace as Record<string, unknown>;
        const ttsTrace = providerTrace.tts as Record<string, unknown>;
        const modes = providerTrace.modes as Record<string, unknown>;
        assert.equal(providerTrace.mode, "fallback");
        assert.equal(providerTrace.fallback, true);
        assert.equal(providerTrace.fallbackReason, "brain-proxy-timeout");
        assert.equal(ttsTrace.state, "fallback");
        assert.equal(ttsTrace.live, false);
        assert.equal(ttsTrace.mock, false);
        assert.equal(modes.tts, "fallback");
        assert.ok((result.evidenceItems as unknown[]).length >= 4);
        assert.equal(result.humanReviewRequired, true);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
