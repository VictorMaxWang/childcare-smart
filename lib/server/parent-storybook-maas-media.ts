import "server-only";

import { createHash } from "node:crypto";
import sharp from "sharp";
import { ApiRouteError } from "@/lib/server/api-errors";
import type { ParentStoryBookMediaStatusRequest, ParentStoryBookResponse, ParentStoryBookScene } from "@/lib/ai/types";
import { MaasProviderError, requestMaasImage, requestMaasTts, resolveMaasConfig } from "@/lib/providers/maas/maas-provider";
import { buildParentStoryBookPersistentMediaKey, persistParentStoryBookMedia, readParentStoryBookMedia } from "@/lib/server/parent-storybook-media-store";
import { getStorybookMediaTaskStore, type StorybookMediaTaskIdentity, type StorybookMediaProviderReceipt } from "@/lib/server/storybook-media-task-store";
import { buildAiProviderTraceFromProviderMeta } from "@/lib/ai/provider-trace";

type Channel = "image" | "audio";
const mediaPath = (key: string) => `/api/ai/parent-storybook/media/${key}`;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export class MaasStoryMediaDownloadError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "MaasStoryMediaDownloadError"; }
}

/**
 * 语音服务可能返回流式 WAV，以接近 2^31 的长度占位并靠 EOF 结束。
 * 下载完成后已知实际长度，只修复明确占位值；普通有限长度截断仍视为损坏，不能静默交付。
 */
export function normalizeMaasStoryWav(input: Buffer): Buffer {
  if (input.length < 44 || input.toString("ascii", 0, 4) !== "RIFF" || input.toString("ascii", 8, 12) !== "WAVE") throw new Error("Invalid generated WAV");
  const bytes = Buffer.from(input);
  let blockAlign = 0, dataLength = 0;
  let repaired = false;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const name = bytes.toString("ascii", offset, offset + 4), start = offset + 8;
    let length = bytes.readUInt32LE(offset + 4);
    if (name === "data" && length >= 0x7fff0000) {
      length = bytes.length - start;
      bytes.writeUInt32LE(length, offset + 4);
      repaired = true;
    }
    if (start + length > bytes.length) throw new Error("Truncated generated WAV");
    if (name === "fmt ") {
      if (length < 16 || ![1, 3, 65534].includes(bytes.readUInt16LE(start))) throw new Error("Invalid generated WAV format");
      blockAlign = bytes.readUInt16LE(start + 12);
    }
    if (name === "data") dataLength += length;
    offset = start + length + length % 2;
  }
  if (!blockAlign || dataLength <= blockAlign * 100 || dataLength % blockAlign) throw new Error("Generated WAV has no valid samples");
  const riffLength = bytes.readUInt32LE(4);
  if (riffLength >= 0x7fff0000 && repaired) bytes.writeUInt32LE(bytes.length - 8, 4);
  else if (riffLength !== bytes.length - 8) throw new Error("Generated WAV length mismatch");
  return repaired ? bytes : input;
}

/** 临时媒体只允许可信 OSS 域名；逐跳检查，避免把模型响应当作任意 URL 下载器。 */
export async function downloadMaasStoryMedia(url: string, channel: Channel, signal?: AbortSignal, deadlineAtMs = Date.now() + 20000) {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new MaasStoryMediaDownloadError("invalid-url", "Invalid generated media URL"); }
  if (!parsed.hostname.endsWith(".aliyuncs.com") || parsed.username || parsed.password || (parsed.port && parsed.port !== "443")) throw new MaasStoryMediaDownloadError("unsafe-target", "Unsafe generated media URL");
  if (parsed.protocol === "http:") parsed.protocol = "https:";
  if (parsed.protocol !== "https:") throw new MaasStoryMediaDownloadError("unsafe-scheme", "Generated media requires HTTPS");
  const remaining = deadlineAtMs - Date.now();
  if (remaining <= 0) throw new MaasStoryMediaDownloadError("deadline-exhausted", "Media download deadline exceeded");
  const requestSignal = AbortSignal.any([AbortSignal.timeout(Math.min(20000, remaining)), ...(signal ? [signal] : [])]);
  let response: Response;
  try { response = await fetch(parsed, { redirect: "error", cache: "no-store", signal: requestSignal }); }
  catch (error) {
    const cause = error && typeof error === "object" ? (error as { cause?: { code?: unknown } }).cause : undefined;
    const code = typeof cause?.code === "string" && ["ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "ETIMEDOUT", "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_SOCKET"].includes(cause.code) ? cause.code : requestSignal.aborted ? "download-aborted" : "transport-failed";
    // 不带cause或原始message，避免Node网络错误把签名URL和query带进生产日志。
    throw new MaasStoryMediaDownloadError(code, "Generated media transport failed");
  }
  const type = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
  if (!response.ok || !type.startsWith(`${channel}/`)) { await response.body?.cancel(); throw new MaasStoryMediaDownloadError(!response.ok ? `http-status-${response.status}` : "invalid-content-type", "Generated media response is invalid"); }
  const limit = channel === "image" ? 16 * 1024 * 1024 : 12 * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > limit || !response.body) { await response.body?.cancel(); throw new MaasStoryMediaDownloadError("body-limit-or-missing", "Generated media exceeds limit"); }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    let part: ReadableStreamReadResult<Uint8Array>;
    try { part = await reader.read(); } catch { throw new MaasStoryMediaDownloadError("body-stream-failed", "Generated media body read failed"); }
    if (part.done) break;
    length += part.value.length;
    if (length > limit) { await reader.cancel(); throw new MaasStoryMediaDownloadError("body-limit", "Generated media exceeds limit"); }
    chunks.push(part.value);
  }
  if (!length) throw new MaasStoryMediaDownloadError("body-empty", "Generated media is empty");
  return { bytes: Buffer.concat(chunks), contentType: type };
}

export function buildMaasStoryImagePrompt(story: ParentStoryBookResponse, scene: ParentStoryBookScene) {
  // 每页保留相同角色与风格约束，分镜留足空间；800 字是 Z-Image 的真实协议上限。
  const role = `婴幼儿原创绘本。全书同一主角和服饰：${story.title.slice(0, 50)}。风格：${story.stylePreset || story.providerMeta.stylePreset || "温暖水彩"}。`;
  const instructions = "人物比例一致，画面温和安全，无文字、水印、标志。竖版构图，仅描绘当前一幕：";
  return Array.from(`${role}${instructions}${scene.imagePrompt || scene.sceneText}`).slice(0, 800).join("");
}

type Dependencies = {
  store: ReturnType<typeof getStorybookMediaTaskStore>;
  image: typeof requestMaasImage;
  tts: typeof requestMaasTts;
  read: typeof readParentStoryBookMedia;
  persist: typeof persistParentStoryBookMedia;
  download: typeof downloadMaasStoryMedia;
};

/** 将已经真实生成的MaaS文字交接给媒体队列；pending不等于文字失败，更不等于媒体已生成。 */
export function prepareMaasStoryForMedia(input: ParentStoryBookResponse): ParentStoryBookResponse {
  const meta = input.providerMeta;
  const provider = meta.textProvider ?? meta.provider;
  const textFailure = meta.diagnostics?.text?.fallbackReason;
  const mediaOnlyReasons = new Set(["partial-media-fallback", "mock-storybook-pipeline"]);
  if (meta.textDelivery !== "real" || !meta.realProvider || !["maas", "maas-llm"].includes(provider) || textFailure ||
      (input.fallbackReason && !mediaOnlyReasons.has(input.fallbackReason)) || (meta.fallbackReason && !mediaOnlyReasons.has(meta.fallbackReason))) return input;
  const story = structuredClone(input);
  const privateMedia = (value: string | null | undefined) => /^\/api\/ai\/parent-storybook\/media\/[a-f0-9]{40}$/u.test(value ?? "");
  for (const scene of story.scenes) {
    const imageReady = scene.imageStatus === "ready" && (!scene.imageSourceKind || scene.imageSourceKind === "real") && privateMedia(scene.imageUrl) && !/mock|fallback|preview/iu.test(scene.imageProvider ?? "");
    const audioReady = scene.audioStatus === "ready" && privateMedia(scene.audioUrl) && !/mock|preview|browser/iu.test(scene.audioProvider ?? "");
    if (!imageReady) Object.assign(scene, { imageUrl: null, assetRef: null, imageStatus: "empty", imageSourceKind: undefined,
      imageProvider: "maas-z-image", imageCacheHit: false, imageStorageObject: undefined });
    if (!audioReady) Object.assign(scene, { audioUrl: null, audioRef: null, audioStatus: "empty", audioProvider: "maas-tts",
      audioCacheHit: false, audioStorageObject: undefined });
  }
  const channel = (name: Channel) => {
    const original = meta.diagnostics?.[name];
    const previous = original && /^maas/iu.test(original.resolvedProvider) ? original : undefined;
    const ready = story.scenes.filter(scene => (name === "image" ? scene.imageStatus : scene.audioStatus) === "ready").length;
    return { ...previous, requestedProvider: "maas", resolvedProvider: name === "image" ? "maas-z-image" : "maas-tts",
      liveEnabled: true, missingConfig: [], readySceneCount: ready, pendingSceneCount: story.scenes.length - ready,
      jobStatus: ready === story.scenes.length ? "ready" as const : previous?.jobStatus === "error" ? "error" as const : "idle" as const,
      lastErrorReason: previous?.lastErrorReason ?? null, retryAfterMs: previous?.jobStatus === "error" ? null : 3000 };
  };
  const image = channel("image"), audio = channel("audio");
  story.source = "ai";
  story.fallback = false;
  story.fallbackReason = null;
  story.provider = "maas";
  story.providerMeta = { ...meta, provider: "maas", textProvider: "maas", mode: "live", realProvider: true, fallbackReason: null,
    imageProvider: [...new Set(story.scenes.map(scene => scene.imageProvider || "maas-z-image"))].join("+"),
    audioProvider: [...new Set(story.scenes.map(scene => scene.audioProvider || "maas-tts"))].join("+"), imageDelivery: image.jobStatus === "ready" ? "real" : "mixed",
    audioDelivery: audio.jobStatus === "ready" ? "real" : "mixed",
    diagnostics: { ...meta.diagnostics, brain: meta.diagnostics?.brain ?? { reachable: true, fallbackReason: null, upstreamHost: null }, image, audio } };
  story.providerTrace = buildAiProviderTraceFromProviderMeta({ providerMeta: story.providerMeta, source: story.source,
    fallback: false, fallbackReason: null, capability: "llm" });
  return story;
}

/**
 * 普通账号只交付持久化后的私有媒体。数据库租约负责幂等，稳定 key 找回已保存但未记账的结果。
 * 每次轮询最多补一张图片和一页语音，当前页优先；结果未知的请求不会被刷新或重启自动重发。
 */
export async function completeMaasStoryMedia(input: {
  payload: ParentStoryBookMediaStatusRequest;
  institutionId: string;
  userId: string;
  signal?: AbortSignal;
  deadlineAtMs: number;
  reconcileOnly?: boolean;
}, overrides: Partial<Dependencies> = {}): Promise<ParentStoryBookResponse> {
  const dependencies: Dependencies = {
    store: overrides.store ?? getStorybookMediaTaskStore(), image: requestMaasImage, tts: requestMaasTts,
    read: readParentStoryBookMedia, persist: persistParentStoryBookMedia, download: downloadMaasStoryMedia,
    ...overrides,
  };
  const config = resolveMaasConfig();
  const story = prepareMaasStoryForMedia(structuredClone(input.payload.story));
  if (story.childId !== input.payload.childId || story.storyId !== input.payload.storyId ||
      new Set(story.scenes.map(scene => scene.sceneIndex)).size !== story.scenes.length) {
    throw new ApiRouteError("invalid_request", "绘本与儿童范围或页码不一致。");
  }
  const priorities = input.payload.prioritySceneIndices ?? [];
  const ordered = [...story.scenes].sort((a, b) => {
    const priority = (index: number) => priorities.includes(index) ? priorities.indexOf(index) : priorities.length + index;
    return priority(a.sceneIndex) - priority(b.sceneIndex);
  });
  const submitted = { image: false, audio: false };
  const problems: Partial<Record<Channel, string>> = {};
  const operation = { deadlineAtMs: input.deadlineAtMs, signal: input.signal };
  const providerOperation = { ...operation, deadlineAtMs: input.deadlineAtMs - 5000 };
  for (const scene of ordered) {
    for (const channel of ["image", "audio"] as const) {
      const provider = channel === "image" ? "maas-z-image" : "maas-tts";
      const model = channel === "image" ? config.imageModel : config.ttsModel;
      const text = channel === "image" ? buildMaasStoryImagePrompt(story, scene) : (scene.audioScript || scene.sceneText).slice(0, 3000);
      const inputDigest = digest({ model, text, voice: channel === "audio" ? "Cherry" : null, size: channel === "image" ? "768*1024" : null });
      const identity: StorybookMediaTaskIdentity = {
        institutionId: input.institutionId, userId: input.userId, childId: input.payload.childId,
        storybookId: story.storyId, sceneIndex: scene.sceneIndex, channel, provider, providerModel: model, inputDigest,
      };
      const seed = `${input.payload.childId}:${story.storyId}:${scene.sceneIndex}:${channel}:${provider}:${inputDigest}`;
      const stableKey = buildParentStoryBookPersistentMediaKey({ institutionId: input.institutionId, seed });
      const setReady = (key: string, cacheHit: boolean) => {
        if (channel === "image") Object.assign(scene, { imageUrl: mediaPath(key), assetRef: key, imageStatus: "ready", imageSourceKind: "real", imageProvider: provider, imageCacheHit: cacheHit });
        else Object.assign(scene, { audioUrl: mediaPath(key), audioRef: key, audioStatus: "ready", audioProvider: provider, audioCacheHit: cacheHit, engineId: model, voiceName: "Cherry" });
      };
      // 历史绘本已保存的授权媒体继续可读；切换模型不应让旧绘本被重新收费生成。
      const existingUrl = channel === "image" ? scene.imageUrl : scene.audioUrl;
      const existingStatus = channel === "image" ? scene.imageStatus : scene.audioStatus;
      const existingKey = existingUrl?.match(/^\/api\/ai\/parent-storybook\/media\/([a-f0-9]{40})$/u)?.[1];
      if (existingKey && existingStatus === "ready") {
        const existing = await dependencies.read({ institutionId: input.institutionId, mediaKey: existingKey, authorizedChildIds: new Set([input.payload.childId]), ...operation });
        if (existing && existing.ownerChildId === input.payload.childId && existing.ownerStorybookId === story.storyId && existing.storageMode !== "cached_media") {
          if (channel === "image" && !scene.imageSourceKind) scene.imageSourceKind = "real";
          continue;
        }
      }
      if (channel === "image") Object.assign(scene, { imageUrl: null, assetRef: null, imageStatus: "empty", imageProvider: provider });
      else Object.assign(scene, { audioUrl: null, audioRef: null, audioStatus: "empty", audioProvider: provider });
      if (input.signal?.aborted || input.deadlineAtMs - Date.now() < 2500) continue;
      let leaseToken: string | null = null;
      let receiptPersisted = false;
      let stage = "lookup";
      try {
        if (submitted[channel]) continue;
        const asset = await dependencies.read({ institutionId: input.institutionId, mediaKey: stableKey, authorizedChildIds: new Set([input.payload.childId]), ...operation });
        if (asset && asset.ownerChildId === input.payload.childId && asset.ownerStorybookId === story.storyId && asset.storageMode !== "cached_media") {
          const claim = await dependencies.store.claim(identity, operation);
          if (claim.action !== "ready" && !await dependencies.store.recoverReadyAudio(identity, stableKey, operation)) throw new Error("Verified media could not be reconciled with task state");
          setReady(stableKey, true);
          continue;
        }
        // 尚未向 provider 发送的页面不抢租约，避免轮询本身耗尽付费尝试次数。
        stage = "receipt-read";
        if (!dependencies.store.claimProviderReceipt || !dependencies.store.saveProviderReceipt) throw new Error("Durable provider receipt store unavailable");
        const recovery = await dependencies.store.claimProviderReceipt(identity, operation);
        if (recovery.action === "wait") { submitted[channel] = true; continue; }
        let receipt: StorybookMediaProviderReceipt;
        if (recovery.action === "resume") {
          leaseToken = recovery.leaseToken; receipt = recovery.receipt; receiptPersisted = true; submitted[channel] = true;
        } else {
          if (input.reconcileOnly || input.payload.reconcileOnly) {
            submitted[channel] = true;
            if (!dependencies.store.inspect) throw new Error("Read-only task inspection unavailable");
            const previous = await dependencies.store.inspect(identity, operation);
            // 新页尚无成果不是失败；只有账本证明真实失败/未知才阻断后续生成。
            // 必须只读检查，不能为了区分状态而claim一个新提交租约。
            if (previous?.action === "blocked") problems[channel] = "媒体请求结果待确认，已停止自动重复扣费。";
            else if (previous?.action === "ready") problems[channel] = "已保存媒体暂时无法读取，已停止重复生成。";
            continue;
          }
          let claim = await dependencies.store.claim(identity, operation);
          if (claim.action === "ready" && claim.mediaKey) {
            await dependencies.store.invalidateReadyMedia(identity, claim.mediaKey, "persistent-media-missing", operation);
            problems[channel] = "已保存媒体暂时无法读取，已停止重复生成。";
            submitted[channel] = true;
            continue;
          }
          if (claim.action === "blocked" && input.payload.retryFailed && claim.lastErrorReason?.startsWith("provider-rejected-") && dependencies.store.retryBlockedSubmission) {
            await dependencies.store.retryBlockedSubmission(identity, operation);
            claim = await dependencies.store.claim(identity, operation);
          }
          if (claim.action === "blocked") { submitted[channel] = true; problems[channel] = claim.lastErrorReason?.startsWith("provider-rejected-") ? "模型拒绝了媒体请求，可主动重试。" : "媒体请求结果待确认，已停止自动重复扣费。"; continue; }
          if (claim.action !== "submit" || !claim.leaseToken) { submitted[channel] = true; continue; }
          leaseToken = claim.leaseToken;
          submitted[channel] = true;
          stage = "provider";
          if (channel === "image") {
            const result = await dependencies.image({ prompt: text, size: "768*1024", ...providerOperation });
            receipt = { version: 1, model: result.model, requestId: result.requestId, contentType: result.mimeType, kind: result.base64 ? "base64" : "url", data: result.base64 || result.imageUrl || "", receivedAtMs: Date.now() };
          } else {
            const result = await dependencies.tts({ text, voice: "Cherry", ...providerOperation });
            receipt = { version: 1, model: result.model, requestId: result.requestId, contentType: result.mimeType, kind: result.audioBytes ? "base64" : "url", data: result.audioBytes ? Buffer.from(result.audioBytes).toString("base64") : result.audioUrl || "", receivedAtMs: Date.now() };
          }
          stage = "receipt-save";
          // 已收费成果的回执不依赖浏览器连接继续存在；单独保留5秒DB预算，仍然有界。
          const receiptOperation = { deadlineAtMs: Math.max(Date.now() + 5000, input.deadlineAtMs) };
          if (!await dependencies.store.saveProviderReceipt(identity, leaseToken, receipt, receiptOperation)) throw new Error("Provider receipt lease was lost");
          receiptPersisted = true;
        }
        let bytes: Buffer;
        let contentType: string;
        stage = "download";
        const media = receipt.kind === "base64" ? { bytes: Buffer.from(receipt.data, "base64"), contentType: receipt.contentType } : await dependencies.download(receipt.data, channel, input.signal, input.deadlineAtMs);
        stage = "transcode";
        if (channel === "image") {
          bytes = await sharp(media.bytes, { limitInputPixels: 16_000_000 }).rotate().resize({ width: 1024, height: 1366, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
          contentType = "image/webp";
        } else {
          const wav = /audio\/(?:x-)?wav/iu.test(media.contentType);
          contentType = wav ? "audio/wav" : media.contentType;
          bytes = wav ? normalizeMaasStoryWav(media.bytes) : media.bytes;
        }
        stage = "persist";
        const saved = await dependencies.persist({ institutionId: input.institutionId, childId: input.payload.childId, storybookId: story.storyId, bytes, contentType, seed, ...operation });
        stage = "task-ready";
        if (!await dependencies.store.markReady(identity, { leaseToken, mediaKey: saved.mediaKey }, operation)) throw new Error("Persisted media task lease was lost");
        setReady(saved.mediaKey, false);
      } catch (error) {
        submitted[channel] = true;
        // 只把明确的 HTTP 拒绝标记为可人工重试；超时/下载/落盘失败均可能已收费。
        const knownRejection = error instanceof MaasProviderError && [400, 401, 403, 429].includes(error.httpStatus ?? 0);
        const safeCode = error instanceof MaasStoryMediaDownloadError ? error.code : knownRejection ? `http-${(error as MaasProviderError).httpStatus}` : "operation-failed";
        const reason = knownRejection ? `provider-rejected-${(error as MaasProviderError).httpStatus}` : receiptPersisted ? `materialization-${stage}-${safeCode}` : "media-result-unknown";
        console.warn("storybook.media.failure", { channel, stage, code: safeCode, receiptPersisted });
        if (leaseToken) await dependencies.store.markSubmissionFailure(identity, leaseToken, { retryable: false, nextRetryAtMs: Date.now(), reason }, operation).catch(() => undefined);
        problems[channel] = knownRejection ? "模型拒绝了媒体请求，可检查服务状态后主动重试。" : receiptPersisted ? "媒体已生成，保存暂未完成，可重试保存而不再次生成。" : "媒体请求未完成，结果待确认，已停止自动重复扣费。";
      }
    }
  }
  const diagnostics = (channel: Channel) => {
    const count = story.scenes.filter(scene => (channel === "image" ? scene.imageStatus : scene.audioStatus) === "ready").length;
    const error = problems[channel];
    return { requestedProvider: "maas", resolvedProvider: channel === "image" ? "maas-z-image" : "maas-tts", liveEnabled: true, missingConfig: [], readySceneCount: count, pendingSceneCount: story.scenes.length - count,
      jobStatus: count === story.scenes.length ? "ready" as const : error ? "error" as const : "warming" as const,
      lastErrorReason: error ?? null, retryAfterMs: error ? null : 3000 };
  };
  const image = diagnostics("image"), audio = diagnostics("audio");
  story.providerMeta = { ...story.providerMeta,
    imageProvider: [...new Set(story.scenes.map(scene => scene.imageProvider || "maas-z-image"))].join("+"),
    audioProvider: [...new Set(story.scenes.map(scene => scene.audioProvider || "maas-tts"))].join("+"),
    imageDelivery: image.jobStatus === "ready" ? "real" : "mixed", audioDelivery: audio.jobStatus === "ready" ? "real" : "mixed",
    diagnostics: { brain: story.providerMeta.diagnostics?.brain ?? { reachable: true, fallbackReason: null, upstreamHost: null }, ...story.providerMeta.diagnostics, image, audio } };
  return story;
}
