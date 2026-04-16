import { NextResponse } from "next/server";
import {
  buildHealthFileBridgeResponse,
  buildHealthFileBridgeWriteback,
  isValidHealthFileBridgeRequest,
} from "@/lib/agent/health-file-bridge";
import {
  createBrainTransportHeaders,
  forwardBrainRequest,
  getBrainBaseUrl,
  type BrainForwardResult,
} from "@/lib/server/brain-client";
import type {
  HealthFileBridgeRequest,
  HealthFileBridgeResponse,
  HealthFileBridgeWritebackRequest,
} from "@/lib/ai/types";

function buildLocalFallbackHeaders(brainForward: BrainForwardResult) {
  return createBrainTransportHeaders({
    transport: "next-json-fallback",
    targetPath: brainForward.targetPath,
    upstreamHost: brainForward.upstreamHost,
    fallbackReason: brainForward.fallbackReason ?? "brain-proxy-unavailable",
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isHealthFileBridgeResponsePayload(payload: unknown): payload is HealthFileBridgeResponse {
  if (!isRecord(payload)) return false;
  return (
    typeof payload.sourceRole === "string" &&
    typeof payload.fileType === "string" &&
    typeof payload.summary === "string" &&
    Array.isArray(payload.extractedFacts) &&
    Array.isArray(payload.riskItems) &&
    Array.isArray(payload.contraindications) &&
    Array.isArray(payload.followUpHints) &&
    typeof payload.source === "string" &&
    typeof payload.fallback === "boolean" &&
    typeof payload.mock === "boolean" &&
    typeof payload.liveReadyButNotVerified === "boolean" &&
    typeof payload.generatedAt === "string"
  );
}

function buildJsonResponse(body: unknown, init: ResponseInit) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

function buildPersistenceHeaders(request: Request) {
  const headers = new Headers({ "content-type": "application/json" });
  for (const key of ["x-request-id", "x-correlation-id", "x-trace-id", "x-debug-memory"]) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  return headers;
}

async function persistHealthFileBridgeWriteback(
  request: Request,
  payload: HealthFileBridgeWritebackRequest
) {
  const baseUrl = getBrainBaseUrl();
  if (!baseUrl) {
    console.warn("[AI] Skipping health-file-bridge writeback persistence: missing brain base URL");
    return;
  }

  try {
    const response = await fetch(`${baseUrl}/api/v1/memory/health-file-bridge-writeback`, {
      method: "POST",
      headers: buildPersistenceHeaders(request),
      cache: "no-store",
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(
        "[AI] Failed to persist health-file-bridge writeback",
        response.status,
        errorText.slice(0, 300)
      );
    }
  } catch (error) {
    console.error("[AI] Failed to persist health-file-bridge writeback", error);
  }
}

async function buildAugmentedBridgeResponse(
  request: Request,
  payload: HealthFileBridgeRequest,
  bridgeResponse: HealthFileBridgeResponse,
  init: ResponseInit
) {
  const bridgeWriteback = buildHealthFileBridgeWriteback(payload, bridgeResponse);
  const enhancedResponse: HealthFileBridgeResponse = {
    ...bridgeResponse,
    bridgeWriteback,
  };

  if (payload.childId) {
    await persistHealthFileBridgeWriteback(request, {
      childId: payload.childId,
      traceId: payload.traceId,
      bridgeWriteback,
    });
  }

  return buildJsonResponse(enhancedResponse, init);
}

async function maybeAugmentRemoteBridgeResponse(request: Request, response: Response) {
  if (!response.ok) return response;

  let bridgeResponse: HealthFileBridgeResponse | null = null;
  try {
    const body = (await response.clone().json()) as unknown;
    if (!isHealthFileBridgeResponsePayload(body)) return response;
    bridgeResponse = body;
  } catch (error) {
    console.error("[AI] Failed to parse remote health-file-bridge response", error);
    return response;
  }

  let payload: HealthFileBridgeRequest | null = null;
  try {
    const body = (await request.clone().json()) as unknown;
    if (!isValidHealthFileBridgeRequest(body)) return response;
    payload = body;
  } catch (error) {
    console.error("[AI] Failed to parse health-file-bridge request for writeback", error);
    return response;
  }

  return buildAugmentedBridgeResponse(request, payload, bridgeResponse, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export async function POST(request: Request) {
  const brainForward = await forwardBrainRequest(request, "/api/v1/agents/health-file-bridge");
  if (brainForward.response) {
    return maybeAugmentRemoteBridgeResponse(request, brainForward.response);
  }

  const headers = buildLocalFallbackHeaders(brainForward);

  let payload: HealthFileBridgeRequest | null = null;
  try {
    payload = (await request.json()) as HealthFileBridgeRequest;
  } catch (error) {
    console.error("[AI] Invalid health-file-bridge payload", error);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers });
  }

  if (!isValidHealthFileBridgeRequest(payload)) {
    return NextResponse.json(
      { error: "Invalid health-file-bridge payload" },
      { status: 400, headers }
    );
  }

  const bridgeResponse = buildHealthFileBridgeResponse(payload, {
    source: "next-local-extractor",
    fallback: true,
    mock: true,
    liveReadyButNotVerified: true,
  });

  return buildAugmentedBridgeResponse(request, payload, bridgeResponse, {
    status: 200,
    headers,
  });
}
