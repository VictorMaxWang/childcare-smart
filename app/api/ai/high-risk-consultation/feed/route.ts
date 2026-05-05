import { NextResponse } from "next/server";
import { createBrainTransportHeaders, forwardBrainRequest } from "@/lib/server/brain-client";
import { authorizeAiRoute } from "@/lib/server/ai-route-guard";

function buildLocalFallbackHeaders(targetPath: string, fallbackReason: string | null, upstreamHost: string | null) {
  return createBrainTransportHeaders({
    transport: "next-json-fallback",
    targetPath,
    upstreamHost,
    fallbackReason: fallbackReason ?? "brain-proxy-unavailable",
  });
}

export async function GET(request: Request) {
  const authError = await authorizeAiRoute(request, { requiredRole: "staff", allowUnscoped: true });
  if (authError) return authError;

  const url = new URL(request.url);
  const targetPath = `/api/v1/agents/consultations/high-risk/feed${url.search}`;
  const brainForward = await forwardBrainRequest(request, targetPath);
  if (brainForward.response) {
    try {
      const payload = (await brainForward.response.clone().json()) as { items?: unknown[] } | null;
      if (payload && Array.isArray(payload.items) && payload.items.length > 0) {
        return brainForward.response;
      }
    } catch {
      return brainForward.response;
    }

    return NextResponse.json(
      {
        items: [],
        count: 0,
        fallback: false,
        empty: true,
      },
      {
        headers: buildLocalFallbackHeaders(
          targetPath,
          "brain-feed-empty-real-empty-state",
          brainForward.upstreamHost
        ),
      }
    );
  }

  return NextResponse.json(
    {
      items: [],
      count: 0,
      fallback: true,
      error: "high-risk consultation feed is unavailable",
    },
    {
      headers: buildLocalFallbackHeaders(targetPath, brainForward.fallbackReason, brainForward.upstreamHost),
    }
  );
}
