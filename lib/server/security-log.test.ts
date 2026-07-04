import assert from "node:assert/strict";
import test from "node:test";

import { buildSafeLogDetails, logSecurityEvent } from "@/lib/server/security-log";

const SECRET_COOKIE = "ccs_session=raw-cookie-value";
const SECRET_API_KEY = "sk-live-secret-value";
const SECRET_SIGNATURE = "hmac-signature-value";
const CHILD_DETAIL = "Lin Xiaoyu has allergy notes";
const PARENT_FEEDBACK = "parent original feedback text";

test("buildSafeLogDetails redacts request secrets and child or feedback detail", () => {
  const safe = buildSafeLogDetails({
    route: "/api/ai/parent-trend-query",
    status: 403,
    cookie: SECRET_COOKIE,
    apiKey: SECRET_API_KEY,
    signature: SECRET_SIGNATURE,
    childDetail: CHILD_DETAIL,
    feedbackText: PARENT_FEEDBACK,
    error: Object.assign(new Error("raw child detail should not be printed"), {
      code: "forbidden_scope",
      status: 403,
    }),
  });

  const serialized = JSON.stringify(safe);
  assert.match(serialized, /parent-trend-query/);
  assert.match(serialized, /forbidden_scope/);
  assert.doesNotMatch(serialized, /raw-cookie-value|sk-live-secret-value|hmac-signature-value/);
  assert.doesNotMatch(serialized, /Lin Xiaoyu|allergy|parent original feedback|raw child detail/i);
});

test("logSecurityEvent never passes raw sensitive values to console", () => {
  const originalWarn = console.warn;
  const calls: unknown[][] = [];
  console.warn = (...args: unknown[]) => {
    calls.push(args);
  };

  try {
    logSecurityEvent("warn", "test.redaction", {
      headers: { authorization: `Bearer ${SECRET_API_KEY}`, cookie: SECRET_COOKIE },
      parentFeedback: PARENT_FEEDBACK,
      requestId: "req-123",
    });
  } finally {
    console.warn = originalWarn;
  }

  const serialized = JSON.stringify(calls);
  assert.match(serialized, /test\.redaction/);
  assert.match(serialized, /req-123/);
  assert.doesNotMatch(serialized, /Bearer|raw-cookie-value|sk-live-secret-value|parent original feedback/i);
});
