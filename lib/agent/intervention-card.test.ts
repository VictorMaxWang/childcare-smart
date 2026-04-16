import assert from "node:assert/strict";
import test from "node:test";

import { resolveAgeBandContext } from "../age-band/policy.ts";
import { buildInterventionCardFromSuggestion } from "./intervention-card.ts";

function birthDateMonthsAgo(monthsAgo: number) {
  const today = new Date();
  const safeDay = Math.min(today.getUTCDate(), 28);
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - monthsAgo, safeDay));
  return date.toISOString().slice(0, 10);
}

const baseSuggestion = {
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

test("intervention-card uses tri-band policy defaults for key action fields", () => {
  const infantCard = buildInterventionCardFromSuggestion({
    targetChildId: "child-infant",
    childName: "Mia",
    triggerReason: "需要继续跟进",
    suggestion: baseSuggestion,
    ageBandContext: resolveAgeBandContext({ birthDate: birthDateMonthsAgo(10) }),
  });
  const toddlerCard = buildInterventionCardFromSuggestion({
    targetChildId: "child-toddler",
    childName: "Mia",
    triggerReason: "需要继续跟进",
    suggestion: baseSuggestion,
    ageBandContext: resolveAgeBandContext({ birthDate: birthDateMonthsAgo(18) }),
  });
  const olderToddlerCard = buildInterventionCardFromSuggestion({
    targetChildId: "child-older",
    childName: "Mia",
    triggerReason: "需要继续跟进",
    suggestion: baseSuggestion,
    ageBandContext: resolveAgeBandContext({ birthDate: birthDateMonthsAgo(30) }),
  });

  assert.match(infantCard.todayInSchoolAction, /喂养|睡眠/);
  assert.match(infantCard.tonightHomeAction, /安抚/);
  assert.match(infantCard.tomorrowObservationPoint, /进食|补水|安抚/);
  assert.match(infantCard.reviewIn48h, /哭闹|睡眠波动|喂养/);

  assert.match(toddlerCard.todayInSchoolAction, /过渡场景/);
  assert.match(toddlerCard.tonightHomeAction, /语言回应|自主进食/);
  assert.match(toddlerCard.tomorrowObservationPoint, /分离后的恢复速度|安抚方式/);
  assert.match(toddlerCard.reviewIn48h, /模仿|配合|分离/);

  assert.match(olderToddlerCard.todayInSchoolAction, /同伴|规则场景/);
  assert.match(olderToddlerCard.tonightHomeAction, /命名情绪|下一步动作/);
  assert.match(olderToddlerCard.tomorrowObservationPoint, /同伴|轮流|冲突/);
  assert.match(olderToddlerCard.reviewIn48h, /单次冲突|抢玩具|自理/);

  assert.notEqual(infantCard.todayInSchoolAction, toddlerCard.todayInSchoolAction);
  assert.notEqual(toddlerCard.todayInSchoolAction, olderToddlerCard.todayInSchoolAction);
});

test("intervention-card keeps generic fallback when age-band cannot be resolved", () => {
  const card = buildInterventionCardFromSuggestion({
    targetChildId: "child-unknown",
    childName: "Mia",
    triggerReason: "需要继续跟进",
    suggestion: baseSuggestion,
  });

  assert.equal(card.todayInSchoolAction, "今天园内继续记录关键场景表现，并与家长同步执行重点。");
  assert.equal(card.tonightHomeAction, "今晚先完成一项稳定情绪和作息的家庭动作，并记录孩子反应。");
  assert.equal(card.tomorrowObservationPoint, "Mia 明日入园后的情绪、晨检状态和家庭反馈是否一致。");
  assert.equal(card.reviewIn48h, "48 小时内结合今晚反馈和明早入园状态复查一次。");
});
