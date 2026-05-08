import { NextResponse } from "next/server";
import {
  executeWeeklyReport,
  getAiRuntimeOptions,
  isValidWeeklyReportPayload,
  resolveWeeklyReportRoleFromPayload,
} from "@/lib/ai/server";
import type { WeeklyReportPayload } from "@/lib/ai/types";
import { forwardBrainRequest } from "@/lib/server/brain-client";
import { authorizeAiRoute } from "@/lib/server/ai-route-guard";

export async function POST(request: Request) {
  const authError = await authorizeAiRoute(request, { allowUnscoped: true });
  if (authError) return authError;

  let payload: WeeklyReportPayload | null = null;

  try {
    payload = (await request.clone().json()) as WeeklyReportPayload;
  } catch (error) {
    console.error("[AI] Invalid weekly-report payload", error);
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
  });
  if (roleAuthError) return roleAuthError;

  const brainForward = await forwardBrainRequest(request, "/api/v1/agents/reports/weekly");
  if (brainForward.response) return brainForward.response;

  const result = await executeWeeklyReport(payload, getAiRuntimeOptions(request));
  return NextResponse.json(result, { status: 200 });
}
