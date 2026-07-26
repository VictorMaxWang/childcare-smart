import assert from "node:assert/strict";
import test from "node:test";

import {
  SMARTCHILDCARE_FALLBACK_REASON_HEADER,
  SMARTCHILDCARE_TRANSPORT_HEADER,
  SMARTCHILDCARE_UPSTREAM_HOST_HEADER,
} from "@/lib/server/brain-client";
import { buildScopedSessionFeedBody, GET } from "./route.ts";

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

function buildRequest() {
  return new Request("http://localhost:3000/api/ai/high-risk-consultation/feed?limit=4&escalated_only=true", {
    headers: {
      "x-demo-account-id": "u-admin",
    },
  });
}

function assertLocalFallbackFeed(body: unknown, fallbackReason: string | RegExp) {
  assert.equal(typeof body, "object");
  assert.ok(body);

  const record = body as Record<string, unknown>;
  assert.equal(record.source, "local-demo");
  assert.equal(record.fallback, true);
  if (typeof fallbackReason === "string") {
    assert.equal(record.fallbackReason, fallbackReason);
  } else {
    assert.match(String(record.fallbackReason), fallbackReason);
  }
  assert.equal(typeof record.message, "string");
  assert.ok(Array.isArray(record.items));
  assert.ok(record.items.length > 0);
  assert.equal(record.count, record.items.length);

  const items = record.items as Array<Record<string, unknown>>;
  const d01 = items.find((item) => item.childId === "c-1");
  assert.ok(d01);
  assert.equal(d01.riskLevel, "high");
  assert.equal(d01.shouldEscalateToAdmin, true);
}

test("high-risk consultation feed route falls back to local demo feed on brain 500", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.endsWith("/api/v1/agents/consultations/high-risk/feed?limit=4&escalated_only=true")) {
      return new Response(JSON.stringify({ error: "brain unavailable" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch url: ${url}`);
  }) as typeof fetch;

  try {
    await withEnv({ BRAIN_API_BASE_URL: "http://brain.example.com" }, async () => {
      const response = await GET(buildRequest());
      const body = (await response.json()) as unknown;

      assert.equal(response.status, 200);
      assertLocalFallbackFeed(body, "brain-status-500");
      assert.equal(response.headers.get(SMARTCHILDCARE_TRANSPORT_HEADER), "next-json-fallback");
      assert.equal(response.headers.get(SMARTCHILDCARE_FALLBACK_REASON_HEADER), "brain-status-500");
      assert.equal(response.headers.get(SMARTCHILDCARE_UPSTREAM_HOST_HEADER), "brain.example.com");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("high-risk consultation feed route falls back to local demo feed on fetch failure", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    throw new TypeError("Failed to fetch");
  }) as typeof fetch;

  try {
    await withEnv({ BRAIN_API_BASE_URL: "http://brain.example.com" }, async () => {
      const response = await GET(buildRequest());
      const body = (await response.json()) as unknown;

      assert.equal(response.status, 200);
      assertLocalFallbackFeed(body, /^brain-fetch-/);
      assert.equal(response.headers.get(SMARTCHILDCARE_TRANSPORT_HEADER), "next-json-fallback");
      assert.match(response.headers.get(SMARTCHILDCARE_FALLBACK_REASON_HEADER) ?? "", /^brain-fetch-/);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("normal-account session feed stays inside visible child scope without fallback labeling", () => {
  const scope = {
    visibleChildren: [
      {
        id: "child-visible",
        name: "可见幼儿",
        className: "向日葵班",
      },
    ],
    scopedSnapshot: {
      consultations: [
        {
          consultationId: "consult-visible",
          childId: "child-visible",
          generatedAt: "2026-07-26T08:00:00.000Z",
          riskLevel: "high",
          triggerReason: "需要园长承接",
          triggerReasons: ["需要园长承接"],
          summary: "可见会诊",
          directorDecisionCard: {
            status: "pending",
            reason: "需要跨端协调",
            recommendedOwnerName: "园长",
            recommendedOwnerRole: "admin",
            recommendedAt: "2026-07-26T08:00:00.000Z",
          },
          participants: [{ label: "健康观察智能体" }],
          keyFindings: ["连续异常"],
          coordinatorSummary: { finalConclusion: "建议人工复核" },
          todayInSchoolActions: ["复测"],
          tonightAtHomeActions: ["观察"],
          followUp48h: ["复查"],
          evidenceItems: [],
          shouldEscalateToAdmin: true,
        },
        {
          consultationId: "consult-hidden",
          childId: "child-hidden",
          generatedAt: "2026-07-26T09:00:00.000Z",
          riskLevel: "high",
          triggerReason: "其他机构数据",
          triggerReasons: ["其他机构数据"],
          summary: "不可见会诊",
          directorDecisionCard: {},
          participants: [],
          keyFindings: [],
          todayInSchoolActions: [],
          tonightAtHomeActions: [],
          followUp48h: [],
          evidenceItems: [],
          shouldEscalateToAdmin: true,
        },
      ],
    },
  } as unknown as Parameters<typeof buildScopedSessionFeedBody>[0];
  const url = new URL(
    "http://localhost:3000/api/ai/high-risk-consultation/feed?limit=4&escalated_only=true"
  );

  const body = buildScopedSessionFeedBody(scope, url);

  assert.equal(body.source, "session-scope");
  assert.equal(body.fallback, false);
  assert.equal(body.fallbackReason, null);
  assert.equal(body.message, null);
  assert.equal(body.count, 1);
  assert.equal(body.items[0]?.consultationId, "consult-visible");
});
