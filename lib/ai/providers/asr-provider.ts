import {
  requestDashscopeAsr,
  resolveBailianAsrModel,
} from "@/lib/ai/dashscope";
import {
  getVivoProviderStatus,
  requestVivoAsr,
  type VivoProviderStatus,
} from "@/lib/providers/vivo";

export interface AsrProviderInput {
  attachmentName?: string;
  fallbackText?: string;
  transcript?: string;
  mimeType?: string;
  durationMs?: number;
  scene?: string;
  audioBytes?: Buffer;
  deadlineAtMs?: number;
  signal?: AbortSignal;
  operationScope?: {
    institutionId: string;
    userId: string;
  };
}

export interface AsrProviderStatus extends VivoProviderStatus<"asr"> {
  model?: string;
}

export interface AsrProviderOutput {
  transcript: string;
  source: string;
  confidence: number | null;
  raw?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  fallback: boolean;
  providerName: string;
  state: "configured" | "live" | "fallback" | "mock";
  live: boolean;
  mock: boolean;
  isRealProvider: boolean;
  warnings: string[];
  providerStatus: AsrProviderStatus;
}

export interface AsrProviderResult<T> {
  provider: string;
  mode: "fallback" | "mock" | "live";
  source:
    | "provider"
    | "provided_transcript"
    | "text_fallback"
    | "provider_unavailable";
  model?: string;
  output: T;
}

export interface AsrProvider {
  getStatus(): AsrProviderStatus;
  transcribe(input: AsrProviderInput): Promise<AsrProviderResult<AsrProviderOutput>>;
}

function normalizeText(value?: string) {
  return value?.trim() || "";
}

function hasDashscopeKey() {
  const value = process.env.DASHSCOPE_API_KEY?.trim() ?? "";
  return Boolean(value) && !/^(?:placeholder|changeme|your[_-].*key)$/i.test(value);
}

function buildMeta(input: AsrProviderInput, reason: string) {
  return {
    attachmentName: input.attachmentName,
    mimeType: input.mimeType,
    durationMs: input.durationMs,
    scene: input.scene,
    reason,
  };
}

export function getDashscopeAsrProviderStatus(): AsrProviderStatus {
  const configured = hasDashscopeKey();
  return {
    providerName: "dashscope",
    capability: "asr",
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
      : "Missing required env for DashScope ASR: DASHSCOPE_API_KEY",
    warnings: [
      "百炼 ASR 状态仅表示配置可用；只有成功转写后才会标记为 live。",
      "单次语音记录限制为 90 秒和 4 MB，供应商请求不会持久化原始音频。",
    ],
    requiredEnv: ["DASHSCOPE_API_KEY"],
    model: resolveBailianAsrModel(),
  };
}

export function getEffectiveAsrProviderStatus(): AsrProviderStatus {
  const vivo = getVivoProviderStatus("asr");
  if (vivo.status === "ready") return vivo;

  const dashscope = getDashscopeAsrProviderStatus();
  if (dashscope.status === "ready") return dashscope;

  return {
    ...vivo,
    providerName: "vivo / dashscope",
    requiredEnv: Array.from(
      new Set([...vivo.requiredEnv, ...dashscope.requiredEnv])
    ),
    warnings: [...vivo.warnings, ...dashscope.warnings],
    reason: "No real ASR provider is configured.",
  };
}

function buildFallbackResult(
  input: AsrProviderInput,
  status: AsrProviderStatus,
  warning?: string
): AsrProviderResult<AsrProviderOutput> {
  const transcript =
    normalizeText(input.transcript) || normalizeText(input.fallbackText);
  const source: AsrProviderResult<AsrProviderOutput>["source"] = transcript
    ? "provided_transcript"
    : "provider_unavailable";
  const requestStatus: AsrProviderStatus = {
    ...status,
    state: "fallback",
    live: false,
    fallback: true,
    mock: false,
    isRealProvider: false,
    status: transcript ? status.status : "provider-unavailable",
  };

  return {
    provider: "local-text-asr-fallback",
    mode: "fallback",
    source,
    model: "local-text-fallback",
    output: {
      transcript,
      source,
      confidence: transcript ? null : 0,
      raw: { path: source },
      meta: buildMeta(
        input,
        transcript ? "provided-transcript" : "provider-unavailable"
      ),
      fallback: true,
      providerName: "local-text-asr-fallback",
      state: "fallback",
      live: false,
      mock: false,
      isRealProvider: false,
      warnings: [
        warning ??
          (transcript
            ? "未调用真实 ASR provider，使用用户提供的转写文本。"
            : "当前没有获得真实语音转写，系统不会伪造转写内容。"),
        ...status.warnings,
      ],
      providerStatus: requestStatus,
    },
  };
}

class LocalTextAsrFallbackProvider implements AsrProvider {
  getStatus() {
    return getEffectiveAsrProviderStatus();
  }

  async transcribe(input: AsrProviderInput) {
    return buildFallbackResult(input, this.getStatus());
  }
}

class DashscopeAsrProvider implements AsrProvider {
  getStatus() {
    return getDashscopeAsrProviderStatus();
  }

  async transcribe(input: AsrProviderInput) {
    if (normalizeText(input.transcript) || normalizeText(input.fallbackText)) {
      return buildFallbackResult(input, this.getStatus());
    }
    if (!input.audioBytes || !input.mimeType) {
      return buildFallbackResult(
        input,
        this.getStatus(),
        "语音请求缺少有效音频内容或 MIME 类型。"
      );
    }

    const result = await requestDashscopeAsr({
      audioBytes: input.audioBytes,
      mimeType: input.mimeType,
      deadlineAtMs: input.deadlineAtMs,
      signal: input.signal,
    });
    if (!result) {
      return buildFallbackResult(
        input,
        {
          ...this.getStatus(),
          status: "provider-unavailable",
          reason: "DashScope ASR request failed or returned an empty transcript.",
        },
        "百炼 ASR 未返回可用转写。"
      );
    }

    const providerStatus: AsrProviderStatus = {
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
      model: result.model,
      output: {
        transcript: result.transcript,
        source: "provider",
        confidence: result.confidence,
        raw: result.rawResponse,
        meta: {
          ...buildMeta(input, "dashscope-asr"),
          language: result.language,
          emotion: result.emotion,
        },
        fallback: false,
        providerName: "dashscope",
        state: "live" as const,
        live: true,
        mock: false,
        isRealProvider: true,
        warnings: [],
        providerStatus,
      },
    };
  }
}

class VivoAsrProvider implements AsrProvider {
  getStatus() {
    return getVivoProviderStatus("asr");
  }

  async transcribe(input: AsrProviderInput) {
    const result = await requestVivoAsr({
      attachmentName: input.attachmentName,
      audioBytes: input.audioBytes,
      durationMs: input.durationMs,
      fallbackText: input.fallbackText,
      mimeType: input.mimeType,
      transcript: input.transcript,
      deadlineAtMs: input.deadlineAtMs,
      signal: input.signal,
      operationScope: input.operationScope,
    });

    return {
      provider: result.providerName,
      mode: result.isRealProvider ? ("live" as const) : ("fallback" as const),
      source: result.isRealProvider
        ? ("provider" as const)
        : result.transcript
          ? ("provided_transcript" as const)
          : ("provider_unavailable" as const),
      model: result.model,
      output: {
        transcript: result.transcript,
        source: result.isRealProvider ? "provider" : "provided_transcript",
        confidence: result.confidence,
        raw: result.rawResponse as Record<string, unknown> | undefined,
        meta: buildMeta(
          input,
          result.isRealProvider ? "vivo-asr-http" : "provided-transcript"
        ),
        fallback: !result.isRealProvider,
        providerName: result.providerName,
        state: result.state,
        live: result.live,
        mock: result.mock,
        isRealProvider: result.isRealProvider,
        warnings: result.warnings,
        providerStatus: result.status,
      },
    };
  }
}

export function resolveAsrProvider(): AsrProvider {
  // Vivo 配置完整时保持原路径；否则复用现有百炼 Key，让普通账号的录音按钮具备真实转写能力。
  const vivoStatus = getVivoProviderStatus("asr");
  if (vivoStatus.status === "ready") return new VivoAsrProvider();
  if (getDashscopeAsrProviderStatus().status === "ready") {
    return new DashscopeAsrProvider();
  }
  return new LocalTextAsrFallbackProvider();
}
