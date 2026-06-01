import type { ConsultationInput } from "@/lib/agent/consultation/input";
import type { AdminConsultationFeedItem } from "@/lib/agent/admin-consultation";
import { buildLocalHighRiskConsultationFallback } from "@/lib/agent/high-risk-consultation-fallback";
import type { ConsultationResult } from "@/lib/ai/types";
import { buildDemoConsultationFeedItems } from "@/lib/demo/demo-consultations";

type AdminD01ConsultationOptions = {
  childName?: string;
  className?: string;
  generatedAt?: string;
};

const D01_CHILD_ID = "c-1";

function nowIso() {
  return new Date().toISOString();
}

export function buildAdminD01HighRiskConsultation(
  options: AdminD01ConsultationOptions = {}
): ConsultationResult {
  const generatedAt = options.generatedAt ?? nowIso();
  const input: ConsultationInput = {
    childId: D01_CHILD_ID,
    childName: options.childName || "林小雨",
    className: options.className || "向阳班",
    ageBand: "小班",
    source: "teacher",
    generatedAt,
    summary: {
      health: {
        abnormalCount: 1,
        handMouthEyeAbnormalCount: 0,
        moodKeywords: ["害怕退缩", "需要陪伴"],
      },
      meals: {
        recordCount: 1,
        hydrationAvg: 180,
        balancedRate: 1,
        monotonyDays: 0,
        allergyRiskCount: 0,
      },
      growth: {
        recordCount: 2,
        attentionCount: 1,
        pendingReviewCount: 1,
        topCategories: [{ category: "社会情绪", count: 2 }],
      },
      feedback: {
        count: 1,
        statusCounts: { pending: 1 },
        keywords: ["共读绘本", "小步尝试"],
      },
    },
    focusReasons: [
      "林小雨在走廊活动听到推车声后害怕退缩，需要勇敢表达与小步尝试的社会情绪支持。",
      "教师观察、成长记录、家长反馈和历史跟进均指向 48 小时复查闭环。",
    ],
    suggestionSummary: "将走廊活动拆成可选择的小目标，并同步园长端承接。",
    priorityHint: {
      level: "P1",
      score: 92,
      reason: "需要管理端承接 48 小时复查。",
    },
    responseSource: "fallback",
    continuityNotes: [
      "在老师陪伴下可以说出“我害怕”。",
      "今晚家庭任务为共读绘本并完成一次门口小步尝试。",
      "48 小时内复查是否能减少提示后表达需求。",
    ],
    memoryMeta: {
      backend: "local-demo-memory",
      degraded: false,
      usedSources: [
        "teacher-observation",
        "growth-record",
        "guardian-feedback",
        "consultation-history",
      ],
      errors: [],
      matchedSnapshotIds: ["memory-snapshot-c-1-social-emotional"],
      matchedTraceIds: ["history-trace-c-1-48h-review"],
    },
  };

  return {
    ...buildLocalHighRiskConsultationFallback({
      input,
      fallbackReason: "admin-feed-local-d01-high-risk",
    }),
    generatedAt,
  };
}

export function buildAdminD01ConsultationFeedItem(
  options: AdminD01ConsultationOptions = {}
): AdminConsultationFeedItem {
  const consultation = buildAdminD01HighRiskConsultation(options);
  const decisionCard = consultation.directorDecisionCard ?? {};

  return {
    consultationId: consultation.consultationId,
    childId: consultation.childId,
    generatedAt: consultation.generatedAt,
    riskLevel: consultation.riskLevel,
    triggerReason: consultation.triggerReason,
    triggerReasons: consultation.triggerReasons,
    summary: consultation.summary,
    directorDecisionCard: {
      ...decisionCard,
      status: decisionCard.status ?? "pending",
      recommendedOwnerRole: decisionCard.recommendedOwnerRole ?? "admin",
      recommendedOwnerName: decisionCard.recommendedOwnerName ?? "陈园长",
      recommendedAt: decisionCard.recommendedAt ?? consultation.generatedAt,
    },
    status: decisionCard.status ?? "pending",
    ownerName: decisionCard.recommendedOwnerName ?? "陈园长",
    ownerRole: decisionCard.recommendedOwnerRole ?? "admin",
    dueAt: decisionCard.recommendedAt ?? consultation.generatedAt,
    whyHighPriority:
      decisionCard.reason ??
      consultation.coordinatorSummary?.finalConclusion ??
      consultation.triggerReason,
    todayInSchoolActions: consultation.todayInSchoolActions,
    tonightAtHomeActions: consultation.tonightAtHomeActions,
    followUp48h: consultation.followUp48h,
    syncTargets: ["教师端结果卡", "家长端今晚任务", "园长端决策卡"],
    shouldEscalateToAdmin: true,
    evidenceItems: consultation.evidenceItems ?? [],
    explainabilitySummary: {
      agentParticipants: consultation.participants.map((participant) => participant.label),
      keyFindings: consultation.keyFindings,
      coordinationConclusion:
        consultation.coordinatorSummary?.finalConclusion ?? consultation.summary,
      evidenceHighlights:
        consultation.evidenceItems?.map((item) => `${item.sourceLabel}: ${item.summary}`).slice(0, 4) ?? [],
    },
    providerTraceSummary: {
      provider: "local-demo",
      source: "admin-feed-local-d01",
      transport: "next-json-fallback",
      fallbackReason: "admin-feed-local-d01-high-risk",
      realProvider: false,
      fallback: true,
    },
    memoryMetaSummary: consultation.memoryMeta,
  };
}

export function buildAdminLocalConsultationFeedItems(options?: {
  limit?: number;
  escalatedOnly?: boolean;
}) {
  const limit = Math.max(1, options?.limit ?? 4);
  const demoFeedItems = buildDemoConsultationFeedItems({
    limit,
    escalatedOnly: options?.escalatedOnly ?? false,
  });
  const byConsultationId = new Map<string, unknown>();

  for (const item of [buildAdminD01ConsultationFeedItem(), ...demoFeedItems]) {
    const consultationId =
      item && typeof item === "object" && "consultationId" in item
        ? String(item.consultationId)
        : "";
    if (consultationId && !byConsultationId.has(consultationId)) {
      byConsultationId.set(consultationId, item);
    }
  }

  return Array.from(byConsultationId.values()).slice(0, limit);
}
