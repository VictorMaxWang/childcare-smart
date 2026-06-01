import "server-only";

import { createRequestId, vivoJsonRequest } from "./vivo-client";
import { VivoProviderError } from "./vivo-errors";
import { getVivoEnv, getVivoProviderStatus } from "./vivo-provider-status";
import type { VivoOcrInput, VivoOcrResult, VivoProviderStatus } from "./types";

type VivoOcrWord = { words?: string };
type VivoOcrResponse = {
  error_code?: number;
  error_msg?: string;
  result?: {
    words?: VivoOcrWord[];
    OCR?: VivoOcrWord[];
    angle?: number;
  };
  version?: string;
  support?: string;
  [key: string]: unknown;
};

const SUPPORTED_OCR_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/bmp"]);

export function isVivoOcrSupportedMimeType(mimeType?: string) {
  return SUPPORTED_OCR_MIME_TYPES.has((mimeType ?? "").toLowerCase());
}

function extractText(raw: VivoOcrResponse) {
  const words = raw.result?.words ?? raw.result?.OCR ?? [];
  return words.map((item) => item.words?.trim()).filter(Boolean).join("\n");
}

function withRequestState(
  status: VivoProviderStatus<"ocr">,
  state: "live" | "fallback",
  reason?: string
): VivoProviderStatus<"ocr"> {
  return {
    ...status,
    state,
    live: state === "live",
    fallback: state === "fallback",
    mock: false,
    configured: state === "live" ? true : status.configured,
    isRealProvider: state === "live",
    status: state === "live" ? "ready" : "provider-unavailable",
    reason: reason ?? status.reason,
  };
}

export async function requestVivoOcr(input: VivoOcrInput): Promise<VivoOcrResult> {
  const fallbackText = input.fallbackText?.trim();
  const providerStatus = getVivoProviderStatus("ocr");
  if (!input.imageBase64 && fallbackText) {
    const fallbackStatus = withRequestState(
      providerStatus,
      "fallback",
      "OCR request used provided text because no binary image payload was supplied."
    );
    return {
      extractedText: fallbackText,
      confidence: null,
      providerName: "vivo",
      state: "fallback",
      live: false,
      fallback: true,
      mock: false,
      isRealProvider: false,
      warnings: ["Using text fallback; no live vivo OCR request was made."],
      requestId: input.requestId,
      status: fallbackStatus,
    };
  }

  if (!input.imageBase64) {
    throw new VivoProviderError("Missing image content for OCR.", {
      capability: "ocr",
      status: "provider-unavailable",
    });
  }

  if (!isVivoOcrSupportedMimeType(input.mimeType)) {
    throw new VivoProviderError("vivo OCR currently supports jpg/png/bmp image inputs only.", {
      capability: "ocr",
      status: "unsupported",
      raw: { mimeType: input.mimeType, attachmentName: input.attachmentName },
    });
  }

  if (!providerStatus.configured || !providerStatus.supported) {
    throw new VivoProviderError(providerStatus.reason ?? "vivo OCR provider is unavailable", {
      capability: "ocr",
      status: providerStatus.status,
    });
  }

  const env = getVivoEnv();
  const requestId = input.requestId ?? createRequestId();
  const body = new URLSearchParams();
  body.set("image", input.imageBase64);
  body.set("pos", "2");
  body.set("businessid", `aigc${env.appId}`);

  const raw = await vivoJsonRequest<VivoOcrResponse>({
    capability: "ocr",
    path: env.ocrPath,
    query: { requestId },
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    timeoutMs: 20_000,
  });

  if (raw.error_code !== 0) {
    throw new VivoProviderError(raw.error_msg ?? "vivo OCR returned an error", {
      capability: "ocr",
      status: "provider-unavailable",
      raw,
    });
  }

  return {
    extractedText: extractText(raw),
    confidence: null,
    providerName: "vivo",
    state: "live",
    live: true,
    fallback: false,
    mock: false,
    isRealProvider: true,
    warnings: providerStatus.warnings,
    rawResponse: raw,
    requestId,
    status: withRequestState(providerStatus, "live"),
  };
}
