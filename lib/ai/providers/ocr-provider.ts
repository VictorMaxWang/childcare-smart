export interface OcrProviderInput {
  attachmentName?: string;
  fallbackText?: string;
}

export interface OcrProviderOutput {
  text: string;
}

export interface OcrProviderResult<T> {
  provider: string;
  mode: "mock" | "real";
  output: T;
}

export interface OcrProvider {
  extract(input: OcrProviderInput): Promise<OcrProviderResult<OcrProviderOutput>>;
}

function buildMockOcrText(input: OcrProviderInput) {
  if (input.fallbackText?.trim()) return input.fallbackText.trim();
  return `${input.attachmentName ?? "图片"} 识别结果：近两天需继续观察饮水、睡前情绪和次日晨检状态。`;
}

class MockOcrProvider implements OcrProvider {
  async extract(input: OcrProviderInput) {
    return {
      provider: "mock-ocr",
      mode: "mock" as const,
      output: {
        text: buildMockOcrText(input),
      },
    };
  }
}

class RealPlaceholderOcrProvider implements OcrProvider {
  async extract(input: OcrProviderInput) {
    return {
      provider: process.env.OCR_PROVIDER_NAME || "real-ocr-placeholder",
      mode: "real" as const,
      output: {
        text: buildMockOcrText(input),
      },
    };
  }
}

export function resolveOcrProvider(): OcrProvider {
  // Future: replace this provider with vivo 蓝心 OCR capability when credentials are available.
  return process.env.OCR_PROVIDER_API_KEY ? new RealPlaceholderOcrProvider() : new MockOcrProvider();
}
