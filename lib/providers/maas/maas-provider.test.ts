import assert from "node:assert/strict";
import test from "node:test";
import { MaasProviderError, requestMaasChat, requestMaasEmbeddings, requestMaasImage, requestMaasTts, requestMaasAsr, getMaasProviderStatus } from "./maas-provider";
import { resolveAsrProvider } from "@/lib/ai/providers/asr-provider";
import { resolveOcrProvider } from "@/lib/ai/providers/ocr-provider";
import { resolveTtsProvider } from "@/lib/ai/providers/tts-provider";

async function configured(run: () => Promise<void>) {
  const previous = { AI_PROVIDER: process.env.AI_PROVIDER, AI_API_KEY: process.env.AI_API_KEY, AI_BASE_URL: process.env.AI_BASE_URL, AI_USAGE_AUDIT: process.env.AI_USAGE_AUDIT };
  const fetch = globalThis.fetch;
  Object.assign(process.env, { AI_PROVIDER: "maas", AI_API_KEY: "test-only-key", AI_BASE_URL: "https://gateway.example/compatible-mode/v1", AI_USAGE_AUDIT: "0" });
  try { await run(); } finally { globalThis.fetch = fetch; for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}
test("MaaS chat uses final content without Qwen thinking-disable fields", async () => configured(async () => {
  let body: Record<string, unknown> = {};
  globalThis.fetch = (async (_url, init) => { body = JSON.parse(String(init?.body)); return Response.json({ model: "ZHIPU/GLM-5.3-Flash", id: "req-1", choices: [{ finish_reason: "stop", message: { content: '{"ok":true}', reasoning_content: "private thought" } }] }); }) as typeof fetch;
  const result = await requestMaasChat({ messages: [{ role: "user", content: "Return JSON" }], json: true });
  assert.equal(result.text, '{"ok":true}'); assert.equal(body.enable_thinking, undefined); assert.equal(body.reasoning_effort, "low"); assert.equal(result.requestId, "req-1");
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
