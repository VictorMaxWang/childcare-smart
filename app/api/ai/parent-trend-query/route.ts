import { NextResponse } from "next/server";
import type { ParentTrendQueryPayload } from "@/lib/ai/types";
import {
  createBrainTransportHeaders,
  forwardBrainRequest,
} from "@/lib/server/brain-client";
import { requireParentChildAccess } from "@/lib/server/parent-route-guard";

export async function POST(request: Request) {
  const body = (await request.clone().json().catch(() => null)) as ParentTrendQueryPayload | null;
  const access = await requireParentChildAccess(body?.childId);
  if (access.response) {
    return access.response;
  }

  const brainForward = await forwardBrainRequest(request, "/api/v1/agents/parent/trend-query");
  if (brainForward.response) return brainForward.response;

  const headers = createBrainTransportHeaders({
    transport: "next-json-fallback",
    targetPath: brainForward.targetPath,
    upstreamHost: brainForward.upstreamHost,
    fallbackReason: brainForward.fallbackReason ?? "brain-proxy-unavailable",
  });

  return NextResponse.json(
    {
      error: "趋势解读暂时不可用，请稍后再试。",
      detail: "当前还没拿到可用的趋势结果，这次先不展示趋势判断。",
    },
    { status: 503, headers }
  );
}
