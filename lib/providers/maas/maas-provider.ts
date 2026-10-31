import "server-only";
import type { VivoCapability, VivoProviderStatus } from "@/lib/providers/vivo/types";

export type MaasMessage = { role: "system" | "user" | "assistant"; content: string | Array<Record<string, unknown>> };
export type MaasFailureKind = "missing-env" | "authentication" | "rate-limited" | "request-cancelled" | "request-timeout" | "provider-response";
const SAFE_UPSTREAM_FAILURES = {
  "1000": "authentication", "1001": "authentication", "1003": "authentication", "1004": "authentication", "1005": "authentication", "1220": "authentication", InvalidApiKey: "authentication",
  "1113": "rate-limited", "1302": "rate-limited", "1305": "rate-limited", "1308": "rate-limited",
  "1200": "provider-response", "1210": "provider-response", "1211": "provider-response", "1212": "provider-response", "1213": "provider-response", "1214": "provider-response", "1215": "provider-response", "1221": "provider-response", "1222": "provider-response", "1230": "provider-response", "1234": "provider-response", "1261": "provider-response", "1301": "provider-response",
} as const satisfies Record<string, MaasFailureKind>;
export type MaasSafeUpstreamCode = keyof typeof SAFE_UPSTREAM_FAILURES;
function safeUpstreamCode(value: unknown): MaasSafeUpstreamCode | undefined {
  const code = typeof value === "string" ? value : typeof value === "number" && Number.isInteger(value) ? String(value) : "";
  return Object.hasOwn(SAFE_UPSTREAM_FAILURES, code) ? code as MaasSafeUpstreamCode : undefined;
}
export class MaasProviderError extends Error {
  public readonly upstreamCode?: MaasSafeUpstreamCode;
  constructor(message: string, public failureKind: MaasFailureKind, public httpStatus?: number, upstreamCode?: MaasSafeUpstreamCode) {
    super(message); this.name = "MaasProviderError";
    // 即使调用方来自未类型检查的JS，也不能把任意上游code变成可记录诊断字段。
    this.upstreamCode = safeUpstreamCode(upstreamCode);
  }
}
export interface MaasRequestOptions {
  signal?: AbortSignal;
  deadlineAtMs?: number;
  onRequestStart?: () => void;
}
export function isMaasSelected() { return ["maas", "openai-compatible"].includes((process.env.AI_PROVIDER || "").trim().toLowerCase()); }
export function isMaasConfigured() { return isMaasSelected() && Boolean(process.env.AI_API_KEY?.trim()); }
type CapabilityObservation = { model: string; verifiedAt: string; status: "passed" | "failed" };
const capabilityObservations = new Map<string, CapabilityObservation>();
function capabilityModel(capability: string) {
  const config = resolveMaasConfig();
  return /image/.test(capability) ? config.imageModel : /tts|audio/.test(capability) ? config.ttsModel : capability === "asr" ? config.asrModel : capability === "embedding" ? config.embeddingModel : config.textModel;
}
export function getMaasCapabilityVerification(capability: string) {
  const observation = capabilityObservations.get(capability);
  return observation?.model === capabilityModel(capability) ? observation : null;
}
export function getMaasProviderStatus<T extends VivoCapability>(capability: T): VivoProviderStatus<T> {
  const configured = isMaasConfigured();
  const verified = configured ? getMaasCapabilityVerification(capability) : null;
  const live = verified?.status === "passed";
  return { providerName: "maas", capability, state: live ? "live" : configured ? "configured" : "fallback", configured,
    live, fallback: !configured, mock: false, supported: true, isRealProvider: configured,
    status: !configured ? "missing-env" : verified?.status === "failed" ? "provider-unavailable" : "ready", warnings: ["配置检查不代表本次调用已成功；最近调用验证仅反映当前服务实例。"],
    requiredEnv: ["AI_PROVIDER", "AI_BASE_URL", "AI_API_KEY"], reason: configured ? undefined : "MaaS configuration is missing" };
}
export function resolveMaasConfig() {
  const baseUrl = (process.env.AI_BASE_URL?.trim() || "https://maas.qianwenaiapi.com/compatible-mode/v1").replace(/\/+$/, "");
  const origin = new URL(baseUrl).origin;
  const nativeEndpoint = `${origin}/api/v1/services/aigc/multimodal-generation/generation`;
  const configuredTimeout = Number(process.env.AI_TIMEOUT_MS || 60000);
  return {
    baseUrl, textModel: process.env.AI_TEXT_MODEL?.trim() || "ZHIPU/GLM-5.3-Flash",
    imageModel: process.env.AI_IMAGE_MODEL?.trim() || "z-image-turbo",
    embeddingModel: process.env.AI_EMBEDDING_MODEL?.trim() || "qwen3.7-text-embedding-flash",
    ttsModel: process.env.AI_TTS_MODEL?.trim() || "qwen3-tts-flash",
    asrModel: process.env.AI_ASR_MODEL?.trim() || "qwen-audio-3.0-asr-flash",
    asrEndpoint: process.env.AI_ASR_ENDPOINT?.trim() || nativeEndpoint,
    asrProtocol: process.env.AI_ASR_PROTOCOL?.trim() || "native",
    imageEndpoint: process.env.AI_IMAGE_ENDPOINT?.trim() || nativeEndpoint,
    imageProtocol: process.env.AI_IMAGE_PROTOCOL?.trim() || "native",
    ttsEndpoint: process.env.AI_TTS_ENDPOINT?.trim() || nativeEndpoint,
    ttsProtocol: process.env.AI_TTS_PROTOCOL?.trim() || "native",
    timeoutMs: Number.isFinite(configuredTimeout) ? Math.min(120000, Math.max(250, configuredTimeout)) : 60000,
  };
}
function readText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  return Array.isArray(value) ? value.map(part => part && typeof part === "object" && typeof part.text === "string" ? part.text : "").join("\n").trim() : "";
}
type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}; }
function resultRequestId(response: Response, data: JsonObject) { return response.headers.get("x-request-id") || (typeof data.request_id === "string" ? data.request_id : typeof data.id === "string" ? data.id : null); }
function upstreamFailureCode(data: JsonObject) {
  const error = object(data.error);
  const codes = [error.code, data.code, error.type].map(safeUpstreamCode).filter((code): code is MaasSafeUpstreamCode => code !== undefined);
  // 网关可能用HTTP400包装智谱1004鉴权失败；仅信固定结构中的白名单code，不匹配message。
  return codes.find(code => SAFE_UPSTREAM_FAILURES[code] === "authentication") ?? codes[0];
}
function upstreamFailure(status: number, data: JsonObject, message: string) {
  const code = upstreamFailureCode(data);
  const failureKind: MaasFailureKind = status === 401 || status === 403 ? "authentication"
    : code && SAFE_UPSTREAM_FAILURES[code] === "authentication" ? "authentication"
    : status === 429 ? "rate-limited" : code ? SAFE_UPSTREAM_FAILURES[code] : "provider-response";
  return new MaasProviderError(message, failureKind, status, code);
}

const USAGE_NUMBER_FIELDS = new Set(["prompt_tokens", "completion_tokens", "total_tokens", "input_tokens", "output_tokens", "cached_tokens", "reasoning_tokens", "audio_tokens", "image_tokens", "text_tokens", "accepted_prediction_tokens", "rejected_prediction_tokens", "image_count", "duration", "characters", "input_characters", "output_characters", "billable_characters"]);
const USAGE_DETAIL_FIELDS = new Set(["prompt_tokens_details", "completion_tokens_details", "input_tokens_details", "output_tokens_details"]);
function safeUsage(value: unknown): JsonObject {
  const result: JsonObject = {};
  for (const [key, item] of Object.entries(object(value))) {
    if (USAGE_NUMBER_FIELDS.has(key) && typeof item === "number" && Number.isFinite(item) && item >= 0) result[key] = item;
    else if (USAGE_DETAIL_FIELDS.has(key)) result[key] = safeUsage(item);
  }
  return result;
}
function auditUsage(response: Response, data: JsonObject, body: JsonObject, elapsedMs: number, failed = false) {
  if (process.env.AI_USAGE_AUDIT !== "1") return;
  const config = resolveMaasConfig();
  const model = typeof body.model === "string" ? body.model : null;
  const text = object(body.input).text ?? body.input;
  const usage = { ...safeUsage(object(data.error).usage), ...safeUsage(data.usage) };
  const upstreamCode = failed ? upstreamFailureCode(data) : undefined;
  // 白名单只保留计费数值；上游 usage 即使夹带原文或额外身份字段也不会进入日志。
  // 错误回执的requestId也可能夹带上游正文；失败诊断仅保留状态码与固定code。
  console.info("ai.usage", JSON.stringify({ provider: "maas", model, requestId: failed ? null : resultRequestId(response, data), httpStatus: response.status, ...(upstreamCode ? { upstreamCode } : {}), usage,
    ttsCharacters: model === config.ttsModel && typeof text === "string" ? Array.from(text).length : 0,
    imageCount: model === config.imageModel ? (typeof usage.image_count === "number" ? usage.image_count : failed ? 0 : 1) : 0, elapsedMs }));
}

type QueueWaiter = { resolve: (release: () => void) => void; reject: (error: Error) => void; cleanup: () => void };
class BoundedProviderQueue {
  private active = 0;
  private waiters: QueueWaiter[] = [];
  constructor(private limit: number) {}
  async acquire(deadline: number, signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) throw new MaasProviderError("MaaS request cancelled", "request-cancelled");
    if (deadline <= Date.now()) throw new MaasProviderError("MaaS request deadline exceeded", "request-timeout");
    if (this.active < this.limit) { this.active++; return this.release; }
    if (this.waiters.length >= 12) throw new MaasProviderError("MaaS request queue is full", "rate-limited");
    return new Promise((resolve, reject) => {
      const cancel = (kind: "request-cancelled" | "request-timeout") => {
        const index = this.waiters.indexOf(waiter);
        if (index < 0) return;
        this.waiters.splice(index, 1); waiter.cleanup();
        reject(new MaasProviderError("MaaS queued request did not start", kind));
      };
      const onAbort = () => cancel("request-cancelled");
      const timer = setTimeout(() => cancel("request-timeout"), Math.max(1, deadline - Date.now()));
      const waiter: QueueWaiter = { resolve, reject, cleanup: () => { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); } };
      this.waiters.push(waiter); signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
  private release = () => {
    const next = this.waiters.shift();
    if (next) { next.cleanup(); next.resolve(this.release); }
    else this.active--;
  };
}
// 单实例共享队列使不同儿童/绘本也受限；队列等待消耗同一截止时间，不产生自动重试。
const imageQueue = new BoundedProviderQueue(1);
const textQueue = new BoundedProviderQueue(3);
const voiceQueue = new BoundedProviderQueue(2);
function requestQueue(body: JsonObject) {
  const config = resolveMaasConfig();
  return body.model === config.imageModel ? imageQueue : body.model === config.ttsModel || body.model === config.asrModel ? voiceQueue : textQueue;
}

/** 请求正文读取与网络阶段共享截止时间；不把上游原文或输入带入异常日志。 */
async function request(endpoint: string, body: JsonObject, options: MaasRequestOptions = {}) {
  const key = process.env.AI_API_KEY?.trim();
  if (!isMaasSelected() || !key) throw new MaasProviderError("MaaS provider is not configured", "missing-env");
  if (options.signal?.aborted) throw new MaasProviderError("MaaS request cancelled", "request-cancelled");
  const deadline = Math.min(options.deadlineAtMs ?? Infinity, Date.now() + resolveMaasConfig().timeoutMs);
  const release = await requestQueue(body).acquire(deadline, options.signal);
  const remaining = deadline - Date.now();
  if (remaining <= 0) { release(); throw new MaasProviderError("MaaS request deadline exceeded", "request-timeout"); }
  const timeout = AbortSignal.timeout(Math.max(1, Math.round(remaining)));
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const startedAt = Date.now();
  try {
    options.onRequestStart?.();
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(body), signal, cache: "no-store", redirect: "error" });
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (response.ok && response.headers.get("content-type")?.startsWith("audio/")) { auditUsage(response, {}, body, Date.now() - startedAt); return { response, data: {} as JsonObject, bytes }; }
    let data: JsonObject;
    try { data = object(JSON.parse(new TextDecoder().decode(bytes))); } catch {
      auditUsage(response, {}, body, Date.now() - startedAt, true);
      if (!response.ok) throw upstreamFailure(response.status, {}, "MaaS provider returned a non-success status");
      throw new MaasProviderError("MaaS returned invalid JSON", "provider-response", response.status);
    }
    const businessError = Boolean(data.code && data.code !== "Success" && data.code !== 200) || Boolean(upstreamFailureCode(data));
    // 必须先记账再校验业务结构：返回的已计费内容即使不完整也不能从费用报告中消失。
    auditUsage(response, data, body, Date.now() - startedAt, !response.ok || businessError);
    if (!response.ok) throw upstreamFailure(response.status, data, "MaaS provider returned a non-success status");
    if (businessError) throw upstreamFailure(response.status, data, "MaaS returned an unsuccessful result");
    return { response, data, bytes };
  } catch (error) {
    if (error instanceof MaasProviderError) throw error;
    throw new MaasProviderError(options.signal?.aborted ? "MaaS request cancelled" : timeout.aborted ? "MaaS request deadline exceeded" : "MaaS request failed", options.signal?.aborted ? "request-cancelled" : timeout.aborted ? "request-timeout" : "provider-response");
  } finally { release(); }
}
async function requestMaasChatImpl(input: MaasRequestOptions & { messages: MaasMessage[]; model?: string; json?: boolean; maxTokens?: number }) {
  const config = resolveMaasConfig();
  const model = input.model?.trim() || config.textModel;
  const { response, data } = await request(`${config.baseUrl}/chat/completions`, {
    model, messages: input.messages, stream: false, max_tokens: input.maxTokens ?? 3000,
    // GLM 5.3 不能关闭思考；仅传其支持的轻量推理档，不把 reasoning_content 当成最终答案。
    ...(model.toLowerCase().includes("glm-5.3") ? { reasoning_effort: "low" } : {}),
    // 已核验的千问混合思考型号用于照护结构化任务时直接回答，降低等待和额外推理费用。
    // 仅作用于明确支持此参数的型号，不能沿用到始终思考的 GLM。
    ...(model.toLowerCase() === "qwen3.8-flash" ? { enable_thinking: false } : {}),
    ...(input.json ? { response_format: { type: "json_object" } } : {}),
  }, input);
  const choice = object(Array.isArray(data.choices) ? data.choices[0] : null);
  const text = readText(object(choice.message).content);
  if (!text || (choice.finish_reason && choice.finish_reason !== "stop")) throw new MaasProviderError("MaaS returned no complete message content", "provider-response", response.status);
  return { text, model: typeof data.model === "string" ? data.model : model, requestId: resultRequestId(response, data), usage: object(data.usage) };
}
async function requestMaasEmbeddingsImpl(texts: string[], options: MaasRequestOptions = {}) {
  if (!texts.length || texts.length > 10 || texts.some(text => !text.trim())) throw new MaasProviderError("Embedding batch must contain 1 to 10 texts", "provider-response");
  const config = resolveMaasConfig();
  const { response, data } = await request(`${config.baseUrl}/embeddings`, { model: config.embeddingModel, input: texts, encoding_format: "float" }, options);
  const entries = Array.isArray(data.data) ? data.data.map(object).sort((a, b) => Number(a.index) - Number(b.index)) : [];
  const vectors = entries.map(item => item.embedding as number[]);
  const dimension = Array.isArray(vectors[0]) ? vectors[0].length : 0;
  if (vectors.length !== texts.length || !dimension || vectors.some(vector => !Array.isArray(vector) || vector.length !== dimension || vector.some(value => typeof value !== "number" || !Number.isFinite(value)))) throw new MaasProviderError("MaaS returned invalid embeddings", "provider-response", response.status);
  return { vectors, model: typeof data.model === "string" ? data.model : config.embeddingModel, requestId: resultRequestId(response, data) };
}
async function requestMaasImageImpl(input: MaasRequestOptions & { prompt: string; negativePrompt?: string; size?: string }) {
  const config = resolveMaasConfig();
  if (!input.prompt.trim() || Array.from(input.prompt).length > 800) throw new MaasProviderError("Image prompt must contain 1 to 800 characters", "provider-response");
  const body = config.imageProtocol === "openai" ? { model: config.imageModel, prompt: input.prompt, size: (input.size || "768*1024").replace("*", "x"), n: 1 } : {
    model: config.imageModel, input: { messages: [{ role: "user", content: [{ text: input.prompt }] }] }, parameters: { size: input.size || "768*1024", prompt_extend: false,
      // Z-Image 的原生协议不声明 negative_prompt，不能把旧 Qwen 图片参数照搬过去。
      ...(input.negativePrompt && config.imageModel !== "z-image-turbo" ? { negative_prompt: input.negativePrompt } : {}) },
  };
  const { response, data } = await request(config.imageEndpoint, body, input);
  const output = object(data.output);
  const choice = object(Array.isArray(output.choices) ? output.choices[0] : null);
  const content = object(choice.message).content;
  const first = object(Array.isArray(data.data) ? data.data[0] : Array.isArray(content) ? content.find(part => object(part).image) : null);
  const imageUrl = typeof first.url === "string" ? first.url : typeof first.image === "string" ? first.image : null;
  const base64 = typeof first.b64_json === "string" ? first.b64_json : null;
  if (!imageUrl && !base64) throw new MaasProviderError("MaaS returned no image", "provider-response", response.status);
  return { imageUrl, base64, mimeType: "image/png", model: config.imageModel, requestId: resultRequestId(response, data) };
}
async function requestMaasTtsImpl(input: MaasRequestOptions & { text: string; voice?: string }) {
  const config = resolveMaasConfig();
  const body = config.ttsProtocol === "openai" ? { model: config.ttsModel, input: input.text, voice: input.voice || "Cherry", response_format: "wav" } : { model: config.ttsModel, input: { text: input.text, voice: input.voice || "Cherry", language_type: "Chinese" } };
  const { response, data, bytes } = await request(config.ttsEndpoint, body, input);
  const audio = object(object(data.output).audio);
  const audioUrl = typeof audio.url === "string" ? audio.url : null;
  const audioBytes = response.headers.get("content-type")?.startsWith("audio/") ? bytes : null;
  if (!audioUrl && !audioBytes) throw new MaasProviderError("MaaS returned no audio", "provider-response", response.status);
  return { audioUrl, audioBytes, mimeType: response.headers.get("content-type")?.startsWith("audio/") ? response.headers.get("content-type")!.split(";")[0] : "audio/wav", model: config.ttsModel, requestId: resultRequestId(response, data) };
}
async function requestMaasAsrImpl(input: MaasRequestOptions & { audioBytes: Uint8Array; mimeType: string }) {
  if (!input.audioBytes.byteLength || !input.mimeType.startsWith("audio/")) throw new MaasProviderError("Audio input is invalid", "provider-response");
  const config = resolveMaasConfig();
  if (config.asrProtocol === "native") {
    const format = ({ "audio/wav": "wav", "audio/x-wav": "wav", "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/ogg": "ogg", "audio/opus": "opus", "audio/webm": "webm", "audio/mp4": "m4a", "audio/x-m4a": "m4a" } as Record<string, string>)[input.mimeType.split(";")[0]];
    if (!format) throw new MaasProviderError("Unsupported ASR audio format", "provider-response");
    // Qwen-Audio-3.x 使用原生多模态协议，与旧 qwen3-asr 的兼容 chat 协议不同。
    const { response, data } = await request(config.asrEndpoint, {
      model: config.asrModel, input: { messages: [{ role: "user", content: [{ type: "input_audio", input_audio: { data: `data:${input.mimeType};base64,${Buffer.from(input.audioBytes).toString("base64")}` } }] }] }, parameters: { format },
    }, input);
    const output = object(data.output);
    const transcript = readText(output.text) || readText(object(output.sentence).text);
    if (!transcript) throw new MaasProviderError("MaaS returned no transcript", "provider-response", response.status);
    return { transcript, model: config.asrModel, requestId: resultRequestId(response, data) };
  }
  const result = await requestMaasChatImpl({ ...input, model: config.asrModel, messages: [{ role: "user", content: [{ type: "input_audio", input_audio: { data: `data:${input.mimeType};base64,${Buffer.from(input.audioBytes).toString("base64")}` } }] }] });
  return { transcript: result.text, model: result.model, requestId: result.requestId };
}
async function observe<T>(capabilities: string[], model: string, action: () => Promise<T>): Promise<T> {
  try {
    const result = await action();
    for (const capability of capabilities) capabilityObservations.set(capability, { model, status: "passed", verifiedAt: new Date().toISOString() });
    return result;
  } catch (error) {
    if (!(error instanceof MaasProviderError) || !["request-cancelled", "request-timeout"].includes(error.failureKind)) {
      for (const capability of capabilities) capabilityObservations.set(capability, { model, status: "failed", verifiedAt: new Date().toISOString() });
    }
    throw error;
  }
}
export function requestMaasChat(input: Parameters<typeof requestMaasChatImpl>[0]) {
  const vision = input.messages.some(message => Array.isArray(message.content) && message.content.some(part => part.type === "image_url"));
  return observe(vision ? ["vision", "ocr"] : ["chat", "llm"], input.model || resolveMaasConfig().textModel, () => requestMaasChatImpl(input));
}
export function requestMaasEmbeddings(texts: string[], options: MaasRequestOptions = {}) { return observe(["embedding"], resolveMaasConfig().embeddingModel, () => requestMaasEmbeddingsImpl(texts, options)); }
export function requestMaasImage(input: Parameters<typeof requestMaasImageImpl>[0]) { return observe(["image", "storybook-image"], resolveMaasConfig().imageModel, () => requestMaasImageImpl(input)); }
export async function requestMaasTts(input: Parameters<typeof requestMaasTtsImpl>[0]) {
  const model = resolveMaasConfig().ttsModel;
  if (typeof input.text !== "string" || !input.text.trim()) {
    throw new MaasProviderError("语音旁白不能为空，未发送语音生成请求。", "provider-response", 400);
  }
  // Qwen3-TTS官方单次输入上限为600字符；按Unicode字符而非UTF-16长度计算。
  // 不静默截断旁白：原文与绘本保持一致，超限在计费请求及live观测之前明确拒绝。
  // 此协议约束不等于计费单位：计费时汉字按2个字符，其他字符按1个字符。
  if (model === "qwen3-tts-flash" && Array.from(input.text).length > 600) {
    throw new MaasProviderError("语音旁白超过600个字符，请缩短后重试；原文未被截断，未发送语音生成请求。", "provider-response", 400);
  }
  return observe(["tts", "storybook-audio"], model, () => requestMaasTtsImpl(input));
}
export function requestMaasAsr(input: Parameters<typeof requestMaasAsrImpl>[0]) { return observe(["asr"], resolveMaasConfig().asrModel, () => requestMaasAsrImpl(input)); }
