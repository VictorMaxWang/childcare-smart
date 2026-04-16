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

export function analyzeExecutionConsultation(input: ConsultationInput): ConsultationFinding {
  const pendingReview = input.summary.growth.pendingReviewCount;

  return {
    agentId: "execution-agent",
    title: "园内执行 Agent",
    riskExplanation:
      pendingReview > 0 || input.priorityHint?.level === "P1"
        ? "园内执行链路已到需要压缩动作、明确负责人与次日复查点的阶段。"
        : "当前重点是把园内执行动作和今晚家庭动作做成同一闭环，避免重复提醒但无人复核。",
    signals: takeUnique([
      pendingReview > 0 ? `待复查 ${pendingReview} 项` : undefined,
      input.priorityHint?.level ? `优先级 ${input.priorityHint.level}` : undefined,
      input.priorityHint?.reason,
      input.currentInterventionCard?.reviewIn48h,
    ]),
    actions: takeUnique([
      "今日园内先完成 1 个最关键复查动作，并在离园前补齐记录",
      "把明日第一观察点写成可核对结果的句子，而不是宽泛提醒",
      input.priorityHint?.level === "P1" ? "同步加入园所重点观察对象，确保园长端可见" : undefined,
    ]),
    observationPoints: takeUnique([
      "明日晨间先看今天的核心风险是否减弱",
      "复查是否已有明确责任人与时点",
      "是否需要升级为园所重点关注对象",
    ]),
    evidence: takeUnique([
      ...input.focusReasons,
      input.currentInterventionCard?.reviewIn48h,
      input.priorityHint?.reason,
    ]),
  };
}
