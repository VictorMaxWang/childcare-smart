import assert from "node:assert/strict";
import test from "node:test";

import { normalizeHighRiskConsultationResult } from "@/lib/consultation/normalize-result";
import { buildConsultationResultTraceViewModel } from "@/lib/consultation/trace-view-model";

function buildRawConsultationResult() {
  return {
    consultationId: "consult-trace-1",
    childId: "child-1",
    generatedAt: "2026-04-08T11:00:00.000Z",
    riskLevel: "high",
    source: "vivo",
    summary: "需要把园内观察、家长反馈和 48 小时复核接成闭环。",
    parentMessageDraft: "今晚记录孩子情绪和入睡情况。",
    reviewIn48h: "48 小时后复核执行情况。",
    triggerReasons: ["连续两天午休前情绪波动", "家庭反馈存在缺口"],
    keyFindings: ["情绪波动持续", "需要家园同步观察"],
    todayInSchoolActions: ["午休前固定安抚动作"],
    tonightAtHomeActions: ["晚间记录入睡前情绪变化"],
    followUp48h: ["48 小时内复核执行结果"],
    nextCheckpoints: ["明早继续回看情绪稳定度"],
    explainability: [
      { label: "关键发现", detail: "连续两天午休前情绪波动" },
      { label: "协调结论", detail: "先把园内动作和晚间反馈接成闭环" },
    ],
    participants: [
      { id: "health-agent", label: "Health Agent" },
      { id: "coparenting-agent", label: "Parent Agent" },
    ],
    shouldEscalateToAdmin: true,
    continuityNotes: ["过去一周出现过类似午休前情绪波动。"],
    memoryMeta: {
      backend: "memory",
      degraded: false,
      usedSources: ["snapshot"],
      errors: [],
      matchedSnapshotIds: ["snap-1"],
      matchedTraceIds: ["trace-1"],
    },
    providerTrace: {
      provider: "vivo",
      source: "vivo",
      model: "BlueLM",
      requestId: "req-2",
      transport: "fastapi-brain",
      transportSource: "fastapi-brain",
      consultationSource: "high-risk-consultation",
      brainProvider: "vivo",
      fallbackReason: "",
      realProvider: true,
      fallback: false,
    },
    coordinatorSummary: {
      finalConclusion: "今晚先执行家庭动作，48 小时后复核。",
      riskLevel: "high",
      problemDefinition: "情绪波动持续，需要闭环处理",
      schoolAction: "午休前固定安抚动作",
      homeAction: "晚间记录情绪和入睡变化",
      observationPoints: ["午休前情绪", "晚间入睡"],
      reviewIn48h: "48 小时后复核执行情况。",
      shouldEscalateToAdmin: true,
    },
    directorDecisionCard: {
      title: "重点会诊决策卡",
      reason: "需要园长确认闭环进度",
      recommendedOwnerRole: "admin",
      recommendedOwnerName: "园长",
      recommendedAt: "2026-04-08T12:00:00.000Z",
      status: "pending",
    },
    interventionCard: {
      id: "card-2",
      title: "今晚闭环动作",
    },
    multimodalNotes: {
      teacherNote: "老师补充：今天午休前明显更黏老师。",
      voiceText: "老师语音记录：离园前情绪恢复速度偏慢。",
      imageText: "OCR 识别：家长反馈晚间情绪仍有波动。",
    },
  } satisfies Record<string, unknown>;
}

test("buildConsultationResultTraceViewModel distributes evidenceItems by stage and keeps legacy evidence projection", () => {
  const result = normalizeHighRiskConsultationResult(buildRawConsultationResult());
  const viewModel = buildConsultationResultTraceViewModel({ result, mode: "demo" });

  assert.ok(viewModel.evidenceItems.length > 0);

  const longTermStage = viewModel.stages.find((stage) => stage.key === "long_term_profile");
  const recentStage = viewModel.stages.find((stage) => stage.key === "recent_context");
  const currentStage = viewModel.stages.find(
    (stage) => stage.key === "current_recommendation"
  );

  assert.ok(longTermStage);
  assert.ok(recentStage);
  assert.ok(currentStage);

  assert.ok(longTermStage!.evidenceItems.length > 0);
  assert.ok(
    longTermStage!.evidenceItems.every((item) =>
      ["memory_snapshot", "consultation_history"].includes(item.sourceType)
    )
  );
  assert.ok(recentStage!.evidenceItems.length > 0);
  assert.ok(
    recentStage!.evidenceItems.some((item) => item.sourceType === "teacher_note")
  );
  assert.ok(currentStage!.evidenceItems.length > 0);
  assert.ok(
    currentStage!.evidenceItems.every(
      (item) => item.sourceType === "derived_explainability"
    )
  );
  assert.ok(Array.isArray(currentStage!.evidence));
  assert.ok(currentStage!.evidence.length > 0);
});
