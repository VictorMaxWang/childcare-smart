import assert from "node:assert/strict";
import test from "node:test";

import type { WeeklyReportPayload } from "@/lib/ai/types";
import { buildWeeklyReportPayloadFromScope } from "@/lib/server/ai-scoped-payloads";
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
      { childId: "child-a", isPresent: true },
      { childId: "child-b", isPresent: false },
    ],
    meals: [
      { childId: "child-a", waterMl: 300 },
      { childId: "child-b", waterMl: 100 },
    ],
    health: [
      { childId: "child-a", isAbnormal: false },
      { childId: "child-b", isAbnormal: true },
    ],
    growth: [
      { childId: "child-a", needsAttention: false },
      { childId: "child-b", needsAttention: true, description: "B risk" },
    ],
    feedback: [
      { childId: "child-a" },
      { childId: "child-b" },
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
    multiChildScope()
  );

  assert.equal(result.snapshot.overview.visibleChildren, 1);
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
    multiChildScope()
  );

  assert.equal(result.snapshot.overview.visibleChildren, 1);
  assert.equal(result.snapshot.overview.healthAbnormalCount, 1);
  assert.equal(result.snapshot.diet.hydrationAvg, 100);
  assert.deepEqual(result.snapshot.risks, ["B risk"]);
});
