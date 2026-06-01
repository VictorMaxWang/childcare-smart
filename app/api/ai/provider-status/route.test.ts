import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "./route.ts";

type EnvKey = "VIVO_APP_ID" | "VIVO_APP_KEY" | "VIVO_BASE_URL" | "VIVO_LLM_MODEL";

function withEnv(overrides: Partial<Record<EnvKey, string | undefined>>, fn: () => void | Promise<void>) {
  const previous: Record<EnvKey, string | undefined> = {
    VIVO_APP_ID: process.env.VIVO_APP_ID,
    VIVO_APP_KEY: process.env.VIVO_APP_KEY,
    VIVO_BASE_URL: process.env.VIVO_BASE_URL,
    VIVO_LLM_MODEL: process.env.VIVO_LLM_MODEL,
  };

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return Promise.resolve(fn()).finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

test("provider-status exposes unified redacted capability statuses", async () => {
  await withEnv(
    {
      VIVO_APP_ID: "demo-app-id-secret-value",
      VIVO_APP_KEY: "demo-app-key-secret-value",
      VIVO_BASE_URL: "https://api-ai.vivo.com.cn",
      VIVO_LLM_MODEL: "vivo-test-model",
    },
    async () => {
      const response = await GET(
        new Request("http://localhost:3000/api/ai/provider-status", {
          headers: {
            "x-demo-account-id": "u-admin",
          },
        })
      );
      const envelope = (await response.json()) as Record<string, unknown>;
      const data = envelope.data as Record<string, unknown>;
      const capabilities = data.capabilities as Record<string, Record<string, unknown>>;

      assert.equal(response.status, 200);
      assert.equal(envelope.ok, true);
      for (const key of ["llm", "ocr", "asr", "tts", "storybookImage", "storybookAudio"]) {
        assert.ok(data[key], `${key} status should exist`);
        assert.ok(capabilities[key], `${key} capability row should exist`);
        assert.equal(typeof capabilities[key].configured, "boolean");
        assert.equal(typeof capabilities[key].live, "boolean");
        assert.equal(typeof capabilities[key].fallback, "boolean");
        assert.equal(typeof capabilities[key].mock, "boolean");
        assert.equal(typeof capabilities[key].providerName, "string");
      }

      const text = JSON.stringify(envelope);
      assert.doesNotMatch(text, /demo-app-id-secret-value|demo-app-key-secret-value|Bearer|Authorization/i);
      assert.match(text, /VIVO_APP_ID|VIVO_APP_KEY/);
    }
  );
});
