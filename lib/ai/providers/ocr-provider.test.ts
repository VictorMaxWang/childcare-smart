import assert from "node:assert/strict";
import test from "node:test";

import { resolveOcrProvider } from "./ocr-provider.ts";

const ENV_KEYS = [
  "AI_OCR_MODEL",
  "AI_VISION_MODEL",
  "DASHSCOPE_API_KEY",
  "VIVO_APP_ID",
  "VIVO_APP_KEY",
  "VIVO_BASE_URL",
  "VIVO_OCR_PATH",
] as const;

async function withEnv(
  overrides: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>,
  fn: () => void | Promise<void>
) {
  const previous = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]])
  ) as Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

  for (const key of ENV_KEYS) {
    const value = overrides[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await fn();
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("OCR provider uses Bailian vision when Vivo OCR is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: "体温 38.1℃",
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    )) as typeof fetch;

  try {
    await withEnv(
      {
        AI_OCR_MODEL: "qwen3.5-ocr",
        AI_VISION_MODEL: "qwen3.7-plus",
        DASHSCOPE_API_KEY: "test-key",
      },
      async () => {
        const provider = resolveOcrProvider();
        assert.equal(provider.getStatus().providerName, "dashscope");

        const result = await provider.extract({
          attachmentName: "health-note.jpg",
          mimeType: "image/jpeg",
          imageBase64: "dGVzdA==",
        });

        assert.equal(result.provider, "dashscope");
        assert.equal(result.mode, "live");
        assert.equal(result.source, "provider");
        assert.equal(result.output.extractedText, "体温 38.1℃");
        assert.equal(result.output.model, "qwen3.5-ocr");
        assert.equal(result.output.providerStatus.live, true);
        assert.equal(result.output.providerStatus.isRealProvider, true);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OCR provider fails closed when Bailian returns no readable text", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: "",
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    )) as typeof fetch;

  try {
    await withEnv(
      {
        AI_OCR_MODEL: "qwen3.5-ocr",
        AI_VISION_MODEL: "qwen3.7-plus",
        DASHSCOPE_API_KEY: "test-key",
      },
      async () => {
        const result = await resolveOcrProvider().extract({
          attachmentName: "blank.jpg",
          mimeType: "image/jpeg",
          imageBase64: "dGVzdA==",
        });

        assert.equal(result.source, "provider_unavailable");
        assert.equal(result.output.extractedText, "");
        assert.equal(result.output.live, false);
        assert.equal(result.output.isRealProvider, false);
        assert.equal(result.output.mock, false);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OCR provider falls back to Bailian when configured Vivo OCR fails at runtime", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url.startsWith("https://vivo.invalid")) {
      return new Response("upstream unavailable", { status: 503 });
    }
    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: { content: "视力复查 2026-07-28" },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    await withEnv(
      {
        AI_OCR_MODEL: "qwen3.5-ocr",
        DASHSCOPE_API_KEY: "test-key",
        VIVO_APP_ID: "vivo-test-id",
        VIVO_APP_KEY: "vivo-test-key",
        VIVO_BASE_URL: "https://vivo.invalid",
        VIVO_OCR_PATH: "/ocr",
      },
      async () => {
        const result = await resolveOcrProvider().extract({
          attachmentName: "health-note.jpg",
          mimeType: "image/jpeg",
          imageBase64: "dGVzdA==",
        });

        assert.equal(result.provider, "dashscope");
        assert.equal(result.mode, "live");
        assert.equal(result.output.extractedText, "视力复查 2026-07-28");
        assert.equal(requestedUrls.some((url) => url.startsWith("https://vivo.invalid")), true);
        assert.equal(requestedUrls.some((url) => url.includes("dashscope")), true);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
