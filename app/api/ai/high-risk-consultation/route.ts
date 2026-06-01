import { NextResponse } from "next/server";
import type { HighRiskConsultationRequestPayload } from "@/lib/agent/high-risk-consultation";
import {
  buildLocalHighRiskConsultationResult,
  isValidHighRiskConsultationPayload,
} from "@/lib/agent/high-risk-consultation-local-result";
import {
  createBrainTransportHeaders,
  forwardBrainRequest,
  type BrainForwardResult,
} from "@/lib/server/brain-client";
import { authorizeAiRoute } from "@/lib/server/ai-route-guard";

const HIGH_RISK_CONSULTATION_TARGET_PATH = "/api/v1/agents/consultations/high-risk";
const DEFAULT_HIGH_RISK_CONSULTATION_BRAIN_TIMEOUT_MS = 8_000;

function readPositiveIntEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getHighRiskConsultationBrainTimeoutMs() {
  return readPositiveIntEnv(
    "HIGH_RISK_CONSULTATION_BRAIN_TIMEOUT_MS",
    DEFAULT_HIGH_RISK_CONSULTATION_BRAIN_TIMEOUT_MS
  );
}

function buildLocalFallbackHeaders(brainForward: BrainForwardResult) {
  return createBrainTransportHeaders({
    transport: "next-json-fallback",
    targetPath: brainForward.targetPath,
    upstreamHost: brainForward.upstreamHost,
    fallbackReason: brainForward.fallbackReason ?? "brain-proxy-unavailable",
  });
}

function buildForcedFallbackHeaders(fallbackReason: string) {
  return createBrainTransportHeaders({
    transport: "next-json-fallback",
    targetPath: HIGH_RISK_CONSULTATION_TARGET_PATH,
    fallbackReason,
  });
}

function isForcedFallbackRequest(request: Request) {
  return request.headers.get("x-ai-force-fallback") === "1";
}

function localFallbackResponse(
  payload: HighRiskConsultationRequestPayload,
  headers: Headers,
  fallbackReason: string
) {
  const result = buildLocalHighRiskConsultationResult({
    payload,
    fallbackReason,
    transport: "next-json-fallback",
    consultationSource: "next-json-local-fallback",
  });

  if (!result) {
    return NextResponse.json(
      { error: "No visible child available for consultation" },
      { status: 400, headers }
    );
  }

  return NextResponse.json(result, { status: 200, headers });
}

export async function POST(request: Request) {
  const authError = await authorizeAiRoute(request, { requiredRole: "staff" });
  if (authError) return authError;

  let payload: HighRiskConsultationRequestPayload | null = null;

  try {
    payload = (await request.json()) as HighRiskConsultationRequestPayload;
  } catch (error) {
    console.error("[AI] Invalid high-risk consultation payload", error);
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: buildForcedFallbackHeaders("invalid-json-body") }
    );
  }

  if (!isValidHighRiskConsultationPayload(payload)) {
    return NextResponse.json(
      { error: "Invalid high-risk consultation payload" },
      { status: 400, headers: buildForcedFallbackHeaders("invalid-high-risk-consultation-payload") }
    );
  }

  if (isForcedFallbackRequest(request)) {
    const fallbackReason = "forced-local-fallback";
    return localFallbackResponse(payload, buildForcedFallbackHeaders(fallbackReason), fallbackReason);
  }

  const brainForward = await forwardBrainRequest(request, HIGH_RISK_CONSULTATION_TARGET_PATH, {
    timeoutMs: getHighRiskConsultationBrainTimeoutMs(),
  });
  if (brainForward.response) return brainForward.response;

  const fallbackReason = brainForward.fallbackReason ?? "brain-proxy-unavailable";
  return localFallbackResponse(payload, buildLocalFallbackHeaders(brainForward), fallbackReason);
}
