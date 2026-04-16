import { toFollowUpFeedbackLite } from "@/lib/feedback/normalize";
import type { ParentStructuredFeedbackLite } from "@/lib/feedback/types";

export interface StructuredFeedbackConsumptionScope {
  childId?: string;
  relatedTaskId?: string;
  relatedConsultationId?: string;
  interventionCardId?: string;
}

export interface StructuredFeedbackConsumption {
  feedback?: ParentStructuredFeedbackLite;
  summary?: string;
  continuitySignals: string[];
  openLoops: string[];
  primaryActionSupport?: string;
}

const EXECUTION_LABELS: Record<ParentStructuredFeedbackLite["executionStatus"], string> = {
  not_started: "尚未开始执行",
  partial: "已部分执行",
  completed: "已完成执行",
  unable_to_execute: "暂时无法执行",
};

const STATUS_LABELS: Record<string, string> = {
  ...EXECUTION_LABELS,
  pending: "待补充",
  synced: "已同步",
};

const REACTION_LABELS: Record<ParentStructuredFeedbackLite["childReaction"], string> = {
  resisted: "孩子明显抗拒",
  neutral: "孩子反应一般",
  accepted: "孩子愿意配合",
  improved: "孩子反应比之前更顺",
};

const IMPROVEMENT_LABELS: Record<ParentStructuredFeedbackLite["improvementStatus"], string> = {
  no_change: "目前还没有看到明显改善",
  slight_improvement: "已经出现轻微改善",
  clear_improvement: "已经出现明确改善",
  worse: "目前状态比之前更吃力",
  unknown: "效果暂时还不明确",
};

function uniqueTexts(items: Array<string | undefined>, limit = 5) {
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

function safeDateMs(value: string | undefined) {
  if (!value) return 0;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function toFeedbackKey(feedback: ParentStructuredFeedbackLite) {
  return (
    feedback.feedbackId ||
    feedback.id ||
    [feedback.childId, feedback.submittedAt ?? feedback.date ?? "", feedback.notes ?? feedback.content ?? ""].join(":")
  );
}

export function getStructuredFeedbackBindingCardId(feedback: ParentStructuredFeedbackLite) {
  return (
    feedback.fallback.rawInterventionCardId ||
    (feedback.interventionCardId && feedback.interventionCardId !== feedback.relatedTaskId
      ? feedback.interventionCardId
      : undefined)
  );
}

export function formatParentFeedbackStatusLabel(status: string | undefined) {
  const normalized = status?.trim();
  if (!normalized) return "最近暂无反馈";
  return STATUS_LABELS[normalized] ?? normalized;
}

export function collectStructuredFeedbackCandidates(
  values: Array<unknown>,
  scope?: Pick<StructuredFeedbackConsumptionScope, "childId">
) {
  const deduped = new Map<string, ParentStructuredFeedbackLite>();

  const pushCandidate = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(pushCandidate);
      return;
    }
    const normalized = toFollowUpFeedbackLite(value);
    if (!normalized) return;
    if (scope?.childId && normalized.childId !== scope.childId) return;
    deduped.set(toFeedbackKey(normalized), normalized);
  };

  values.forEach(pushCandidate);

  return Array.from(deduped.values()).sort(
    (left, right) =>
      safeDateMs(right.submittedAt ?? right.date) - safeDateMs(left.submittedAt ?? left.date)
  );
}

export function selectStructuredFeedback(
  values: Array<unknown>,
  scope: StructuredFeedbackConsumptionScope
) {
  const candidates = collectStructuredFeedbackCandidates(values, { childId: scope.childId });
  if (candidates.length === 0) return undefined;

  if (scope.relatedTaskId) {
    const taskMatch = candidates.find((feedback) => feedback.relatedTaskId === scope.relatedTaskId);
    if (taskMatch) return taskMatch;
  }

  if (scope.relatedConsultationId) {
    const consultationMatch = candidates.find(
      (feedback) => feedback.relatedConsultationId === scope.relatedConsultationId
    );
    if (consultationMatch) return consultationMatch;
  }

  if (scope.interventionCardId) {
    const cardMatch = candidates.find(
      (feedback) => getStructuredFeedbackBindingCardId(feedback) === scope.interventionCardId
    );
    if (cardMatch) return cardMatch;
  }

  return candidates[0];
}

function buildBindingSummary(feedback: ParentStructuredFeedbackLite) {
  const bindingParts = uniqueTexts([
    feedback.relatedTaskId ? `绑定任务 ${feedback.relatedTaskId}` : undefined,
    feedback.relatedConsultationId ? `关联会诊 ${feedback.relatedConsultationId}` : undefined,
    getStructuredFeedbackBindingCardId(feedback)
      ? `兼容干预卡 ${getStructuredFeedbackBindingCardId(feedback)}`
      : undefined,
  ]);

  return bindingParts.length > 0 ? bindingParts.join("，") : undefined;
}

function buildPrimaryActionSupport(feedback: ParentStructuredFeedbackLite) {
  const firstBarrier = feedback.barriers[0];

  if (feedback.executionStatus === "unable_to_execute") {
    return firstBarrier
      ? `先解决家庭执行阻碍：${firstBarrier}。`
      : "先确认为什么家庭动作暂时无法执行，再决定是否需要改小动作。";
  }

  if (feedback.executionStatus === "partial") {
    return firstBarrier
      ? `先补齐上次没完成的步骤，并处理阻碍：${firstBarrier}。`
      : "先补齐上次没有完成的步骤，再看孩子明早的连续反应。";
  }

  if (feedback.childReaction === "resisted") {
    return "先降低动作强度，并记录孩子最抗拒的具体环节。";
  }

  if (feedback.improvementStatus === "clear_improvement" || feedback.improvementStatus === "slight_improvement") {
    return "优先延续上次已经有效的家庭动作，并保持同一观察口径。";
  }

  if (feedback.improvementStatus === "no_change" || feedback.improvementStatus === "worse") {
    return firstBarrier
      ? `优先围绕执行阻碍调整动作：${firstBarrier}。`
      : "优先缩小今晚动作范围，确保家长能给出更明确的执行反馈。";
  }

  return feedback.notes
    ? `优先围绕家长备注继续跟进：${feedback.notes}`
    : "优先把今晚动作收敛成一个可执行、可反馈的闭环。";
}

export function buildStructuredFeedbackConsumption(
  feedback: ParentStructuredFeedbackLite | undefined
): StructuredFeedbackConsumption {
  if (!feedback) {
    return {
      continuitySignals: [],
      openLoops: [],
    };
  }

  const bindingSummary = buildBindingSummary(feedback);
  const notesSummary = feedback.notes || feedback.freeNote || feedback.content;
  const summary = uniqueTexts(
    [
      `家长反馈显示${EXECUTION_LABELS[feedback.executionStatus]}。`,
      `孩子反馈为“${REACTION_LABELS[feedback.childReaction]}”。`,
      feedback.improvementStatus !== "unknown"
        ? `当前效果判断：${IMPROVEMENT_LABELS[feedback.improvementStatus]}。`
        : undefined,
      bindingSummary ? `${bindingSummary}。` : undefined,
      feedback.barriers.length > 0 ? `主要阻碍：${feedback.barriers.slice(0, 2).join("；")}。` : undefined,
      notesSummary ? `补充说明：${notesSummary}` : undefined,
    ],
    6
  ).join("");

  const positiveSignal =
    feedback.executionStatus === "completed" &&
    (feedback.improvementStatus === "slight_improvement" ||
      feedback.improvementStatus === "clear_improvement" ||
      feedback.childReaction === "accepted" ||
      feedback.childReaction === "improved")
      ? "这条反馈可以作为后续继续沿用当前家庭动作的正向证据。"
      : undefined;

  const openLoops = uniqueTexts(
    [
      feedback.executionStatus === "not_started"
        ? `${bindingSummary ?? "该家庭动作"}还没有真正开始执行，需要确认今晚是否能落地。`
        : undefined,
      feedback.executionStatus === "partial"
        ? `${bindingSummary ?? "该家庭动作"}只完成了一部分，需要补齐剩余步骤。`
        : undefined,
      feedback.executionStatus === "unable_to_execute"
        ? `${bindingSummary ?? "该家庭动作"}暂时无法执行，需要先处理执行断点。`
        : undefined,
      feedback.improvementStatus === "no_change"
        ? "家长反馈显示目前还没有看到明确改善，需要继续跟进同一观察点。"
        : undefined,
      feedback.improvementStatus === "worse"
        ? "家长反馈显示当前状态比之前更吃力，需要重新评估动作强度和时机。"
        : undefined,
      feedback.barriers[0] ? `家长提到的首要阻碍是：${feedback.barriers[0]}` : undefined,
      feedback.childReaction === "resisted" ? "孩子对家庭动作仍有抗拒，建议把抗拒点写入下一轮跟进。" : undefined,
      feedback.notes ? `后续需要回看家长备注：${feedback.notes}` : undefined,
    ],
    5
  );

  return {
    feedback,
    summary,
    continuitySignals: uniqueTexts(
      [
        summary,
        bindingSummary ? `这条反馈与${bindingSummary}直接相关。` : undefined,
        positiveSignal,
        feedback.barriers.length > 0 ? `执行阻碍集中在：${feedback.barriers.slice(0, 2).join("；")}` : undefined,
      ],
      5
    ),
    openLoops,
    primaryActionSupport: buildPrimaryActionSupport(feedback),
  };
}

export function selectStructuredFeedbackConsumption(
  values: Array<unknown>,
  scope: StructuredFeedbackConsumptionScope
) {
  return buildStructuredFeedbackConsumption(selectStructuredFeedback(values, scope));
}
