import assert from "node:assert/strict";
import test from "node:test";

import { normalizeHighRiskConsultationResult } from "@/lib/consultation/normalize-result";

function buildRawConsultationResult() {
  return {
    consultationId: "consult-evidence-1",
    childId: "child-1",
    generatedAt: "2026-04-08T10:00:00.000Z",
    riskLevel: "high",
    source: "vivo",
    summary: "需要继续跟进孩子午休前情绪和家园闭环。",
    parentMessageDraft: "今晚先记录孩子午睡前后的情绪变化。",
    reviewIn48h: "48 小时后复核执行情况。",
    triggerReasons: ["连续两天午休前情绪波动", "家庭反馈尚未补齐"],
    keyFindings: ["情绪波动持续", "需要家园同步观察"],
    todayInSchoolActions: ["午休前先做固定安抚动作"],
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
      requestId: "req-1",
      transport: "fastapi-brain",
      transportSource: "fastapi-brain",
      consultationSource: "high-risk-consultation",
      brainProvider: "vivo",
      fallbackReason: "",
      realProvider: true,
      fallback: false,
    },
    coordinatorSummary: {
      finalConclusion: "先稳住今晚家庭动作，再做 48 小时复核。",
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
      reason: "需要园长确认家园协同闭环",
      recommendedOwnerRole: "admin",
      recommendedOwnerName: "园长",
      recommendedAt: "2026-04-08T12:00:00.000Z",
      status: "pending",
    },
    interventionCard: {
      id: "card-1",
      title: "今晚闭环动作",
    },
    multimodalNotes: {
      teacherNote: "老师补充：今天午休前明显更黏老师。",
      voiceText: "老师语音记录：离园前情绪恢复速度偏慢。",
      imageText: "OCR 识别：家长反馈晚间情绪仍有波动。",
    },
  } satisfies Record<string, unknown>;
}

test("normalizeHighRiskConsultationResult emits evidenceItems and keeps legacy fields", () => {
  const normalized = normalizeHighRiskConsultationResult(buildRawConsultationResult());

  assert.ok(Array.isArray(normalized.evidenceItems));
  assert.ok(normalized.evidenceItems.length >= 5);
  assert.equal(normalized.traceMeta?.evidenceCount, normalized.evidenceItems.length);
  assert.ok(normalized.explainability.length >= 3);
  assert.ok(
    normalized.evidenceItems.some((item) => item.sourceType === "teacher_note")
  );
  assert.ok(
    normalized.evidenceItems.some((item) => item.sourceType === "memory_snapshot")
  );
  assert.ok(
    normalized.evidenceItems.some((item) => item.sourceType === "consultation_history")
  );
  assert.ok(
    normalized.evidenceItems.some((item) => item.sourceType === "derived_explainability")
  );
  assert.ok(
    normalized.evidenceItems.some(
      (item) =>
        item.sourceType === "derived_explainability" && item.requiresHumanReview
    )
  );
});
