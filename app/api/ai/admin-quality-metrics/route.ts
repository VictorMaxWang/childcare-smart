import { NextResponse } from "next/server";
import {
  createBrainTransportHeaders,
  forwardBrainRequest,
} from "@/lib/server/brain-client";

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
  const targetPath = "/api/v1/agents/metrics/admin-quality";
  const brainForward = await forwardBrainRequest(request, targetPath);

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
