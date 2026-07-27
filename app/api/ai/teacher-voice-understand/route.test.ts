import assert from "node:assert/strict";
import test from "node:test";

import {
  handleTeacherVoiceUnderstandRequest,
  type TeacherVoiceUnderstandRouteDependencies,
} from "./route.ts";
import type { AsrProvider } from "@/lib/ai/providers";
import { VivoProviderError } from "@/lib/providers/vivo";

const WEBM_SIGNATURE = new Uint8Array([
  0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x86, 0x81, 0x01,
]);
const OGG_SIGNATURE = new Uint8Array([
  0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00,
]);

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
  formData.append("audio", new Blob([WEBM_SIGNATURE], { type: "audio/webm" }), "voice.webm");
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

  assert.equal(response.status, 413);
  assert.equal(body.code, "invalid_request");
  assert.equal(providerCalls, 0);
});

test("teacher voice understand rejects oversized Content-Length before authorization", async () => {
  let authorizeCalls = 0;
  const response = await handleTeacherVoiceUnderstandRequest(
    new Request("http://localhost:3000/api/ai/teacher-voice-understand", {
      method: "POST",
      headers: {
        "content-length": String(5 * 1024 * 1024),
        "content-type": "multipart/form-data; boundary=voice",
      },
      body: "--voice--\r\n",
    }),
    {
      async authorize() {
        authorizeCalls += 1;
        return null;
      },
      resolveProvider: providerThatRejectsBrowserAudio,
    }
  );

  assert.equal(response.status, 413);
  assert.equal(authorizeCalls, 0);
});

test("teacher voice understand rejects disguised audio before invoking ASR", async () => {
  let providerCalls = 0;
  const provider = providerThatRejectsBrowserAudio();
  const formData = new FormData();
  formData.set(
    "audio",
    new File(["<html>not audio</html>"], "voice.webm", {
      type: "audio/webm",
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

  assert.equal(response.status, 415);
  assert.equal(providerCalls, 0);
});

test("teacher voice understand accepts Ogg Opus and passes canonical MIME to ASR", async () => {
  let receivedMimeType: string | undefined;
  let receivedOperationScope:
    | { institutionId: string; userId: string }
    | undefined;
  const provider = providerThatRejectsBrowserAudio();
  const formData = new FormData();
  formData.set(
    "audio",
    new File([OGG_SIGNATURE], "voice.ogg", {
      type: "audio/ogg;codecs=opus",
    })
  );
  formData.set("mimeType", "audio/wav");

  const response = await handleTeacherVoiceUnderstandRequest(
    new Request("http://localhost:3000/api/ai/teacher-voice-understand", {
      method: "POST",
      body: formData,
    }),
    {
      async authorize() {
        return {
          session: {
            source: "cookie" as const,
            user: {
              id: "teacher-normal-1",
              name: "测试教师",
              role: "教师" as const,
              avatar: "",
              institutionId: "institution-normal-1",
              accountKind: "normal" as const,
            },
          },
        };
      },
      resolveProvider() {
        return {
          ...provider,
          async transcribe(input) {
            receivedMimeType = input.mimeType;
            receivedOperationScope = input.operationScope;
            return provider.transcribe(input);
          },
        };
      },
    }
  );

  assert.equal(response.status, 503);
  assert.equal(receivedMimeType, "audio/ogg");
  assert.deepEqual(receivedOperationScope, {
    institutionId: "institution-normal-1",
    userId: "teacher-normal-1",
  });
});
