import assert from "node:assert/strict";
import test from "node:test";

import { resolveTtsProvider } from "./tts-provider.ts";

const ENV_KEYS = [
  "TTS_PROVIDER_API_KEY",
  "TTS_PROVIDER_NAME",
  "VIVO_APP_ID",
  "VIVO_APP_KEY",
  "VIVO_BASE_URL",
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

test("resolveTtsProvider returns text-only fallback when no vivo env is configured", async () => {
  await withProviderEnv({}, async () => {
    const provider = resolveTtsProvider();
    const status = provider.getStatus();
    const result = await provider.synthesize({ text: "read this script" });

    assert.equal(status.providerName, "text-only-tts-fallback");
    assert.equal(status.state, "fallback");
    assert.equal(status.live, false);
    assert.equal(status.mock, false);
    assert.equal(result.provider, "text-only-tts-fallback");
    assert.equal(result.mode, "fallback");
    assert.equal(result.live, false);
    assert.equal(result.mock, false);
    assert.equal(result.output.audioUrl, undefined);
    assert.equal(result.output.script, "read this script");
  });
});

test("legacy TTS_PROVIDER_API_KEY no longer creates placeholder live TTS", async () => {
  await withProviderEnv({ TTS_PROVIDER_API_KEY: "legacy-placeholder-secret" }, async () => {
    const provider = resolveTtsProvider();
    const result = await provider.synthesize({ text: "script only" });
    const serialized = JSON.stringify(result);

    assert.equal(result.provider, "text-only-tts-fallback");
    assert.equal(result.mode, "fallback");
    assert.equal(result.live, false);
    assert.equal(serialized.includes("legacy-placeholder-secret"), false);
  });
});

test("resolveTtsProvider uses built-in TTS metadata defaults with core vivo credentials", async () => {
  await withProviderEnv(
    {
      VIVO_APP_ID: "fake-tts-app-id",
      VIVO_APP_KEY: "fake-tts-secret",
      VIVO_BASE_URL: "https://api.example.invalid",
    },
    () => {
      const provider = resolveTtsProvider();
      const status = provider.getStatus();
      const serialized = JSON.stringify(status);

      assert.equal(status.providerName, "vivo");
      assert.equal(status.state, "configured");
      assert.equal(status.configured, true);
      assert.equal(status.live, false);
      assert.equal(status.fallback, false);
      assert.equal(status.mock, false);
      assert.deepEqual(status.requiredEnv, [
        "VIVO_APP_KEY",
        "VIVO_APP_ID",
        "VIVO_BASE_URL",
      ]);
      assert.equal(serialized.includes("fake-tts-secret"), false);
      assert.equal(serialized.includes("fake-tts-app-id"), false);
    }
  );
});
