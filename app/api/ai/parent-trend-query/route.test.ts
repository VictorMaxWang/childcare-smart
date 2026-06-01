import assert from "node:assert/strict";
import test from "node:test";

import type { ParentTrendQueryPayload, ParentTrendQueryResponse } from "@/lib/ai/types";
import { createDemoSeedSnapshot } from "@/lib/demo-data/seed";
import {
  SMARTCHILDCARE_FALLBACK_REASON_HEADER,
  SMARTCHILDCARE_TRANSPORT_HEADER,
} from "@/lib/server/brain-client";
import { POST } from "./route.ts";

function withEnv(
  overrides: Partial<Record<"BRAIN_API_BASE_URL" | "NEXT_PUBLIC_BACKEND_BASE_URL", string | undefined>>,
  fn: () => void | Promise<void>
) {
  const previous = {
    BRAIN_API_BASE_URL: process.env.BRAIN_API_BASE_URL,
    NEXT_PUBLIC_BACKEND_BASE_URL: process.env.NEXT_PUBLIC_BACKEND_BASE_URL,
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

function buildRequest(payload: ParentTrendQueryPayload) {
  return new Request("http://localhost:3000/api/ai/parent-trend-query", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-demo-account-id": "u-parent",
    },
    body: JSON.stringify(payload),
  });
}

function baseSnapshot() {
  const snapshot = createDemoSeedSnapshot("2026-04-04T08:00:00.000Z");
  return {
    ...snapshot,
    children: snapshot.children.filter((child) => child.id === "c-1"),
    attendance: snapshot.attendance.filter((record) => record.childId === "c-1"),
    meals: snapshot.meals.filter((record) => record.childId === "c-1"),
    growth: snapshot.growth.filter((record) => record.childId === "c-1"),
    feedback: snapshot.feedback.filter((record) => record.childId === "c-1"),
    health: snapshot.health.filter((record) => record.childId === "c-1"),
    taskCheckIns: snapshot.taskCheckIns.filter((record) => record.childId === "c-1"),
    interventionCards: snapshot.interventionCards.filter((record) => record.targetChildId === "c-1"),
    consultations: snapshot.consultations.filter((record) => record.childId === "c-1"),
    reminders: snapshot.reminders.filter((record) => record.childId === "c-1" || record.targetId === "c-1"),
    tasks: snapshot.tasks.filter((record) => record.childId === "c-1"),
    messages: snapshot.messages.filter((record) => record.childId === "c-1"),
    conversations: snapshot.conversations.filter((record) => record.childId === "c-1"),
    healthMaterials: snapshot.healthMaterials.filter((record) => record.childId === "c-1"),
    storybooks: snapshot.storybooks.filter((record) => record.childId === "c-1"),
  };
}

function buildPayload(overrides: Partial<ParentTrendQueryPayload> = {}): ParentTrendQueryPayload {
  return {
    question: "最近一个月分离焦虑缓解了吗？",
    childId: "c-1",
    appSnapshot: baseSnapshot(),
    ...overrides,
  };
}

async function readTrend(response: Response) {
  return (await response.json()) as ParentTrendQueryResponse;
}

async function withMockedFetch(
  fetchImpl: typeof fetch,
  fn: () => void | Promise<void>
) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function assertFallbackContract(body: ParentTrendQueryResponse, reason: string) {
  assert.equal(body.fallback, true);
  assert.equal(body.fallbackReason, reason);
  assert.equal(body.dataQuality.fallbackUsed, true);
  assert.ok(body.dataQuality.source);
  assert.ok(Array.isArray(body.warnings));
  assert.ok(body.warnings.length > 0);
  assert.ok(body.source);
}

test("parent trend route returns local fallback when provider fetch aborts", async () => {
  await withMockedFetch((async () => {
    throw new DOMException("Aborted", "AbortError");
  }) as typeof fetch, async () => {
    await withEnv({ BRAIN_API_BASE_URL: "http://brain.example.com", NEXT_PUBLIC_BACKEND_BASE_URL: undefined }, async () => {
      const response = await POST(buildRequest(buildPayload()));
      const body = await readTrend(response);

      assert.equal(response.status, 200);
      assert.equal(response.headers.get(SMARTCHILDCARE_TRANSPORT_HEADER), "next-json-fallback");
      assert.equal(response.headers.get(SMARTCHILDCARE_FALLBACK_REASON_HEADER), "brain-proxy-timeout");
      assertFallbackContract(body, "brain-proxy-timeout");
      assert.equal(body.source, "request_snapshot");
      assert.match(body.explanation, /本地趋势解释/);
    });
  });
});

test("parent trend route converts provider 503 into 200 fallback", async () => {
  await withMockedFetch((async () =>
    new Response(JSON.stringify({ error: "provider down" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    })) as typeof fetch, async () => {
    await withEnv({ BRAIN_API_BASE_URL: "http://brain.example.com", NEXT_PUBLIC_BACKEND_BASE_URL: undefined }, async () => {
      const response = await POST(buildRequest(buildPayload()));
      const body = await readTrend(response);

      assert.equal(response.status, 200);
      assertFallbackContract(body, "brain-status-503");
      assert.equal(body.source, "request_snapshot");
    });
  });
});

test("parent trend route marks sparse data without failing", async () => {
  await withMockedFetch((async () =>
    new Response(JSON.stringify({ error: "provider down" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    })) as typeof fetch, async () => {
    await withEnv({ BRAIN_API_BASE_URL: "http://brain.example.com", NEXT_PUBLIC_BACKEND_BASE_URL: undefined }, async () => {
      const sparseSnapshot = {
        ...baseSnapshot(),
        meals: [],
        growth: [],
        feedback: [],
        health: [],
      };
      const response = await POST(buildRequest(buildPayload({ appSnapshot: sparseSnapshot })));
      const body = await readTrend(response);

      assert.equal(response.status, 200);
      assert.equal(body.dataQuality.sparse, true);
      assert.equal(body.dataQuality.observedDays, 0);
      assert.ok(body.warnings.some((warning) => warning.includes("有效记录覆盖")));
    });
  });
});

test("parent trend route can build demo snapshot fallback for authorized child without request snapshot", async () => {
  await withMockedFetch((async () =>
    new Response(JSON.stringify({ error: "provider down" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    })) as typeof fetch, async () => {
    await withEnv({ BRAIN_API_BASE_URL: "http://brain.example.com", NEXT_PUBLIC_BACKEND_BASE_URL: undefined }, async () => {
      const response = await POST(
        buildRequest({
          question: "最近成长情况怎么样？",
          childId: "c-4",
        })
      );
      const body = await readTrend(response);

      assert.equal(response.status, 200);
      assertFallbackContract(body, "brain-status-503");
      assert.equal(body.source, "demo_snapshot");
      assert.ok(body.series.length > 0);
      assert.ok(body.dataQuality.observedDays >= 0);
    });
  });
});

test("parent trend route includes latest feedback in fallback explanation", async () => {
  await withMockedFetch((async () =>
    new Response("not json", {
      status: 200,
      headers: { "content-type": "text/plain" },
    })) as typeof fetch, async () => {
    await withEnv({ BRAIN_API_BASE_URL: "http://brain.example.com", NEXT_PUBLIC_BACKEND_BASE_URL: undefined }, async () => {
      const snapshot = baseSnapshot();
      snapshot.feedback = [
        {
          feedbackId: "feedback-latest-route-test",
          id: "feedback-latest-route-test",
          childId: "c-1",
          sourceRole: "parent",
          sourceChannel: "parent-agent",
          executionStatus: "completed",
          executionCount: 1,
          executorRole: "parent",
          childReaction: "accepted",
          improvementStatus: "clear_improvement",
          barriers: [],
          attachments: {},
          notes: "The bedtime routine worked better after the new feedback.",
          content: "The bedtime routine worked better after the new feedback.",
          submittedAt: "2026-04-04T20:00:00.000Z",
          date: "2026-04-04",
          status: "resolved",
          source: { kind: "structured", workflow: "parent-agent" },
          fallback: {},
          sourceWorkflow: "parent-agent",
          executed: true,
          improved: true,
          freeNote: "The bedtime routine worked better after the new feedback.",
          createdBy: "u-parent",
          createdByRole: "家长",
        },
      ];
      const response = await POST(
        buildRequest(
          buildPayload({
            question: "最近两周睡眠情况稳定吗？",
            appSnapshot: snapshot,
          })
        )
      );
      const body = await readTrend(response);
      const text = JSON.stringify(body);

      assert.equal(response.status, 200);
      assertFallbackContract(body, "brain-proxy-invalid-json");
      assert.match(text, /已纳入家长反馈/);
      assert.match(text, /bedtime routine/);
      assert.ok(body.supportingSignals.some((signal) => signal.sourceType === "feedback"));
    });
  });
});
