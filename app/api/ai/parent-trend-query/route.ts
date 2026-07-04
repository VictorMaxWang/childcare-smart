import { NextResponse } from "next/server";
import type { ParentTrendQueryPayload, ParentTrendQueryResponse } from "@/lib/ai/types";
import { buildAiProviderTrace } from "@/lib/ai/provider-trace";
import {
  createBrainTransportHeaders,
  forwardBrainRequest,
  type BrainForwardResult,
} from "@/lib/server/brain-client";
import { authorizeAiRoute } from "@/lib/server/ai-route-guard";
import {
  buildParentTrendFallbackResponse,
  isParentTrendQueryResponse,
} from "@/lib/server/parent-trend-fallback";

function isParentTrendPayload(value: unknown): value is ParentTrendQueryPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Partial<ParentTrendQueryPayload>;
  return (
    typeof payload.question === "string" &&
    payload.question.trim().length > 0 &&
    typeof payload.childId === "string" &&
    payload.childId.trim().length > 0
  );
}

function buildFallbackHeaders(input: {
  targetPath: string;
  upstreamHost?: string | null;
  fallbackReason: string;
}) {
  return createBrainTransportHeaders({
    transport: "next-json-fallback",
    targetPath: input.targetPath,
    upstreamHost: input.upstreamHost,
    fallbackReason: input.fallbackReason,
  });
}

function enrichParentTrendResponse(
  responseBody: ParentTrendQueryResponse,
  brainForward: BrainForwardResult
) {
  const fallback = Boolean(responseBody.fallback);
  const fallbackReason = responseBody.fallbackReason ?? null;
  const provider = responseBody.provider ?? (fallback ? "remote-brain-fallback" : "remote-brain");
  return {
    ...responseBody,
    mode: responseBody.mode ?? (fallback ? "fallback" : "live"),
    provider,
    fallbackReason,
    providerTrace:
      responseBody.providerTrace ??
      buildAiProviderTrace({
        capability: "llm",
        provider,
        source: fallback ? "fallback" : "remote-brain",
        mode: fallback ? "fallback" : "live",
        fallback,
        fallbackReason,
        realProvider: !fallback,
        transport: "remote-brain-proxy",
        transportSource: "next-server",
        extra: {
          dataSource: responseBody.source,
          upstreamHost: brainForward.upstreamHost,
        },
      }),
  };
}

export async function POST(request: Request) {
  const authError = await authorizeAiRoute(request, {
    requiredRole: "parent",
    collectJsonClassNames: false,
    requireScopedNormalSession: true,
  });
  if (authError) return authError;

  const body = (await request.clone().json().catch(() => null)) as unknown;
  if (!isParentTrendPayload(body)) {
    return NextResponse.json(
      { error: "Invalid parent trend payload" },
      { status: 400 }
    );
  }

  const brainForward = await forwardBrainRequest(request, "/api/v1/agents/parent/trend-query");
  if (brainForward.response) {
    if (brainForward.response.status >= 400 && brainForward.response.status < 500) {
      return brainForward.response;
    }

    const contentType = brainForward.response.headers.get("content-type") ?? "";
    const responseBody = contentType.includes("application/json")
      ? await brainForward.response.clone().json().catch(() => null)
      : null;

    if (brainForward.response.ok && isParentTrendQueryResponse(responseBody)) {
      return NextResponse.json(enrichParentTrendResponse(responseBody, brainForward), {
        status: brainForward.response.status,
        headers: brainForward.response.headers,
      });
    }

    const fallbackReason =
      brainForward.fallbackReason ??
      (!contentType.includes("application/json")
        ? "brain-proxy-invalid-json"
        : "brain-incomplete-parent-trend-result");
    const headers = buildFallbackHeaders({
      targetPath: brainForward.targetPath,
      upstreamHost: brainForward.upstreamHost,
      fallbackReason,
    });

    return NextResponse.json(
      buildParentTrendFallbackResponse({
        payload: body,
        fallbackReason,
      }),
      { status: 200, headers }
    );
  }

  const fallbackReason = brainForward.fallbackReason ?? "brain-proxy-unavailable";
  const headers = buildFallbackHeaders({
    targetPath: brainForward.targetPath,
    upstreamHost: brainForward.upstreamHost,
    fallbackReason,
  });

  return NextResponse.json(
    buildParentTrendFallbackResponse({
      payload: body,
      fallbackReason,
    }),
    { status: 200, headers }
  );
}
