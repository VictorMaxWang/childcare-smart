import "server-only";

import {
  getVivoProviderStatus,
  requestVivoTts,
  type VivoProviderStatus,
} from "@/lib/providers/vivo";
import { getMaasProviderStatus, isMaasSelected, requestMaasTts } from "@/lib/providers/maas/maas-provider";

export interface TtsProviderInput {
  text: string;
  childId?: string;
  storyId?: string;
  page?: number;
  voiceStyle?: string;
}

export interface TtsProviderOutput {
  audioUrl?: string;
  audioContentType?: string;
  script: string;
  requestId?: string;
  providerStatus: VivoProviderStatus<"tts">;
  state: "configured" | "live" | "fallback" | "mock";
  live: boolean;
  fallback: boolean;
  mock: boolean;
  warnings: string[];
}

export interface TtsProviderResult<T> {
  provider: string;
  mode: "fallback" | "live" | "mock";
  state: "configured" | "live" | "fallback" | "mock";
  live: boolean;
  fallback: boolean;
  mock: boolean;
  output: T;
}

export interface TtsProvider {
  getStatus(): VivoProviderStatus<"tts">;
  synthesize(input: TtsProviderInput): Promise<TtsProviderResult<TtsProviderOutput>>;
}

function buildTextOnlyStatus(
  reason: string,
  base: VivoProviderStatus<"tts"> = getVivoProviderStatus("tts")
): VivoProviderStatus<"tts"> {
  return {
    ...base,
    providerName: "text-only-tts-fallback",
    state: "fallback",
    configured: false,
    live: false,
    fallback: true,
    mock: false,
    supported: true,
    isRealProvider: false,
    status: base.status === "ready" ? "provider-unavailable" : base.status,
    reason,
    warnings: [...base.warnings, "No audio was generated; returning script text only."],
  };
}

function buildTextOnlyResult(input: TtsProviderInput, status: VivoProviderStatus<"tts">) {
  return {
    provider: "text-only-tts-fallback",
    mode: "fallback" as const,
    state: "fallback" as const,
    live: false,
    fallback: true,
    mock: false,
    output: {
      script: input.text,
      providerStatus: status,
      state: "fallback" as const,
      live: false,
      fallback: true,
      mock: false,
      warnings: status.warnings,
    },
  };
}

class TextOnlyTtsFallbackProvider implements TtsProvider {
  constructor(private readonly status = buildTextOnlyStatus("Vivo TTS is not configured.")) {}

  getStatus() {
    return this.status;
  }

  async synthesize(input: TtsProviderInput) {
    return buildTextOnlyResult(input, this.status);
  }
}

class VivoTtsProvider implements TtsProvider {
  getStatus() {
    return getVivoProviderStatus("tts");
  }

  async synthesize(input: TtsProviderInput) {
    const status = this.getStatus();
    try {
      const result = await requestVivoTts({
        text: input.text,
        childId: input.childId,
        storyId: input.storyId,
        page: input.page,
        voiceStyle: input.voiceStyle,
      });
      const audioUrl = `data:${result.audioContentType};base64,${result.audioBytes.toString("base64")}`;
      return {
        provider: result.providerName,
        mode: "live" as const,
        state: "live" as const,
        live: true,
        fallback: false,
        mock: false,
        output: {
          audioUrl,
          audioContentType: result.audioContentType,
          script: input.text,
          requestId: result.requestId,
          providerStatus: result.status,
          state: "live" as const,
          live: true,
          fallback: false,
          mock: false,
          warnings: result.warnings,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Vivo TTS request failed.";
      const fallbackStatus = buildTextOnlyStatus(message, status);
      return buildTextOnlyResult(input, fallbackStatus);
    }
  }
}

export function resolveTtsProvider(): TtsProvider {
  if (isMaasSelected()) return new MaasTtsProvider();
  const status = getVivoProviderStatus("tts");
  return status.status === "ready"
    ? new VivoTtsProvider()
    : new TextOnlyTtsFallbackProvider(buildTextOnlyStatus(status.reason ?? "Vivo TTS is not configured.", status));
}

class MaasTtsProvider implements TtsProvider {
  getStatus() { return getMaasProviderStatus("tts"); }
  async synthesize(input: TtsProviderInput): Promise<TtsProviderResult<TtsProviderOutput>> {
    const result = await requestMaasTts({ text: input.text });
    const audioUrl = result.audioBytes ? `data:${result.mimeType};base64,${Buffer.from(result.audioBytes).toString("base64")}` : result.audioUrl || undefined;
    return { provider: "maas", mode: "live", state: "live", live: true, fallback: false, mock: false,
      output: { audioUrl, audioContentType: result.mimeType, script: input.text, requestId: result.requestId || undefined,
        providerStatus: { ...this.getStatus(), state: "live", live: true }, state: "live", live: true, fallback: false, mock: false, warnings: [] } };
  }
}
