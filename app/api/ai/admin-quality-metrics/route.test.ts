import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "./route.ts";

test("admin quality route replaces forged tenant data with the authenticated scope", async () => {
  const previousBaseUrl = process.env.BRAIN_API_BASE_URL;
  const originalFetch = globalThis.fetch;
  const captured: { body?: Record<string, unknown> } = {};

  process.env.BRAIN_API_BASE_URL = "https://brain.example.test";
  globalThis.fetch = (async (_input, init) => {
    const rawBody =
      init?.body instanceof ArrayBuffer
        ? new TextDecoder().decode(init.body)
        : String(init?.body ?? "");
    captured.body = JSON.parse(rawBody) as Record<string, unknown>;
    return new Response(JSON.stringify({ error: "provider unavailable" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const response = await POST(
      new Request("http://localhost/api/ai/admin-quality-metrics", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-demo-account-id": "u-admin",
        },
        body: JSON.stringify({
          institutionId: "inst-forged",
          snapshot: { marker: "forged" },
          windowDays: 7,
        }),
      })
    );

    assert.equal(response.status, 503);
    const forwardedBody = captured.body;
    assert.ok(forwardedBody);
    assert.equal(forwardedBody.institutionId, "inst-1");
    assert.notEqual(
      (forwardedBody.snapshot as { marker?: string } | undefined)?.marker,
      "forged"
    );
    assert.ok(Array.isArray((forwardedBody.snapshot as { children?: unknown[] }).children));
  } finally {
    globalThis.fetch = originalFetch;
    if (previousBaseUrl === undefined) {
      delete process.env.BRAIN_API_BASE_URL;
    } else {
      process.env.BRAIN_API_BASE_URL = previousBaseUrl;
    }
  }
});

test("admin quality route rejects a non-object JSON body", async () => {
  const response = await POST(
    new Request("http://localhost/api/ai/admin-quality-metrics", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-demo-account-id": "u-admin",
      },
      body: JSON.stringify(["invalid"]),
    })
  );

  assert.equal(response.status, 400);
});
