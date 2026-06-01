import {
  buildHighRiskConsultationAutoContext,
  resolveHighRiskConsultationContexts,
  type HighRiskConsultationRequestPayload,
} from "@/lib/agent/high-risk-consultation";
import { buildConsultationInputFromSnapshot } from "@/lib/agent/consultation/input";
import { buildLocalHighRiskConsultationFallback } from "@/lib/agent/high-risk-consultation-fallback";
import { buildInterventionCardFromConsultation } from "@/lib/agent/intervention-card";
import { buildTeacherChildSuggestionSnapshotWithMemory } from "@/lib/agent/teacher-agent";
import { normalizeHighRiskConsultationResult } from "@/lib/consultation/normalize-result";

export type HighRiskConsultationLocalTransport = "next-json-fallback" | "next-stream-fallback";

export interface BuildLocalHighRiskConsultationResultOptions {
  payload: HighRiskConsultationRequestPayload;
  fallbackReason: string;
  transport: HighRiskConsultationLocalTransport;
  consultationSource: string;
  priorityReason?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function isRecordArray(value: unknown) {
  return Array.isArray(value);
}

export function isValidHighRiskConsultationPayload(
  payload: unknown
): payload is HighRiskConsultationRequestPayload {
  const obj = asRecord(payload);

  return (
    typeof obj.targetChildId === "string" &&
    obj.currentUser !== null &&
    typeof obj.currentUser === "object" &&
    isRecordArray(obj.visibleChildren) &&
    isRecordArray(obj.presentChildren) &&
    isRecordArray(obj.healthCheckRecords) &&
    isRecordArray(obj.growthRecords) &&
    isRecordArray(obj.guardianFeedbacks)
  );
}

export function buildLocalHighRiskConsultationResult({
  payload,
  fallbackReason,
  transport,
  consultationSource,
  priorityReason,
}: BuildLocalHighRiskConsultationResultOptions) {
  const { classContext, childContext } = resolveHighRiskConsultationContexts(payload);
  if (!childContext) return null;

  const autoContext = buildHighRiskConsultationAutoContext({
    classContext,
    childContext,
  });
  const teacherSignals = [
    payload.teacherNote,
    asRecord(payload.imageInput).content,
    asRecord(payload.voiceInput).content,
  ]
    .map((item) => asString(item))
    .filter(Boolean);
  const suggestionSnapshot = buildTeacherChildSuggestionSnapshotWithMemory(childContext, null);
  const consultationInput = buildConsultationInputFromSnapshot({
    snapshot: suggestionSnapshot,
    focusReasons: [...autoContext.focusReasons, ...teacherSignals],
    source: "teacher",
    priorityHint: {
      level: "P1",
      score: 92,
      reason:
        priorityReason ??
        "AI high-risk consultation switched to local fallback so the teacher can continue the 48-hour review loop.",
    },
    memoryContext: null,
  });
  const consultation = buildLocalHighRiskConsultationFallback({
    input: consultationInput,
    autoContext,
    fallbackReason,
  });
  const providerTrace = {
    source: "local-rules-fallback",
    provider: "local-rules-llm",
    model: "local-social-emotional-rules",
    requestId: "",
    transport,
    transportSource: "next-server",
    consultationSource,
    fallbackReason,
    brainProvider: "next-fallback",
    fallback: true,
    realProvider: false,
  };
  const interventionCard = buildInterventionCardFromConsultation({
    targetChildId: childContext.child.id,
    childName: childContext.child.name,
    consultation,
    generatedAt: consultation.generatedAt,
  });

  return normalizeHighRiskConsultationResult(
    {
      ...consultation,
      interventionCard,
      autoContext,
      provider: providerTrace.provider,
      model: providerTrace.model,
      realProvider: false,
      fallback: true,
      providerTrace,
      multimodalNotes: {
        teacherNote: asString(payload.teacherNote),
        imageText: asString(asRecord(payload.imageInput).content),
        voiceText: asString(asRecord(payload.voiceInput).content),
      },
    },
    {
      brainProvider: "next-fallback",
      defaultTransport: transport,
      defaultTransportSource: "next-server",
      defaultConsultationSource: consultationSource,
      defaultFallbackReason: fallbackReason,
    }
  );
}
