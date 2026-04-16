import type {
  ChildSuggestionSnapshot,
  ParentMessageReflexionRequest,
  ParentMessageReflexionResponse,
} from "@/lib/ai/types";
import {
  sanitizeParentFacingList,
  sanitizeParentFacingText,
} from "@/lib/agent/parent-copy";
import type {
  ParentAgentChildContext,
  ParentAgentResult,
  ParentMessageMeta,
} from "@/lib/agent/parent-agent";

function uniqueItems(items: Array<string | null | undefined>, limit = 4) {
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

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readTextArray(value: unknown, limit = 4) {
  if (!Array.isArray(value)) return [];
  return uniqueItems(
    value.map((item) => (typeof item === "string" ? item : item == null ? undefined : String(item))),
    limit
  );
}

function readBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  if (typeof value === "number") return value !== 0;
  return false;
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function readFinalOutput(response: ParentMessageReflexionResponse) {
  const finalOutput = (response?.finalOutput ?? {}) as Partial<ParentMessageReflexionResponse["finalOutput"]>;
  const evaluationMeta = (response?.evaluationMeta ?? {}) as Partial<
    ParentMessageReflexionResponse["evaluationMeta"]
  >;

  return {
    title: readText(finalOutput.title),
    summary: readText(finalOutput.summary),
    tonightActions: readTextArray(finalOutput.tonightActions),
    wordingForParent: readText(finalOutput.wordingForParent),
    whyThisMatters: readText(finalOutput.whyThisMatters),
    estimatedTime: readText(finalOutput.estimatedTime),
    followUpWindow: readText(finalOutput.followUpWindow),
    evaluationMeta,
  };
}

function buildParentMessageMeta(
  response: ParentMessageReflexionResponse
): ParentMessageMeta {
  const evaluationMeta = (response?.evaluationMeta ?? {}) as Partial<
    ParentMessageReflexionResponse["evaluationMeta"]
  >;

  return {
    revisionCount: readNumber(response?.revisionCount),
    score: readNumber(evaluationMeta.score),
    canSend: readBoolean(evaluationMeta.canSend),
    fallback: readBoolean(response?.fallback) || readBoolean(evaluationMeta.fallback),
    stopReason: readText(evaluationMeta.stopReason) || undefined,
    source: readText(response?.source) || undefined,
    model: readText(response?.model) || undefined,
  };
}

function buildAssistantAnswer(params: {
  wordingForParent: string;
  whyThisMatters: string;
  tonightActions: string[];
  fallbackTopAction: string;
  followUpWindow: string;
  estimatedTime: string;
}) {
  const wordingForParent = sanitizeParentFacingText(params.wordingForParent);
  const whyThisMatters = sanitizeParentFacingText(params.whyThisMatters);
  const topAction =
    sanitizeParentFacingText(params.tonightActions[0]) ||
    sanitizeParentFacingText(params.fallbackTopAction);
  const actionLines = sanitizeParentFacingList(params.tonightActions, 4).map(
    (item, index) => `${index + 1}. ${item}`
  );
  const followUpWindow = sanitizeParentFacingText(params.followUpWindow);
  const estimatedTime = sanitizeParentFacingText(params.estimatedTime);

  return [
    wordingForParent,
    whyThisMatters ? `为什么这件事值得今晚先做：${whyThisMatters}` : "",
    topAction ? `今晚先做这一步：${topAction}` : "",
    "",
    "今晚可以这样做：",
    ...(actionLines.length > 0 ? actionLines : [`1. ${params.fallbackTopAction}`]),
    "",
    followUpWindow ? `接下来重点观察：${followUpWindow}` : "",
    estimatedTime ? `大约需要：${estimatedTime}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildParentMessageReflexionPayload(params: {
  context: ParentAgentChildContext;
  snapshot: ChildSuggestionSnapshot;
  result: ParentAgentResult;
}): ParentMessageReflexionRequest {
  const { context, snapshot, result } = params;
  const todayInSchoolActions = uniqueItems([
    result.interventionCard.todayInSchoolAction,
    ...(result.consultation?.todayInSchoolActions ?? []),
    result.consultation?.schoolAction,
  ]);
  const tonightHomeActions = uniqueItems([
    result.tonightTopAction,
    ...result.homeSteps,
    ...result.interventionCard.homeSteps,
    ...(result.consultation?.tonightAtHomeActions ?? []),
    result.consultation?.homeAction,
  ]);

  return {
    targetChildId: context.child.id,
    teacherNote:
      context.teacherSuggestionSummary ??
      result.interventionCard.teacherFollowupDraft ??
      result.summary,
    issueSummary: uniqueItems(
      [
        result.summary,
        result.interventionCard.triggerReason,
        ...context.focusReasons,
      ],
      2
    ).join("; "),
    currentInterventionCard:
      result.interventionCard as unknown as Record<string, unknown>,
    latestGuardianFeedback: context.latestFeedback
      ? ({
          date: context.latestFeedback.date,
          status: context.latestFeedback.status,
          content: context.latestFeedback.content,
          executed: context.latestFeedback.executed,
          childReaction: context.latestFeedback.childReaction,
          improved: context.latestFeedback.improved,
          freeNote: context.latestFeedback.freeNote,
        } satisfies Record<string, unknown>)
      : null,
    todayInSchoolActions,
    tonightHomeActions,
    snapshot: snapshot as unknown as Record<string, unknown>,
    visibleChildren: [
      {
        id: context.child.id,
        name: context.child.name,
        className: context.child.className,
      },
    ],
    debugMemory: false,
    debugLoop: false,
  };
}

export function mergeParentMessageReflexionResult(params: {
  baseResult: ParentAgentResult;
  response: ParentMessageReflexionResponse;
}): ParentAgentResult {
  const { baseResult, response } = params;
  const finalOutput = readFinalOutput(response);
  const mergedHomeSteps = sanitizeParentFacingList(
    [...finalOutput.tonightActions, ...baseResult.homeSteps],
    4
  );
  const tonightTopAction = mergedHomeSteps[0] ?? baseResult.tonightTopAction;
  const nextReviewWindow = finalOutput.followUpWindow || baseResult.interventionCard.reviewIn48h;
  const nextTitle = sanitizeParentFacingText(finalOutput.title) || baseResult.title;
  const nextSummary = sanitizeParentFacingText(finalOutput.summary) || baseResult.summary;
  const nextWhyThisMatters = sanitizeParentFacingText(finalOutput.whyThisMatters) || baseResult.whyNow;
  const nextWordingForParent =
    sanitizeParentFacingText(finalOutput.wordingForParent) ||
    sanitizeParentFacingText(baseResult.interventionCard.parentMessageDraft);

  return {
    ...baseResult,
    title: nextTitle,
    summary: nextSummary,
    tonightTopAction,
    whyNow: nextWhyThisMatters,
    homeSteps: mergedHomeSteps.length > 0 ? mergedHomeSteps : baseResult.homeSteps,
    interventionCard: {
      ...baseResult.interventionCard,
      title: finalOutput.title || baseResult.interventionCard.title,
      summary: nextSummary,
      tonightHomeAction:
        sanitizeParentFacingText(finalOutput.tonightActions[0]) ||
        sanitizeParentFacingText(baseResult.interventionCard.tonightHomeAction),
      homeSteps: mergedHomeSteps.length > 0 ? mergedHomeSteps : baseResult.interventionCard.homeSteps,
      reviewIn48h: nextReviewWindow,
      parentMessageDraft: nextWordingForParent,
    },
    assistantAnswer: buildAssistantAnswer({
      wordingForParent: nextWordingForParent,
      whyThisMatters: nextWhyThisMatters,
      tonightActions: finalOutput.tonightActions,
      fallbackTopAction: tonightTopAction,
      followUpWindow: nextReviewWindow,
      estimatedTime: finalOutput.estimatedTime,
    }),
    highlights: sanitizeParentFacingList([nextWhyThisMatters, ...baseResult.highlights], 4),
    parentMessageMeta: buildParentMessageMeta(response),
  };
}

export function sanitizeParentMessageReflexionResponse(
  response: ParentMessageReflexionResponse
): ParentMessageReflexionResponse {
  return {
    ...response,
    finalOutput: {
      ...response.finalOutput,
      title: sanitizeParentFacingText(response.finalOutput?.title),
      summary: sanitizeParentFacingText(response.finalOutput?.summary),
      tonightActions: sanitizeParentFacingList(response.finalOutput?.tonightActions ?? [], 4),
      wordingForParent: sanitizeParentFacingText(response.finalOutput?.wordingForParent),
      whyThisMatters: sanitizeParentFacingText(response.finalOutput?.whyThisMatters),
      estimatedTime: sanitizeParentFacingText(response.finalOutput?.estimatedTime),
      followUpWindow: sanitizeParentFacingText(response.finalOutput?.followUpWindow),
    },
    continuityNotes: sanitizeParentFacingList(response.continuityNotes ?? [], 4),
    memoryMeta: undefined,
    debugIterations: null,
  };
}
