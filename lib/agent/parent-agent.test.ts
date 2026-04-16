import assert from "node:assert/strict";
import test from "node:test";

import {
  buildParentAgentChildContext,
  buildParentAgentSuggestionResult,
  buildParentChildSuggestionSnapshot,
} from "./parent-agent.ts";

function birthDateMonthsAgo(monthsAgo: number) {
  const today = new Date();
  const safeDay = Math.min(today.getUTCDate(), 28);
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - monthsAgo, safeDay));
  return date.toISOString().slice(0, 10);
}

function createParentContext(birthDate: string) {
  return buildParentAgentChildContext({
    child: {
      id: `child-${birthDate}`,
      name: "Mia",
      birthDate,
      gender: "女",
      allergies: [],
      heightCm: 90,
      weightKg: 13,
      guardians: [{ name: "Lin", relation: "妈妈", phone: "13800000000" }],
      institutionId: "inst-1",
      className: "Sun Class",
      specialNotes: "",
      avatar: "/demo/mia.png",
      parentUserId: "parent-1",
    },
    smartInsights: [],
    healthCheckRecords: [],
    mealRecords: [],
    growthRecords: [],
    guardianFeedbacks: [],
    taskCheckInRecords: [],
    weeklyTrend: {
      hydrationAvg: 118,
      balancedRate: 72,
      monotonyDays: 1,
      vegetableDays: 4,
      proteinDays: 4,
    },
  });
}

const suggestion = {
  riskLevel: "medium",
  summary: "建议继续做一轮轻量家园协同。",
  highlights: [],
  concerns: [],
  actions: [],
  actionPlan: {
    schoolActions: [],
    familyActions: [],
    reviewActions: [],
  },
  disclaimer: "本建议仅用于托育观察与家园沟通参考，不构成医疗诊断。",
  source: "fallback",
} as const;

test("parent-agent carries ageBandContext into snapshot and main suggestion output", () => {
  const infantContext = createParentContext(birthDateMonthsAgo(10));
  const toddlerContext = createParentContext(birthDateMonthsAgo(18));
  const olderToddlerContext = createParentContext(birthDateMonthsAgo(30));

  assert.equal(buildParentChildSuggestionSnapshot(infantContext).child.ageBandContext?.normalizedAgeBand, "0-12m");
  assert.equal(buildParentChildSuggestionSnapshot(toddlerContext).child.ageBandContext?.normalizedAgeBand, "12-24m");
  assert.equal(buildParentChildSuggestionSnapshot(olderToddlerContext).child.ageBandContext?.normalizedAgeBand, "24-36m");

  const infant = buildParentAgentSuggestionResult({ context: infantContext, suggestion });
  const toddler = buildParentAgentSuggestionResult({ context: toddlerContext, suggestion });
  const olderToddler = buildParentAgentSuggestionResult({ context: olderToddlerContext, suggestion });

  assert.match(infant.tonightTopAction, /安抚/);
  assert.match(infant.whyNow, /安稳|轻量|可重复/);
  assert.match(infant.teacherTomorrowObservation, /进食与补水节律是否稳定/);
  assert.ok(infant.tonightObservationPoints.some((item) => item.includes("进食与补水节律是否稳定")));

  assert.match(toddler.tonightTopAction, /语言回应|自主进食/);
  assert.match(toddler.whyNow, /陪伴式过渡|清晰提示/);
  assert.match(toddler.teacherTomorrowObservation, /入园分离后的恢复速度和寻求安抚方式/);
  assert.ok(toddler.tonightObservationPoints.some((item) => item.includes("入园分离后的恢复速度和寻求安抚方式")));

  assert.match(olderToddler.tonightTopAction, /命名情绪|下一步动作/);
  assert.match(olderToddler.whyNow, /情绪命名|稳定边界/);
  assert.match(olderToddler.teacherTomorrowObservation, /是否主动靠近同伴、轮流和回应冲突/);
  assert.ok(olderToddler.tonightObservationPoints.some((item) => item.includes("是否主动靠近同伴、轮流和回应冲突")));

  assert.notEqual(infant.tonightTopAction, toddler.tonightTopAction);
  assert.notEqual(toddler.tonightTopAction, olderToddler.tonightTopAction);
  assert.notEqual(infant.teacherTomorrowObservation, toddler.teacherTomorrowObservation);
  assert.notEqual(toddler.teacherTomorrowObservation, olderToddler.teacherTomorrowObservation);
});
