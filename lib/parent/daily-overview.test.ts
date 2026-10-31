import assert from "node:assert/strict";
import test from "node:test";
import { buildParentDailyOverview, parentRecordDateKey, type ParentDailyRecord } from "./daily-overview";

test("daily overview preserves teacher facts, dates, updates and authorized photos while excluding other children and hidden rows", () => {
  const row: ParentDailyRecord = { recordId: "growth-a", childId: "child-a", classId: "class-a", type: "growth", createdAt: "2026-10-30T23:30:00Z", updatedAt: "2026-10-31T01:00:00Z", createdBy: "合成教师", visibleToParent: true, payload: { description: "尝试独立拿勺", category: "动作发展", mediaUrls: ["/api/attachments/photo-a", "/api/attachments/photo-a"] } };
  const result = buildParentDailyOverview([row, { ...row, childId: "child-b" }, { ...row, visibleToParent: false }], "child-a");
  assert.equal(result.length, 1); assert.equal(result[0].date, "2026-10-31");
  assert.equal(result[0].recorder, "合成教师"); assert.equal(result[0].updatedAt, "2026-10-31T01:00:00Z");
  assert.deepEqual(result[0].mediaUrls, ["/api/attachments/photo-a"]);
  assert.equal(result[0].summary, "尝试独立拿勺");
});

test("business date-only records preserve the occurrence date and invalid timestamps are not invented", () => {
  assert.equal(parentRecordDateKey("2026-10-30"), "2026-10-30");
  assert.equal(parentRecordDateKey("invalid"), "");
});
