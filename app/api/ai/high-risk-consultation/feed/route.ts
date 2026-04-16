import { NextResponse } from "next/server";
import { createBrainTransportHeaders, forwardBrainRequest } from "@/lib/server/brain-client";
import { buildDemoConsultationFeedItems } from "@/lib/demo/demo-consultations";

function buildLocalFallbackHeaders(targetPath: string, fallbackReason: string | null, upstreamHost: string | null) {
  return createBrainTransportHeaders({
    transport: "next-json-fallback",
    targetPath,
    upstreamHost,
    fallbackReason: fallbackReason ?? "brain-proxy-unavailable",
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const targetPath = `/api/v1/agents/consultations/high-risk/feed${url.search}`;
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "4", 10);
  const escalatedOnly = url.searchParams.get("escalated_only") === "true";
  const fallbackItems = buildDemoConsultationFeedItems({
    limit: Number.isFinite(limit) && limit > 0 ? limit : 4,
    escalatedOnly,
  });
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
        items: fallbackItems,
        count: fallbackItems.length,
        fallback: true,
        error: "high-risk consultation feed returned empty items",
      },
      {
        headers: buildLocalFallbackHeaders(
          targetPath,
          "brain-feed-empty",
          brainForward.upstreamHost
        ),
      }
    );
  }

  return NextResponse.json(
    {
      items: fallbackItems,
      count: fallbackItems.length,
      fallback: true,
      error: "high-risk consultation feed is unavailable",
    },
    {
      headers: buildLocalFallbackHeaders(targetPath, brainForward.fallbackReason, brainForward.upstreamHost),
    }
  );
}
