import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "./route.ts";

type EnvKey = "VIVO_APP_ID" | "VIVO_APP_KEY" | "VIVO_BASE_URL";

function withEnv(overrides: Partial<Record<EnvKey, string | undefined>>, fn: () => void | Promise<void>) {
  const previous: Record<EnvKey, string | undefined> = {
    VIVO_APP_ID: process.env.VIVO_APP_ID,
    VIVO_APP_KEY: process.env.VIVO_APP_KEY,
    VIVO_BASE_URL: process.env.VIVO_BASE_URL,
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

test("voice-asr text fallback returns complete provider trace", async () => {
  await withEnv(
    {
      VIVO_APP_ID: undefined,
      VIVO_APP_KEY: undefined,
      VIVO_BASE_URL: undefined,
    },
    async () => {
      const formData = new FormData();
      formData.set("transcript", "child is calm after the bedtime story");
      formData.set("scene", "voice-orb");

      const response = await POST(
        new Request("http://localhost:3000/api/ai/voice-asr", {
          method: "POST",
          headers: {
            "x-demo-account-id": "u-parent",
          },
          body: formData,
        })
      );
      const envelope = (await response.json()) as Record<string, unknown>;
      const data = envelope.data as Record<string, unknown>;
      const providerTrace = data.providerTrace as Record<string, unknown>;

      assert.equal(response.status, 200);
      assert.equal(envelope.ok, true);
      assert.equal(data.provider, "local-text-asr-fallback");
      assert.equal(data.fallback, true);
      assert.equal(data.fallbackReason, "provided-transcript");
      assert.equal(providerTrace.mode, "fallback");
      assert.equal(providerTrace.fallback, true);
      assert.equal(providerTrace.fallbackReason, "provided-transcript");
      assert.equal(providerTrace.provider, data.provider);
      assert.equal(providerTrace.capability, "asr");
    }
  );
});
