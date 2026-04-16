import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveAdminWhyHighPriorityText,
  sanitizeAdminWhyHighPriorityText,
} from "./admin-consultation-sanitize.ts";

test("sanitizeAdminWhyHighPriorityText drops serialized snapshot blobs", () => {
  const leakedJson =
    '最近上下文：{"snapshot":{"child":{"id":"c-1","name":"林小雨"},"summary":{"health":{"abnormalCount":0},"growth":{"pendingReviewCount":2}}}}';

  assert.equal(sanitizeAdminWhyHighPriorityText(leakedJson), null);
});

test("resolveAdminWhyHighPriorityText falls back to structured reason when raw why is leaked json", () => {
  const leakedJson =
    '{"snapshot":{"child":{"id":"c-1","name":"林小雨"},"summary":{"growth":{"pendingReviewCount":2}}}}';

  const resolved = resolveAdminWhyHighPriorityText(
    undefined,
    "需要优先跟进连续两次待复查记录",
    "近 48 小时出现重复风险",
    sanitizeAdminWhyHighPriorityText(leakedJson)
  );

  assert.equal(resolved, "需要优先跟进连续两次待复查记录");
});

test("sanitizeAdminWhyHighPriorityText preserves natural language summaries", () => {
  const readable = "近两天连续出现午睡前情绪波动，需要优先关注并安排家园协同。";

  assert.equal(sanitizeAdminWhyHighPriorityText(readable), readable);
});
