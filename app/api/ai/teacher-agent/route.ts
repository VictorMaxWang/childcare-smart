import { NextResponse } from "next/server.js";
import {
  executeFollowUp,
  executeSuggestion,
  executeWeeklyReport,
  getAiRuntimeOptions,
  isAiProviderUnavailableError,
  type AiRuntimeOptions,
} from "@/lib/ai/server";
import {
  buildTeacherAgentChildContext,
  buildTeacherAgentClassContext,
  buildTeacherChildSuggestionSnapshotWithMemory,
  buildTeacherCommunicationFollowUpPayloadWithMemory,
  buildTeacherCommunicationResultWithMemory,
  buildTeacherFollowUpResultWithMemory,
  buildTeacherWeeklyReportSnapshotWithMemory,
  buildTeacherWeeklySummaryResultWithMemory,
  pickTeacherAgentWorkflowTargetChildId,
  type TeacherAgentRequestPayload,
  type TeacherAgentResult,
  type TeacherAgentResultSource,
  type TeacherAgentWorkflowType,
} from "@/lib/agent/teacher-agent";
import { buildConsultationInputFromSnapshot } from "@/lib/agent/consultation/input";
import { maybeRunHighRiskConsultation } from "@/lib/agent/consultation/coordinator";
import { attachConsultationToInterventionCard } from "@/lib/agent/intervention-card";
import { buildAiProviderTrace } from "@/lib/ai/provider-trace";
import { toFollowUpFeedbackLite } from "@/lib/feedback/normalize";
import { aiRouteLimitedResponse, authorizeAiRouteSession } from "@/lib/server/ai-route-guard";
import { ApiRouteError } from "@/lib/server/api-errors";
import { buildTeacherAgentPayloadFromScope } from "@/lib/server/ai-scoped-payloads";
import {
  createBrainTransportHeaders,
  forwardBrainRequest,
  readBrainTransportHeaders,
  shouldAcceptRemotePayload,
  type BrainServiceScopeClaim,
  type BrainForwardResult,
  type BrainTransport,
} from "@/lib/server/brain-client";
import { buildMemoryContextForPrompt } from "@/lib/server/memory-context";
import { logSecurityEvent } from "@/lib/server/security-log";
import {
  buildServiceScopeClaim,
  getSessionScope,
  requireScopedChild,
} from "@/lib/server/session-scope";

const TEACHER_AGENT_TARGET_PATH = "/api/v1/agents/teacher/run";
const TEACHER_AGENT_BRAIN_TIMEOUT_MS = 3_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isRecordArray(value: unknown) {
  return Array.isArray(value);
}

function isValidWorkflow(value: unknown): value is TeacherAgentWorkflowType {
  return value === "communication" || value === "follow-up" || value === "weekly-summary";
}

function isBrainTransport(value: unknown): value is BrainTransport {
  return (
    value === "brain-proxy-error" ||
    value === "remote-brain-proxy" ||
    value === "next-json-fallback" ||
    value === "next-stream-fallback"
  );
}

function isValidPayload(payload: unknown): payload is TeacherAgentRequestPayload {
  if (!isRecord(payload)) return false;

  return (
    isValidWorkflow(payload.workflow) &&
    (payload.scope === "class" || payload.scope === "child") &&
    isRecord(payload.currentUser) &&
    isRecordArray(payload.visibleChildren) &&
    isRecordArray(payload.presentChildren) &&
    isRecordArray(payload.healthCheckRecords) &&
    (payload.mealRecords === undefined || isRecordArray(payload.mealRecords)) &&
    isRecordArray(payload.growthRecords) &&
    isRecordArray(payload.guardianFeedbacks)
  );
}

function isCompleteTeacherAgentResult(value: unknown): value is TeacherAgentResult {
  if (!isRecord(value)) return false;
  return (
    isValidWorkflow(value.workflow) &&
    (value.mode === "class" || value.mode === "child") &&
    typeof value.summary === "string" &&
    value.summary.trim().length > 0 &&
    typeof value.targetLabel === "string" &&
    value.targetLabel.trim().length > 0 &&
    Array.isArray(value.actionItems)
  );
}

async function readJsonBody(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function normalizeResultSource(value: unknown): TeacherAgentResultSource {
  if (value === "ai" || value === "fallback" || value === "mock") return value;
  return "fallback";
}

function providerFromResult(result: TeacherAgentResult) {
  if (result.provider) return result.provider;
  if (result.source === "ai") return "vivo";
  if (result.source === "mock") return "mock";
  return "local-rule-fallback";
}

function buildInputCounts(payload: TeacherAgentRequestPayload) {
  return {
    visibleChildren: payload.visibleChildren.length,
    presentChildren: payload.presentChildren.length,
    healthCheckRecords: payload.healthCheckRecords.length,
    mealRecords: payload.mealRecords?.length ?? 0,
    growthRecords: payload.growthRecords.length,
    guardianFeedbacks: payload.guardianFeedbacks.length,
  };
}

function fallbackReasonFromProviderError(error: unknown) {
  if (!isAiProviderUnavailableError(error)) return null;
  return error.providerStatus.reason ?? error.message ?? "provider-unavailable";
}

function buildFallbackReason(reason: string | null | undefined, defaultReason: string) {
  return reason?.trim() || defaultReason;
}

function buildTransportHeaders(params: {
  transport: BrainTransport;
  fallbackReason?: string | null;
  upstreamHost?: string | null;
}) {
  return createBrainTransportHeaders({
    transport: params.transport,
    targetPath: TEACHER_AGENT_TARGET_PATH,
    upstreamHost: params.upstreamHost,
    fallbackReason: params.fallbackReason,
  });
}

function enrichTeacherAgentResult(params: {
  result: TeacherAgentResult;
  payload: TeacherAgentRequestPayload;
  transport: BrainTransport;
  fallbackReason?: string | null;
}) {
  const source = normalizeResultSource(params.result.source);
  const provider = providerFromResult({ ...params.result, source });
  const fallback =
    typeof params.result.fallback === "boolean"
      ? params.result.fallback
      : source !== "ai";
  const fallbackReason =
    params.result.fallbackReason ??
    params.fallbackReason ??
    (fallback ? "provider-unavailable" : null);
  const fieldCoverage = {
    summary: params.result.summary.trim().length > 0,
    targetLabel: params.result.targetLabel.trim().length > 0,
    actionItems: params.result.actionItems.length > 0,
    parentMessageDraft: Boolean(params.result.parentMessageDraft?.trim()),
  };
  const warnings = [
    ...(
      params.result.dataQuality?.warnings ??
      Object.entries(fieldCoverage)
        .filter(([, present]) => !present)
        .map(([field]) => `${field}_missing`)
    ),
  ];

  return {
    ...params.result,
    source,
    provider,
    fallback,
    transport: params.result.transport ?? params.transport,
    fallbackReason,
    providerTrace: params.result.providerTrace ?? buildAiProviderTrace({
      capability: "llm",
      provider,
      source,
      mode: source === "mock" ? "mock" : fallback ? "fallback" : "live",
      fallback,
      fallbackReason,
      realProvider: !fallback && provider === "vivo",
      model: params.result.model,
      transport: params.result.transport ?? params.transport,
      providerStatus: params.result.providerStatus,
      extra: {
        workflow: params.result.workflow,
        objectScope: params.result.mode,
      },
    }),
    dataQuality: params.result.dataQuality ?? {
      source,
      isFallback: fallback,
      isMock: source === "mock",
      fieldCoverage,
      inputCounts: buildInputCounts(params.payload),
      warnings,
    },
  } satisfies TeacherAgentResult;
}

async function maybeReadBrainResult(
  brainForward: BrainForwardResult,
  payload: TeacherAgentRequestPayload,
  accountKind: "demo" | "normal"
) {
  if (!brainForward.response) return null;
  if (!brainForward.response.ok) return { response: brainForward.response, fallbackReason: null };

  const headers = readBrainTransportHeaders(brainForward.response.headers);
  const transport = isBrainTransport(headers.transport) ? headers.transport : "remote-brain-proxy";
  const raw = await readJsonBody(brainForward.response);

  if (!raw) {
    return { response: null, fallbackReason: "brain-invalid-json" };
  }
  if (!isCompleteTeacherAgentResult(raw)) {
    return { response: null, fallbackReason: "brain-incomplete-teacher-agent-result" };
  }
  if (!shouldAcceptRemotePayload(raw, accountKind)) {
    return { response: null, fallbackReason: "brain-mock-result" };
  }

  const result = enrichTeacherAgentResult({
    result: raw,
    payload,
    transport,
    fallbackReason: headers.fallbackReason,
  });

  return {
    response: NextResponse.json(result, {
      status: 200,
      headers: buildTransportHeaders({
        transport,
        upstreamHost: headers.upstreamHost ?? brainForward.upstreamHost,
        fallbackReason: headers.fallbackReason,
      }),
    }),
    fallbackReason: null,
  };
}

async function runLocalTeacherAgent(params: {
  payload: TeacherAgentRequestPayload;
  runtimeOptions: AiRuntimeOptions;
  allowConsultation: boolean;
  request: Request;
  serviceScope?: BrainServiceScopeClaim | null;
}) {
  const classContext = buildTeacherAgentClassContext(params.payload);
  const workflowTargetChildId = pickTeacherAgentWorkflowTargetChildId(
    classContext,
    params.payload.workflow,
    params.payload.targetChildId
  );
  const childContext = buildTeacherAgentChildContext(classContext, workflowTargetChildId);
  const memoryContext =
    params.payload.workflow !== "weekly-summary" && childContext
      ? await buildMemoryContextForPrompt({
          childId: childContext.child.id,
          workflowType: "teacher-agent",
          query: childContext.focusReasons.join(" "),
          request: params.request,
          serviceScope: params.serviceScope,
        })
      : null;
  const weeklyMemoryContexts =
    params.payload.workflow === "weekly-summary"
      ? await Promise.all(
          (classContext.focusChildren.map((item) => item.childId).slice(0, 3).length > 0
            ? classContext.focusChildren.map((item) => item.childId).slice(0, 3)
            : params.payload.visibleChildren.map((item) => item.id).slice(0, 3)
          ).map((childId) =>
            buildMemoryContextForPrompt({
              childId,
              workflowType: "teacher-weekly-summary",
              query: "weekly report focus child continuity",
              request: params.request,
              serviceScope: params.serviceScope,
            })
          )
        )
      : [];

  if (params.payload.workflow === "communication") {
    if (!childContext) {
      return NextResponse.json(
        { error: "No visible child available for communication workflow" },
        { status: 400 }
      );
    }

    const aiResponse = await executeFollowUp(
      buildTeacherCommunicationFollowUpPayloadWithMemory(childContext, memoryContext),
      params.runtimeOptions
    );
    const baseResult = buildTeacherCommunicationResultWithMemory({
      context: childContext,
      response: aiResponse,
      memoryContext,
    });
    const consultation = params.allowConsultation
      ? await maybeRunHighRiskConsultation(
          buildConsultationInputFromSnapshot({
            snapshot: buildTeacherChildSuggestionSnapshotWithMemory(childContext, memoryContext),
            latestFeedback: childContext.latestFeedback
              ? (toFollowUpFeedbackLite(childContext.latestFeedback) ?? undefined)
              : undefined,
            focusReasons: childContext.focusReasons,
            followUp: aiResponse,
            source: "teacher",
            memoryContext,
          })
        )
      : null;

    return consultation
      ? {
          ...baseResult,
          consultation,
          consultationMode: true,
          interventionCard: attachConsultationToInterventionCard(baseResult.interventionCard, consultation),
        }
      : baseResult;
  }

  if (params.payload.workflow === "follow-up") {
    if (!childContext) {
      return NextResponse.json(
        { error: "No visible child available for follow-up workflow" },
        { status: 400 }
      );
    }

    const aiSuggestion = await executeSuggestion(
      { snapshot: buildTeacherChildSuggestionSnapshotWithMemory(childContext, memoryContext) },
      params.runtimeOptions
    );
    const baseResult = buildTeacherFollowUpResultWithMemory({
      classContext,
      childContext,
      suggestion: aiSuggestion,
      memoryContext,
    });
    const consultation = params.allowConsultation
      ? await maybeRunHighRiskConsultation(
          buildConsultationInputFromSnapshot({
            snapshot: buildTeacherChildSuggestionSnapshotWithMemory(childContext, memoryContext),
            latestFeedback: childContext.latestFeedback
              ? (toFollowUpFeedbackLite(childContext.latestFeedback) ?? undefined)
              : undefined,
            focusReasons: childContext.focusReasons,
            suggestion: aiSuggestion,
            source: "teacher",
            memoryContext,
          })
        )
      : null;

    return consultation
      ? {
          ...baseResult,
          consultation,
          consultationMode: true,
          interventionCard: attachConsultationToInterventionCard(baseResult.interventionCard, consultation),
        }
      : baseResult;
  }

  const aiReport = await executeWeeklyReport(
    {
      role: "teacher",
      snapshot: buildTeacherWeeklyReportSnapshotWithMemory(classContext, weeklyMemoryContexts),
    },
    params.runtimeOptions
  );

  return buildTeacherWeeklySummaryResultWithMemory({
    classContext,
    report: aiReport,
    memoryContexts: weeklyMemoryContexts,
  });
}

function isNextResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

export async function POST(request: Request) {
  const authResult = await authorizeAiRouteSession(request, { requiredRole: "staff" });
  if (authResult instanceof Response) return authResult;

  let payload: TeacherAgentRequestPayload;
  try {
    payload = (await request.json()) as TeacherAgentRequestPayload;
  } catch (error) {
    logSecurityEvent("error", "ai.teacher_agent.invalid_payload", { error });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isRecord(payload) || !isValidWorkflow(payload.workflow) || (payload.scope !== "class" && payload.scope !== "child")) {
    return NextResponse.json({ error: "Invalid teacher-agent payload" }, { status: 400 });
  }

  const sessionScope = await getSessionScope(authResult.session);
  if (payload.targetChildId) {
    try {
      requireScopedChild(sessionScope, payload.targetChildId);
    } catch (error) {
      if (error instanceof ApiRouteError && (error.code === "forbidden_scope" || error.code === "not_found")) {
        return aiRouteLimitedResponse({
          reason: "forbidden_child",
          error: "Current account cannot access this child teacher-agent scope.",
          requiredRole: "staff",
        });
      }
      throw error;
    }
  }
  payload = buildTeacherAgentPayloadFromScope(payload, sessionScope);
  if (!isValidPayload(payload)) {
    return NextResponse.json({ error: "Invalid teacher-agent payload" }, { status: 400 });
  }
  const serviceScope = buildServiceScopeClaim(sessionScope);

  const brainRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(payload),
  });
  const brainForward = await forwardBrainRequest(brainRequest, TEACHER_AGENT_TARGET_PATH, {
    timeoutMs: TEACHER_AGENT_BRAIN_TIMEOUT_MS,
    serviceScope,
  });
  const brainResult = await maybeReadBrainResult(
    brainForward,
    payload,
    authResult.session.user.accountKind
  );

  if (brainResult?.response) return brainResult.response;

  const fallbackReason = buildFallbackReason(
    brainResult?.fallbackReason ?? brainForward.fallbackReason,
    "brain-proxy-unavailable"
  );
  const baseRuntimeOptions = getAiRuntimeOptions(request, {
    accountKind: authResult.session.user.accountKind,
  });
  const localRuntimeOptions: AiRuntimeOptions = {
    ...baseRuntimeOptions,
    // Brain 不可用或返回 mock 时仍应尝试 Next 侧真实 provider；provider 自身失败后才进入规则兜底。
    forceFallback: baseRuntimeOptions.forceFallback,
    fallbackReason: baseRuntimeOptions.forceFallback ? fallbackReason : null,
  };
  const localFallbackReason = localRuntimeOptions.forceFallback ? fallbackReason : null;

  try {
    const result = await runLocalTeacherAgent({
      payload,
      runtimeOptions: localRuntimeOptions,
      allowConsultation: !localRuntimeOptions.forceFallback && !localRuntimeOptions.forceMock,
      request,
      serviceScope,
    });
    if (isNextResponse(result)) return result;

    return NextResponse.json(
      enrichTeacherAgentResult({
        result,
        payload,
        transport: "next-json-fallback",
        fallbackReason: localFallbackReason,
      }),
      {
        status: 200,
        headers: buildTransportHeaders({
          transport: "next-json-fallback",
          upstreamHost: brainForward.upstreamHost,
          fallbackReason: localFallbackReason,
        }),
      }
    );
  } catch (error) {
    const providerFallbackReason = fallbackReasonFromProviderError(error);
    if (!providerFallbackReason) throw error;

    const providerRuntimeOptions: AiRuntimeOptions = {
      ...baseRuntimeOptions,
      forceFallback: true,
      fallbackReason: providerFallbackReason,
    };
    const result = await runLocalTeacherAgent({
      payload,
      runtimeOptions: providerRuntimeOptions,
      allowConsultation: false,
      request,
      serviceScope,
    });
    if (isNextResponse(result)) return result;

    return NextResponse.json(
      enrichTeacherAgentResult({
        result,
        payload,
        transport: "next-json-fallback",
        fallbackReason: providerFallbackReason,
      }),
      {
        status: 200,
        headers: buildTransportHeaders({
          transport: "next-json-fallback",
          upstreamHost: brainForward.upstreamHost,
          fallbackReason: providerFallbackReason,
        }),
      }
    );
  }
}
