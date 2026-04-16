import assert from "node:assert/strict";
import test from "node:test";

import type { ParentAgentChildContext, ParentAgentResult } from "./parent-agent.ts";
import {
  buildParentAgentTransparencyModel,
  buildParentHomeTransparencyModel,
} from "./parent-transparency.ts";
import type {
  ConsultationResult,
  ParentTrendQueryResponse,
  WeeklyReportResponse,
} from "../ai/types.ts";

function buildContext(overrides: Partial<ParentAgentChildContext> = {}) {
  return {
    today: "2026-04-11",
    child: {
      id: "child-1",
      name: "安安",
      className: "向日葵班",
      birthDate: "2021-05-06",
    } as never,
    smartInsights: [{ id: "insight-1", title: "午睡节奏波动", level: "warning" }] as never,
    todayMeals: [],
    weeklyMeals: [{ id: "meal-1", date: "2026-04-10" }, { id: "meal-2", date: "2026-04-09" }] as never,
    weeklyHealthChecks: [
      { id: "health-1", date: "2026-04-11", isAbnormal: false },
      { id: "health-2", date: "2026-04-10", isAbnormal: false },
    ] as never,
    weeklyGrowthRecords: [
      { id: "growth-1", createdAt: "2026-04-09T08:30:00.000Z" },
      { id: "growth-2", createdAt: "2026-04-08T08:30:00.000Z" },
    ] as never,
    attentionGrowthRecords: [],
    pendingReviews: [],
    weeklyFeedbacks: [
      {
        id: "feedback-1",
        date: "2026-04-10",
        status: "昨晚补水时一开始抗拒，后来能接受。",
      },
    ] as never,
    latestFeedback: {
      id: "feedback-1",
      date: "2026-04-10",
      status: "昨晚补水时一开始抗拒，后来能接受。",
    } as never,
    weeklyTrend: { hydrationAvg: 165 } as never,
    task: {
      id: "task-1",
      title: "睡前补水观察",
      description: "晚饭后补水 100ml，再观察情绪变化。",
      durationText: "10 分钟",
      tag: "今晚任务",
    },
    taskCheckIns: [],
    taskTimeline: [],
    focusReasons: ["近 3 天补水波动"],
    observationDefaults: ["睡前是否更容易烦躁"],
    ...overrides,
  } as ParentAgentChildContext;
}

function buildConsultation(overrides: Partial<ConsultationResult> = {}) {
  return {
    consultationId: "consult-1",
    triggerReason: "补水和情绪同时波动",
    triggerType: ["hydration-risk"],
    triggerReasons: ["近 3 天补水波动", "晚间情绪更容易起伏"],
    participants: [],
    childId: "child-1",
    riskLevel: "medium",
    agentFindings: [],
    summary: "老师建议今晚先做一个短时补水动作，再看情绪变化。",
    keyFindings: ["最近 3 天补水偏少"],
    healthAgentView: {} as never,
    dietBehaviorAgentView: {} as never,
    parentCommunicationAgentView: {} as never,
    inSchoolActionAgentView: {} as never,
    todayInSchoolActions: ["园内继续记录饮水量"],
    tonightAtHomeActions: ["晚饭后补水 100ml"],
    followUp48h: [],
    parentMessageDraft: "今晚先补水，再看反应。",
    directorDecisionCard: {
      title: "继续观察",
      reason: "暂不需要升级",
      recommendedOwnerRole: "parent",
      recommendedOwnerName: "家长",
      recommendedAt: "2026-04-11T10:00:00.000Z",
      status: "pending",
    },
    explainability: [],
    evidenceItems: [],
    nextCheckpoints: [],
    coordinatorSummary: {
      finalConclusion: "先做补水动作",
      riskLevel: "medium",
      problemDefinition: "补水和情绪波动",
      schoolAction: "园内继续记录饮水量",
      homeAction: "晚饭后补水 100ml",
      observationPoints: ["晚间情绪变化"],
      reviewIn48h: "48 小时内复查",
      shouldEscalateToAdmin: false,
    },
    schoolAction: "园内继续记录饮水量",
    homeAction: "晚饭后补水 100ml",
    observationPoints: ["晚间情绪变化"],
    reviewIn48h: "48 小时内复查",
    shouldEscalateToAdmin: false,
    continuityNotes: [],
    memoryMeta: {
      backend: "memory",
      degraded: false,
      usedSources: [],
      errors: [],
      matchedSnapshotIds: [],
      matchedTraceIds: [],
    },
    source: "ai",
    fallback: false,
    generatedAt: "2026-04-11T10:00:00.000Z",
    ...overrides,
  } as ConsultationResult;
}

function buildResult(overrides: Partial<ParentAgentResult> = {}) {
  return {
    title: "今晚先做一次短时补水",
    summary: "先做一个最容易执行的补水动作，再看情绪和配合度。",
    targetChildId: "child-1",
    targetLabel: "安安",
    tonightTopAction: "晚饭后补水 100ml，再观察 10 分钟。",
    whyNow: "最近 3 天补水偏少，且晚间情绪更容易起伏。",
    homeSteps: ["补水 100ml", "观察 10 分钟内情绪变化"],
    tonightObservationPoints: ["是否更愿意配合", "入睡前情绪是否稳定"],
    teacherTomorrowObservation: "明天老师继续看上午饮水主动性。",
    recommendedQuestions: ["如果孩子不愿意喝水怎么办？"],
    feedbackPrompt: "今晚做完后反馈孩子的接受度。",
    interventionCard: {
      id: "card-1",
      title: "睡前补水微动作",
      riskLevel: "medium",
      targetChildId: "child-1",
      triggerReason: "补水偏少",
      summary: "先补水，再看情绪。",
      todayInSchoolAction: "园内继续记录饮水量",
      tonightHomeAction: "晚饭后补水 100ml，再观察 10 分钟。",
      homeSteps: ["补水 100ml", "观察 10 分钟内情绪变化"],
      observationPoints: ["是否更愿意配合", "入睡前情绪是否稳定"],
      tomorrowObservationPoint: "明天老师继续看上午饮水主动性。",
      reviewIn48h: "48 小时内复查",
      parentMessageDraft: "今晚先补水，再看情绪变化。",
      teacherFollowupDraft: "明早继续看饮水主动性。",
      source: "ai",
      model: "baseline",
    },
    consultation: undefined,
    consultationMode: false,
    highlights: ["最近 3 天补水偏少"],
    assistantAnswer: "今晚先补水，再看情绪变化。",
    source: "ai",
    model: "baseline",
    generatedAt: "2026-04-11T10:00:00.000Z",
    ...overrides,
  } as ParentAgentResult;
}

function buildWeeklyReport(overrides: Partial<WeeklyReportResponse> = {}) {
  return {
    schemaVersion: "v2-actionized",
    role: "parent",
    summary: "本周补水需要继续稳定。",
    highlights: ["家长有持续反馈"],
    risks: [],
    nextWeekActions: ["继续晚饭后补水"],
    trendPrediction: "stable",
    sections: [],
    continuityNotes: [],
    disclaimer: "仅供照护建议参考",
    source: "ai",
    ...overrides,
  } as WeeklyReportResponse;
}

function buildTrendResult(overrides: Partial<ParentTrendQueryResponse> = {}) {
  return {
    query: {
      normalized: "最近补水怎么样",
      matchedKeywords: ["补水"],
    },
    intent: "trend",
    metric: "hydration",
    child: { id: "child-1", name: "安安" },
    windowDays: 7,
    range: {
      start: "2026-04-05",
      end: "2026-04-11",
    },
    labels: ["4/5", "4/6", "4/7", "4/8", "4/9", "4/10", "4/11"],
    xAxis: ["4/5", "4/6", "4/7", "4/8", "4/9", "4/10", "4/11"],
    series: [],
    trendLabel: "flat",
    trendScore: 0.2,
    comparison: {
      direction: "flat",
      delta: 0,
      label: "基本持平",
    },
    explanation: "补水基本持平。",
    supportingSignals: [],
    dataQuality: {
      observedDays: 5,
      coverageRatio: 5 / 7,
      sparse: false,
      fallbackUsed: false,
      source: "request_snapshot",
    },
    warnings: [],
    source: "request_snapshot",
    fallback: false,
    ...overrides,
  } as ParentTrendQueryResponse;
}

test("buildParentHomeTransparencyModel marks live suggestion and weekly report as real-record based", () => {
  const model = buildParentHomeTransparencyModel({
    context: buildContext(),
    suggestionResult: buildResult(),
    weeklyReport: buildWeeklyReport({
      continuityNotes: ["延续上周补水观察"],
    }),
    latestConsultation: buildConsultation(),
    pendingFeedback: false,
  });

  assert.match(model.summarySentence, /近 7 天/);
  assert.equal(model.reliabilityText, "主要基于真实记录，可作为今晚行动参考。");
  assert.equal(model.defaultExpanded, false);
  assert.ok(model.sourceBadges.some((item) => item.label === "孩子记录"));
  assert.ok(model.sourceBadges.some((item) => item.label === "家长反馈"));
  assert.ok(model.sourceBadges.some((item) => item.label === "老师观察"));
  assert.ok(model.sourceBadges.some((item) => item.label === "延续上周观察"));
  assert.ok(model.coverageText?.includes("覆盖率约"));
});

test("buildParentAgentTransparencyModel exposes fallback mode when suggestion falls back and trend is absent", () => {
  const model = buildParentAgentTransparencyModel({
    context: buildContext({
      weeklyFeedbacks: [],
      latestFeedback: undefined,
    }),
    currentResult: buildResult({
      source: "fallback",
    }),
    pendingFeedback: true,
  });

  assert.ok(model.sourceBadges.some((item) => item.label === "保守补位"));
  assert.equal(model.defaultExpanded, true);
  assert.match(model.reliabilityText, /初步建议/);
  assert.ok(model.warnings.some((item) => item.includes("保守补位")));
});

test("buildParentAgentTransparencyModel uses trend dataQuality and warnings when trend is sparse", () => {
  const model = buildParentAgentTransparencyModel({
    context: buildContext(),
    currentResult: buildResult(),
    trendResult: buildTrendResult({
      dataQuality: {
        observedDays: 2,
        coverageRatio: 2 / 7,
        sparse: true,
        fallbackUsed: false,
        source: "request_snapshot",
      },
      warnings: ["最近睡眠记录不足，趋势只适合作为参考。"],
    }),
    pendingFeedback: false,
  });

  assert.equal(model.coverageText, "最近 2/7 天有可用记录，覆盖率约 29%。");
  assert.match(model.reliabilityText, /继续观察确认/);
  assert.ok(model.warnings.includes("最近睡眠记录不足，趋势只适合作为参考。"));
});

test("buildParentAgentTransparencyModel warns on requiresHumanReview evidence and degraded memory", () => {
  const model = buildParentAgentTransparencyModel({
    context: buildContext(),
    currentResult: buildResult({
      consultation: buildConsultation({
        evidenceItems: [
          {
            id: "evidence-1",
            sourceType: "teacher_note",
            sourceLabel: "老师观察",
            summary: "孩子晚间更容易烦躁。",
            confidence: "medium",
            requiresHumanReview: true,
            evidenceCategory: "risk_control",
            supports: [],
          },
        ],
        memoryMeta: {
          backend: "memory",
          degraded: true,
          usedSources: [],
          errors: ["continuity missing"],
          matchedSnapshotIds: [],
          matchedTraceIds: [],
        },
      }),
    }),
    pendingFeedback: false,
  });

  assert.ok(model.warnings.includes("部分依据仍需人工观察确认。"));
  assert.ok(model.warnings.includes("当前延续记录不完整，这次说明会更保守。"));
  assert.match(model.reliabilityText, /继续观察确认/);
});

test("buildParentAgentTransparencyModel shows escalated closure status ahead of pending feedback copy", () => {
  const model = buildParentAgentTransparencyModel({
    context: buildContext(),
    currentResult: buildResult({
      consultation: buildConsultation({
        shouldEscalateToAdmin: true,
      }),
    }),
    pendingFeedback: true,
  });

  assert.equal(model.closureStatus, "已升级为机构关注，后续会按会诊节奏继续跟进。");
  assert.ok(model.sourceBadges.some((item) => item.label === "老师观察"));
});
