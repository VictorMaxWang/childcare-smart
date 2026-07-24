import { NextResponse } from "next/server.js";
import { authorizeAiRouteSession } from "@/lib/server/ai-route-guard";
import {
  buildAdminAgentContext,
  buildAdminDailyPriorityResult,
  buildAdminQuestionFollowUpPayload,
  buildAdminFollowUpResult,
  buildAdminLocalFallbackResult,
  buildAdminWeeklyReportResult,
  buildAdminWeeklyReportResultWithMemory,
  buildAdminWeeklyReportSnapshotWithMemory,
} from "@/lib/agent/admin-agent";
import {
  sanitizeAdminWeeklyReportResponseForAdmin,
  sanitizeAdminWeeklyResult,
} from "@/lib/agent/admin-weekly-sanitize";
import type {
  AdminAgentRequestPayload,
  AdminAgentResult,
  AdminAgentWorkflowType,
} from "@/lib/agent/admin-types";
import {
  buildAiProviderUnavailableBody,
  executeFollowUp,
  executeSuggestion,
  executeWeeklyReport,
  getAiRuntimeOptions,
  isAiProviderUnavailableError,
} from "@/lib/ai/server";
import type { WeeklyReportResponse } from "@/lib/ai/types";
import {
  forwardBrainRequest,
  shouldAcceptRemoteResponse,
} from "@/lib/server/brain-client";
import { buildAdminAgentPayloadFromScope } from "@/lib/server/ai-scoped-payloads";
import { buildServiceScopeClaim, getSessionScope } from "@/lib/server/session-scope";
import { buildMemoryContextForPrompt } from "@/lib/server/memory-context";
import { logSecurityEvent } from "@/lib/server/security-log";

function isRecordArray(value: unknown) {
  return Array.isArray(value);
}

function isValidWorkflow(value: unknown): value is AdminAgentWorkflowType {
  return value === "daily-priority" || value === "question-follow-up" || value === "weekly-ops-report";
}

function isValidPayload(payload: unknown): payload is AdminAgentRequestPayload {
  if (!payload || typeof payload !== "object") return false;
  const obj = payload as Record<string, unknown>;

  return (
    isValidWorkflow(obj.workflow) &&
    obj.currentUser !== null &&
    typeof obj.currentUser === "object" &&
    isRecordArray(obj.visibleChildren) &&
    isRecordArray(obj.attendanceRecords) &&
    isRecordArray(obj.healthCheckRecords) &&
    isRecordArray(obj.growthRecords) &&
    isRecordArray(obj.guardianFeedbacks) &&
    isRecordArray(obj.mealRecords) &&
    obj.adminBoardData !== null &&
    typeof obj.adminBoardData === "object" &&
    obj.weeklyTrend !== null &&
    typeof obj.weeklyTrend === "object" &&
    isRecordArray(obj.smartInsights)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isAdminAgentResult(value: unknown): value is AdminAgentResult {
  if (!isRecord(value)) return false;

  return (
    typeof value.title === "string" &&
    typeof value.summary === "string" &&
    typeof value.assistantAnswer === "string" &&
    isRecord(value.institutionScope) &&
    Array.isArray(value.priorityTopItems) &&
    Array.isArray(value.riskChildren) &&
    Array.isArray(value.riskClasses) &&
    Array.isArray(value.feedbackRiskItems) &&
    isStringArray(value.highlights) &&
    Array.isArray(value.actionItems) &&
    Array.isArray(value.recommendedOwnerMap) &&
    isStringArray(value.quickQuestions) &&
    Array.isArray(value.notificationEvents) &&
    typeof value.source === "string" &&
    typeof value.generatedAt === "string"
  );
}

function isWeeklyReportResponse(value: unknown): value is WeeklyReportResponse {
  if (!isRecord(value)) return false;

  return (
    typeof value.schemaVersion === "string" &&
    typeof value.role === "string" &&
    typeof value.summary === "string" &&
    isStringArray(value.highlights) &&
    isStringArray(value.risks) &&
    isStringArray(value.nextWeekActions) &&
    typeof value.trendPrediction === "string" &&
    Array.isArray(value.sections) &&
    typeof value.disclaimer === "string" &&
    typeof value.source === "string"
  );
}

function extractWeeklyReportResponse(value: unknown): WeeklyReportResponse | null {
  if (isWeeklyReportResponse(value)) {
    return value;
  }

  if (!isRecord(value) || value.workflow !== "weekly-ops-report") {
    return null;
  }

  const report = { ...value };
  delete report.workflow;
  delete report.title;
  delete report.generatedAt;
  return isWeeklyReportResponse(report) ? report : null;
}

function normalizeWeeklyProxyResult(
  payload: AdminAgentRequestPayload,
  raw: unknown
): AdminAgentResult | null {
  if (isAdminAgentResult(raw)) {
    return sanitizeAdminWeeklyResult(raw);
  }

  const report = extractWeeklyReportResponse(raw);
  if (!report) return null;

  const context = buildAdminAgentContext(payload);
  return buildAdminWeeklyReportResult({
    context,
    report: sanitizeAdminWeeklyReportResponseForAdmin(report),
  });
}

function buildNormalizedProxyResponse(upstream: Response, data: AdminAgentResult) {
  const headers = new Headers(upstream.headers);
  headers.delete("content-length");
  headers.delete("content-type");
  return NextResponse.json(data, {
    status: upstream.status,
    headers,
  });
}

function providerErrorResponse(error: unknown) {
  return isAiProviderUnavailableError(error)
    ? NextResponse.json(buildAiProviderUnavailableBody(error), { status: error.status })
    : null;
}

export async function POST(request: Request) {
  const authResult = await authorizeAiRouteSession(request, { requiredRole: "admin" });
  if (authResult instanceof Response) return authResult;

  let payload: AdminAgentRequestPayload | null = null;

  try {
    payload = (await request.clone().json()) as AdminAgentRequestPayload;
  } catch (error) {
    logSecurityEvent("error", "ai.admin_agent.invalid_payload", { error });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload || typeof payload !== "object" || !isValidWorkflow(payload.workflow)) {
    return NextResponse.json({ error: "Invalid admin-agent payload" }, { status: 400 });
  }

  const sessionScope = await getSessionScope(authResult.session);
  payload = buildAdminAgentPayloadFromScope(payload, sessionScope);
  if (!isValidPayload(payload)) {
    return NextResponse.json({ error: "Invalid admin-agent payload" }, { status: 400 });
  }
  const serviceScope = buildServiceScopeClaim(sessionScope);
  const brainRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(payload),
  });

  const brainForward = await forwardBrainRequest(brainRequest, "/api/v1/agents/admin/run", {
    serviceScope,
  });
  if (
    brainForward.response &&
    await shouldAcceptRemoteResponse(
      brainForward.response,
      authResult.session.user.accountKind
    )
  ) {
    if (payload.workflow !== "weekly-ops-report" || !brainForward.response.ok) {
      return brainForward.response;
    }

    let shouldFallbackToLocalWeekly = false;

    try {
      const proxyData = (await brainForward.response.clone().json()) as unknown;
      const normalized = normalizeWeeklyProxyResult(payload, proxyData);
      if (normalized) {
        return buildNormalizedProxyResponse(brainForward.response, normalized);
      }
      shouldFallbackToLocalWeekly = true;
    } catch (error) {
      logSecurityEvent("warn", "ai.admin_agent.proxy_normalize_failed", { error });
      shouldFallbackToLocalWeekly = true;
    }

    if (!shouldFallbackToLocalWeekly) {
      return brainForward.response;
    }
  }

  const context = buildAdminAgentContext(payload);
  const runtimeOptions = getAiRuntimeOptions(request, {
    accountKind: authResult.session.user.accountKind,
  });

  try {
  if (payload.workflow === "daily-priority") {
    const suggestion = await executeSuggestion(
      {
        scope: "institution",
        snapshot: context.suggestionSnapshot,
      },
      runtimeOptions
    );

    const result = buildAdminDailyPriorityResult({
      context,
      suggestion,
    });

    return NextResponse.json(result, { status: 200 });
  }

  if (payload.workflow === "question-follow-up") {
    const question = payload.question?.trim() || "今天最该优先处理的 3 件事是什么？";
    const response = await executeFollowUp(
      buildAdminQuestionFollowUpPayload({
        context,
        question,
        history: payload.history,
      }),
      runtimeOptions
    );

    const result = buildAdminFollowUpResult({
      context,
      question,
      response,
    });

    return NextResponse.json(result, { status: 200 });
  }

  const weeklyMemoryContexts = await Promise.all(
    (context.riskChildren.map((item) => item.childId).slice(0, 3).length > 0
      ? context.riskChildren.map((item) => item.childId).slice(0, 3)
      : payload.visibleChildren.map((item) => item.id).slice(0, 3)
    ).map((childId) =>
      buildMemoryContextForPrompt({
        childId,
        workflowType: "admin-weekly-ops-report",
        query: payload.question?.trim() || "weekly ops report risk child continuity",
        request,
        serviceScope,
      })
    )
  );
  const report = await executeWeeklyReport(
    {
      role: "admin",
      snapshot: buildAdminWeeklyReportSnapshotWithMemory(payload, context, weeklyMemoryContexts),
    },
    runtimeOptions
  );
  const result = buildAdminWeeklyReportResultWithMemory({
    context,
    report,
    memoryContexts: weeklyMemoryContexts,
  });

  return NextResponse.json(sanitizeAdminWeeklyResult(result), { status: 200 });
  } catch (error) {
    const response = providerErrorResponse(error);
    if (response) {
      return NextResponse.json(
        buildAdminLocalFallbackResult(payload, "admin-agent-provider-unavailable"),
        { status: 200 }
      );
    }
    throw error;
  }
}
