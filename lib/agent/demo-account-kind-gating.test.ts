import assert from "node:assert/strict";
import test from "node:test";

import type {
  AiFollowUpResponse,
  AiSuggestionResponse,
  WeeklyReportResponse,
} from "@/lib/ai/types";
import type { ConsultationInput } from "@/lib/agent/consultation/input";
import {
  buildLocalHighRiskConsultationFallback,
  isLinXiaoyuHighRiskConsultationCase,
} from "@/lib/agent/high-risk-consultation-fallback";
import {
  buildTeacherAgentChildContext,
  buildTeacherAgentClassContext,
  buildTeacherCommunicationResult,
  buildTeacherFollowUpResult,
  buildTeacherWeeklySummaryResult,
  pickTeacherAgentWorkflowTargetChildId,
} from "@/lib/agent/teacher-agent";

type AccountKindGate = {
  accountKind: "demo" | "normal";
};

function withAccountKind<T extends object>(
  value: T,
  accountKind: AccountKindGate["accountKind"]
): T & AccountKindGate {
  return { ...value, accountKind };
}

function consultationInput(): ConsultationInput {
  return {
    childId: "c-1",
    childName: "林小雨",
    className: "真实班级",
    source: "teacher",
    generatedAt: "2026-07-26T00:00:00.000Z",
    summary: {
      health: {
        abnormalCount: 0,
        handMouthEyeAbnormalCount: 0,
      },
      meals: {
        recordCount: 0,
        hydrationAvg: 0,
        balancedRate: 0,
        monotonyDays: 0,
        allergyRiskCount: 0,
      },
      growth: {
        recordCount: 0,
        attentionCount: 0,
        pendingReviewCount: 0,
        topCategories: [],
      },
      feedback: {
        count: 0,
        statusCounts: {},
        keywords: [],
      },
    },
    focusReasons: ["普通账号真实观察：今天需要跟进情绪变化。"],
    responseSource: "fallback",
  };
}

function teacherContexts(accountKind: AccountKindGate["accountKind"]) {
  const classContext = buildTeacherAgentClassContext({
    currentUser: {
      name: "真实账号教师",
      className: "真实班级",
      institutionId: "inst-real",
      role: "教师",
      accountKind,
    },
    visibleChildren: [
      {
        id: "c-1",
        name: "林小雨",
        birthDate: "2022-03-01",
        className: "真实班级",
        allergies: [],
        specialNotes: "普通账号中恰好同名。",
      },
      {
        id: "c-12",
        name: "高远舟",
        birthDate: "2022-04-01",
        className: "真实班级",
        allergies: [],
        specialNotes: "普通账号中恰好同名。",
      },
      {
        id: "c-5",
        name: "陈安安",
        birthDate: "2022-05-01",
        className: "真实班级",
        allergies: [],
        specialNotes: "普通账号中恰好同名。",
      },
    ],
    presentChildren: [],
    healthCheckRecords: [],
    mealRecords: [],
    growthRecords: [],
    guardianFeedbacks: [],
  });

  const followUpChild = buildTeacherAgentChildContext(classContext, "c-12");
  const communicationChild = buildTeacherAgentChildContext(classContext, "c-5");
  assert.ok(followUpChild);
  assert.ok(communicationChild);

  return {
    classContext,
    followUpChild,
    communicationChild,
  };
}

const weeklyReport: WeeklyReportResponse = {
  schemaVersion: "v2-actionized",
  role: "teacher",
  summary: "真实账号周报内容",
  highlights: ["真实账号周报亮点"],
  risks: [],
  nextWeekActions: ["继续真实观察"],
  trendPrediction: "stable",
  sections: [],
  disclaimer: "test",
  source: "fallback",
};

const followUpSuggestion: AiSuggestionResponse = {
  riskLevel: "medium",
  summary: "真实账号随访内容",
  highlights: ["真实账号随访亮点"],
  concerns: [],
  actions: ["继续真实随访"],
  actionPlan: {
    schoolActions: ["继续真实随访"],
    familyActions: [],
    reviewActions: [],
  },
  disclaimer: "test",
  source: "fallback",
};

const communicationResponse: AiFollowUpResponse = {
  answer: "真实账号沟通内容",
  keyPoints: ["真实账号沟通重点"],
  nextSteps: ["继续真实沟通"],
  disclaimer: "test",
  source: "fallback",
};

function hasDemoAction(result: { actionItems: Array<{ id: string }> }) {
  return result.actionItems.some((item) => item.id.startsWith("demo-"));
}

test("normal account collisions never select the Lin Xiaoyu consultation demo fallback", () => {
  const input = consultationInput();

  assert.equal(
    isLinXiaoyuHighRiskConsultationCase(
      withAccountKind({ input, autoContext: null }, "normal")
    ),
    false
  );

  const result = buildLocalHighRiskConsultationFallback(
    withAccountKind(
      {
        input,
        autoContext: null,
        fallbackReason: "test-provider-unavailable",
      },
      "normal"
    )
  );

  assert.equal(result.consultationId, "consult-c-1-local-fallback");
  assert.doesNotMatch(JSON.stringify(result), /林小雨的一小步勇敢|勇敢表达与小步尝试/u);
});

test("explicit demo account keeps the Lin Xiaoyu consultation scenario", () => {
  const input = consultationInput();

  assert.equal(
    isLinXiaoyuHighRiskConsultationCase(
      withAccountKind({ input, autoContext: null }, "demo")
    ),
    true
  );

  const result = buildLocalHighRiskConsultationFallback(
    withAccountKind(
      {
        input,
        autoContext: null,
        fallbackReason: "test-provider-unavailable",
      },
      "demo"
    )
  );

  assert.equal(result.consultationId, "consult-c-1-bravery-expression");
  assert.match(JSON.stringify(result), /勇敢表达与小步尝试/u);
});

test("normal teacher account collisions do not replace real workflow results with demo templates", () => {
  const { classContext, followUpChild, communicationChild } = teacherContexts("normal");

  const weekly = buildTeacherWeeklySummaryResult({ classContext, report: weeklyReport });
  const followUp = buildTeacherFollowUpResult({
    classContext,
    childContext: followUpChild,
    suggestion: followUpSuggestion,
  });
  const communication = buildTeacherCommunicationResult({
    context: communicationChild,
    response: communicationResponse,
  });

  assert.equal(hasDemoAction(weekly), false);
  assert.equal(hasDemoAction(followUp), false);
  assert.equal(hasDemoAction(communication), false);
  assert.match(weekly.summary, /真实账号周报内容/u);
  assert.match(followUp.summary, /真实账号随访内容/u);
  assert.match(communication.summary, /真实账号沟通内容/u);
});

test("normal teacher workflow selection ignores demo child names and ids", () => {
  const { classContext } = teacherContexts("normal");

  assert.equal(
    pickTeacherAgentWorkflowTargetChildId(classContext, "follow-up"),
    "c-1"
  );
  assert.equal(
    pickTeacherAgentWorkflowTargetChildId(classContext, "communication"),
    "c-1"
  );
});

test("explicit demo teacher account keeps all three defense templates", () => {
  const { classContext, followUpChild, communicationChild } = teacherContexts("demo");

  const weekly = buildTeacherWeeklySummaryResult({ classContext, report: weeklyReport });
  const followUp = buildTeacherFollowUpResult({
    classContext,
    childContext: followUpChild,
    suggestion: followUpSuggestion,
  });
  const communication = buildTeacherCommunicationResult({
    context: communicationChild,
    response: communicationResponse,
  });

  assert.equal(hasDemoAction(weekly), true);
  assert.equal(hasDemoAction(followUp), true);
  assert.equal(hasDemoAction(communication), true);
});

test("explicit demo teacher workflow selection keeps the defense targets", () => {
  const { classContext } = teacherContexts("demo");

  assert.equal(
    pickTeacherAgentWorkflowTargetChildId(classContext, "follow-up"),
    "c-12"
  );
  assert.equal(
    pickTeacherAgentWorkflowTargetChildId(classContext, "communication"),
    "c-5"
  );
});
