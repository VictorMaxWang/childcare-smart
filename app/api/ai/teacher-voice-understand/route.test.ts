import assert from "node:assert/strict";
import test from "node:test";

import {
  handleTeacherVoiceUnderstandRequest,
  type TeacherVoiceUnderstandRouteDependencies,
} from "./route.ts";
import type { AsrProvider } from "@/lib/ai/providers";
import { VivoProviderError } from "@/lib/providers/vivo";

function providerThatRejectsBrowserAudio(): AsrProvider {
  return {
    getStatus() {
      return {
        providerName: "vivo",
        capability: "asr",
        state: "configured",
        configured: true,
        live: false,
        fallback: false,
        mock: false,
        supported: true,
        isRealProvider: true,
        status: "ready",
        warnings: [],
        requiredEnv: [],
      };
    },
    async transcribe() {
      throw new VivoProviderError("sensitive upstream diagnostic", {
        capability: "asr",
        status: "unsupported",
      });
    },
  };
}

test("teacher voice understand maps a provider audio rejection to a redacted 503", async () => {
  const formData = new FormData();
  formData.append("audio", new Blob(["not-a-real-audio-file"], { type: "audio/webm" }), "voice.webm");
  formData.append("scene", "normal-session-ai-access");

  const dependencies: TeacherVoiceUnderstandRouteDependencies = {
    async authorize() {
      return null;
    },
    resolveProvider: providerThatRejectsBrowserAudio,
  };

  const response = await handleTeacherVoiceUnderstandRequest(
    new Request("http://localhost:3000/api/ai/teacher-voice-understand", {
      method: "POST",
      body: formData,
    }),
    dependencies
  );
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.code, "provider_unavailable");
  assert.equal(body.fallback, true);
  assert.equal(body.fallbackReason, "provider-unavailable");
  assert.equal((body.status as Record<string, unknown>).status, "unsupported");
  assert.doesNotMatch(JSON.stringify(body), /sensitive upstream diagnostic/);
});

test("teacher voice understand rejects oversized audio before invoking ASR", async () => {
  let providerCalls = 0;
  const provider = providerThatRejectsBrowserAudio();
  const formData = new FormData();
  formData.set(
    "audio",
    new File([new Uint8Array(4 * 1024 * 1024 + 1)], "too-large.wav", {
      type: "audio/wav",
    })
  );

  const response = await handleTeacherVoiceUnderstandRequest(
    new Request("http://localhost:3000/api/ai/teacher-voice-understand", {
      method: "POST",
      body: formData,
    }),
    {
      async authorize() {
        return null;
      },
      resolveProvider() {
        return {
          ...provider,
          async transcribe(input) {
            providerCalls += 1;
            return provider.transcribe(input);
          },
        };
      },
    }
  );
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 400);
  assert.equal(body.code, "invalid_request");
  assert.equal(providerCalls, 0);
});
