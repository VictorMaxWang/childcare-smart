export interface AsrProviderInput {
  attachmentName?: string;
  fallbackText?: string;
  transcript?: string;
  mimeType?: string;
  durationMs?: number;
  scene?: string;
}

export interface AsrProviderOutput {
  transcript: string;
  source: string;
  confidence: number | null;
  raw?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  fallback: boolean;
}

export interface AsrProviderResult<T> {
  provider: string;
  mode: "mock" | "real";
  source: string;
  model?: string;
  output: T;
}

export interface AsrProvider {
  transcribe(input: AsrProviderInput): Promise<AsrProviderResult<AsrProviderOutput>>;
}

function normalizeText(value?: string) {
  return value?.trim() || "";
}

function buildMockTranscript(input: AsrProviderInput) {
  const transcript = normalizeText(input.transcript) || normalizeText(input.fallbackText);
  if (transcript) return transcript;

  return `${input.attachmentName ?? "teacher-voice-note.webm"} 转写结果：小朋友今天午睡前情绪波动，老师需要补充记录体温、饮水和离园后的家庭观察反馈。`;
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

class MockAsrProvider implements AsrProvider {
  async transcribe(input: AsrProviderInput) {
    const transcript = normalizeText(input.transcript);
    if (transcript) {
      return {
        provider: "mock-asr",
        mode: "mock" as const,
        source: "provided_transcript",
        output: {
          transcript,
          source: "provided_transcript",
          confidence: null,
          raw: { path: "provided_transcript" },
          meta: buildMeta(input, "provided-transcript"),
          fallback: false,
        },
      };
    }

    return {
      provider: "mock-asr",
      mode: "mock" as const,
      source: "mock",
      output: {
        transcript: buildMockTranscript(input),
        source: "mock",
        confidence: 0.62,
        raw: { path: "mock-fallback" },
        meta: buildMeta(input, "mock-transcript"),
        fallback: true,
      },
    };
  }
}

class VivoAsrStubProvider implements AsrProvider {
  async transcribe(input: AsrProviderInput) {
    const transcript = normalizeText(input.transcript);
    if (transcript) {
      return {
        provider: "vivo-asr-stub",
        mode: "mock" as const,
        source: "provided_transcript",
        model: "vivo-asr-stub",
        output: {
          transcript,
          source: "provided_transcript",
          confidence: null,
          raw: { path: "provided_transcript" },
          meta: buildMeta(input, "provided-transcript"),
          fallback: false,
        },
      };
    }

    return {
      provider: "vivo-asr-stub",
      mode: "mock" as const,
      source: "mock",
      model: "vivo-asr-stub",
      output: {
        transcript: buildMockTranscript(input),
        source: "mock",
        confidence: 0.66,
        raw: { path: "official-doc-transport-pending" },
        meta: {
          ...buildMeta(input, "official-doc-transport-pending"),
          officialDocRequired: true,
        },
        fallback: true,
      },
    };
  }
}

function hasVivoCredentials() {
  return Boolean(process.env.VIVO_APP_ID?.trim() && process.env.VIVO_APP_KEY?.trim());
}

export function resolveAsrProvider(): AsrProvider {
  return hasVivoCredentials() ? new VivoAsrStubProvider() : new MockAsrProvider();
}
