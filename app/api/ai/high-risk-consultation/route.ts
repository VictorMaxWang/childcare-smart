import { NextResponse } from "next/server";
import type { HighRiskConsultationRequestPayload } from "@/lib/agent/high-risk-consultation";
import {
  buildLocalHighRiskConsultationResult,
  isValidHighRiskConsultationPayload,
} from "@/lib/agent/high-risk-consultation-local-result";
import { buildAiProviderTrace } from "@/lib/ai/provider-trace";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function maybeEnrichRemoteResponse(brainForward: BrainForwardResult): Promise<Response> {
  const response = brainForward.response;
  if (!response) {
    return NextResponse.json(
      { error: "Missing remote brain response" },
      { status: 502, headers: buildLocalFallbackHeaders(brainForward) }
    );
  }
  if (!response?.ok) return response;

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = (await response.clone().json().catch(() => null)) as unknown;
  if (!isRecord(body)) return response;

  const fallback = typeof body.fallback === "boolean" ? body.fallback : false;
  const provider = typeof body.provider === "string" && body.provider.trim() ? body.provider : "remote-brain";
  const fallbackReason =
    typeof body.fallbackReason === "string" && body.fallbackReason.trim()
      ? body.fallbackReason
      : null;
  const enriched = {
    ...body,
    provider,
    fallback,
    fallbackReason,
    providerTrace:
      isRecord(body.providerTrace) && Object.keys(body.providerTrace).length > 0
        ? body.providerTrace
        : buildAiProviderTrace({
            capability: "llm",
            provider,
            source: typeof body.source === "string" ? body.source : "remote-brain",
            mode: fallback ? "fallback" : "live",
            fallback,
            fallbackReason,
            realProvider: !fallback,
            model: body.model,
            transport: "remote-brain-proxy",
            transportSource: "next-server",
            extra: {
              consultationSource: "remote-brain-proxy",
              brainProvider: "remote-brain",
              upstreamHost: brainForward.upstreamHost,
            },
          }),
  };

  return NextResponse.json(enriched, {
    status: response.status,
    headers: response.headers,
  });
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
  if (brainForward.response) return maybeEnrichRemoteResponse(brainForward);

  const fallbackReason = brainForward.fallbackReason ?? "brain-proxy-unavailable";
  return localFallbackResponse(payload, buildLocalFallbackHeaders(brainForward), fallbackReason);
}
