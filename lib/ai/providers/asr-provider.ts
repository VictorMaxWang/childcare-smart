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
}

export interface AsrProviderOutput {
  transcript: string;
  source: string;
  confidence: number | null;
  raw?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  fallback: boolean;
  providerName: string;
  isRealProvider: boolean;
  warnings: string[];
  providerStatus: VivoProviderStatus<"asr">;
}

export interface AsrProviderResult<T> {
  provider: string;
  mode: "fallback" | "mock" | "real";
  source: "provider" | "provided_transcript" | "text_fallback" | "provider_unavailable";
  model?: string;
  output: T;
}

export interface AsrProvider {
  getStatus(): VivoProviderStatus<"asr">;
  transcribe(input: AsrProviderInput): Promise<AsrProviderResult<AsrProviderOutput>>;
}

function normalizeText(value?: string) {
  return value?.trim() || "";
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

class LocalTextAsrFallbackProvider implements AsrProvider {
  getStatus() {
    return {
      ...getVivoProviderStatus("asr"),
      configured: false,
      isRealProvider: false,
      warnings: ["当前未配置 vivo ASR，音频文件不会被伪造转写；可使用浏览器语音识别或文本输入 fallback。"],
    };
  }

  async transcribe(input: AsrProviderInput) {
    const transcript = normalizeText(input.transcript) || normalizeText(input.fallbackText);
    const status = this.getStatus();
    const source: AsrProviderResult<AsrProviderOutput>["source"] = transcript
      ? "provided_transcript"
      : "provider_unavailable";

    return {
      provider: "local-text-asr-fallback",
      mode: "fallback" as const,
      source,
      model: "local-text-fallback",
      output: {
        transcript,
        source,
        confidence: transcript ? null : 0,
        raw: { path: source },
        meta: buildMeta(input, transcript ? "provided-transcript" : "provider-unavailable"),
        fallback: true,
        providerName: "local-text-asr-fallback",
        isRealProvider: false,
        warnings: [
          transcript
            ? "未调用真实 ASR provider，使用用户提供的转写文本。"
            : "当前未接入真实 ASR provider，音频材料不会被伪造转写成功。",
          ...status.warnings,
        ],
        providerStatus: status,
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
    });

    return {
      provider: result.providerName,
      mode: result.isRealProvider ? ("real" as const) : ("fallback" as const),
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
        meta: buildMeta(input, result.isRealProvider ? "vivo-asr-http" : "provided-transcript"),
        fallback: !result.isRealProvider,
        providerName: result.providerName,
        isRealProvider: result.isRealProvider,
        warnings: result.warnings,
        providerStatus: result.status,
      },
    };
  }
}

export function resolveAsrProvider(): AsrProvider {
  const status = getVivoProviderStatus("asr");
  return status.status === "ready" ? new VivoAsrProvider() : new LocalTextAsrFallbackProvider();
}
