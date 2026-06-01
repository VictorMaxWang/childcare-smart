import assert from "node:assert/strict";
import test from "node:test";

import { getVivoProviderStatus } from "./vivo-provider-status.ts";

const ENV_KEYS = [
  "VIVO_APP_ID",
  "VIVO_APP_KEY",
  "VIVO_BASE_URL",
  "VIVO_LLM_MODEL",
  "VIVO_OCR_PATH",
  "VIVO_ASR_PACKAGE",
  "VIVO_ASR_CLIENT_VERSION",
  "VIVO_ASR_USER_ID",
  "VIVO_ASR_ENGINE_ID",
  "STORYBOOK_TTS_MODEL",
  "STORYBOOK_TTS_PRODUCT",
  "STORYBOOK_TTS_PACKAGE",
  "STORYBOOK_TTS_CLIENT_VERSION",
  "STORYBOOK_TTS_SYSTEM_VERSION",
  "STORYBOOK_TTS_SDK_VERSION",
  "STORYBOOK_TTS_ANDROID_VERSION",
] as const;

function withProviderEnv(
  values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>,
  fn: () => void | Promise<void>
) {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]])) as Record<
    (typeof ENV_KEYS)[number],
    string | undefined
  >;

  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  return Promise.resolve(fn()).finally(() => {
    for (const key of ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test("vivo provider status reports fallback when env is absent", async () => {
  await withProviderEnv({}, () => {
    for (const capability of ["chat", "ocr", "asr", "tts"] as const) {
      const status = getVivoProviderStatus(capability);
      assert.equal(status.state, "fallback");
      assert.equal(status.configured, false);
      assert.equal(status.live, false);
      assert.equal(status.fallback, true);
      assert.equal(status.mock, false);
      assert.equal(status.status, "missing-env");
    }
  });
});

test("vivo provider status rejects placeholder env without leaking values", async () => {
  await withProviderEnv(
    {
      VIVO_APP_ID: "your_appid",
      VIVO_APP_KEY: "your_appkey",
      VIVO_BASE_URL: "https://api-ai.vivo.com.cn",
      VIVO_LLM_MODEL: "Volc-DeepSeek-V3.2",
    },
    () => {
      const status = getVivoProviderStatus("chat");
      const serialized = JSON.stringify(status);

      assert.equal(status.state, "fallback");
      assert.equal(status.configured, false);
      assert.equal(status.live, false);
      assert.equal(serialized.includes("your_appid"), false);
      assert.equal(serialized.includes("your_appkey"), false);
    }
  );
});

test("vivo provider status keeps partial env unconfigured", async () => {
  await withProviderEnv({ VIVO_APP_ID: "partial-app-id" }, () => {
    const status = getVivoProviderStatus("chat");

    assert.equal(status.state, "fallback");
    assert.equal(status.configured, false);
    assert.equal(status.requiredEnv.includes("VIVO_APP_KEY"), true);
    assert.equal(JSON.stringify(status).includes("partial-app-id"), false);
  });
});

test("vivo provider status reports configured without claiming live", async () => {
  const appId = "fake-real-next-app-id";
  const appKey = "fake-real-next-secret";
  await withProviderEnv(
    {
      VIVO_APP_ID: appId,
      VIVO_APP_KEY: appKey,
      VIVO_BASE_URL: "https://api.example.invalid",
      VIVO_LLM_MODEL: "fake-llm",
      VIVO_OCR_PATH: "/ocr/general_recognition",
      VIVO_ASR_PACKAGE: "fake-asr-package",
      VIVO_ASR_CLIENT_VERSION: "1.0.0",
      VIVO_ASR_USER_ID: "fake-asr-user",
      VIVO_ASR_ENGINE_ID: "fileasrrecorder",
      STORYBOOK_TTS_MODEL: "fake-tts-model",
      STORYBOOK_TTS_PRODUCT: "fake-tts-product",
      STORYBOOK_TTS_PACKAGE: "com.example.fake",
      STORYBOOK_TTS_CLIENT_VERSION: "1.0.0",
      STORYBOOK_TTS_SYSTEM_VERSION: "1",
      STORYBOOK_TTS_SDK_VERSION: "1",
      STORYBOOK_TTS_ANDROID_VERSION: "13",
    },
    () => {
      for (const capability of ["chat", "ocr", "asr", "tts"] as const) {
        const status = getVivoProviderStatus(capability);
        const serialized = JSON.stringify(status);

        assert.equal(status.state, "configured");
        assert.equal(status.configured, true);
        assert.equal(status.live, false);
        assert.equal(status.fallback, false);
        assert.equal(status.mock, false);
        assert.equal(serialized.includes(appId), false);
        assert.equal(serialized.includes(appKey), false);
      }
    }
  );
});
