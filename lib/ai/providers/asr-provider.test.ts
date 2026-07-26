import assert from "node:assert/strict";
import test from "node:test";

import { resolveAsrProvider } from "./asr-provider.ts";

const ENV_KEYS = [
  "AI_ASR_MODEL",
  "DASHSCOPE_API_KEY",
  "VIVO_APP_ID",
  "VIVO_APP_KEY",
  "VIVO_ASR_CLIENT_VERSION",
  "VIVO_ASR_ENGINE_ID",
  "VIVO_ASR_PACKAGE",
  "VIVO_ASR_USER_ID",
  "VIVO_BASE_URL",
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

test("ASR provider uses Bailian when Vivo ASR is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: "小雨今天午餐吃了一碗粥。",
              annotations: [
                { type: "audio_info", language: "zh", emotion: "neutral" },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    )) as typeof fetch;

  try {
    await withEnv(
      {
        AI_ASR_MODEL: "qwen3-asr-flash",
        DASHSCOPE_API_KEY: "test-key",
      },
      async () => {
        const provider = resolveAsrProvider();
        assert.equal(provider.getStatus().providerName, "dashscope");

        const result = await provider.transcribe({
          attachmentName: "voice.wav",
          mimeType: "audio/wav",
          audioBytes: Buffer.from("test-audio"),
        });

        assert.equal(result.provider, "dashscope");
        assert.equal(result.mode, "live");
        assert.equal(result.source, "provider");
        assert.equal(result.output.transcript, "小雨今天午餐吃了一碗粥。");
        assert.equal(result.output.providerStatus.live, true);
        assert.equal(result.output.providerStatus.isRealProvider, true);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ASR provider does not fabricate a transcript when Bailian returns empty", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: "" } }],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    )) as typeof fetch;

  try {
    await withEnv(
      {
        AI_ASR_MODEL: "qwen3-asr-flash",
        DASHSCOPE_API_KEY: "test-key",
      },
      async () => {
        const result = await resolveAsrProvider().transcribe({
          attachmentName: "silent.wav",
          mimeType: "audio/wav",
          audioBytes: Buffer.from("silent-audio"),
        });

        assert.equal(result.source, "provider_unavailable");
        assert.equal(result.output.transcript, "");
        assert.equal(result.output.live, false);
        assert.equal(result.output.isRealProvider, false);
        assert.equal(result.output.mock, false);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
