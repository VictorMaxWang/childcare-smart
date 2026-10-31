import assert from "node:assert/strict";
import test from "node:test";

import type { WeeklyReportPayload } from "@/lib/ai/types";
import { buildWeeklyReportPayloadFromScope } from "@/lib/server/ai-scoped-payloads";
import { buildAiResultKey } from "@/lib/server/ai-result-cache";
import type { SessionScope } from "@/lib/server/session-scope";

function weeklySource(
  scopeType: "institution" | "class" | "child",
  scopeId: string
): WeeklyReportPayload {
  return {
    role: scopeType === "institution" ? "admin" : scopeType === "class" ? "teacher" : "parent",
    scopeType,
    scopeId,
    snapshot: { periodLabel: "\u8fd1 7 \u5929" } as WeeklyReportPayload["snapshot"],
  };
}

function multiChildScope(): SessionScope {
  const children = [
    { id: "child-a", name: "\u5e7c\u513f A", className: "\u5411\u9633\u73ed", classId: "class-a" },
    { id: "child-b", name: "\u5e7c\u513f B", className: "\u6668\u66e6\u73ed", classId: "class-b" },
  ];
  const scopedSnapshot = {
    children,
    attendance: [
      { childId: "child-a", date: "2026-10-31", isPresent: true },
      { childId: "child-b", date: "2026-10-31", isPresent: false },
    ],
    meals: [
      { childId: "child-a", date: "2026-10-31", waterMl: 300 },
      { childId: "child-b", date: "2026-10-31", waterMl: 100 },
    ],
    health: [
      { childId: "child-a", date: "2026-10-31", isAbnormal: false },
      { childId: "child-b", date: "2026-10-31", isAbnormal: true },
    ],
    growth: [
      { childId: "child-a", createdAt: "2026-10-31T08:00:00Z", needsAttention: false },
      { childId: "child-b", createdAt: "2026-10-31T08:00:00Z", needsAttention: true, description: "B risk" },
    ],
    feedback: [
      { childId: "child-a", date: "2026-10-31" },
      { childId: "child-b", date: "2026-10-31" },
    ],
  };

  return {
    user: {
      id: "parent-1",
      role: "\u5bb6\u957f",
      institutionId: "inst-1",
      childIds: ["child-a", "child-b"],
      accountKind: "normal",
    },
    institutionId: "inst-1",
    visibleChildren: children,
    scopedSnapshot,
  } as unknown as SessionScope;
}

test("child-scoped weekly reports exclude records from other authorized children", () => {
  const result = buildWeeklyReportPayloadFromScope(
    weeklySource("child", "child-a"),
    multiChildScope(), "2026-10-31"
  );

  assert.equal(result.snapshot.overview.visibleChildren, 1);
  assert.equal(result.snapshot.overview.attendanceRate, 100);
  assert.equal(result.snapshot.overview.mealRecordCount, 1);
  assert.equal(result.snapshot.overview.healthAbnormalCount, 0);
  assert.equal(result.snapshot.overview.feedbackCount, 1);
  assert.deepEqual(
    result.snapshot.topAttentionChildren.map((child) => child.childName),
    ["\u5e7c\u513f A"]
  );
});

test("class-scoped weekly reports only aggregate children from that class", () => {
  const result = buildWeeklyReportPayloadFromScope(
    weeklySource("class", "\u6668\u66e6\u73ed"),
    multiChildScope(), "2026-10-31"
  );

  assert.equal(result.snapshot.overview.visibleChildren, 1);
  assert.equal(result.snapshot.overview.attendanceRate, 0);
  assert.equal(result.snapshot.overview.healthAbnormalCount, 1);
  assert.equal(result.snapshot.diet.hydrationAvg, 100);
  assert.deepEqual(result.snapshot.risks, ["B risk"]);
});

test("weekly input excludes year-2000 history, expired records and future business dates", () => {
  const scope = multiChildScope();
  const snapshot = scope.scopedSnapshot;
  const dates = ["2000-01-01", "2026-10-24", "2026-10-25", "2026-10-31", "2026-11-01"];
  for (const group of ["attendance", "meals", "health", "growth", "feedback"] as const) {
    const records = dates.map((date, index) => ({ id: `synthetic-${group}-${index}`, childId: "child-a", date,
      createdAt: `${date}T00:00:00Z`, submittedAt: `${date}T00:00:00Z`, isPresent: true, isAbnormal: true,
      needsAttention: true, waterMl: index === 2 || index === 3 ? 200 : 9999 }));
    Object.assign(snapshot, { [group]: records });
  }
  const source = weeklySource("child", "child-a");
  source.snapshot.periodLabel = "客户端伪造全年范围";
  const result = buildWeeklyReportPayloadFromScope(source, scope, "2026-10-31");
  assert.deepEqual(result.snapshot.period, { startDate: "2026-10-25", endDate: "2026-10-31", timeZone: "Asia/Taipei" });
  assert.equal(result.snapshot.periodLabel, "近 7 天");
  assert.equal(result.snapshot.overview.mealRecordCount, 2);
  assert.equal(result.snapshot.overview.healthAbnormalCount, 2);
  assert.equal(result.snapshot.overview.growthAttentionCount, 2);
  assert.equal(result.snapshot.overview.feedbackCount, 2);
  assert.equal(result.snapshot.diet.hydrationAvg, 200);
});

test("weekly boundaries use UTC+8 for growth and feedback timestamps without host-timezone dependence", () => {
  const previous = process.env.TZ;
  try {
    for (const timezone of ["UTC", "Asia/Taipei", "America/New_York"]) {
      process.env.TZ = timezone;
      const scope = multiChildScope();
      const values = ["2026-10-24T15:59:59Z", "2026-10-24T16:00:00Z", "2026-10-31T15:59:59Z", "2026-10-31T16:00:00Z"];
      scope.scopedSnapshot.growth = values.map((createdAt, index) => ({ id: `g${index}`, childId: "child-a", createdAt, needsAttention: true })) as typeof scope.scopedSnapshot.growth;
      scope.scopedSnapshot.feedback = values.map((submittedAt, index) => ({ id: `f${index}`, childId: "child-a", submittedAt })) as typeof scope.scopedSnapshot.feedback;
      scope.scopedSnapshot.health = values.map((date, index) => ({ id: `h${index}`, childId: "child-a", date, isAbnormal: true })) as typeof scope.scopedSnapshot.health;
      scope.scopedSnapshot.meals = values.map((date, index) => ({ id: `m${index}`, childId: "child-a", date, waterMl: 200 })) as typeof scope.scopedSnapshot.meals;
      const result = buildWeeklyReportPayloadFromScope(weeklySource("child", "child-a"), scope, "2026-10-31T15:59:59Z");
      assert.equal(result.snapshot.overview.growthAttentionCount, 2);
      assert.equal(result.snapshot.overview.feedbackCount, 2);
      assert.equal(result.snapshot.overview.healthAbnormalCount, 2);
      assert.equal(result.snapshot.overview.mealRecordCount, 2);
      assert.deepEqual(result.snapshot.recentFeedback?.map(item => item.feedbackId), ["f2", "f1"]);
    }
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});

test("same-count feedback updates change both trusted model evidence and the persistent cache key", () => {
  const scope = multiChildScope();
  scope.scopedSnapshot.feedback = [{ feedbackId: "synthetic-feedback", childId: "child-a", date: "2026-10-31",
    submittedAt: "2026-10-31T01:00:00Z", updatedAt: "2026-10-31T02:00:00Z", status: "未处理", executionStatus: "unable_to_execute",
    childReaction: "resisted", improvementStatus: "worse", notes: "孩子抗拒，照护者未能完成动作", version: 1 }] as unknown as typeof scope.scopedSnapshot.feedback;
  const source = weeklySource("child", "child-a");
  const first = buildWeeklyReportPayloadFromScope(source, scope, "2026-10-31");
  const changed = structuredClone(scope);
  Object.assign(changed.scopedSnapshot.feedback[0], { status: "已处理", updatedAt: "2026-10-31T03:00:00Z", notes: "教师已读取反馈，后续减少任务步骤", version: 2 });
  const next = buildWeeklyReportPayloadFromScope(source, changed, "2026-10-31");
  assert.equal(first.snapshot.overview.feedbackCount, next.snapshot.overview.feedbackCount);
  assert.equal(first.snapshot.recentFeedback?.[0].notes, "孩子抗拒，照护者未能完成动作");
  assert.equal(next.snapshot.recentFeedback?.[0].status, "已处理");
  assert.equal(next.snapshot.recentFeedback?.[0].recordVersion, 2);
  assert.notEqual(first.snapshot.dataVersion, next.snapshot.dataVersion);
  const key = (input: WeeklyReportPayload) => buildAiResultKey({ session: scope.user, capability: "weekly-report", scopeId: "child:child-a", input },
    { provider: "synthetic", model: "synthetic", endpoint: "https://synthetic.invalid" }, new Date("2026-10-31T08:00:00Z"));
  assert.notEqual(key(first), key(next));
  const missingVersionUpdate = structuredClone(scope);
  Object.assign(missingVersionUpdate.scopedSnapshot.feedback[0], { notes: "旧系统没有更新时间，但家庭执行内容已变化" });
  const withoutUpdatedTimestamp = buildWeeklyReportPayloadFromScope(source, missingVersionUpdate, "2026-10-31");
  assert.notEqual(first.snapshot.dataVersion, withoutUpdatedTimestamp.snapshot.dataVersion);
  assert.notEqual(key(first), key(withoutUpdatedTimestamp));
  const foreign = structuredClone(changed);
  foreign.scopedSnapshot.feedback.push({ ...foreign.scopedSnapshot.feedback[0], childId: "child-b", notes: "禁止混入另一个孩子" });
  assert.deepEqual(buildWeeklyReportPayloadFromScope(source, foreign, "2026-10-31"), next);
});
