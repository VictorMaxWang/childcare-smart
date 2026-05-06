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
import { authorizeAiRoute } from "@/lib/server/ai-route-guard";
import { apiError } from "@/lib/server/api-errors";
import { resolveOcrProvider } from "@/lib/ai/providers";
import { VivoProviderError } from "@/lib/providers/vivo";
import type {
  HealthFileBridgeFile,
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

function readFileBase64(file: HealthFileBridgeFile) {
  const fromFile = typeof file.imageBase64 === "string" ? file.imageBase64 : "";
  const fromMeta = typeof file.meta?.imageBase64 === "string" ? file.meta.imageBase64 : "";
  const fromDataUrl = typeof file.dataUrl === "string" ? file.dataUrl : "";
  const value = fromFile || fromMeta || fromDataUrl;
  return value.includes(",") ? value.split(",").pop()?.trim() ?? "" : value.trim();
}

function isBinaryHealthFile(file: HealthFileBridgeFile) {
  const mimeType = file.mimeType?.toLowerCase() ?? "";
  const name = file.name.toLowerCase();
  return mimeType.startsWith("image/") || mimeType.includes("pdf") || name.endsWith(".pdf");
}

function hasTextMaterial(payload: HealthFileBridgeRequest) {
  return Boolean(
    payload.optionalNotes?.trim() ||
      payload.files.some((file) => file.previewText?.trim())
  );
}

function needsServerOcrEnrichment(payload: HealthFileBridgeRequest) {
  return payload.files.some((file) => isBinaryHealthFile(file) && readFileBase64(file));
}

function buildPayloadRequest(request: Request, payload: HealthFileBridgeRequest) {
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(payload),
  });
}

function mergeUnique(left?: string[], right?: string[]) {
  return Array.from(new Set([...(left ?? []), ...(right ?? [])]));
}

async function enrichPayloadWithOcr(payload: HealthFileBridgeRequest) {
  const ocrProvider = resolveOcrProvider();
  const providerStatus = ocrProvider.getStatus();
  const extractedTextParts: string[] = [];
  const warnings = new Set<string>(providerStatus.warnings);
  const fileStatuses: Array<Record<string, unknown>> = [];
  let usedRealProvider = false;

  const files = await Promise.all(
    payload.files.map(async (file) => {
      const existingText = file.previewText?.trim() ?? "";
      const imageBase64 = readFileBase64(file);
      const result = await ocrProvider.extract({
        attachmentName: file.name,
        fallbackText: existingText,
        imageBase64,
        mimeType: file.mimeType,
      });

      for (const warning of result.output.warnings) warnings.add(warning);
      if (result.output.isRealProvider) usedRealProvider = true;
      if (result.output.extractedText.trim()) extractedTextParts.push(result.output.extractedText.trim());
      fileStatuses.push({
        fileName: file.name,
        provider: result.provider,
        mode: result.mode,
        source: result.source,
        isRealProvider: result.output.isRealProvider,
        status: result.output.providerStatus.status,
      });

      if (result.source === "provider_unavailable" && isBinaryHealthFile(file) && !existingText) {
        throw new VivoProviderError("当前未接入真实 OCR provider，请输入文字材料或配置 vivo OCR 后再解析图片/PDF。", {
          capability: "ocr",
          status: "provider-unavailable",
          raw: { fileName: file.name, mimeType: file.mimeType, providerStatus: result.output.providerStatus },
        });
      }

      return {
        ...file,
        previewText: result.output.extractedText || existingText,
      };
    })
  );

  const enrichedPayload = { ...payload, files };
  const extractedText = extractedTextParts.join("\n\n");
  if (!hasTextMaterial(enrichedPayload)) {
    throw new VivoProviderError("未获得可解析文字材料；当前不会从图片或音频伪造识别结果。", {
      capability: "ocr",
      status: "provider-unavailable",
      raw: { providerStatus, fileStatuses },
    });
  }

  return {
    payload: enrichedPayload,
    providerStatus: {
      ocr: providerStatus,
      files: fileStatuses,
    },
    extractedText,
    usedRealProvider,
    warnings: Array.from(warnings),
  };
}

type OcrEnrichment = Awaited<ReturnType<typeof enrichPayloadWithOcr>>;

function mergeOcrProvenance(
  bridgeResponse: HealthFileBridgeResponse,
  enriched?: OcrEnrichment | null
): HealthFileBridgeResponse {
  if (!enriched?.usedRealProvider) return bridgeResponse;

  const providerStatus =
    bridgeResponse.providerStatus && typeof bridgeResponse.providerStatus === "object"
      ? bridgeResponse.providerStatus
      : {};

  return {
    ...bridgeResponse,
    source: "vivo-ocr-provider",
    fallback: false,
    provider: "vivo",
    model: bridgeResponse.model ?? "vivo-general-ocr",
    extractedText: enriched.extractedText || bridgeResponse.extractedText,
    providerStatus: {
      ...providerStatus,
      ...enriched.providerStatus,
    },
    warnings: mergeUnique(bridgeResponse.warnings, enriched.warnings),
  };
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
  init: ResponseInit,
  enriched?: OcrEnrichment | null
) {
  const responseWithProvenance = mergeOcrProvenance(bridgeResponse, enriched);
  const bridgeWriteback = buildHealthFileBridgeWriteback(payload, responseWithProvenance);
  const enhancedResponse: HealthFileBridgeResponse = {
    ...responseWithProvenance,
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

async function maybeAugmentRemoteBridgeResponse(
  request: Request,
  response: Response,
  enriched?: OcrEnrichment | null
) {
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

  if (
    bridgeResponse.mock &&
    payload.files.some((file) => isBinaryHealthFile(file)) &&
    !hasTextMaterial(payload)
  ) {
    return apiError(
      "provider_unavailable",
      "当前未接入真实 OCR provider，图片/PDF 材料不会被后端 fallback 伪造成识别成功；请提供预览文字或配置 provider。",
      { status: 503, headers: response.headers }
    );
  }

  return buildAugmentedBridgeResponse(request, payload, bridgeResponse, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  }, enriched);
}

export async function POST(request: Request) {
  const authError = await authorizeAiRoute(request, { requiredRole: "staff" });
  if (authError) return authError;

  let payload: HealthFileBridgeRequest | null = null;
  try {
    payload = (await request.json()) as HealthFileBridgeRequest;
  } catch (error) {
    console.error("[AI] Invalid health-file-bridge payload", error);
    return apiError("invalid_request", "Invalid JSON body", { status: 400 });
  }

  if (!isValidHealthFileBridgeRequest(payload)) {
    return apiError("invalid_request", "Invalid health-file-bridge payload", { status: 400 });
  }

  let enriched: OcrEnrichment | null = null;
  let forwardedRequest = buildPayloadRequest(request, payload);
  try {
    if (needsServerOcrEnrichment(payload)) {
      enriched = await enrichPayloadWithOcr(payload);
      payload = enriched.payload;
      forwardedRequest = buildPayloadRequest(request, payload);
    }
  } catch (error) {
    if (error instanceof VivoProviderError) {
      return apiError("provider_unavailable", error.message, { status: 503 });
    }
    throw error;
  }

  const brainForward = await forwardBrainRequest(forwardedRequest, "/api/v1/agents/health-file-bridge");
  if (brainForward.response) {
    return maybeAugmentRemoteBridgeResponse(forwardedRequest, brainForward.response, enriched);
  }

  const headers = buildLocalFallbackHeaders(brainForward);

  if (!enriched) {
    try {
      enriched = await enrichPayloadWithOcr(payload);
      payload = enriched.payload;
    } catch (error) {
      if (error instanceof VivoProviderError) {
        return apiError("provider_unavailable", error.message, { status: 503, headers });
      }
      throw error;
    }
  }

  const bridgeResponse = buildHealthFileBridgeResponse(enriched.payload, {
    source: enriched.usedRealProvider ? "vivo-ocr-provider" : "local-text-fallback",
    fallback: !enriched.usedRealProvider,
    mock: false,
    liveReadyButNotVerified: true,
    provider: enriched.usedRealProvider ? "vivo" : "local-text-fallback",
    model: enriched.usedRealProvider ? "vivo-general-ocr" : "local-health-rule-parser",
    extractedText: enriched.extractedText,
    providerStatus: enriched.providerStatus,
    warnings: enriched.warnings,
  });

  return buildAugmentedBridgeResponse(request, enriched.payload, bridgeResponse, {
    status: 200,
    headers,
  }, enriched);
}
