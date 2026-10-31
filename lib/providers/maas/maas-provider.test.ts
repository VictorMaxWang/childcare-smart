import assert from "node:assert/strict";
import test from "node:test";
import { MaasProviderError, requestMaasChat, requestMaasEmbeddings, requestMaasImage, requestMaasTts, requestMaasAsr, getMaasProviderStatus } from "./maas-provider";
import { resolveAsrProvider } from "@/lib/ai/providers/asr-provider";
import { resolveOcrProvider } from "@/lib/ai/providers/ocr-provider";
import { resolveTtsProvider } from "@/lib/ai/providers/tts-provider";

async function configured(run: () => Promise<void>) {
  const previous = { AI_PROVIDER: process.env.AI_PROVIDER, AI_API_KEY: process.env.AI_API_KEY, AI_BASE_URL: process.env.AI_BASE_URL, AI_USAGE_AUDIT: process.env.AI_USAGE_AUDIT, AI_TTS_MODEL: process.env.AI_TTS_MODEL, AI_TTS_PROTOCOL: process.env.AI_TTS_PROTOCOL };
  const fetch = globalThis.fetch;
  Object.assign(process.env, { AI_PROVIDER: "maas", AI_API_KEY: "test-only-key", AI_BASE_URL: "https://gateway.example/compatible-mode/v1", AI_USAGE_AUDIT: "0", AI_TTS_MODEL: "qwen3-tts-flash", AI_TTS_PROTOCOL: "native" });
  try { await run(); } finally { globalThis.fetch = fetch; for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}
test("MaaS chat uses final content without Qwen thinking-disable fields", async () => configured(async () => {
  let body: Record<string, unknown> = {};
  globalThis.fetch = (async (_url, init) => { body = JSON.parse(String(init?.body)); return Response.json({ model: "ZHIPU/GLM-5.3-Flash", id: "req-1", choices: [{ finish_reason: "stop", message: { content: '{"ok":true}', reasoning_content: "private thought" } }] }); }) as typeof fetch;
  const result = await requestMaasChat({ messages: [{ role: "user", content: "Return JSON" }], json: true });
  assert.equal(result.text, '{"ok":true}'); assert.equal(body.enable_thinking, undefined); assert.equal(body.reasoning_effort, "low"); assert.equal(result.requestId, "req-1");
}));

test("verified Qwen Flash uses direct answers while other models keep their own protocol", async () => configured(async () => {
  for (const model of ["qwen3.8-flash", "ZHIPU/GLM-5.3-Flash", "unverified-model"]) {
    let body: Record<string, unknown> = {};
    globalThis.fetch = (async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json({ model, choices: [{ finish_reason: "stop", message: { content: '{"ok":true}', reasoning_content: "not user content" } }] });
    }) as typeof fetch;
    const result = await requestMaasChat({ model, messages: [{ role: "user", content: "JSON" }], json: true });
    assert.equal(result.model, model);
    assert.equal(result.text, '{"ok":true}');
    assert.equal(body.enable_thinking, model === "qwen3.8-flash" ? false : undefined);
    assert.equal(body.reasoning_effort, model.includes("GLM") ? "low" : undefined);
  }
}));

test("opt-in usage audit keeps billed invalid responses and excludes private fields", async () => configured(async () => {
  const originalInfo = console.info; const lines: string[] = [];
  console.info = (...values: unknown[]) => { lines.push(values.join(" ")); };
  try {
    process.env.AI_USAGE_AUDIT = "1";
    globalThis.fetch = (async () => Response.json({ id: "synthetic-request", usage: { prompt_tokens: 10, completion_tokens: 20, completion_tokens_details: { reasoning_tokens: 5, text: "private-child-text" }, privateField: "private-child-name" }, choices: [{ finish_reason: "length", message: { content: "private-answer" } }] })) as typeof fetch;
    await assert.rejects(requestMaasChat({ messages: [{ role: "user", content: "private-prompt" }] }), MaasProviderError);
    assert.equal(lines.length, 1);
    const record = JSON.parse(lines[0].slice("ai.usage ".length));
    assert.equal(record.requestId, "synthetic-request"); assert.equal(record.httpStatus, 200);
    assert.deepEqual(record.usage, { prompt_tokens: 10, completion_tokens: 20, completion_tokens_details: { reasoning_tokens: 5 } });
    assert.doesNotMatch(lines[0], /private-|test-only-key|gateway\.example/);
    process.env.AI_USAGE_AUDIT = "0";
    globalThis.fetch = (async () => Response.json({ usage: { total_tokens: 7 }, choices: [{ message: { content: "answer" } }] })) as typeof fetch;
    assert.deepEqual((await requestMaasChat({ messages: [] })).usage, { total_tokens: 7 });
    assert.equal(lines.length, 1);
  } finally { console.info = originalInfo; }
}));

test("media usage audit records quantities without script or generated URLs", async () => configured(async () => {
  const originalInfo = console.info; const records: Array<Record<string, unknown>> = [];
  console.info = (_event: unknown, data: unknown) => { records.push(JSON.parse(String(data))); };
  try {
    process.env.AI_USAGE_AUDIT = "1";
    globalThis.fetch = (async () => Response.json({ request_id: "tts-test", usage: { characters: 3 }, output: { audio: { url: "https://private.example/audio" } } })) as typeof fetch;
    await requestMaasTts({ text: "你好🌼" });
    globalThis.fetch = (async () => Response.json({ request_id: "image-test", usage: { image_count: 1 }, output: { choices: [{ message: { content: [{ image: "https://private.example/image" }] } }] } })) as typeof fetch;
    await requestMaasImage({ prompt: "private-image-prompt" });
    assert.equal(records[0].ttsCharacters, 3); assert.equal(records[1].imageCount, 1);
    assert.doesNotMatch(JSON.stringify(records), /private|你好|🌼|https:/);
  } finally { console.info = originalInfo; }
}));
test("MaaS errors do not disclose the key or upstream input", async () => configured(async () => {
  for (const status of [401, 403, 429, 500]) {
    globalThis.fetch = (async () => new Response("test-only-key private child content", { status })) as typeof fetch;
    await assert.rejects(requestMaasChat({ messages: [{ role: "user", content: "private child content" }] }), (error: unknown) => {
      assert(error instanceof MaasProviderError); assert(!error.message.includes("test-only-key")); assert(!error.message.includes("private child")); assert.equal(error.httpStatus, status); return true;
    });
  }
}));

test("MaaS gateway HTTP 400 preserves a whitelisted Zhipu authentication code without exposing its message", async () => configured(async () => {
  for (const code of ["1004", 1004, "1000", "1001", "1003", "1005", "1220", "InvalidApiKey"]) {
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return Response.json({ error: { code, message: "AuthenticationToken private-child test-only-key https://private.example/secret" } }, { status: 400 }); }) as typeof fetch;
    await assert.rejects(requestMaasChat({ messages: [{ role: "user", content: "private-child" }] }), (error: unknown) => {
      assert(error instanceof MaasProviderError); assert.equal(error.failureKind, "authentication"); assert.equal(error.httpStatus, 400); assert.equal(error.upstreamCode, String(code));
      assert.doesNotMatch(`${error.message} ${JSON.stringify(error)}`, /AuthenticationToken|private-child|test-only-key|https:|secret/); return true;
    });
    assert.equal(calls, 1, "classification must never retry the paid request");
  }
}));

test("MaaS parameter and rate codes remain distinct from authentication even under gateway status 400", async () => configured(async () => {
  for (const [code, expected] of [["1210", "provider-response"], ["1211", "provider-response"], ["1261", "provider-response"], ["1301", "provider-response"], ["1113", "rate-limited"], ["1302", "rate-limited"], ["1305", "rate-limited"]]) {
    globalThis.fetch = (async () => Response.json({ code, message: "private upstream message" }, { status: 400 })) as typeof fetch;
    await assert.rejects(requestMaasChat({ messages: [] }), (error: unknown) => {
      assert(error instanceof MaasProviderError); assert.equal(error.httpStatus, 400); assert.equal(error.failureKind, expected); assert.equal(error.upstreamCode, code); return true;
    });
  }
}));

test("MaaS ignores arbitrary code values and never infers authentication from free text", async () => configured(async () => {
  for (const code of ["private-child-key", "https://private.example/key", "1004 ", "__proto__", 1004.5, { code: "1004" }, ["1004"]]) {
    globalThis.fetch = (async () => Response.json({ error: { code, message: "AuthenticationToken failed, mentioned code 1004" }, input: "private-child" }, { status: 400 })) as typeof fetch;
    await assert.rejects(requestMaasChat({ messages: [] }), (error: unknown) => {
      assert(error instanceof MaasProviderError); assert.equal(error.failureKind, "provider-response"); assert.equal(error.upstreamCode, undefined); assert.equal(error.httpStatus, 400);
      assert.doesNotMatch(JSON.stringify(error), /private-child|private\.example|AuthenticationToken/); return true;
    });
  }
  // 运行时JS也不能绕过类型检查把未审核的code保留在异常对象中。
  const direct = new MaasProviderError("safe message", "provider-response", 400, "private-child-key" as "1004");
  assert.equal(direct.upstreamCode, undefined);
}));

test("MaaS keeps authoritative HTTP authentication and rate status with malformed error bodies", async () => configured(async () => {
  for (const [status, kind] of [[401, "authentication"], [403, "authentication"], [429, "rate-limited"], [500, "provider-response"]] as const) {
    globalThis.fetch = (async () => new Response("private non-JSON failure body", { status })) as typeof fetch;
    await assert.rejects(requestMaasChat({ messages: [] }), (error: unknown) => {
      assert(error instanceof MaasProviderError); assert.equal(error.failureKind, kind); assert.equal(error.httpStatus, status); assert.equal(error.upstreamCode, undefined); assert.doesNotMatch(error.message, /private/); return true;
    });
  }
}));

test("MaaS also classifies structured failed business results under HTTP 200", async () => configured(async () => {
  globalThis.fetch = (async () => Response.json({ error: { code: "1004", message: "private authentication token" } })) as typeof fetch;
  await assert.rejects(requestMaasChat({ messages: [] }), (error: unknown) => error instanceof MaasProviderError && error.httpStatus === 200 && error.failureKind === "authentication" && error.upstreamCode === "1004");
  globalThis.fetch = (async () => Response.json({ code: "1210", message: "private parameter name" })) as typeof fetch;
  await assert.rejects(requestMaasChat({ messages: [] }), (error: unknown) => error instanceof MaasProviderError && error.httpStatus === 200 && error.failureKind === "provider-response" && error.upstreamCode === "1210");
}));

test("failed MaaS responses still audit billed numeric usage and only a safe diagnostic code", async () => configured(async () => {
  const previousInfo = console.info, lines: string[] = [];
  console.info = (...values: unknown[]) => { lines.push(values.join(" ")); };
  try {
    process.env.AI_USAGE_AUDIT = "1";
    globalThis.fetch = (async () => Response.json({ id: "private-child test-only-key https://private.example", error: { code: "1004", message: "private-child test-only-key", usage: { prompt_tokens: 10, completion_tokens: 20, completion_tokens_details: { reasoning_tokens: 3, text: "private-child" } } }, usage: { input_tokens: 15, output_tokens: 25, total_tokens: 40, text: "private prompt", duration: -1, untrustedCode: "private-child" }, input: "private prompt" }, { status: 400, headers: { "x-request-id": "test-only-key https://private.example" } })) as typeof fetch;
    await assert.rejects(requestMaasChat({ messages: [{ role: "user", content: "private prompt" }] }), MaasProviderError);
    assert.equal(lines.length, 1);
    const record = JSON.parse(lines[0].slice("ai.usage ".length));
    assert.equal(record.httpStatus, 400); assert.equal(record.upstreamCode, "1004"); assert.equal(record.requestId, null);
    assert.deepEqual(record.usage, { prompt_tokens: 10, completion_tokens: 20, completion_tokens_details: { reasoning_tokens: 3 }, input_tokens: 15, output_tokens: 25, total_tokens: 40 });
    assert.doesNotMatch(lines[0], /private|test-only-key|https:|gateway\.example/);
    process.env.AI_USAGE_AUDIT = "0";
    await assert.rejects(requestMaasChat({ messages: [] }), MaasProviderError); assert.equal(lines.length, 1);
  } finally { console.info = previousInfo; }
}));

test("failed image audit does not invent a generated image when usage is absent", async () => configured(async () => {
  const previousInfo = console.info, records: Array<Record<string, unknown>> = [];
  console.info = (_event: unknown, data: unknown) => { records.push(JSON.parse(String(data))); };
  try {
    process.env.AI_USAGE_AUDIT = "1";
    globalThis.fetch = (async () => Response.json({ code: "1210", usage: { image_count: 0 }, message: "private image prompt" }, { status: 400 })) as typeof fetch;
    await assert.rejects(requestMaasImage({ prompt: "private image prompt" }), MaasProviderError);
    assert.equal(records[0].imageCount, 0); assert.deepEqual(records[0].usage, { image_count: 0 });
    globalThis.fetch = (async () => new Response("private invalid body", { status: 500 })) as typeof fetch;
    await assert.rejects(requestMaasImage({ prompt: "private image prompt" }), MaasProviderError);
    assert.equal(records[1].imageCount, 0); assert.deepEqual(records[1].usage, {}); assert.doesNotMatch(JSON.stringify(records), /private/);
  } finally { console.info = previousInfo; }
}));
test("MaaS rejects empty, truncated and malformed final answers", async () => configured(async () => {
  for (const result of [{ choices: [{ message: { reasoning_content: "only thought" } }] }, { choices: [{ finish_reason: "length", message: { content: "partial" } }] }]) {
    globalThis.fetch = (async () => Response.json(result)) as typeof fetch;
    await assert.rejects(requestMaasChat({ messages: [{ role: "user", content: "hello" }] }), MaasProviderError);
  }
  globalThis.fetch = (async () => new Response("invalid-json")) as typeof fetch;
  await assert.rejects(requestMaasChat({ messages: [{ role: "user", content: "hello" }] }), MaasProviderError);
}));
test("MaaS embedding checks dimensions and finite vectors", async () => configured(async () => {
  globalThis.fetch = (async () => Response.json({ data: [{ index: 1, embedding: [3, 4] }, { index: 0, embedding: [1, 2] }] })) as typeof fetch;
  assert.deepEqual((await requestMaasEmbeddings(["first", "second"])).vectors, [[1, 2], [3, 4]]);
  globalThis.fetch = (async () => Response.json({ data: [{ embedding: [1, 2] }, { embedding: [1] }] })) as typeof fetch;
  await assert.rejects(requestMaasEmbeddings(["first", "second"]), MaasProviderError);
}));
test("MaaS media supports native single-image and TTS response contracts", async () => configured(async () => {
  let body: Record<string, unknown> = {};
  globalThis.fetch = (async (_url, init) => { body = JSON.parse(String(init?.body)); return Response.json({ output: { choices: [{ message: { content: [{ image: "https://media.example/image.png" }] } }] }, request_id: "image-1" }); }) as typeof fetch;
  const image = await requestMaasImage({ prompt: "synthetic illustration" });
  assert.equal(image.imageUrl, "https://media.example/image.png"); assert.equal((body.parameters as Record<string, unknown>).prompt_extend, false);
  globalThis.fetch = (async () => Response.json({ output: { audio: { url: "https://media.example/audio.wav" } } })) as typeof fetch;
  assert.equal((await requestMaasTts({ text: "合成验收文字" })).audioUrl, "https://media.example/audio.wav");
}));

test("Qwen3 TTS accepts exactly 600 Unicode characters without truncating either native or compatible requests", async () => configured(async () => {
  const text = "合成🌼".repeat(200); assert.equal(Array.from(text).length, 600); assert.ok(text.length > 600);
  for (const protocol of ["native", "openai"]) {
    process.env.AI_TTS_PROTOCOL = protocol; let sent = "", started = 0;
    globalThis.fetch = (async (_url, init) => { const payload = JSON.parse(String(init?.body)); sent = protocol === "native" ? payload.input.text : payload.input; return Response.json({ output: { audio: { url: "https://media.example/valid.wav" } } }); }) as typeof fetch;
    const result = await requestMaasTts({ text, onRequestStart: () => { started++; } });
    assert.equal(sent, text); assert.equal(result.audioUrl, "https://media.example/valid.wav"); assert.equal(started, 1);
  }
}));

test("Qwen3 TTS rejects empty and 601-character narration before charging, audit or capability failure, retaining original text", async () => configured(async () => {
  let fetchCalls = 0, started = 0, auditCalls = 0; const info = console.info;
  globalThis.fetch = (async () => { fetchCalls++; return Response.json({ output: { audio: { url: "https://media.example/valid.wav" } } }); }) as typeof fetch;
  await requestMaasTts({ text: "已经真实成功的合成测试旁白" }); const previousStatus = getMaasProviderStatus("tts"); assert.equal(previousStatus.live, true);
  fetchCalls = 0; process.env.AI_USAGE_AUDIT = "1"; console.info = () => { auditCalls++; };
  try {
    for (const text of ["", "  \n\t", "合".repeat(601), "🌼".repeat(601)]) {
      const original = text;
      await assert.rejects(requestMaasTts({ text, onRequestStart: () => { started++; } }), (error: unknown) => {
        assert.ok(error instanceof MaasProviderError); assert.equal(error.httpStatus, 400); assert.equal(error.failureKind, "provider-response");
        assert.match(error.message, /未发送语音生成请求/u); assert.ok(!error.message.includes("合合")); return true;
      });
      assert.equal(text, original);
    }
    assert.equal(fetchCalls, 0); assert.equal(started, 0); assert.equal(auditCalls, 0); assert.equal(getMaasProviderStatus("tts").live, true, "本地输入错误不应伪装成供应商故障。");
  } finally { console.info = info; }
}));

test("Qwen3-only text length does not silently impose an unverified limit on a different explicitly selected TTS model", async () => configured(async () => {
  process.env.AI_TTS_MODEL = "synthetic-other-tts-model"; const text = "a".repeat(601); let sent = "";
  globalThis.fetch = (async (_url, init) => { sent = JSON.parse(String(init?.body)).input.text; return Response.json({ output: { audio: { url: "https://media.example/other.wav" } } }); }) as typeof fetch;
  assert.equal((await requestMaasTts({ text })).model, "synthetic-other-tts-model"); assert.equal(sent, text);
}));
test("MaaS ASR keeps the selected model and never labels supplied text as recognition", async () => configured(async () => {
  let model = "";
  globalThis.fetch = (async (url, init) => { const body = JSON.parse(String(init?.body)); model = body.model; assert.equal(String(url), "https://gateway.example/api/v1/services/aigc/multimodal-generation/generation"); assert.equal(body.parameters.format, "wav"); assert.equal(body.max_tokens, undefined); assert.equal(body.input.messages[0].content[0].type, "input_audio"); return Response.json({ output: { text: "合成语音" } }); }) as typeof fetch;
  const result = await requestMaasAsr({ audioBytes: new Uint8Array([1, 2, 3]), mimeType: "audio/wav" });
  assert.equal(result.transcript, "合成语音"); assert.equal(model, "qwen-audio-3.0-asr-flash");
  await assert.rejects(requestMaasAsr({ audioBytes: new Uint8Array(), mimeType: "audio/wav" }), MaasProviderError);
}));
test("MaaS expired or cancelled operations never send a request", async () => configured(async () => {
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return Response.json({}); }) as typeof fetch;
  await assert.rejects(requestMaasChat({ messages: [], deadlineAtMs: Date.now() - 10 }), MaasProviderError);
  await assert.rejects(requestMaasChat({ messages: [], signal: AbortSignal.abort() }), MaasProviderError);
  assert.equal(calls, 0);
}));
test("business OCR/ASR resolvers preserve the selected MaaS provenance", async () => configured(async () => {
  globalThis.fetch = (async () => Response.json({ output: { text: "合成识别结果" }, choices: [{ message: { content: "合成识别结果" } }] })) as typeof fetch;
  const asr = await resolveAsrProvider().transcribe({ audioBytes: Buffer.from("synthetic"), mimeType: "audio/wav" });
  assert.equal(asr.provider, "maas"); assert.equal(asr.output.providerName, "maas"); assert.equal(asr.output.live, true);
  const ocr = await resolveOcrProvider().extract({ imageBase64: "c3ludGhldGlj", mimeType: "image/png" });
  assert.equal(ocr.provider, "maas"); assert.equal(ocr.output.providerStatus.providerName, "maas"); assert.equal(ocr.output.extractedText, "合成识别结果");
}));
test("business TTS resolver returns actual generated bytes", async () => configured(async () => {
  globalThis.fetch = (async () => new Response(new Uint8Array([82, 73, 70, 70]), { headers: { "content-type": "audio/wav" } })) as typeof fetch;
  const result = await resolveTtsProvider().synthesize({ text: "合成朗读" });
  assert.equal(result.provider, "maas"); assert.equal(result.output.audioUrl, "data:audio/wav;base64,UklGRg=="); assert.equal(result.live, true);
}));

test("image requests share one bounded queue across independent jobs", async () => configured(async () => {
  let active = 0; let maximum = 0;
  globalThis.fetch = (async () => {
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 5)); active--;
    return Response.json({ output: { choices: [{ message: { content: [{ image: "https://media.example/image.png" }] } }] } });
  }) as typeof fetch;
  await Promise.all(Array.from({ length: 4 }, (_, index) => requestMaasImage({ prompt: `synthetic job ${index}` })));
  assert.equal(maximum, 1);
}));

test("cancelled queued image never reaches the paid endpoint", async () => configured(async () => {
  let calls = 0; let releaseFirst!: () => void; let started!: () => void;
  const firstStarted = new Promise<void>(resolve => { started = resolve; });
  globalThis.fetch = (async () => {
    calls++; started(); await new Promise<void>(resolve => { releaseFirst = resolve; });
    return Response.json({ output: { choices: [{ message: { content: [{ image: "https://media.example/image.png" }] } }] } });
  }) as typeof fetch;
  const first = requestMaasImage({ prompt: "first" }); await firstStarted;
  const controller = new AbortController();
  const second = requestMaasImage({ prompt: "second", signal: controller.signal });
  controller.abort(); await assert.rejects(second, (error: unknown) => error instanceof MaasProviderError && error.failureKind === "request-cancelled");
  releaseFirst(); await first; assert.equal(calls, 1);
}));

test("capability configuration is distinct from model-specific recent verification", async () => configured(async () => {
  const previousModel = process.env.AI_TEXT_MODEL;
  try {
    process.env.AI_TEXT_MODEL = "synthetic-verification-model";
    assert.equal(getMaasProviderStatus("chat").live, false);
    globalThis.fetch = (async () => Response.json({ choices: [{ message: { content: "verified" } }] })) as typeof fetch;
    await requestMaasChat({ messages: [{ role: "user", content: "synthetic" }] });
    assert.equal(getMaasProviderStatus("chat").live, true);
    globalThis.fetch = (async () => new Response("upstream failed", { status: 500 })) as typeof fetch;
    await assert.rejects(requestMaasChat({ messages: [{ role: "user", content: "synthetic" }] }), MaasProviderError);
    assert.equal(getMaasProviderStatus("chat").status, "provider-unavailable");
    assert.equal(getMaasProviderStatus("chat").live, false);
  } finally { if (previousModel === undefined) delete process.env.AI_TEXT_MODEL; else process.env.AI_TEXT_MODEL = previousModel; }
}));
