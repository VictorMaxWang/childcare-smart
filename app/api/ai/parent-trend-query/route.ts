import { NextResponse } from "next/server";
import type { ParentTrendQueryPayload } from "@/lib/ai/types";
import {
  createBrainTransportHeaders,
  forwardBrainRequest,
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

export async function POST(request: Request) {
  const authError = await authorizeAiRoute(request, { requiredRole: "parent" });
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
      return NextResponse.json(responseBody, {
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
