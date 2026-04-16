import assert from "node:assert/strict";
import test from "node:test";

import type { TeacherAgentRequestPayload } from "@/lib/agent/teacher-agent";
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

function buildPayload(): TeacherAgentRequestPayload {
  return {
    workflow: "weekly-summary",
    scope: "class",
    currentUser: {
      name: "Teacher Li",
      className: "Sun Class",
      institutionId: "inst-1",
      role: "teacher",
    },
    visibleChildren: [
      {
        id: "child-1",
        name: "Ava",
        birthDate: "2021-02-01",
        className: "Sun Class",
        allergies: [],
        specialNotes: "",
      },
      {
        id: "child-2",
        name: "Ben",
        birthDate: "2021-03-01",
        className: "Sun Class",
        allergies: [],
        specialNotes: "",
      },
    ],
    presentChildren: [],
    healthCheckRecords: [],
    growthRecords: [],
    guardianFeedbacks: [],
  };
}

test("teacher weekly-summary route uses teacher-only memory namespace in local fallback", async () => {
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
      const response = await POST(
        new Request("http://localhost:3000/api/ai/teacher-agent", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-ai-force-fallback": "1",
          },
          body: JSON.stringify(buildPayload()),
        })
      );
      const body = (await response.json()) as Record<string, unknown>;

      assert.equal(response.status, 200);
      assert.equal(body.workflow, "weekly-summary");
      assert.ok(memoryRequests.length > 0);
      assert.ok(
        memoryRequests.every(
          (requestBody) => requestBody.workflow_type === "teacher-weekly-summary"
        )
      );
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
