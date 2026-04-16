import type { ConsultationFinding } from "@/lib/ai/types";
import type { ConsultationInput } from "@/lib/agent/consultation/input";

function takeUnique(items: Array<string | undefined>, limit = 4) {
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

function isFeedbackBlocked(input: ConsultationInput) {
  const feedback = input.latestFeedback;
  if (!feedback) return false;

  return (
    feedback.executionStatus === "not_started" ||
    feedback.executionStatus === "partial" ||
    feedback.executionStatus === "unable_to_execute" ||
    feedback.improvementStatus === "no_change" ||
    feedback.improvementStatus === "worse" ||
    feedback.barriers.length > 0 ||
    feedback.childReaction === "resisted"
  );
}

export function analyzeCoparentingConsultation(input: ConsultationInput): ConsultationFinding {
  const recentFeedback = input.recentDetails?.feedback ?? [];
  const latestFeedback = input.latestFeedback;
  const blockedFeedback = isFeedbackBlocked(input);

  return {
    agentId: "coparenting-agent",
    title: "家园沟通 Agent",
    riskExplanation: blockedFeedback
      ? "上一轮家园协同动作已经暴露出执行断点，沟通重点应从“再提醒一次”升级为“明确阻碍、缩小动作、约定明早怎么回传”。"
      : "当前需要把园内观察和家庭执行语言保持一致，避免双方对问题定义不一致。",
    signals: takeUnique([
      latestFeedback ? `最近反馈：${latestFeedback.status}` : "最近缺少家长反馈",
      latestFeedback?.executionStatus ? `执行状态：${latestFeedback.executionStatus}` : undefined,
      latestFeedback?.improvementStatus ? `效果判断：${latestFeedback.improvementStatus}` : undefined,
      latestFeedback?.barriers[0] ? `执行阻碍：${latestFeedback.barriers[0]}` : undefined,
      latestFeedback?.content,
      input.question,
      input.currentInterventionCard ? `已有干预卡 ${input.currentInterventionCard.title}` : undefined,
    ]),
    actions: takeUnique([
      "给家长的沟通话术要先定义今晚只做 1 个核心动作，再约定明早回传 2 到 3 个观察点。",
      blockedFeedback ? "明确询问上次卡住的原因，是没执行、执行不完整，还是孩子抗拒。" : undefined,
      latestFeedback?.barriers[0] ? `优先围绕“${latestFeedback.barriers[0]}”调整家庭动作。` : undefined,
      latestFeedback?.childReaction === "resisted" ? "如果孩子明显抗拒，先把动作拆小，再确认家长是否需要示范模板。" : undefined,
      "如果家长反馈与园内判断冲突，先对齐事实，再决定是否继续维持原动作。",
    ]),
    observationPoints: takeUnique([
      "家长是否真正完成今晚动作",
      "孩子对家庭动作的第一反应是什么",
      blockedFeedback ? "执行阻碍是否在今晚被清楚记录下来" : undefined,
      "明早反馈是否能覆盖情绪、饮水/进食、睡眠三个维度中的至少两个",
    ]),
    evidence: takeUnique([
      ...recentFeedback.slice(0, 3).map((item) => `${item.date} ${item.status} ${item.content}`),
      latestFeedback?.childReaction,
      latestFeedback?.notes,
      latestFeedback?.barriers[0],
    ]),
  };
}
