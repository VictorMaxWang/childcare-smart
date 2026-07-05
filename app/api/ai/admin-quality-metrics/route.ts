import { NextResponse } from "next/server";
import { authorizeAiRouteSession } from "@/lib/server/ai-route-guard";
import {
  createBrainTransportHeaders,
  forwardBrainRequest,
} from "@/lib/server/brain-client";
import { buildServiceScopeClaim, getSessionScope } from "@/lib/server/session-scope";

function buildLocalFallbackHeaders(
  targetPath: string,
  fallbackReason: string | null,
  upstreamHost: string | null
) {
  return createBrainTransportHeaders({
    transport: "next-json-fallback",
    targetPath,
    upstreamHost,
    fallbackReason: fallbackReason ?? "brain-proxy-unavailable",
  });
}

export async function POST(request: Request) {
  const authResult = await authorizeAiRouteSession(request, { requiredRole: "admin" });
  if (authResult instanceof Response) return authResult;

  const targetPath = "/api/v1/agents/metrics/admin-quality";
  const sessionScope = await getSessionScope(authResult.session);
  const brainForward = await forwardBrainRequest(request, targetPath, {
    serviceScope: buildServiceScopeClaim(sessionScope),
  });

  if (brainForward.response) {
    return brainForward.response;
  }

  return NextResponse.json(
    {
      error: "admin quality metrics are unavailable",
      source: "next-json-fallback",
      fallback: true,
    },
    {
      status: 503,
      headers: buildLocalFallbackHeaders(
        targetPath,
        brainForward.fallbackReason,
        brainForward.upstreamHost
      ),
    }
  );
}
