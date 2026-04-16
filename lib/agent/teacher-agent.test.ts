import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTeacherAgentChildContext,
  buildTeacherAgentClassContext,
  buildTeacherCommunicationResult,
  buildTeacherFollowUpResult,
} from "./teacher-agent.ts";

function birthDateMonthsAgo(monthsAgo: number) {
  const today = new Date();
  const safeDay = Math.min(today.getUTCDate(), 28);
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - monthsAgo, safeDay));
  return date.toISOString().slice(0, 10);
}

function createTeacherContexts(birthDate: string) {
  const classContext = buildTeacherAgentClassContext({
    currentUser: {
      name: "Teacher A",
      className: "Sun Class",
      institutionId: "inst-1",
      role: "teacher",
    },
    visibleChildren: [
      {
        id: `child-${birthDate}`,
        name: "Mia",
        birthDate,
        className: "Sun Class",
        allergies: [],
        specialNotes: "",
        guardians: [{ name: "Lin", relation: "妈妈", phone: "13800000000" }],
      },
    ],
    presentChildren: [
      {
        id: `child-${birthDate}`,
        name: "Mia",
        birthDate,
        className: "Sun Class",
        allergies: [],
        specialNotes: "",
        guardians: [{ name: "Lin", relation: "妈妈", phone: "13800000000" }],
      },
    ],
    healthCheckRecords: [],
    growthRecords: [],
    guardianFeedbacks: [],
  });

  const childContext = buildTeacherAgentChildContext(classContext, `child-${birthDate}`);
  assert.ok(childContext);

  return { classContext, childContext: childContext! };
}

const suggestion = {
  riskLevel: "medium",
  summary: "",
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

const communicationResponse = {
  answer: "",
  keyPoints: [],
  nextSteps: [],
  disclaimer: "本建议仅用于托育观察与家园沟通参考，不构成医疗诊断。",
  source: "fallback",
} as const;

test("teacher-agent communication result reflects age-band guidance", () => {
  const infant = createTeacherContexts(birthDateMonthsAgo(10));
  const toddler = createTeacherContexts(birthDateMonthsAgo(18));
  const olderToddler = createTeacherContexts(birthDateMonthsAgo(30));

  const infantResult = buildTeacherCommunicationResult({ context: infant.childContext, response: communicationResponse });
  const toddlerResult = buildTeacherCommunicationResult({ context: toddler.childContext, response: communicationResponse });
  const olderToddlerResult = buildTeacherCommunicationResult({
    context: olderToddler.childContext,
    response: communicationResponse,
  });

  assert.match(infantResult.summary, /喂养节律|睡眠安抚|分离安稳/);
  assert.match(infantResult.parentMessageDraft ?? "", /安稳|轻量|可重复/);
  assert.match(infantResult.tomorrowObservationPoint ?? "", /进食与补水节律是否稳定/);

  assert.match(toddlerResult.summary, /分离过渡|语言萌发|自主进食/);
  assert.match(toddlerResult.parentMessageDraft ?? "", /陪伴式过渡|清晰提示/);
  assert.match(toddlerResult.tomorrowObservationPoint ?? "", /入园分离后的恢复速度和寻求安抚方式/);

  assert.match(olderToddlerResult.summary, /同伴互动|规则切换|自理/);
  assert.match(olderToddlerResult.parentMessageDraft ?? "", /情绪命名|稳定边界/);
  assert.match(olderToddlerResult.tomorrowObservationPoint ?? "", /是否主动靠近同伴、轮流和回应冲突/);
});

test("teacher-agent follow-up result uses tri-band action shaping", () => {
  const infant = createTeacherContexts(birthDateMonthsAgo(10));
  const toddler = createTeacherContexts(birthDateMonthsAgo(18));
  const olderToddler = createTeacherContexts(birthDateMonthsAgo(30));

  const infantResult = buildTeacherFollowUpResult({
    classContext: infant.classContext,
    childContext: infant.childContext,
    suggestion,
  });
  const toddlerResult = buildTeacherFollowUpResult({
    classContext: toddler.classContext,
    childContext: toddler.childContext,
    suggestion,
  });
  const olderToddlerResult = buildTeacherFollowUpResult({
    classContext: olderToddler.classContext,
    childContext: olderToddler.childContext,
    suggestion,
  });

  assert.equal(infant.childContext.ageBandContext?.normalizedAgeBand, "0-12m");
  assert.equal(toddler.childContext.ageBandContext?.normalizedAgeBand, "12-24m");
  assert.equal(olderToddler.childContext.ageBandContext?.normalizedAgeBand, "24-36m");

  assert.match(infantResult.summary, /喂养节律|睡眠安抚/);
  assert.ok(infantResult.actionItems.some((item) => item.action.includes("先稳住喂养和睡眠节律")));
  assert.match(infantResult.tomorrowObservationPoint ?? "", /进食与补水节律是否稳定/);
  assert.match(infantResult.interventionCard?.todayInSchoolAction ?? "", /喂养|睡眠/);

  assert.match(toddlerResult.summary, /分离过渡|语言萌发|自主进食/);
  assert.ok(toddlerResult.actionItems.some((item) => item.action.includes("先固定一个过渡场景")));
  assert.match(toddlerResult.tomorrowObservationPoint ?? "", /入园分离后的恢复速度和寻求安抚方式/);
  assert.match(toddlerResult.interventionCard?.todayInSchoolAction ?? "", /过渡场景/);

  assert.match(olderToddlerResult.summary, /同伴互动|规则切换|自理/);
  assert.ok(olderToddlerResult.actionItems.some((item) => item.action.includes("先固定一个同伴或规则场景练习")));
  assert.match(olderToddlerResult.tomorrowObservationPoint ?? "", /是否主动靠近同伴、轮流和回应冲突/);
  assert.match(olderToddlerResult.interventionCard?.todayInSchoolAction ?? "", /同伴|规则场景/);
});
