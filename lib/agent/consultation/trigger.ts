import type { AiRiskLevel, ConsultationTrigger, ConsultationTriggerType } from "@/lib/ai/types";
import type { ConsultationInput } from "@/lib/agent/consultation/input";
import { getHydrationDisplayState } from "@/lib/hydration-display";

export interface ConsultationTriggerResult {
  shouldTrigger: boolean;
  riskLevel: AiRiskLevel;
  triggerReason: string;
  triggerTypes: ConsultationTriggerType[];
  triggers: ConsultationTrigger[];
}

function takeUnique(items: Array<string | undefined>, limit = 5) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = item?.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) break;
  }

  return result;
}

function hasPositiveFeedback(content: string) {
  return /(好转|改善|稳定|正常|没事|还好|缓解)/.test(content);
}

function countAbnormalDays(input: ConsultationInput) {
  return new Set(
    (input.recentDetails?.health ?? []).filter((item) => item.isAbnormal).map((item) => item.date)
  ).size;
}

function isStaleStructuredFeedback(input: ConsultationInput) {
  const feedback = input.latestFeedback;
  if (!input.currentInterventionCard || !feedback) return false;

  return (
    feedback.improved === false ||
    feedback.executionStatus === "not_started" ||
    feedback.executionStatus === "partial" ||
    feedback.executionStatus === "unable_to_execute" ||
    feedback.improvementStatus === "no_change" ||
    feedback.improvementStatus === "worse" ||
    feedback.barriers.length > 0 ||
    feedback.childReaction === "resisted"
  );
}

function hasPositiveStructuredFeedback(input: ConsultationInput) {
  const feedback = input.latestFeedback;
  if (!feedback) return false;

  return (
    feedback.improved === true ||
    feedback.improvementStatus === "slight_improvement" ||
    feedback.improvementStatus === "clear_improvement" ||
    feedback.childReaction === "accepted" ||
    feedback.childReaction === "improved" ||
    (feedback.content ? hasPositiveFeedback(feedback.content) : false)
  );
}

export function detectConsultationTrigger(input: ConsultationInput): ConsultationTriggerResult {
  const triggers: ConsultationTrigger[] = [];
  const healthRisk = input.summary.health.abnormalCount > 0 || input.summary.health.handMouthEyeAbnormalCount > 0;
  const dietRisk = input.summary.meals.hydrationAvg < 140 || input.summary.meals.monotonyDays >= 3;
  const reviewRisk = input.summary.growth.pendingReviewCount > 0;
  const growthRisk = input.summary.growth.attentionCount >= 2;
  const abnormalDays = countAbnormalDays(input);
  const hydrationDisplay = getHydrationDisplayState(input.summary.meals.hydrationAvg);
  const latestFeedback = input.latestFeedback;

  if ([healthRisk, dietRisk, reviewRisk || growthRisk].filter(Boolean).length >= 2) {
    triggers.push({
      triggerType: "multi-risk",
      reason: "同时命中健康、饮食或待复查等多个风险维度",
      score: 88,
      evidence: takeUnique([
        healthRisk ? `晨检异常 ${input.summary.health.abnormalCount} 次` : undefined,
        dietRisk ? `近 7 天补水状态 ${hydrationDisplay.statusLabel}` : undefined,
        reviewRisk ? `待复查 ${input.summary.growth.pendingReviewCount} 项` : undefined,
        growthRisk ? `持续关注观察 ${input.summary.growth.attentionCount} 条` : undefined,
      ]),
    });
  }

  if (abnormalDays >= 2 || input.summary.health.abnormalCount >= 2 || input.summary.growth.attentionCount >= 3) {
    triggers.push({
      triggerType: "continuous-abnormality",
      reason: "连续多天异常或关注信号未消退",
      score: 86,
      evidence: takeUnique([
        abnormalDays >= 2 ? `异常已持续 ${abnormalDays} 天` : undefined,
        input.summary.health.abnormalCount >= 2 ? `晨检异常累计 ${input.summary.health.abnormalCount} 次` : undefined,
        input.summary.growth.attentionCount >= 3 ? `成长观察关注 ${input.summary.growth.attentionCount} 条` : undefined,
      ]),
    });
  }

  if (isStaleStructuredFeedback(input)) {
    triggers.push({
      triggerType: "stale-intervention",
      reason: "已生成干预卡，但家长反馈显示执行或改善仍未闭环",
      score: 92,
      evidence: takeUnique([
        input.currentInterventionCard ? `当前干预卡：${input.currentInterventionCard.title}` : undefined,
        latestFeedback?.executionStatus ? `执行状态：${latestFeedback.executionStatus}` : undefined,
        latestFeedback?.improvementStatus ? `改善判断：${latestFeedback.improvementStatus}` : undefined,
        latestFeedback?.childReaction ? `孩子反应：${latestFeedback.childReaction}` : undefined,
        latestFeedback?.barriers[0] ? `执行阻碍：${latestFeedback.barriers[0]}` : undefined,
        latestFeedback?.notes,
      ]),
    });
  }

  if (hasPositiveStructuredFeedback(input) && (healthRisk || reviewRisk || growthRisk)) {
    triggers.push({
      triggerType: "feedback-conflict",
      reason: "家长反馈与园内观察存在明显冲突，需要联合校准",
      score: 82,
      evidence: takeUnique([
        latestFeedback?.content ? `家长反馈：${latestFeedback.content}` : undefined,
        latestFeedback?.improvementStatus ? `家长判断：${latestFeedback.improvementStatus}` : undefined,
        latestFeedback?.childReaction ? `孩子反应：${latestFeedback.childReaction}` : undefined,
        healthRisk ? "园内仍存在晨检异常" : undefined,
        reviewRisk ? "园内仍存在待复查任务" : undefined,
        growthRisk ? "园内仍存在连续关注记录" : undefined,
      ]),
    });
  }

  if (input.priorityHint?.level === "P1" || (input.priorityHint?.score ?? 0) >= 85) {
    const priorityHint = input.priorityHint;
    triggers.push({
      triggerType: "admin-priority",
      reason: "园长端优先级引擎已把该儿童判为高优先级对象",
      score: priorityHint?.score ?? 90,
      evidence: takeUnique([
        priorityHint?.reason,
        priorityHint?.level ? `优先级 ${priorityHint.level}` : undefined,
        priorityHint?.score ? `优先分 ${priorityHint.score}` : undefined,
      ]),
    });
  }

  const shouldTrigger = triggers.length > 0;
  const riskLevel: AiRiskLevel =
    triggers.some((item) => item.triggerType === "stale-intervention" || item.triggerType === "admin-priority") ||
    triggers.length >= 2
      ? "high"
      : shouldTrigger
        ? "medium"
        : "low";

  return {
    shouldTrigger,
    riskLevel,
    triggerReason:
      triggers[0]?.reason ??
      "当前风险信号尚未达到联合会诊阈值，可继续沿用单 Agent 工作流。",
    triggerTypes: triggers.map((item) => item.triggerType),
    triggers,
  };
}
