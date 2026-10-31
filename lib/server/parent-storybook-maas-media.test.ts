import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import type { ParentStoryBookResponse } from "@/lib/ai/types";
import { MaasProviderError } from "@/lib/providers/maas/maas-provider";
import { buildMaasStoryImagePrompt, completeMaasStoryMedia, downloadMaasStoryMedia, prepareMaasStoryForMedia } from "./parent-storybook-maas-media";
import { shouldCacheParentStoryBookResponse } from "./parent-storybook-cache";
import { buildParentStoryBookPersistentMediaKey, type ParentStoryBookMediaAsset } from "./parent-storybook-media-store";
import { InMemoryStorybookMediaTaskStore } from "./storybook-media-task-store";

function syntheticPcmWav() {
  const bytes = Buffer.alloc(444);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16_000, 24); bytes.writeUInt32LE(32_000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  for (let offset = 44; offset + 1 < bytes.length; offset += 2) bytes.writeInt16LE(Math.round(10_000 * Math.sin(offset / 20)), offset);
  return new Uint8Array(bytes);
}

function story(count = 1): ParentStoryBookResponse {
  return { storyId: "synthetic-story-1", childId: "synthetic-child-1", mode: "storybook", title: "小熊的一天", summary: "合成测试", moral: "观察与陪伴", parentNote: "合成场景", source: "ai", fallback: false,
    generatedAt: "2026-10-31T00:00:00.000Z", providerMeta: { provider: "maas", mode: "live", textProvider: "maas", textDelivery: "real", imageProvider: "maas-z-image", audioProvider: "maas-tts", realProvider: true, highlightCount: 0, sceneCount: count },
    scenes: Array.from({ length: count }, (_, sceneIndex) => ({ sceneIndex: sceneIndex + 1, sceneTitle: `第${sceneIndex + 1}幕`, sceneText: `小熊在第${sceneIndex + 1}幕观察花朵。`, imagePrompt: `同一只穿蓝色衣服的小熊，第${sceneIndex + 1}幕在花园。`, imageStatus: "empty", audioStatus: "empty", audioScript: `这是第${sceneIndex + 1}幕`, voiceStyle: "gentle", highlightSource: "synthetic" })) };
}

test("real MaaS text with disabled backend mock media becomes a cached pending book without fabricated assets", () => {
  const input = story(4);
  input.fallback = true;
  Object.assign(input.providerMeta, { provider: "maas-llm", textProvider: "maas-llm", mode: "mixed", imageProvider: "storybook-dynamic-fallback", audioProvider: "storybook-mock-preview", imageDelivery: "dynamic-fallback", audioDelivery: "preview-only" });
  Object.assign(input.scenes[0], { imageUrl: "data:image/svg+xml,<svg/>", imageStatus: "fallback", imageSourceKind: "svg-fallback", audioUrl: "/storybook/demo.wav", audioStatus: "mock" });
  const prepared = prepareMaasStoryForMedia(input);
  assert.equal(input.fallback, true, "legacy raw evidence must not be mutated");
  assert.equal(prepared.source, "ai"); assert.equal(prepared.fallback, false);
  assert.equal(prepared.providerMeta.provider, "maas"); assert.equal(prepared.providerMeta.textDelivery, "real");
  assert.equal(prepared.providerTrace?.realProvider, true); assert.equal(prepared.providerTrace?.fallback, false);
  for (const channel of ["image", "audio"] as const) {
    assert.equal(prepared.providerMeta.diagnostics?.[channel].pendingSceneCount, 4);
    assert.equal(prepared.providerMeta.diagnostics?.[channel].readySceneCount, 0);
    assert.equal(prepared.providerMeta.diagnostics?.[channel].jobStatus, "idle");
  }
  assert.ok(prepared.scenes.every(scene => scene.imageStatus === "empty" && scene.audioStatus === "empty" && !scene.imageUrl && !scene.audioUrl));
  assert.equal(shouldCacheParentStoryBookResponse(prepared), true, "paid text must survive before the first image exists");
});

test("MaaS preparation preserves historical ready private media and never upgrades rule or failed text", () => {
  const historical = story();
  Object.assign(historical.scenes[0], { imageStatus: "ready", imageSourceKind: "real", imageUrl: `/api/ai/parent-storybook/media/${"a".repeat(40)}`, imageProvider: "vivo-story-image" });
  const prepared = prepareMaasStoryForMedia(historical);
  assert.equal(prepared.scenes[0].imageUrl, historical.scenes[0].imageUrl);
  assert.equal(prepared.scenes[0].imageProvider, "vivo-story-image");
  assert.equal(prepared.providerMeta.imageProvider, "vivo-story-image");
  const fallback = story(); fallback.providerMeta.textDelivery = "fallback"; fallback.fallback = true;
  assert.equal(prepareMaasStoryForMedia(fallback), fallback);
  const failed = story(); failed.providerMeta.fallbackReason = "provider-invalid-json";
  assert.equal(prepareMaasStoryForMedia(failed), failed);
  const legacy = story(); legacy.providerMeta.textProvider = "vivo-llm";
  assert.equal(prepareMaasStoryForMedia(legacy), legacy);
});

async function harness(count = 1) {
  const png = await sharp({ create: { width: 8, height: 12, channels: 3, background: "#ffeecc" } }).png().toBuffer();
  const assets = new Map<string, ParentStoryBookMediaAsset>();
  const calls = { image: 0, audio: 0, imageDeadline: 0 };
  const input: Parameters<typeof completeMaasStoryMedia>[0] = { payload: { childId: "synthetic-child-1", storyId: "synthetic-story-1", story: story(count) }, institutionId: "synthetic-institution", userId: "synthetic-parent", deadlineAtMs: Date.now() + 40_000 };
  const store = new InMemoryStorybookMediaTaskStore();
  const dependencies: NonNullable<Parameters<typeof completeMaasStoryMedia>[1]> = {
    store,
    image: async request => { calls.image++; calls.imageDeadline = request.deadlineAtMs!; return { imageUrl: null, base64: png.toString("base64"), mimeType: "image/png", model: "z-image-turbo", requestId: "synthetic-image" }; },
    tts: async () => { calls.audio++; return { audioUrl: null, audioBytes: syntheticPcmWav(), mimeType: "audio/wav", model: "qwen3-tts-flash", requestId: "synthetic-audio" }; },
    read: async request => assets.get(`${request.institutionId}:${request.mediaKey}`) ?? null,
    persist: async request => {
      const mediaKey = buildParentStoryBookPersistentMediaKey({ institutionId: request.institutionId, seed: request.seed! });
      assets.set(`${request.institutionId}:${mediaKey}`, { bytes: request.bytes, contentType: request.contentType, ownerChildId: request.childId, ownerStorybookId: request.storybookId, storageMode: "private_blob", expiresAt: null });
      return { mediaKey, mediaUrl: `/api/ai/parent-storybook/media/${mediaKey}` };
    },
    download: async () => { throw new Error("Synthetic providers return inline bytes; no network expected"); },
  };
  return { input, dependencies, assets, calls, store };
}

test("one media round generates one prioritized image and audio with persistence reserve", async () => {
  const fixture = await harness(3); fixture.input.payload.prioritySceneIndices = [3];
  const result = await completeMaasStoryMedia(fixture.input, fixture.dependencies);
  assert.equal(fixture.calls.image, 1); assert.equal(fixture.calls.audio, 1);
  assert.equal(result.scenes[2].imageStatus, "ready"); assert.equal(result.scenes[2].audioStatus, "ready");
  assert.equal(result.scenes[0].imageStatus, "empty");
  assert(fixture.calls.imageDeadline <= fixture.input.deadlineAtMs - 5000);
  assert.match(result.scenes[2].imageUrl!, /^\/api\/ai\/parent-storybook\/media\/[a-f0-9]{40}$/);
});

test("concurrent polling leases prevent duplicate generation of the same scene", async () => {
  const fixture = await harness(); const image = fixture.dependencies.image!;
  fixture.dependencies.image = async request => { await new Promise(resolve => setTimeout(resolve, 10)); return image(request); };
  await Promise.all([completeMaasStoryMedia(fixture.input, fixture.dependencies), completeMaasStoryMedia(fixture.input, fixture.dependencies)]);
  const result = await completeMaasStoryMedia(fixture.input, fixture.dependencies);
  assert.equal(fixture.calls.image, 1); assert.equal(fixture.calls.audio, 1);
  assert.equal(result.scenes[0].imageStatus, "ready"); assert.equal(result.scenes[0].audioStatus, "ready");
});

test("unknown charged image failure is blocked across refresh and explicit retry", async () => {
  const fixture = await harness();
  fixture.dependencies.image = async () => { fixture.calls.image++; throw new MaasProviderError("result unknown", "request-timeout"); };
  const first = await completeMaasStoryMedia(fixture.input, fixture.dependencies);
  fixture.input.payload.story = first; fixture.input.payload.retryFailed = true;
  const second = await completeMaasStoryMedia(fixture.input, fixture.dependencies);
  assert.equal(fixture.calls.image, 1); assert.equal(second.scenes[0].imageStatus, "empty");
  assert.match(second.providerMeta.diagnostics!.image.lastErrorReason!, /待确认/);
});

test("stable persisted key recovers a result whose task acknowledgement failed", async () => {
  const fixture = await harness(); const markReady = fixture.store.markReady.bind(fixture.store); let rejectOnce = true;
  fixture.store.markReady = async (identity, input, operation) => { if (identity.channel === "image" && rejectOnce) { rejectOnce = false; throw new Error("synthetic acknowledgement failure"); } return markReady(identity, input, operation); };
  await completeMaasStoryMedia(fixture.input, fixture.dependencies);
  const recovered = await completeMaasStoryMedia(fixture.input, fixture.dependencies);
  assert.equal(fixture.calls.image, 1); assert.equal(recovered.scenes[0].imageStatus, "ready"); assert.equal(recovered.scenes[0].imageCacheHit, true);
});

test("private media identities remain separated across institutions and children", async () => {
  const fixture = await harness();
  const first = await completeMaasStoryMedia(fixture.input, fixture.dependencies);
  const secondInput = structuredClone(fixture.input); secondInput.payload.childId = "synthetic-child-2"; secondInput.payload.story.childId = "synthetic-child-2";
  const second = await completeMaasStoryMedia(secondInput, fixture.dependencies);
  const third = await completeMaasStoryMedia({ ...fixture.input, institutionId: "synthetic-other-institution" }, fixture.dependencies);
  assert.notEqual(first.scenes[0].assetRef, second.scenes[0].assetRef);
  assert.notEqual(first.scenes[0].assetRef, third.scenes[0].assetRef);
  assert.equal(fixture.assets.size, 6);
});

test("mismatched story scope is rejected before media providers", async () => {
  const fixture = await harness(); fixture.input.payload.story.childId = "synthetic-other-child";
  await assert.rejects(completeMaasStoryMedia(fixture.input, fixture.dependencies));
  assert.equal(fixture.calls.image, 0); assert.equal(fixture.calls.audio, 0);
});

test("duplicate scene numbers are rejected before media providers", async () => {
  const fixture = await harness(2); fixture.input.payload.story.scenes[1].sceneIndex = 1;
  await assert.rejects(completeMaasStoryMedia(fixture.input, fixture.dependencies));
  assert.equal(fixture.calls.image, 0); assert.equal(fixture.calls.audio, 0);
});

test("previously saved authorized media survives provider changes without new charges", async () => {
  const fixture = await harness(); const scene = fixture.input.payload.story.scenes[0];
  const imageKey = "a".repeat(40), audioKey = "b".repeat(40);
  Object.assign(scene, { imageUrl: `/api/ai/parent-storybook/media/${imageKey}`, imageStatus: "ready", imageProvider: "vivo-story-image", audioUrl: `/api/ai/parent-storybook/media/${audioKey}`, audioStatus: "ready", audioProvider: "vivo-story-tts" });
  for (const key of [imageKey, audioKey]) fixture.assets.set(`${fixture.input.institutionId}:${key}`, { bytes: Buffer.from("synthetic-persisted-media"), contentType: key === imageKey ? "image/webp" : "audio/wav", ownerChildId: fixture.input.payload.childId, ownerStorybookId: fixture.input.payload.storyId, storageMode: "private_blob", expiresAt: null });
  const result = await completeMaasStoryMedia(fixture.input, fixture.dependencies);
  assert.equal(fixture.calls.image, 0); assert.equal(fixture.calls.audio, 0);
  assert.equal(result.scenes[0].imageUrl, scene.imageUrl); assert.equal(result.scenes[0].audioUrl, scene.audioUrl);
  assert.equal(result.scenes[0].imageProvider, "vivo-story-image");
});

test("a definite provider rejection only retries after explicit user action", async () => {
  const fixture = await harness(); const image = fixture.dependencies.image!; let rejectOnce = true;
  fixture.dependencies.image = async request => { if (rejectOnce) { rejectOnce = false; fixture.calls.image++; throw new MaasProviderError("rejected", "provider-response", 400); } return image(request); };
  await completeMaasStoryMedia(fixture.input, fixture.dependencies);
  await completeMaasStoryMedia(fixture.input, fixture.dependencies);
  assert.equal(fixture.calls.image, 1);
  fixture.input.payload.retryFailed = true;
  const result = await completeMaasStoryMedia(fixture.input, fixture.dependencies);
  assert.equal(fixture.calls.image, 2); assert.equal(result.scenes[0].imageStatus, "ready");
});

test("story image prompt respects the 800 Unicode character protocol limit", () => {
  const fixture = story(); fixture.scenes[0].imagePrompt = "熊🌼".repeat(1000);
  const prompt = buildMaasStoryImagePrompt(fixture, fixture.scenes[0]);
  assert.equal(Array.from(prompt).length, 800); assert.match(prompt, /同一主角和服饰/); assert(!/[\uD800-\uDBFF]$/u.test(prompt));
});

test("generated media downloader rejects unsafe targets before network", async () => {
  const previous = globalThis.fetch; let calls = 0;
  globalThis.fetch = (async () => { calls++; throw new Error("no network expected"); }) as typeof fetch;
  try {
    for (const url of ["http://127.0.0.1/private", "https://evil.example/a.png", "https://safe.aliyuncs.com.evil.example/a.png", "https://user:pass@safe.aliyuncs.com/a.png", "https://safe.aliyuncs.com:444/a.png", "file:///tmp/private"]) await assert.rejects(downloadMaasStoryMedia(url, "image"));
    assert.equal(calls, 0);
  } finally { globalThis.fetch = previous; }
});

test("generated media downloader limits streamed bytes and rejects redirects", async () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = (async (_url, options) => { assert.equal(options?.redirect, "error"); return new Response("redirect", { status: 302 }); }) as typeof fetch;
    await assert.rejects(downloadMaasStoryMedia("http://safe.oss-cn-beijing.aliyuncs.com/a.wav", "audio"));
    globalThis.fetch = (async () => new Response(new Uint8Array(12 * 1024 * 1024 + 1), { headers: { "content-type": "audio/wav" } })) as typeof fetch;
    await assert.rejects(downloadMaasStoryMedia("https://safe.oss-cn-beijing.aliyuncs.com/a.wav", "audio"), /exceeds limit/);
  } finally { globalThis.fetch = previous; }
});
