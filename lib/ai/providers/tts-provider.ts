export interface TtsProviderInput {
  text: string;
}

export interface TtsProviderOutput {
  audioUrl?: string;
  script: string;
}

export interface TtsProviderResult<T> {
  provider: string;
  mode: "mock" | "real";
  output: T;
}

export interface TtsProvider {
  synthesize(input: TtsProviderInput): Promise<TtsProviderResult<TtsProviderOutput>>;
}

class MockTtsProvider implements TtsProvider {
  async synthesize(input: TtsProviderInput) {
    return {
      provider: "mock-tts",
      mode: "mock" as const,
      output: {
        script: input.text,
      },
    };
  }
}

class RealPlaceholderTtsProvider implements TtsProvider {
  async synthesize(input: TtsProviderInput) {
    return {
      provider: process.env.TTS_PROVIDER_NAME || "real-tts-placeholder",
      mode: "real" as const,
      output: {
        script: input.text,
      },
    };
  }
}

export function resolveTtsProvider(): TtsProvider {
  // Future: replace this provider with vivo 蓝心 TTS capability when credentials are available.
  return process.env.TTS_PROVIDER_API_KEY ? new RealPlaceholderTtsProvider() : new MockTtsProvider();
}
