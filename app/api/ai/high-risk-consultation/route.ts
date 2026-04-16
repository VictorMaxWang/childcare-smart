import { NextResponse } from "next/server";
import {
  buildHighRiskConsultationAutoContext,
  resolveHighRiskConsultationContexts,
  type HighRiskConsultationRequestPayload,
} from "@/lib/agent/high-risk-consultation";
import { buildInterventionCardFromConsultation } from "@/lib/agent/intervention-card";
import { maybeRunHighRiskConsultation } from "@/lib/agent/consultation/coordinator";
import { buildConsultationInputFromSnapshot } from "@/lib/agent/consultation/input";
import { buildTeacherChildSuggestionSnapshotWithMemory } from "@/lib/agent/teacher-agent";
import {
  resolveAsrProvider,
  resolveLlmProvider,
  resolveOcrProvider,
  resolveTtsProvider,
} from "@/lib/ai/providers";
import {
  createBrainTransportHeaders,
  forwardBrainRequest,
  type BrainForwardResult,
} from "@/lib/server/brain-client";
import { normalizeHighRiskConsultationResult } from "@/lib/consultation/normalize-result";
import { toFollowUpFeedbackLite } from "@/lib/feedback/normalize";
import { buildMemoryContextForPrompt } from "@/lib/server/memory-context";

function isRecordArray(value: unknown) {
  return Array.isArray(value);
}

function isValidPayload(payload: unknown): payload is HighRiskConsultationRequestPayload {
  if (!payload || typeof payload !== "object") return false;
  const obj = payload as Record<string, unknown>;

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

function resolveNextLlmSource(provider: string, mode: "mock" | "real") {
  if (provider === "mock-llm" || mode === "mock") return "mock";
  if (provider === "dashscope-llm") return "dashscope";
  return provider.replace(/-llm$/u, "") || "unknown";
}

function resolveNextLlmModel(provider: string, mode: "mock" | "real") {
  if (provider === "mock-llm" || mode === "mock") return "mock-local-llm";
  if (provider === "dashscope-llm") {
    return process.env.AI_MODEL || process.env.BAILIAN_MODEL || "qwen-plus";
  }
  return "";
}

function buildLocalFallbackHeaders(brainForward: BrainForwardResult) {
  return createBrainTransportHeaders({
    transport: "next-json-fallback",
    targetPath: brainForward.targetPath,
    upstreamHost: brainForward.upstreamHost,
    fallbackReason: brainForward.fallbackReason ?? "brain-proxy-unavailable",
  });
}

export async function POST(request: Request) {
  const brainForward = await forwardBrainRequest(request, "/api/v1/agents/consultations/high-risk");
  if (brainForward.response) return brainForward.response;
  const localFallbackHeaders = buildLocalFallbackHeaders(brainForward);

  let payload: HighRiskConsultationRequestPayload | null = null;

  try {
    payload = (await request.json()) as HighRiskConsultationRequestPayload;
  } catch (error) {
    console.error("[AI] Invalid high-risk consultation payload", error);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: localFallbackHeaders });
  }

  if (!isValidPayload(payload)) {
    return NextResponse.json(
      { error: "Invalid high-risk consultation payload" },
      { status: 400, headers: localFallbackHeaders }
    );
  }

  const { classContext, childContext } = resolveHighRiskConsultationContexts(payload);
  if (!childContext) {
    return NextResponse.json(
      { error: "No visible child available for consultation" },
      { status: 400, headers: localFallbackHeaders }
    );
  }

  const autoContext = buildHighRiskConsultationAutoContext({
    classContext,
    childContext,
  });
  const ocrProvider = resolveOcrProvider();
  const asrProvider = resolveAsrProvider();
  const llmProvider = resolveLlmProvider();
  const ttsProvider = resolveTtsProvider();

  const [ocrResult, asrResult] = await Promise.all([
    payload.imageInput
      ? ocrProvider.extract({
          attachmentName: payload.imageInput.attachmentName,
          fallbackText: payload.imageInput.content,
        })
      : null,
    payload.voiceInput
      ? asrProvider.transcribe({
          attachmentName: payload.voiceInput.attachmentName,
          fallbackText: payload.voiceInput.content,
        })
      : null,
  ]);

  const teacherSignals = [
    payload.teacherNote?.trim(),
    ocrResult?.output.text,
    asrResult?.output.transcript,
  ].filter((item): item is string => Boolean(item));

  const memoryContext = await buildMemoryContextForPrompt({
    childId: childContext.child.id,
    workflowType: "high-risk-consultation",
    query: [...autoContext.focusReasons, ...teacherSignals].join(" "),
    request,
  });

  const suggestionSnapshot = buildTeacherChildSuggestionSnapshotWithMemory(childContext, memoryContext);
  const consultationInput = buildConsultationInputFromSnapshot({
    snapshot: suggestionSnapshot,
    latestFeedback: childContext.latestFeedback
      ? (toFollowUpFeedbackLite(childContext.latestFeedback) ?? undefined)
      : undefined,
    focusReasons: [...autoContext.focusReasons, ...teacherSignals],
    source: "teacher",
    priorityHint: {
      level: "P1",
      score: 92,
      reason: "老师主动发起高风险会诊，需要进入闭环评估。",
    },
    memoryContext,
  });

  const consultation = await maybeRunHighRiskConsultation(consultationInput);
  if (!consultation) {
    return NextResponse.json(
      { error: "Failed to generate consultation result" },
      { status: 500, headers: localFallbackHeaders }
    );
  }

  const llmResult = await llmProvider.generateHighRiskConsultationNarrative({
    childName: childContext.child.name,
    className: classContext.className,
    riskLevel: consultation.riskLevel,
    triggerReasons: consultation.triggerReasons,
    keyFindings: consultation.keyFindings,
    todayInSchoolActions: consultation.todayInSchoolActions,
    tonightAtHomeActions: consultation.tonightAtHomeActions,
    nextCheckpoints: consultation.nextCheckpoints,
    longTermTraits: memoryContext.promptContext.longTermTraits,
    recentContinuitySignals: memoryContext.promptContext.recentContinuitySignals,
    lastConsultationTakeaways: memoryContext.promptContext.lastConsultationTakeaways,
    openLoops: memoryContext.promptContext.openLoops,
  });
  const ttsResult = await ttsProvider.synthesize({
    text: llmResult.output.summary,
  });

  const nextConsultation = {
    ...consultation,
    summary: llmResult.output.summary,
    parentMessageDraft: llmResult.output.parentMessageDraft,
    continuityNotes: consultation.continuityNotes ?? suggestionSnapshot.continuityNotes,
    memoryMeta: consultation.memoryMeta ?? memoryContext.meta,
    directorDecisionCard: {
      ...consultation.directorDecisionCard,
      reason: llmResult.output.directorReason,
    },
    explainability: [
      ...consultation.explainability,
      {
        label: "教师补充",
        detail: teacherSignals.join("；") || "本次主要使用系统自动上下文发起会诊。",
      },
    ],
  };

  const interventionCard = buildInterventionCardFromConsultation({
    targetChildId: childContext.child.id,
    childName: childContext.child.name,
    consultation: nextConsultation,
    generatedAt: nextConsultation.generatedAt,
  });

  const llmSource = resolveNextLlmSource(llmResult.provider, llmResult.mode);
  const llmModel = resolveNextLlmModel(llmResult.provider, llmResult.mode);
  const providerTrace = {
    llm: llmResult.provider,
    provider: llmResult.provider,
    source: llmSource,
    model: llmModel,
    requestId: "",
    transport: "next-json-fallback",
    transportSource: "next-server",
    consultationSource: String(nextConsultation.source ?? ""),
    fallbackReason: brainForward.fallbackReason ?? "brain-proxy-unavailable",
    brainProvider: "next-fallback",
    realProvider: false,
    fallback: true,
    ocr: ocrResult?.provider ?? "unused",
    asr: asrResult?.provider ?? "unused",
    tts: ttsResult.provider,
    modes: {
      llm: llmResult.mode,
      ocr: ocrResult?.mode ?? "mock",
      asr: asrResult?.mode ?? "mock",
      tts: ttsResult.mode,
    },
  };

  const normalizedResult = normalizeHighRiskConsultationResult(
    {
      ...nextConsultation,
      interventionCard,
      autoContext,
      provider: providerTrace.provider,
      model: providerTrace.model,
      realProvider: false,
      fallback: true,
      providerTrace,
      audioNarrationScript: ttsResult.output.script,
      multimodalNotes: {
        imageText: ocrResult?.output.text,
        voiceText: asrResult?.output.transcript,
        teacherNote: payload.teacherNote?.trim() || "",
      },
    },
    {
      brainProvider: "next-fallback",
      defaultTransport: "next-json-fallback",
      defaultTransportSource: "next-server",
      defaultConsultationSource: String(nextConsultation.source ?? ""),
      defaultFallbackReason: brainForward.fallbackReason ?? "brain-proxy-unavailable",
    }
  );

  return NextResponse.json(
    normalizedResult,
    { status: 200, headers: localFallbackHeaders }
  );
}
