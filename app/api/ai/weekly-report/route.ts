import { NextResponse } from "next/server";
import {
  buildAiProviderUnavailableBody,
  executeWeeklyReport,
  getAiRuntimeOptions,
  isAiProviderUnavailableError,
  isValidWeeklyReportPayload,
  resolveWeeklyReportRoleFromPayload,
} from "@/lib/ai/server";
import type { WeeklyReportPayload } from "@/lib/ai/types";
import { forwardBrainRequest } from "@/lib/server/brain-client";
import { aiRouteLimitedResponse, authorizeAiRouteSession } from "@/lib/server/ai-route-guard";
import { ApiRouteError } from "@/lib/server/api-errors";
import { buildWeeklyReportPayloadFromScope } from "@/lib/server/ai-scoped-payloads";
import {
  buildServiceScopeClaim,
  getSessionScope,
  requireScopedChild,
} from "@/lib/server/session-scope";
import { requireClassAccess } from "@/lib/server/scope";
import { logSecurityEvent } from "@/lib/server/security-log";

export async function POST(request: Request) {
  const authResult = await authorizeAiRouteSession(request, { allowUnscoped: true });
  if (authResult instanceof Response) return authResult;

  let payload: WeeklyReportPayload | null = null;

  try {
    payload = (await request.clone().json()) as WeeklyReportPayload;
  } catch (error) {
    logSecurityEvent("error", "ai.weekly_report.invalid_payload", { error });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidWeeklyReportPayload(payload)) {
    return NextResponse.json({ error: "Invalid snapshot payload" }, { status: 400 });
  }

  const payloadRole = resolveWeeklyReportRoleFromPayload(payload);
  if (!payloadRole) {
    return NextResponse.json({ error: "Weekly report role is required" }, { status: 400 });
  }

  const roleAuthResult = await authorizeAiRouteSession(request, {
    requiredRole: payloadRole === "admin" ? "admin" : payloadRole === "teacher" ? "staff" : "parent",
    allowUnscoped: true,
    requireScopedNormalSession: true,
    session: authResult.session,
  });
  if (roleAuthResult instanceof Response) return roleAuthResult;

  const sessionScope = await getSessionScope(authResult.session);
  try {
    if (payload.scopeType === "child" && payload.scopeId) {
      requireScopedChild(sessionScope, payload.scopeId);
    }
    if (payload.scopeType === "class" && payload.scopeId) {
      // TODO(T8B-classId): class-scoped weekly reports are limited by className until classId is migrated.
      requireClassAccess(authResult.session.user, sessionScope.scopedSnapshot, payload.scopeId);
    }
  } catch (error) {
    if (error instanceof ApiRouteError && (error.code === "forbidden_scope" || error.code === "not_found")) {
      return aiRouteLimitedResponse({
        reason: payload.scopeType === "class" ? "forbidden_class" : "forbidden_child",
        error: "Current account cannot access this weekly report scope.",
        requiredRole: payloadRole === "admin" ? "admin" : payloadRole === "teacher" ? "staff" : "parent",
      });
    }
    throw error;
  }
  const trustedPayload = buildWeeklyReportPayloadFromScope(payload, sessionScope);
  const brainRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(trustedPayload),
  });

  const brainForward = await forwardBrainRequest(brainRequest, "/api/v1/agents/reports/weekly", {
    serviceScope: buildServiceScopeClaim(sessionScope),
  });
  if (brainForward.response) return brainForward.response;

  try {
    const result = await executeWeeklyReport(trustedPayload, getAiRuntimeOptions(request));
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (isAiProviderUnavailableError(error)) {
      return NextResponse.json(buildAiProviderUnavailableBody(error), { status: error.status });
    }
    throw error;
  }
}
