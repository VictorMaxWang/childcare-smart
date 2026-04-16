import type {
  AiFollowUpPayload,
  AiFollowUpResponse,
  AiSuggestionResponse,
  ChildSuggestionSnapshot,
  ConsultationResultSource,
  MemoryContextEnvelope,
  MemoryContextMeta,
  PromptMemoryContext,
} from "@/lib/ai/types";
import { selectStructuredFeedbackConsumption } from "@/lib/feedback/consumption";
import { buildContinuityNotes } from "@/lib/memory/prompt-context";

export interface ConsultationPriorityHint {
  level?: "P1" | "P2" | "P3";
  score?: number;
  reason?: string;
}

export interface ConsultationInput {
  childId: string;
  childName: string;
  className?: string;
  ageBand?: string;
  source: "teacher" | "parent" | "admin" | "api";
  generatedAt: string;
  summary: ChildSuggestionSnapshot["summary"];
  recentDetails?: ChildSuggestionSnapshot["recentDetails"];
  focusReasons: string[];
  latestFeedback?: AiFollowUpPayload["latestFeedback"];
  currentInterventionCard?: AiFollowUpPayload["currentInterventionCard"];
  suggestionSummary?: string;
  followUpAnswer?: string;
  question?: string;
  priorityHint?: ConsultationPriorityHint;
  responseSource: ConsultationResultSource;
  model?: string;
  memoryContext?: PromptMemoryContext;
  continuityNotes?: string[];
  memoryMeta?: MemoryContextMeta;
}

export interface ConsultationInputFromSnapshotParams {
  snapshot: ChildSuggestionSnapshot;
  latestFeedback?: AiFollowUpPayload["latestFeedback"];
  currentInterventionCard?: AiFollowUpPayload["currentInterventionCard"];
  activeTaskId?: string;
  focusReasons?: string[];
  question?: string;
  suggestion?: AiSuggestionResponse;
  followUp?: AiFollowUpResponse;
  source?: ConsultationInput["source"];
  priorityHint?: ConsultationPriorityHint;
  memoryContext?: MemoryContextEnvelope | null;
}

function takeUnique(items: Array<string | undefined>, limit = 6) {
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

export function buildConsultationInputFromSnapshot(
  params: ConsultationInputFromSnapshotParams
): ConsultationInput {
  const generatedAt = new Date().toISOString();
  const promptMemoryContext = params.memoryContext?.promptContext ?? params.snapshot.memoryContext;
  const feedbackConsumption = selectStructuredFeedbackConsumption(
    [params.latestFeedback, params.snapshot.recentDetails?.feedback],
    {
      childId: params.snapshot.child.id,
      relatedTaskId: params.activeTaskId ?? params.latestFeedback?.relatedTaskId,
      relatedConsultationId:
        params.latestFeedback?.relatedConsultationId ?? params.currentInterventionCard?.consultationId,
      interventionCardId: params.currentInterventionCard?.id,
    }
  );
  const continuityNotes = takeUnique(
    [
      ...(params.snapshot.continuityNotes ?? buildContinuityNotes(params.snapshot.child.name, promptMemoryContext)),
      feedbackConsumption.summary,
      ...feedbackConsumption.continuitySignals,
      ...feedbackConsumption.openLoops,
    ],
    8
  );
  const focusReasons = takeUnique(
    [
      ...(params.focusReasons ?? []),
      ...continuityNotes,
      ...(promptMemoryContext?.openLoops ?? []),
      ...(promptMemoryContext?.recentContinuitySignals ?? []),
      feedbackConsumption.primaryActionSupport,
      params.suggestion?.summary,
      ...(params.suggestion?.concerns ?? []),
      ...params.snapshot.ruleFallback.map((item) => item.title),
    ],
    8
  );
  const responseSource = params.followUp?.source ?? params.suggestion?.source ?? "fallback";

  return {
    childId: params.snapshot.child.id,
    childName: params.snapshot.child.name,
    className: params.snapshot.child.className,
    ageBand: params.snapshot.child.ageBand,
    source: params.source ?? "api",
    generatedAt,
    summary: params.snapshot.summary,
    recentDetails: params.snapshot.recentDetails,
    focusReasons,
    latestFeedback: feedbackConsumption.feedback,
    currentInterventionCard: params.currentInterventionCard,
    suggestionSummary: params.suggestion?.summary,
    followUpAnswer: params.followUp?.answer,
    question: params.question,
    priorityHint: params.priorityHint,
    responseSource,
    model: params.followUp?.model ?? params.suggestion?.model,
    memoryContext: promptMemoryContext,
    continuityNotes,
    memoryMeta: params.memoryContext?.meta,
  };
}
