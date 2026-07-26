import {
  requestDashscopeHealthOcr,
  resolveBailianOcrModel,
} from "@/lib/ai/dashscope";
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

export interface OcrProviderStatus extends VivoProviderStatus<"ocr"> {
  model?: string;
}

export interface OcrProviderOutput {
  text: string;
  extractedText: string;
  confidence: number | null;
  providerName: string;
  model?: string;
  state: "configured" | "live" | "fallback" | "mock";
  live: boolean;
  fallback: boolean;
  mock: boolean;
  isRealProvider: boolean;
  warnings: string[];
  rawResponse?: Record<string, unknown>;
  providerStatus: OcrProviderStatus;
}

export interface OcrProviderResult<T> {
  provider: string;
  mode: "fallback" | "mock" | "live";
  source: "provider" | "provided_text" | "provider_unavailable";
  output: T;
}

export interface OcrProvider {
  getStatus(): OcrProviderStatus;
  extract(input: OcrProviderInput): Promise<OcrProviderResult<OcrProviderOutput>>;
}

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

function normalizeText(value?: string) {
  return value?.trim() || "";
}

function hasDashscopeKey() {
  const value = process.env.DASHSCOPE_API_KEY?.trim() ?? "";
  return Boolean(value) && !/^(?:placeholder|changeme|your[_-].*key)$/i.test(value);
}

export function getDashscopeOcrProviderStatus(): OcrProviderStatus {
  const configured = hasDashscopeKey();
  return {
    providerName: "dashscope",
    capability: "ocr",
    state: configured ? "configured" : "fallback",
    configured,
    live: false,
    fallback: !configured,
    mock: false,
    supported: true,
    isRealProvider: configured,
    status: configured ? "ready" : "missing-env",
    reason: configured
      ? undefined
      : "Missing required env for DashScope OCR: DASHSCOPE_API_KEY",
    warnings: [
      "百炼 OCR 状态仅表示配置可用；只有成功识别后才会标记为 live。",
      "百炼视觉 OCR 仅处理图片；可提取文字的 PDF 由服务端本地解析。",
    ],
    requiredEnv: ["DASHSCOPE_API_KEY"],
    model: resolveBailianOcrModel(),
  };
}

export function getEffectiveOcrProviderStatus(): OcrProviderStatus {
  const vivo = getVivoProviderStatus("ocr");
  if (vivo.status === "ready") return vivo;

  const dashscope = getDashscopeOcrProviderStatus();
  if (dashscope.status === "ready") return dashscope;

  return {
    ...vivo,
    providerName: "vivo / dashscope",
    requiredEnv: Array.from(
      new Set([...vivo.requiredEnv, ...dashscope.requiredEnv])
    ),
    warnings: [...vivo.warnings, ...dashscope.warnings],
    reason: "No real OCR provider is configured.",
  };
}

function buildFallbackOutput(
  input: OcrProviderInput,
  status: OcrProviderStatus,
  warning?: string
): OcrProviderOutput {
  const text = normalizeText(input.fallbackText);
  return {
    text,
    extractedText: text,
    confidence: text ? null : 0,
    providerName: "local-text-fallback",
    state: "fallback",
    live: false,
    fallback: true,
    mock: false,
    isRealProvider: false,
    warnings: [
      warning ??
        (text
          ? "未调用真实 OCR provider，使用文件内可提取文字继续解析。"
          : "当前没有可用的真实 OCR provider，且材料中没有可提取文字。"),
      ...status.warnings,
    ],
    providerStatus: {
      ...status,
      state: "fallback",
      live: false,
      fallback: true,
      isRealProvider: false,
      status: text ? status.status : "provider-unavailable",
    },
  };
}

class LocalTextOcrFallbackProvider implements OcrProvider {
  getStatus() {
    return getEffectiveOcrProviderStatus();
  }

  async extract(input: OcrProviderInput) {
    const output = buildFallbackOutput(input, this.getStatus());
    return {
      provider: output.providerName,
      mode: "fallback" as const,
      source: output.extractedText
        ? ("provided_text" as const)
        : ("provider_unavailable" as const),
      output,
    };
  }
}

class DashscopeOcrProvider implements OcrProvider {
  getStatus() {
    return getDashscopeOcrProviderStatus();
  }

  async extract(input: OcrProviderInput) {
    const existingText = normalizeText(input.fallbackText);
    const mimeType = input.mimeType?.trim().toLowerCase() ?? "";
    if (!input.imageBase64 || !IMAGE_MIME_TYPES.has(mimeType)) {
      const output = buildFallbackOutput(
        input,
        this.getStatus(),
        existingText
          ? "材料无需调用图片 OCR，使用文件内已提取文字继续解析。"
          : "百炼视觉 OCR 仅支持 JPEG、PNG、WebP 图片。"
      );
      return {
        provider: output.providerName,
        mode: "fallback" as const,
        source: output.extractedText
          ? ("provided_text" as const)
          : ("provider_unavailable" as const),
        output,
      };
    }

    const imageDataUrl = `data:${mimeType};base64,${input.imageBase64}`;
    const result = await requestDashscopeHealthOcr(imageDataUrl);
    if (!result) {
      const output = buildFallbackOutput(
        input,
        {
          ...this.getStatus(),
          status: "provider-unavailable",
          reason: "DashScope OCR request failed or returned no readable text.",
        },
        existingText
          ? "百炼 OCR 未返回有效文字，已改用文件内可提取文字。"
          : "百炼 OCR 未返回可辨认文字。"
      );
      return {
        provider: output.providerName,
        mode: "fallback" as const,
        source: output.extractedText
          ? ("provided_text" as const)
          : ("provider_unavailable" as const),
        output,
      };
    }

    const providerStatus: OcrProviderStatus = {
      ...this.getStatus(),
      state: "live",
      configured: true,
      live: true,
      fallback: false,
      mock: false,
      isRealProvider: true,
      status: "ready",
      model: result.model,
    };
    return {
      provider: "dashscope",
      mode: "live" as const,
      source: "provider" as const,
      output: {
        text: result.extractedText,
        extractedText: result.extractedText,
        confidence: result.confidence,
        providerName: "dashscope",
        model: result.model,
        state: "live" as const,
        live: true,
        fallback: false,
        mock: false,
        isRealProvider: true,
        warnings: result.warnings,
        rawResponse: result.rawResponse,
        providerStatus,
      },
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
      mode: result.isRealProvider ? ("live" as const) : ("fallback" as const),
      source: result.isRealProvider
        ? ("provider" as const)
        : ("provided_text" as const),
      output: {
        text: result.extractedText,
        extractedText: result.extractedText,
        confidence: result.confidence,
        providerName: result.providerName,
        state: result.state,
        live: result.live,
        fallback: result.fallback,
        mock: result.mock,
        isRealProvider: result.isRealProvider,
        warnings: result.warnings,
        rawResponse: result.rawResponse as Record<string, unknown> | undefined,
        providerStatus: result.status,
      },
    };
  }
}

class VivoDashscopeFailoverOcrProvider implements OcrProvider {
  private readonly vivo = new VivoOcrProvider();
  private readonly dashscope = new DashscopeOcrProvider();

  getStatus() {
    const vivoStatus = this.vivo.getStatus();
    return {
      ...vivoStatus,
      warnings: [
        ...vivoStatus.warnings,
        "Vivo OCR 运行失败时会自动切换到百炼 OCR。",
      ],
    };
  }

  async extract(input: OcrProviderInput) {
    try {
      const result = await this.vivo.extract(input);
      if (result.output.extractedText.trim() || result.source === "provided_text") {
        return result;
      }
    } catch {
      // 供应商凭据过期、模型下线或临时 5xx 都不应让健康材料入口直接失效；
      // 百炼已独立配置，因此在同一请求内做一次有界回退。
    }

    const result = await this.dashscope.extract(input);
    return {
      ...result,
      output: {
        ...result.output,
        warnings: [
          "Vivo OCR 本次调用不可用，已自动切换到百炼 OCR。",
          ...result.output.warnings,
        ],
      },
    };
  }
}

export function resolveOcrProvider(): OcrProvider {
  // 保留原有 Vivo 优先级；缺少 Vivo 配置时复用已部署的百炼视觉能力，避免图片入口退化为空壳。
  const vivoStatus = getVivoProviderStatus("ocr");
  const dashscopeStatus = getDashscopeOcrProviderStatus();
  if (vivoStatus.status === "ready" && dashscopeStatus.status === "ready") {
    return new VivoDashscopeFailoverOcrProvider();
  }
  if (vivoStatus.status === "ready") return new VivoOcrProvider();
  if (dashscopeStatus.status === "ready") {
    return new DashscopeOcrProvider();
  }
  return new LocalTextOcrFallbackProvider();
}
