import assert from "node:assert/strict";
import test from "node:test";
import { buildParentHomeStatusCopy } from "./home-status-copy";

test("empty child records do not imply good health, an update time or a confirmed teacher plan", () => {
  const copy = buildParentHomeStatusCopy({ childName: "合成儿童", todayText: "10月31日", hasRecords: false, aiProvenance: "local-rule" });
  assert.match(copy.greeting, /无法判断/); assert.equal(copy.updateLabel, "暂无已同步记录");
  assert.equal(copy.focusSource, "记录规则建议"); assert.doesNotMatch(copy.focusTitle, /将|已确认/);
});
test("status timestamps and AI ownership come from the supplied record metadata", () => {
  const copy = buildParentHomeStatusCopy({ childName: "合成儿童", todayText: "10月31日", hasRecords: true, dataUpdatedAt: "2026-10-31T22:02:00+08:00", aiProvenance: "ai" });
  assert.match(copy.updateLabel, /22:02/); assert.equal(copy.focusSource, "AI 建议"); assert.doesNotMatch(copy.greeting, /状态良好/);
  const dayOnly = buildParentHomeStatusCopy({ childName: "合成儿童", todayText: "10月31日", hasRecords: true, dataUpdatedAt: "2026-10-31", aiProvenance: "local-rule" });
  assert.equal(dayOnly.updateLabel, "记录更新于 2026-10-31");
});
