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
import { authorizeAiRoute } from "@/lib/server/ai-route-guard";
import { logSecurityEvent } from "@/lib/server/security-log";

export async function POST(request: Request) {
  const authError = await authorizeAiRoute(request, { allowUnscoped: true });
  if (authError) return authError;

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

  const roleAuthError = await authorizeAiRoute(request, {
    requiredRole: payloadRole === "admin" ? "admin" : payloadRole === "teacher" ? "staff" : "parent",
    allowUnscoped: true,
    requireScopedNormalSession: true,
  });
  if (roleAuthError) return roleAuthError;

  const brainForward = await forwardBrainRequest(request, "/api/v1/agents/reports/weekly");
  if (brainForward.response) return brainForward.response;

  try {
    const result = await executeWeeklyReport(payload, getAiRuntimeOptions(request));
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (isAiProviderUnavailableError(error)) {
      return NextResponse.json(buildAiProviderUnavailableBody(error), { status: error.status });
    }
    throw error;
  }
}
