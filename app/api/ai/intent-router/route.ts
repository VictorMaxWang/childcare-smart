import { NextResponse } from "next/server";
import { isIntentRouterRequest, routeIntentRequest } from "@/lib/ai/intent-router";
import {
  createBrainTransportHeaders,
  forwardBrainRequest,
} from "@/lib/server/brain-client";
import { authorizeAiRoute } from "@/lib/server/ai-route-guard";
import { logSecurityEvent } from "@/lib/server/security-log";

export async function POST(request: Request) {
  const authError = await authorizeAiRoute(request, { allowUnscoped: true });
  if (authError) return authError;

  let payload: unknown;

  try {
    payload = await request.clone().json();
  } catch (error) {
    logSecurityEvent("error", "ai.intent_router.invalid_payload", { error });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isIntentRouterRequest(payload)) {
    return NextResponse.json({ error: "Invalid intent-router payload" }, { status: 400 });
  }

  if (payload.roleHint) {
    const roleAuthError = await authorizeAiRoute(request, {
      allowUnscoped: true,
      requiredRole: payload.roleHint,
    });
    if (roleAuthError) return roleAuthError;
  }

  const brainForward = await forwardBrainRequest(request, "/api/v1/agents/intent-router");
  if (brainForward.response) return brainForward.response;

  const headers = createBrainTransportHeaders({
    transport: "next-json-fallback",
    targetPath: brainForward.targetPath,
    upstreamHost: brainForward.upstreamHost,
    fallbackReason: brainForward.fallbackReason ?? "brain-proxy-unavailable",
  });

  return NextResponse.json(routeIntentRequest(payload), { status: 200, headers });
}
