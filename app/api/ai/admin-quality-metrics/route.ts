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
  let payload: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Request body must be an object." }, { status: 400 });
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // 机构与业务快照只能来自服务端会话，不能让浏览器指定另一个租户的数据源。
  const trustedRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({
      ...payload,
      institutionId: sessionScope.institutionId,
      snapshot: sessionScope.scopedSnapshot,
      appSnapshot: sessionScope.scopedSnapshot,
    }),
  });
  const brainForward = await forwardBrainRequest(trustedRequest, targetPath, {
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
