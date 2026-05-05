import {
  getVivoProviderStatus,
  requestVivoOcr,
  type VivoProviderStatus,
} from "@/lib/providers/vivo";

export interface OcrProviderInput {
  attachmentName?: string;
  fallbackText?: string;
  mimeType?: string;
  imageBase64?: string;
}

export interface OcrProviderOutput {
  text: string;
  extractedText: string;
  confidence: number | null;
  providerName: string;
  isRealProvider: boolean;
  warnings: string[];
  rawResponse?: Record<string, unknown>;
  providerStatus: VivoProviderStatus;
}

export interface OcrProviderResult<T> {
  provider: string;
  mode: "fallback" | "mock" | "real";
  source: "provider" | "provided_text" | "provider_unavailable";
  output: T;
}

export interface OcrProvider {
  getStatus(): VivoProviderStatus;
  extract(input: OcrProviderInput): Promise<OcrProviderResult<OcrProviderOutput>>;
}

function normalizeText(value?: string) {
  return value?.trim() || "";
}

function buildFallbackOutput(input: OcrProviderInput, status: VivoProviderStatus): OcrProviderOutput {
  const text = normalizeText(input.fallbackText);
  return {
    text,
    extractedText: text,
    confidence: text ? null : 0,
    providerName: "local-text-fallback",
    isRealProvider: false,
    warnings: [
      text
        ? "未调用真实 OCR provider，使用用户输入或文件内文字作为解析材料。"
        : "当前未接入真实 OCR provider，图片材料不会被伪造识别成功。",
      ...status.warnings,
    ],
    providerStatus: status,
  };
}

class LocalTextOcrFallbackProvider implements OcrProvider {
  getStatus() {
    return {
      ...getVivoProviderStatus("ocr"),
      status: "missing-env" as const,
      configured: false,
      isRealProvider: false,
      warnings: ["当前未配置 vivo OCR，只有文本材料可走本地规则解析。"],
    };
  }

  async extract(input: OcrProviderInput) {
    const output = buildFallbackOutput(input, this.getStatus());
    return {
      provider: output.providerName,
      mode: "fallback" as const,
      source: output.extractedText ? ("provided_text" as const) : ("provider_unavailable" as const),
      output,
    };
  }
}

class VivoOcrProvider implements OcrProvider {
  getStatus() {
    return getVivoProviderStatus("ocr");
  }

  async extract(input: OcrProviderInput) {
    const result = await requestVivoOcr({
      attachmentName: input.attachmentName,
      fallbackText: input.fallbackText,
      imageBase64: input.imageBase64,
      mimeType: input.mimeType,
    });

    return {
      provider: result.providerName,
      mode: result.isRealProvider ? ("real" as const) : ("fallback" as const),
      source: result.isRealProvider ? ("provider" as const) : ("provided_text" as const),
      output: {
        text: result.extractedText,
        extractedText: result.extractedText,
        confidence: result.confidence,
        providerName: result.providerName,
        isRealProvider: result.isRealProvider,
        warnings: result.warnings,
        rawResponse: result.rawResponse as Record<string, unknown> | undefined,
        providerStatus: result.status,
      },
    };
  }
}

export function resolveOcrProvider(): OcrProvider {
  const status = getVivoProviderStatus("ocr");
  return status.status === "ready" ? new VivoOcrProvider() : new LocalTextOcrFallbackProvider();
}
