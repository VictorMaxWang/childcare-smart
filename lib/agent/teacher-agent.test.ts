import assert from "node:assert/strict";
import test from "node:test";

import type { AiFollowUpResponse, AiSuggestionResponse, WeeklyReportResponse } from "@/lib/ai/types";
import {
  buildTeacherAgentChildContext,
  buildTeacherAgentClassContext,
  buildTeacherCommunicationResult,
  buildTeacherFollowUpResult,
  buildTeacherWeeklySummaryResult,
} from "./teacher-agent.ts";
import { getLocalToday } from "@/lib/date";

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
      role: "教师",
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
    mealRecords: [],
    growthRecords: [],
    guardianFeedbacks: [],
  });

  const childContext = buildTeacherAgentChildContext(classContext, `child-${birthDate}`);
  assert.ok(childContext);

  return { classContext, childContext: childContext! };
}

const suggestion: AiSuggestionResponse = {
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
};

const communicationResponse: AiFollowUpResponse = {
  answer: "",
  keyPoints: [],
  nextSteps: [],
  disclaimer: "本建议仅用于托育观察与家园沟通参考，不构成医疗诊断。",
  source: "fallback",
};

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

test("teacher-agent weekly summary surfaces Lin Xiaoyu parent feedback writeback", () => {
  const today = getLocalToday();
  const classContext = buildTeacherAgentClassContext({
    currentUser: {
      name: "李老师",
      className: "向阳班",
      institutionId: "inst-1",
      role: "教师",
    },
    visibleChildren: [
      {
        id: "c-1",
        name: "林小雨",
        birthDate: "2022-03-01",
        className: "向阳班",
        allergies: [],
        specialNotes: "走廊活动听到响声后容易害怕、退缩。",
        guardians: [{ name: "林妈妈", relation: "妈妈", phone: "DEMO-PHONE-001" }],
      },
      {
        id: "c-12",
        name: "高远舟",
        birthDate: "2022-04-01",
        className: "向阳班",
        allergies: [],
        specialNotes: "午睡前焦虑。",
      },
      {
        id: "c-5",
        name: "陈安安",
        birthDate: "2022-05-01",
        className: "向阳班",
        allergies: [],
        specialNotes: "午餐进食偏少。",
      },
    ],
    presentChildren: [],
    healthCheckRecords: [],
    mealRecords: [],
    growthRecords: [
      {
        id: "growth-c-1-hallway",
        childId: "c-1",
        createdAt: today,
        category: "情绪表现",
        tags: ["走廊活动"],
        description: "林小雨走廊活动听到推车声后退缩。",
        needsAttention: true,
        reviewStatus: "待复查",
      },
    ],
    guardianFeedbacks: [
      {
        feedbackId: "feedback-api-lin-writeback",
        id: "feedback-api-lin-writeback",
        childId: "c-1",
        sourceRole: "parent",
        sourceChannel: "parent-agent",
        executionStatus: "completed",
        executionCount: 1,
        executorRole: "parent",
        childReaction: "improved",
        improvementStatus: "clear_improvement",
        barriers: [],
        notes: "写回链路测试：完成共读，孩子愿意复述我害怕并走到门口。",
        attachments: {},
        submittedAt: `${today}T21:00:00.000Z`,
        source: { kind: "structured", workflow: "parent-agent" },
        fallback: {},
        date: `${today}T21:00:00.000Z`,
        status: "completed",
        content: "写回链路测试：完成共读，孩子愿意复述我害怕并走到门口。",
        createdBy: "u-parent",
        createdByRole: "家长",
        executed: true,
        improved: true,
      },
    ],
  });

  const result = buildTeacherWeeklySummaryResult({
    classContext,
    report: {
      schemaVersion: "v2-actionized",
      role: "teacher",
      summary: "",
      highlights: [],
      risks: [],
      nextWeekActions: [],
      trendPrediction: "stable",
      sections: [],
      disclaimer: "test",
      source: "fallback",
    } satisfies WeeklyReportResponse,
  });
  const text = JSON.stringify(result);

  assert.match(text, /家庭反馈已回流/);
  assert.match(text, /写回链路测试/);
  assert.match(text, /孩子反应比之前更顺|明显更顺/);
  assert.match(text, /已经出现明确改善|明确改善/);
});
