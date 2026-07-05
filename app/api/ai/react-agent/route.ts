import { NextResponse } from "next/server";
import { forwardBrainRequest } from "@/lib/server/brain-client";
import { authorizeAiRouteSession } from "@/lib/server/ai-route-guard";
import { buildServiceScopeClaim, getSessionScope } from "@/lib/server/session-scope";

export async function POST(request: Request) {
  const authResult = await authorizeAiRouteSession(request, {
    allowUnscoped: true,
    normalAccountAccess: "demo-only",
    normalAccountLimitedReason: "normal_session_not_enabled",
  });
  if (authResult instanceof Response) return authResult;

  const sessionScope = await getSessionScope(authResult.session);
  const brainForward = await forwardBrainRequest(request, "/api/v1/agents/react/run", {
    serviceScope: buildServiceScopeClaim(sessionScope),
  });
  if (brainForward.response) return brainForward.response;

  return NextResponse.json(
    {
      ok: false,
      error: "React agent backend is unavailable.",
    },
    { status: 503 }
  );
}
