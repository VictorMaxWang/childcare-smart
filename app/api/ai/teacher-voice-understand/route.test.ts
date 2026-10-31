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

test("teacher voice understanding propagates actual ASR model and live evidence through the multipart route", async () => {
  const form = new FormData(); form.set("audio", new File([OGG_SIGNATURE], "synthetic.ogg", { type: "audio/ogg" }));
  form.set("childId", "synthetic-child");
  let providerCalls = 0;
  const base = providerThatRejectsBrowserAudio();
  const response = await handleTeacherVoiceUnderstandRequest(new Request("http://localhost:3000/api/ai/teacher-voice-understand", { method: "POST", body: form }), {
    async authorize() { return null; }, resolveProvider() { return { ...base, async transcribe(input) {
      providerCalls++; assert.ok(input.audioBytes?.length); assert.equal(input.transcript, undefined); assert.equal(input.fallbackText, undefined);
      const status = { ...base.getStatus(), providerName: "maas-asr", state: "live" as const, live: true, isRealProvider: true, model: "qwen-audio-3.0-asr-flash" };
      return { provider: "maas-asr", mode: "live" as const, source: "provider" as const, model: "qwen-audio-3.0-asr-flash", output: {
        transcript: "合成儿童午餐尝试使用勺子。", source: "provider", confidence: null, fallback: false, providerName: "maas-asr", state: "live" as const,
        live: true, mock: false, isRealProvider: true, warnings: [], providerStatus: status,
      } };
    } }; },
  });
  const body = await response.json(); assert.equal(response.status, 200); assert.equal(providerCalls, 1);
  assert.equal(body.model.asr, "qwen-audio-3.0-asr-flash"); assert.equal(body.providerTrace.model, body.model.asr);
  assert.equal(body.providerTrace.realProvider, true); assert.equal(body.providerTrace.mode, "live"); assert.equal(body.fallback, false);
  assert.equal(body.source.router, "rule"); assert.equal(body.source.chaining, "rule");
});

test("teacher voice JSON transcript keeps its fallback model and cannot inherit a configured provider's real status", async () => {
  const base = providerThatRejectsBrowserAudio();
  const response = await handleTeacherVoiceUnderstandRequest(new Request("http://localhost:3000/api/ai/teacher-voice-understand", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ childId: "synthetic-child", transcript: "合成儿童午睡平稳。" }),
  }), { async authorize() { return null; }, resolveProvider() { return { ...base, async transcribe(input) {
    return { provider: "local-text-asr-fallback", mode: "fallback" as const, source: "provided_transcript" as const, model: "local-text-fallback", output: {
      transcript: input.transcript!, source: "provided_transcript", confidence: null, fallback: true, providerName: "local-text-asr-fallback", state: "fallback" as const,
      live: false, mock: false, isRealProvider: false, warnings: [], providerStatus: { ...base.getStatus(), state: "fallback" as const, live: false, fallback: true, isRealProvider: false },
    } };
  } }; } });
  const body = await response.json(); assert.equal(response.status, 200); assert.equal(body.model.asr, "local-text-fallback");
  assert.equal(body.providerTrace.model, "local-text-fallback"); assert.equal(body.providerTrace.realProvider, false);
  assert.equal(body.providerTrace.mode, "fallback"); assert.equal(body.fallback, true); assert.equal(body.fallbackReason, "provided-transcript");
});
