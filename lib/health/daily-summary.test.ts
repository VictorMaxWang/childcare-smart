import assert from "node:assert/strict";
import test from "node:test";
import { buildHealthDailySummary, filterHealthDailyChildren } from "./daily-summary";

const children = [{ id: "child-a", name: "合成甲" }, { id: "child-b", name: "合成乙" }];

test("two visible children with one morning check remain one completed and one pending before attendance is registered", () => {
  const summary = buildHealthDailySummary(children, [{ childId: "child-a", date: "2026-10-31", isAbnormal: false, temperature: 36.6 }], [], "2026-10-31");
  assert.deepEqual(summary.stats, { total: 2, present: 0, checked: 1, abnormal: 0, unchecked: 1 });
  assert.equal(filterHealthDailyChildren(summary.children, "all").length, 2);
  assert.deepEqual(filterHealthDailyChildren(summary.children, "checked").map(child => child.id), ["child-a"]);
  assert.deepEqual(filterHealthDailyChildren(summary.children, "unchecked").map(child => child.id), ["child-b"]);
});

test("health statistics never include foreign children or turn missing attendance into completed checks", () => {
  const summary = buildHealthDailySummary(children, [
    { childId: "child-a", date: "2026-10-30", isAbnormal: true },
    { childId: "foreign-child", date: "2026-10-31", isAbnormal: true },
  ], [{ id: "child-a" }, { id: "child-a" }, { id: "foreign-child" }], "2026-10-31");
  assert.deepEqual(summary.stats, { total: 2, present: 1, checked: 0, abnormal: 0, unchecked: 2 });
});

test("today uses business UTC+8 and the latest record per child, keeping every count equal to its filter", () => {
  const summary = buildHealthDailySummary(children, [
    { childId: "child-a", date: "2026-10-30T16:30:00Z", isAbnormal: true, updatedAt: "2026-10-31T01:00:00Z" },
    { childId: "child-a", date: "2026-10-31", isAbnormal: false, updatedAt: "2026-10-31T02:00:00Z" },
    { childId: "child-b", date: "2026-10-30T17:00:00Z", isAbnormal: true, updatedAt: "2026-10-31T01:00:00Z" },
    { childId: "child-b", date: "2026-10-31T16:00:00Z", isAbnormal: false, updatedAt: "2026-11-01T01:00:00Z" },
  ], [], "2026-10-31");
  assert.deepEqual(summary.stats, { total: 2, present: 0, checked: 2, abnormal: 1, unchecked: 0 });
  assert.equal(summary.children[0].health?.isAbnormal, false);
  for (const [status, expected] of [["all", summary.stats.total], ["checked", summary.stats.checked], ["unchecked", summary.stats.unchecked], ["abnormal", summary.stats.abnormal]] as const) {
    assert.equal(filterHealthDailyChildren(summary.children, status).length, expected);
  }
});
