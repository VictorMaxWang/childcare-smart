import { NextResponse } from "next/server";
import { createBrainTransportHeaders, forwardBrainRequest } from "@/lib/server/brain-client";
import { authorizeAiRoute } from "@/lib/server/ai-route-guard";
import { buildAdminLocalConsultationFeedItems } from "@/lib/agent/admin-local-consultation-fallback";

type FeedPayload = {
  items?: unknown[];
  count?: number;
  source?: string;
  fallback?: boolean;
  fallbackReason?: string | null;
  [key: string]: unknown;
};

function buildLocalFallbackHeaders(targetPath: string, fallbackReason: string | null, upstreamHost: string | null) {
  return createBrainTransportHeaders({
    transport: "next-json-fallback",
    targetPath,
    upstreamHost,
    fallbackReason: fallbackReason ?? "brain-proxy-unavailable",
  });
}

function buildRemoteHeaders(headers: Headers) {
  const responseHeaders = new Headers(headers);
  responseHeaders.delete("content-length");
  responseHeaders.delete("content-type");
  return responseHeaders;
}

function readPositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readEscalatedOnly(value: string | null) {
  return value === "true" || value === "1";
}

function buildLocalFallbackBody(url: URL, fallbackReason: string | null) {
  const limit = readPositiveInteger(url.searchParams.get("limit"), 4);
  const items = buildAdminLocalConsultationFeedItems({
    limit,
    escalatedOnly: readEscalatedOnly(url.searchParams.get("escalated_only")),
  });

  return {
    items,
    count: items.length,
    source: "local-demo",
    fallback: true,
    fallbackReason: fallbackReason ?? "brain-proxy-unavailable",
    message: "远端 feed 暂不可用，当前使用本地演示数据。",
  };
}

function localFallbackResponse(params: {
  url: URL;
  targetPath: string;
  fallbackReason: string | null;
  upstreamHost: string | null;
}) {
  return NextResponse.json(buildLocalFallbackBody(params.url, params.fallbackReason), {
    status: 200,
    headers: buildLocalFallbackHeaders(params.targetPath, params.fallbackReason, params.upstreamHost),
  });
}

export async function GET(request: Request) {
  const authError = await authorizeAiRoute(request, { requiredRole: "staff", allowUnscoped: true });
  if (authError) return authError;

  const url = new URL(request.url);
  const targetPath = `/api/v1/agents/consultations/high-risk/feed${url.search}`;
  const brainForward = await forwardBrainRequest(request, targetPath);
  if (brainForward.response) {
    if (!brainForward.response.ok) {
      return localFallbackResponse({
        url,
        targetPath,
        fallbackReason: `brain-status-${brainForward.response.status}`,
        upstreamHost: brainForward.upstreamHost,
      });
    }

    try {
      const payload = (await brainForward.response.clone().json()) as FeedPayload | null;
      if (payload && Array.isArray(payload.items) && payload.items.length > 0) {
        return NextResponse.json(
          {
            ...payload,
            items: payload.items,
            count: typeof payload.count === "number" ? payload.count : payload.items.length,
            source: "remote-brain",
            fallback: false,
            fallbackReason: null,
          },
          {
            status: brainForward.response.status,
            headers: buildRemoteHeaders(brainForward.response.headers),
          }
        );
      }
    } catch {
      return localFallbackResponse({
        url,
        targetPath,
        fallbackReason: "brain-feed-invalid-json",
        upstreamHost: brainForward.upstreamHost,
      });
    }

    return localFallbackResponse({
      url,
      targetPath,
      fallbackReason: "brain-feed-empty-real-empty-state",
      upstreamHost: brainForward.upstreamHost,
    });
  }

  return localFallbackResponse({
    url,
    targetPath,
    fallbackReason: brainForward.fallbackReason,
    upstreamHost: brainForward.upstreamHost,
  });
}
