import type { WeeklyReportResponse } from "../ai/types.ts";
import type {
  AdminAgentActionItem,
  AdminAgentResult,
  AdminFeedbackRiskSummary,
  AdminRiskChildSummary,
  AdminRiskClassSummary,
  InstitutionPriorityItem,
  InstitutionScopeSummary,
} from "./admin-types";

const RAW_INTERNAL_TOKENS = [
  "teacher-agent",
  "workflow",
  "objectscope",
  "targetchildid",
  "actionitems",
  "node_name",
  "action_type",
  "input_summary",
  "output_summary",
  "recent context",
  "recent consultation",
  "trace_id",
  "prompt_context",
  "snapshot_json",
  "metadata_json",
] as const;

function takeUnique(items: Array<string | null | undefined>, limit = 6) {
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

function normalizeInlineWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripLeadingLabel(value: string) {
  return value.replace(/^[\u4e00-\u9fa5A-Za-z0-9_-]{1,12}[：:]\s*/, "").trim();
}

function looksLikeStructuredPayload(text: string) {
  const compact = normalizeInlineWhitespace(text);
  if (!compact) return false;

  const lower = compact.toLowerCase();
  if (RAW_INTERNAL_TOKENS.some((token) => lower.includes(token))) {
    return true;
  }

  if (/[A-Za-z0-9_-]+\s*:\s*[\[{]/.test(compact)) {
    return true;
  }

  if (
    (/^[\[{]/.test(compact)) &&
    (compact.match(/"[^"]+"\s*:/g)?.length ?? 0) >= 2
  ) {
    return true;
  }

  const keyValueCount =
    (compact.match(/"[^"]+"\s*:/g)?.length ?? 0) +
    (compact.match(/\b[A-Za-z_][A-Za-z0-9_]*\s*:/g)?.length ?? 0);
  const punctuationDensity =
    (compact.match(/[{}[\]":,]/g)?.length ?? 0) / Math.max(compact.length, 1);

  return keyValueCount >= 3 && compact.length >= 80 && punctuationDensity > 0.1;
}

export function sanitizeAdminWeeklyText(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) return null;
  return looksLikeStructuredPayload(normalized) ? null : normalizeInlineWhitespace(normalized);
}

export function sanitizeAdminWeeklyTexts(values: string[] | null | undefined, limit = 6) {
  return takeUnique((values ?? []).map((item) => sanitizeAdminWeeklyText(item)), limit);
}

function buildPriorityRiskText(item?: InstitutionPriorityItem) {
  if (!item) return null;
  return sanitizeAdminWeeklyText(`${item.targetName}需要持续跟进，重点是${item.reason}`);
}

function buildChildRiskText(item?: AdminRiskChildSummary) {
  if (!item) return null;
  return sanitizeAdminWeeklyText(`${item.childName}仍是本周重点跟进对象，当前风险集中在${item.reason}`);
}

function buildClassRiskText(item?: AdminRiskClassSummary) {
  if (!item) return null;
  return sanitizeAdminWeeklyText(`${item.className}仍需持续关注，当前压力点是${item.reason}`);
}

function buildFeedbackRiskText(item?: AdminFeedbackRiskSummary) {
  if (!item) return null;
  return sanitizeAdminWeeklyText(`${item.childName}的家园协同仍需补齐，当前重点是${item.reason}`);
}

function buildActionSummaryText(item?: AdminAgentActionItem) {
  if (!item) return null;

  const action =
    sanitizeAdminWeeklyText(item.action) ??
    sanitizeAdminWeeklyText(item.summary) ??
    `围绕${item.targetName}先完成本周承接动作`;

  return sanitizeAdminWeeklyText(`${item.ownerLabel}在${item.deadline}前推进：${action}`) ?? action;
}

function formatContinuityNote(label: string, detail: string | null | undefined) {
  const normalized = sanitizeAdminWeeklyText(stripLeadingLabel(detail ?? ""));
  if (!normalized) return null;
  return `${label}：${normalized.replace(/[。；;，,\s]+$/g, "")}`;
}

function buildOverallSentence(scope: InstitutionScopeSummary) {
  const attendanceRate = Number.isFinite(scope.attendanceRate) ? scope.attendanceRate : 0;
  const feedbackRate = Number.isFinite(scope.feedbackCompletionRate) ? scope.feedbackCompletionRate : 0;

  if (scope.pendingReviewCount > 0 || scope.pendingDispatchCount > 0) {
    return `本周整体运行已形成复盘基础，机构出勤率${attendanceRate}% ，家园反馈完成率${feedbackRate}% ，当前仍有${scope.pendingReviewCount}项待复查和${scope.pendingDispatchCount}项待承接动作需要持续闭环。`;
  }

  return `本周整体运行基本稳定，机构出勤率${attendanceRate}% ，家园反馈完成率${feedbackRate}% ，周报所需的核心数据已形成复盘基础。`;
}

function buildRiskSentence(params: {
  institutionScope: InstitutionScopeSummary;
  priorityTopItems: InstitutionPriorityItem[];
  riskChildren: AdminRiskChildSummary[];
  riskClasses: AdminRiskClassSummary[];
  feedbackRiskItems: AdminFeedbackRiskSummary[];
}) {
  const focus =
    buildPriorityRiskText(params.priorityTopItems[0]) ??
    buildChildRiskText(params.riskChildren[0]) ??
    buildClassRiskText(params.riskClasses[0]) ??
    buildFeedbackRiskText(params.feedbackRiskItems[0]) ??
    (params.institutionScope.pendingReviewCount > 0
      ? `当前主要风险集中在待复查事项仍未完全闭环。`
      : params.institutionScope.pendingDispatchCount > 0
        ? `当前主要风险集中在承接动作尚未全部落地。`
        : `当前主要风险集中在下周承接动作的连续跟进节奏。`);

  const normalized = sanitizeAdminWeeklyText(focus) ?? "当前主要风险集中在下周承接动作的连续跟进节奏。";
  return normalized.endsWith("。") ? normalized : `${normalized}。`;
}

function buildActionSentence(actionText: string | null | undefined) {
  const normalized =
    sanitizeAdminWeeklyText(actionText) ??
    "先收敛下周治理重点，并明确责任人与完成时点";
  return `下周最先动作是：${normalized.replace(/[。；;，,\s]+$/g, "")}。`;
}

type WeeklyFallbackSource = Pick<
  AdminAgentResult,
  | "institutionScope"
  | "priorityTopItems"
  | "riskChildren"
  | "riskClasses"
  | "feedbackRiskItems"
  | "actionItems"
>;

function buildSummaryFallback(source: WeeklyFallbackSource) {
  const actionText = buildActionSummaryText(source.actionItems[0]);

  return [
    buildOverallSentence(source.institutionScope),
    buildRiskSentence(source),
    buildActionSentence(actionText),
  ].join(" ");
}

function buildContinuityFallback(source: WeeklyFallbackSource, existingNotes?: string[]) {
  const safeExisting = sanitizeAdminWeeklyTexts(existingNotes, 3).map((item) => stripLeadingLabel(item));
  const derivedContinuation =
    safeExisting[0] ??
    buildPriorityRiskText(source.priorityTopItems[0]) ??
    (source.institutionScope.pendingReviewCount > 0
      ? `待复查事项仍需延续跟进`
      : `本周重点事项仍需持续承接`);
  const derivedRisk =
    safeExisting[1] ??
    buildChildRiskText(source.riskChildren[0]) ??
    buildFeedbackRiskText(source.feedbackRiskItems[0]) ??
    buildClassRiskText(source.riskClasses[0]) ??
    `重点事项的连续跟进节奏仍需盯紧`;
  const derivedAction =
    safeExisting[2] ??
    buildActionSummaryText(source.actionItems[0]) ??
    "先明确下周第一责任人与完成时点";

  return takeUnique(
    [
      formatContinuityNote("上周延续问题", derivedContinuation),
      formatContinuityNote("当前连续风险", derivedRisk),
      formatContinuityNote("本周承接动作", derivedAction),
    ],
    3
  );
}

function buildHighlightsFallback(
  source: WeeklyFallbackSource,
  existingHighlights: string[],
  existingRisks: string[] = []
) {
  const actionText = buildActionSummaryText(source.actionItems[0]);
  const fallbackHighlights = [
    `本周机构级周报已形成可复盘的运营摘要。`,
    buildRiskSentence(source).replace(/。$/, ""),
    source.institutionScope.feedbackCompletionRate < 80
      ? `家园反馈回流仍需继续提效，当前完成率为${source.institutionScope.feedbackCompletionRate}%。`
      : `家园反馈回流节奏基本稳定，当前完成率为${source.institutionScope.feedbackCompletionRate}%。`,
    buildActionSentence(actionText).replace(/。$/, ""),
  ];

  return takeUnique(
    [
      ...sanitizeAdminWeeklyTexts(existingHighlights, 6),
      ...sanitizeAdminWeeklyTexts(existingRisks, 3),
      ...fallbackHighlights.map((item) => sanitizeAdminWeeklyText(item)),
    ],
    5
  );
}

function sanitizeActionItems(actionItems: AdminAgentActionItem[]) {
  return actionItems.map((item) => {
    const safeAction =
      sanitizeAdminWeeklyText(item.action) ??
      sanitizeAdminWeeklyText(item.summary) ??
      `围绕${item.targetName}先完成本周承接动作`;
    const safeSummary =
      sanitizeAdminWeeklyText(item.summary) ??
      `${item.ownerLabel}在${item.deadline}前推进：${safeAction}`;
    const safeTitle =
      sanitizeAdminWeeklyText(item.title) ??
      `${item.targetName}本周承接动作`;

    return {
      ...item,
      title: safeTitle,
      action: safeAction,
      summary: safeSummary,
    };
  });
}

export function sanitizeAdminWeeklyReportResponseForAdmin(report: WeeklyReportResponse): WeeklyReportResponse {
  return {
    ...report,
    summary: sanitizeAdminWeeklyText(report.summary) ?? "",
    highlights: sanitizeAdminWeeklyTexts(report.highlights, 6),
    risks: sanitizeAdminWeeklyTexts(report.risks, 6),
    nextWeekActions: sanitizeAdminWeeklyTexts(report.nextWeekActions, 6),
    continuityNotes: sanitizeAdminWeeklyTexts(report.continuityNotes, 4),
    sections: report.sections.map((section) => ({
      ...section,
      summary: sanitizeAdminWeeklyText(section.summary) ?? section.title,
      items: section.items
        .map((item) => ({
          ...item,
          label: sanitizeAdminWeeklyText(item.label) ?? item.label,
          detail: sanitizeAdminWeeklyText(item.detail) ?? "",
        }))
        .filter((item) => Boolean(item.detail)),
    })),
    primaryAction: report.primaryAction
      ? {
          ...report.primaryAction,
          title: sanitizeAdminWeeklyText(report.primaryAction.title) ?? report.primaryAction.title,
          detail: sanitizeAdminWeeklyText(report.primaryAction.detail) ?? "",
        }
      : report.primaryAction,
  };
}

export function sanitizeAdminWeeklyResult(result: AdminAgentResult): AdminAgentResult {
  const actionItems = sanitizeActionItems(result.actionItems);
  const sanitizedBase: WeeklyFallbackSource = {
    institutionScope: result.institutionScope,
    priorityTopItems: result.priorityTopItems,
    riskChildren: result.riskChildren,
    riskClasses: result.riskClasses,
    feedbackRiskItems: result.feedbackRiskItems,
    actionItems,
  };
  const continuityNotes = buildContinuityFallback(sanitizedBase, result.continuityNotes);
  const summary =
    sanitizeAdminWeeklyText(result.summary) ??
    buildSummaryFallback(sanitizedBase);
  const assistantAnswer =
    sanitizeAdminWeeklyText(result.assistantAnswer) ??
    `${summary} ${buildActionSentence(buildActionSummaryText(actionItems[0]))}`;
  const highlights = buildHighlightsFallback(sanitizedBase, result.highlights, []);
  const title =
    sanitizeAdminWeeklyText(result.title) ??
    "本周机构运营周报";

  return {
    ...result,
    title,
    summary,
    assistantAnswer,
    highlights,
    continuityNotes,
    actionItems,
  };
}
