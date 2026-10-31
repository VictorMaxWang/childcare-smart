import assert from "node:assert/strict";
import test from "node:test";

import type { AiSuggestionResponse } from "@/lib/ai/types";
import {
  buildParentAgentChildContext,
  buildParentAgentActionDisplay,
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
      stapleDays: 5,
    },
  });
}

const suggestion: AiSuggestionResponse = {
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
};

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

test("growth without meals never creates low-hydration facts or comparative hydration prompts", () => {
  const context = createParentContext(birthDateMonthsAgo(26));
  assert.doesNotMatch(context.focusReasons.join(""), /补水偏少|补水需关注/);
  assert.doesNotMatch(context.observationDefaults.join(""), /今晚补水是否比前几天更主动/);
  assert.ok(context.focusReasons.some(item => /缺少饮食记录/.test(item)));
  const withMeals = buildParentAgentChildContext({ child: context.child, smartInsights: [], healthCheckRecords: [], growthRecords: [], guardianFeedbacks: [], taskCheckInRecords: [], weeklyTrend: { ...context.weeklyTrend, hydrationAvg: 80 }, mealRecords: [{ childId: context.child.id, date: context.today, waterMl: 80, foods: [] }] as never });
  assert.match(withMeals.focusReasons.join(""), /补水偏少/);
  assert.match(withMeals.observationDefaults.join(""), /今晚补水是否比前几天更主动/);
});

test("real AI family actions and evidence stay primary for infants and toddlers instead of an age rule", () => {
  const modelSuggestion: AiSuggestionResponse = { ...suggestion, source: "ai", model: "synthetic-maas-model",
    summary: "合成记录显示昨日进食后仍愿意再次尝试，今天反馈已完成一次短练习。",
    concerns: ["合成反馈中练习后稍有疲倦，需要缩短单次时长。"],
    actionPlan: { schoolActions: ["明日记录同一种食材的尝试反应。"],
      familyActions: ["晚餐后让孩子自主握勺尝试两口软食，观察是否主动伸手，再结束本次练习。", "把是否伸手和持续时间写入今晚反馈。"],
      reviewActions: ["两天后结合自主尝试次数和疲倦反应复查，必要时降低频次。"] } };
  for (const months of [8, 18, 30]) {
    const context = createParentContext(birthDateMonthsAgo(months));
    const result = buildParentAgentSuggestionResult({ context, suggestion: modelSuggestion });
    assert.equal(result.tonightTopAction, modelSuggestion.actionPlan!.familyActions[0]);
    assert.equal(result.interventionCard.tonightHomeAction, modelSuggestion.actionPlan!.familyActions[0]);
    assert.equal(result.whyNow, [modelSuggestion.summary, ...modelSuggestion.concerns].join("；"));
    assert.equal(result.interventionCard.triggerReason, modelSuggestion.concerns[0]);
    assert.equal(result.homeSteps[0], modelSuggestion.actionPlan!.familyActions[0]);
    assert.equal(result.homeSteps[1], modelSuggestion.actionPlan!.familyActions[1]);
    assert.equal(result.interventionCard.todayInSchoolAction, modelSuggestion.actionPlan!.schoolActions[0]);
    assert.equal(result.interventionCard.reviewIn48h, modelSuggestion.actionPlan!.reviewActions[0]);
    assert.equal(result.source, "ai"); assert.equal(result.interventionCard.source, "ai");
    assert.doesNotMatch(result.tonightTopAction, /阶段今晚先/u);
  }
});

test("AI text without an executable action cannot label a rule action as AI", () => {
  const result = buildParentAgentSuggestionResult({ context: createParentContext(birthDateMonthsAgo(8)), suggestion: { ...suggestion, source: "ai" } });
  assert.equal(result.source, "fallback"); assert.equal(result.interventionCard.source, "fallback");
  assert.match(result.tonightTopAction, /安抚/u);
});

test("empty-cache parent actions use distinct 8/18/30-month care rules and truthful provenance", () => {
  const expected = [[8, /安抚/u], [18, /语言回应|自主进食/u], [30, /命名情绪|下一步动作/u]] as const;
  const actions = new Set<string>();
  for (const [months, actionPattern] of expected) {
    const context = createParentContext(birthDateMonthsAgo(months));
    const display = buildParentAgentActionDisplay({ context });
    assert.match(context.task.description, actionPattern);
    assert.equal(context.task.tag, "月龄照护提示（规则）");
    assert.equal(display.source, "fallback");
    assert.equal(display.sourceLabel, "月龄照护提示（规则）");
    assert.match(display.whyNow, /仅依据.+照护规则/u);
    assert.match(display.whyNow, /尚未生成.+AI 个性化方案/u);
    assert.doesNotMatch(display.tonightTopAction, /指认|复述|数楼梯|10-15/u);
    assert.doesNotMatch(display.whyNow, /系统综合|已分析|已选出/u);
    assert.match(display.teacherObservation, /可将.+实际情况反馈给教师/u);
    actions.add(display.tonightTopAction);
  }
  assert.equal(actions.size, 3);
});

test("action display preserves real AI actions and evidence while ignoring stale rule cards", () => {
  const context = createParentContext(birthDateMonthsAgo(8));
  const result = buildParentAgentSuggestionResult({ context, suggestion: {
    ...suggestion, source: "ai", actions: ["按合成观察把晚间练习缩短为一次，记录是否主动回应。"],
    summary: "合成记录显示最近两次练习结束前出现疲倦。",
  } });
  const live = buildParentAgentActionDisplay({ context, result });
  assert.equal(live.source, "ai");
  assert.equal(live.tonightTopAction, result.tonightTopAction);
  assert.equal(live.whyNow, result.whyNow);
  const saved = buildParentAgentActionDisplay({ context, interventionCard: result.interventionCard });
  assert.equal(saved.source, "ai");
  assert.equal(saved.tonightTopAction, result.interventionCard.tonightHomeAction);
  const staleRule = buildParentAgentActionDisplay({ context, interventionCard: {
    ...result.interventionCard, source: "fallback", tonightHomeAction: "亲子共读10-15分钟并指认角色。",
  } });
  assert.equal(staleRule.source, "fallback");
  assert.equal(staleRule.tonightTopAction, context.task.description);
  assert.doesNotMatch(staleRule.tonightTopAction, /指认|10-15/u);
});
