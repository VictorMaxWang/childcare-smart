import { NextResponse } from "next/server";
import { isIntentRouterRequest, routeIntentRequest } from "@/lib/ai/intent-router";
import {
  createBrainTransportHeaders,
  forwardBrainRequest,
} from "@/lib/server/brain-client";

export async function POST(request: Request) {
  const brainForward = await forwardBrainRequest(request, "/api/v1/agents/intent-router");
  if (brainForward.response) return brainForward.response;

  let payload: unknown;

  try {
    payload = await request.json();
  } catch (error) {
    console.error("[AI] Invalid intent-router payload", error);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isIntentRouterRequest(payload)) {
    return NextResponse.json({ error: "Invalid intent-router payload" }, { status: 400 });
  }

  const headers = createBrainTransportHeaders({
    transport: "next-json-fallback",
    targetPath: brainForward.targetPath,
    upstreamHost: brainForward.upstreamHost,
    fallbackReason: brainForward.fallbackReason ?? "brain-proxy-unavailable",
  });

  return NextResponse.json(routeIntentRequest(payload), { status: 200, headers });
}
