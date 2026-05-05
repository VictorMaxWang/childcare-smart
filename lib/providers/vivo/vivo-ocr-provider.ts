import "server-only";

import { createRequestId, vivoJsonRequest } from "./vivo-client";
import { VivoProviderError } from "./vivo-errors";
import { getVivoEnv, getVivoProviderStatus } from "./vivo-provider-status";
import type { VivoOcrInput, VivoOcrResult } from "./types";

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

export async function requestVivoOcr(input: VivoOcrInput): Promise<VivoOcrResult> {
  const fallbackText = input.fallbackText?.trim();
  const providerStatus = getVivoProviderStatus("ocr");
  if (!input.imageBase64 && fallbackText) {
    return {
      extractedText: fallbackText,
      confidence: null,
      providerName: "vivo",
      isRealProvider: false,
      warnings: ["使用文本 fallback，未调用真实 vivo OCR。"],
      requestId: input.requestId,
      status: providerStatus,
    };
  }

  if (!input.imageBase64) {
    throw new VivoProviderError("缺少可识别的图片内容。", {
      capability: "ocr",
      status: "provider-unavailable",
    });
  }

  if (!isVivoOcrSupportedMimeType(input.mimeType)) {
    throw new VivoProviderError("vivo OCR 文档仅确认 jpg/png/bmp 图片识别。", {
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
    isRealProvider: true,
    warnings: providerStatus.warnings,
    rawResponse: raw,
    requestId,
    status: providerStatus,
  };
}
