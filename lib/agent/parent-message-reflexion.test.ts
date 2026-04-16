import assert from "node:assert/strict";
import test from "node:test";

import { mergeParentMessageReflexionResult } from "./parent-message-reflexion.ts";

function buildBaseResult() {
  return {
    title: "原始标题",
    summary: "原始摘要",
    targetChildId: "child-1",
    targetLabel: "安安",
    tonightTopAction: "原始今晚动作",
    whyNow: "原始 why now",
    homeSteps: ["原始今晚动作", "记录孩子反应"],
    tonightObservationPoints: ["情绪是否稳定"],
    teacherTomorrowObservation: "明天观察入园情绪",
    recommendedQuestions: ["今晚做完后有什么变化？"],
    feedbackPrompt: "请反馈执行情况",
    interventionCard: {
      id: "card-1",
      title: "原始干预卡标题",
      riskLevel: "medium",
      targetChildId: "child-1",
      triggerReason: "原始触发原因",
      summary: "原始干预卡摘要",
      todayInSchoolAction: "园内继续观察",
      tonightHomeAction: "原始今晚动作",
      homeSteps: ["原始今晚动作", "记录孩子反应"],
      observationPoints: ["情绪是否稳定"],
      tomorrowObservationPoint: "明天观察入园情绪",
      reviewIn48h: "48 小时内复盘",
      parentMessageDraft: "原始家长话术",
      teacherFollowupDraft: "原始老师跟进话术",
      source: "mock",
      model: "baseline-model",
    },
    consultation: {
      todayInSchoolActions: ["园内继续观察"],
      tonightAtHomeActions: ["原始今晚动作"],
      schoolAction: "园内继续观察",
      homeAction: "原始今晚动作",
    },
    consultationMode: false,
    highlights: ["原始 why now", "已有亮点"],
    assistantAnswer: "原始 assistant answer",
    source: "mock",
    model: "baseline-model",
    generatedAt: "2026-04-05T10:00:00.000Z",
  };
}

function buildResponse(overrides = {}) {
  return {
    finalOutput: {
      title: "更新后的标题",
      summary: "更新后的摘要",
      tonightActions: ["  今晚先抱一抱再说  ", "记录 10 分钟内情绪变化", "今晚先抱一抱再说"],
      wordingForParent: "今晚先抱一抱再说，再观察孩子情绪变化。",
      whyThisMatters: "这样能把老师观察和家庭反馈连起来。",
      estimatedTime: "5-10 分钟",
      followUpWindow: "明早入园前反馈",
      evaluationMeta: {
        score: 8.6,
        canSend: true,
        problems: [],
        revisionSuggestions: [],
        iterationScores: [8.6],
        approvedIteration: 1,
        stopReason: "passed",
        fallback: false,
        provider: "hybrid:vivo-llm+local-rule",
        model: "Volc-DeepSeek-V3.2",
        memoryContextUsed: true,
        decision: "approve",
      },
    },
    evaluationMeta: {
      score: 8.6,
      canSend: true,
      problems: [],
      revisionSuggestions: [],
      iterationScores: [8.6],
      approvedIteration: 1,
      stopReason: "passed",
      fallback: false,
      provider: "hybrid:vivo-llm+local-rule",
      model: "Volc-DeepSeek-V3.2",
      memoryContextUsed: true,
      decision: "approve",
    },
    revisionCount: 1,
    source: "vivo",
    model: "Volc-DeepSeek-V3.2",
    fallback: false,
    continuityNotes: ["连续性提示 A"],
    memoryMeta: { backend: "memory" },
    debugIterations: [],
    ...overrides,
  };
}

test("mergeParentMessageReflexionResult merges refined finalOutput into ParentAgentResult and InterventionCard", () => {
  const result = mergeParentMessageReflexionResult({
    baseResult: buildBaseResult(),
    response: buildResponse(),
  });

  assert.equal(result.title, "更新后的标题");
  assert.equal(result.summary, "更新后的摘要");
  assert.equal(result.tonightTopAction, "今晚先抱一抱再说");
  assert.equal(result.whyNow, "这样能把老师观察和家庭反馈连起来。");
  assert.deepEqual(result.homeSteps, ["今晚先抱一抱再说", "记录 10 分钟内情绪变化", "原始今晚动作", "记录孩子反应"]);
  assert.deepEqual(result.highlights, ["这样能把老师观察和家庭反馈连起来。", "原始 why now", "已有亮点"]);

  assert.equal(result.interventionCard.id, "card-1");
  assert.equal(result.interventionCard.title, "更新后的标题");
  assert.equal(result.interventionCard.summary, "更新后的摘要");
  assert.equal(result.interventionCard.tonightHomeAction, "今晚先抱一抱再说");
  assert.equal(result.interventionCard.reviewIn48h, "明早入园前反馈");
  assert.equal(result.interventionCard.parentMessageDraft, "今晚先抱一抱再说，再观察孩子情绪变化。");
  assert.equal(result.interventionCard.teacherFollowupDraft, "原始老师跟进话术");

  assert.match(result.assistantAnswer, /Tonight's top action: 今晚先抱一抱再说/);
  assert.match(result.assistantAnswer, /Follow-up window: 明早入园前反馈/);
  assert.deepEqual(result.parentMessageMeta, {
    revisionCount: 1,
    score: 8.6,
    canSend: true,
    fallback: false,
    stopReason: "passed",
    source: "vivo",
    model: "Volc-DeepSeek-V3.2",
  });
});

test("mergeParentMessageReflexionResult falls back to base fields when finalOutput strings are blank and actions are empty", () => {
  const response = buildResponse({
    finalOutput: {
      title: "   ",
      summary: "   ",
      tonightActions: ["  ", "", "原始今晚动作"],
      wordingForParent: "   ",
      whyThisMatters: "   ",
      estimatedTime: "   ",
      followUpWindow: "   ",
      evaluationMeta: {
        score: 7.2,
        canSend: false,
        problems: ["需要人工确认"],
        revisionSuggestions: ["先确认今晚动作"],
        iterationScores: [7.2],
        approvedIteration: null,
        stopReason: "generator_fallback",
        fallback: true,
        provider: "local-rule",
        model: "local-parent-message-v1",
        memoryContextUsed: false,
        decision: "revise",
      },
    },
    evaluationMeta: {
      score: 7.2,
      canSend: false,
      problems: ["需要人工确认"],
      revisionSuggestions: ["先确认今晚动作"],
      iterationScores: [7.2],
      approvedIteration: null,
      stopReason: "generator_fallback",
      fallback: true,
      provider: "local-rule",
      model: "local-parent-message-v1",
      memoryContextUsed: false,
      decision: "revise",
    },
    revisionCount: 0,
    source: "mock",
    model: "local-parent-message-v1",
    fallback: true,
  });

  const result = mergeParentMessageReflexionResult({
    baseResult: buildBaseResult(),
    response,
  });

  assert.equal(result.title, "原始标题");
  assert.equal(result.summary, "原始摘要");
  assert.equal(result.whyNow, "原始 why now");
  assert.deepEqual(result.homeSteps, ["原始今晚动作", "记录孩子反应"]);
  assert.equal(result.interventionCard.title, "原始干预卡标题");
  assert.equal(result.interventionCard.reviewIn48h, "48 小时内复盘");
  assert.equal(result.interventionCard.parentMessageDraft, "原始家长话术");
  assert.match(result.assistantAnswer, /原始家长话术/);
  assert.match(result.assistantAnswer, /Follow-up window: 48 小时内复盘/);
  assert.match(result.assistantAnswer, /Estimated time:\s*$/m);
  assert.deepEqual(result.parentMessageMeta, {
    revisionCount: 0,
    score: 7.2,
    canSend: false,
    fallback: true,
    stopReason: "generator_fallback",
    source: "mock",
    model: "local-parent-message-v1",
  });
});

test("mergeParentMessageReflexionResult preserves warnings/meta and non-sendable branch in parentMessageMeta only", () => {
  const response = buildResponse({
    evaluationMeta: {
      score: 6.9,
      canSend: false,
      problems: ["语气还可以再温和一点", "生成阶段已回退为本地兜底"],
      revisionSuggestions: ["减少命令式表达", "先人工确认后发送"],
      iterationScores: [6.1, 6.9],
      approvedIteration: null,
      stopReason: "evaluator_fallback",
      fallback: true,
      provider: "vivo-llm",
      model: "Volc-DeepSeek-V3.2",
      memoryContextUsed: true,
      decision: "block",
    },
    fallback: true,
    source: "mock",
    model: "Volc-DeepSeek-V3.2",
    continuityNotes: ["提示 A"],
    memoryMeta: { backend: "memory", degraded: false },
    debugIterations: [{ iteration: 1 }],
  });

  const result = mergeParentMessageReflexionResult({
    baseResult: buildBaseResult(),
    response,
  });

  assert.equal(result.parentMessageMeta?.canSend, false);
  assert.equal(result.parentMessageMeta?.fallback, true);
  assert.equal(result.parentMessageMeta?.stopReason, "evaluator_fallback");
  assert.equal(result.parentMessageMeta?.score, 6.9);
  assert.equal(result.interventionCard.title, "更新后的标题");
  assert.equal(result.interventionCard.parentMessageDraft, "今晚先抱一抱再说，再观察孩子情绪变化。");
});

test("mergeParentMessageReflexionResult handles missing runtime fields without throwing and keeps base result stable", () => {
  const result = mergeParentMessageReflexionResult({
    baseResult: buildBaseResult(),
    response: {
      source: "mock",
      fallback: true,
    } as never,
  });

  assert.equal(result.title, "原始标题");
  assert.equal(result.summary, "原始摘要");
  assert.deepEqual(result.homeSteps, ["原始今晚动作", "记录孩子反应"]);
  assert.equal(result.interventionCard.parentMessageDraft, "原始家长话术");
  assert.equal(result.parentMessageMeta?.revisionCount, 0);
  assert.equal(result.parentMessageMeta?.score, 0);
  assert.equal(result.parentMessageMeta?.canSend, false);
  assert.equal(result.parentMessageMeta?.fallback, true);
  assert.equal(result.parentMessageMeta?.source, "mock");
});
