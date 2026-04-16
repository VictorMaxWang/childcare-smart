import assert from "node:assert/strict";
import test from "node:test";

import { buildUnavailableResponse } from "./contract.ts";

test("notification-events unavailable responses return a sanitized availability contract", async () => {
  const response = buildUnavailableResponse("通知派单暂不可用", "notification_store_unavailable");
  const body = (await response.json()) as {
    available: boolean;
    reasonCode: string;
    message: string;
    error: string;
  };

  assert.equal(response.status, 503);
  assert.deepEqual(body, {
    available: false,
    reasonCode: "notification_store_unavailable",
    message: "通知派单暂不可用",
    error: "通知派单暂不可用",
  });
  assert.equal(body.message.includes("DATABASE_URL"), false);
  assert.equal(body.error.includes("DATABASE_URL"), false);
});
