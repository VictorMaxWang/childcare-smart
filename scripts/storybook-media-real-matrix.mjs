#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import { validateMatrixManifest } from "./parent-courses-real-matrix.mjs";

// 本脚本不启动浏览器、不创建账号、不改既有用户的一日记录；仅为合成儿童保存绘本与分享。
// 不自动重试任何网络请求。
// 使用已有普通账号与合成儿童；真实费用仅在 --execute --ai 同时存在时才可能发生。
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_ARTIFACT = "artifacts/implementation-20261031";
const MODELS = { text: "ZHIPU/GLM-5.3-Flash", image: "z-image-turbo", audio: "qwen3-tts-flash" };
const VERIFIED_TEXT_MODELS = Object.freeze(["ZHIPU/GLM-5.3-Flash", "qwen3.8-flash"]);
const MEDIA_PATH = /^\/api\/ai\/parent-storybook\/media\/[a-f0-9]{40}$/u;
const MAX_RESERVED_CNY = 5;
const MAX_MEDIA_ROUNDS = 8;
const nowIso = () => new Date().toISOString();
const roundMoney = value => Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function arg(name, fallback) {
  const entry = process.argv.find(value => value.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : fallback;
}
function artifactPath(value) {
  const resolved = path.resolve(ROOT, value);
  const relative = path.relative(path.join(ROOT, "artifacts"), resolved);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "进度、凭据与报告必须位于本工作树的 artifacts 目录。");
  return resolved;
}
async function jsonFile(file) { return JSON.parse(await readFile(file, "utf8")); }
async function optionalJson(file) {
  try { return await jsonFile(file); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
async function atomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 }); await rename(temporary, file); }
  finally { await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; }); }
}
function safeOrigin(value) {
  const target = new URL(value);
  assert.ok(!target.username && !target.password && !target.search && !target.hash && target.pathname === "/", "base-url 必须是无凭据的站点 origin。");
  assert.ok(["www.smartchildcare.cn", "smartchildcare.cn", "localhost", "127.0.0.1"].includes(target.hostname), "仅允许已授权正式域名或本机候选环境。");
  assert.ok(target.protocol === "https:" || ["localhost", "127.0.0.1"].includes(target.hostname) && target.protocol === "http:", "正式网站必须使用 HTTPS。");
  return target.origin;
}

/** 允许切换已经核验的文本模型；不允许用任意价格文件扩大模型或媒体的验收范围。 */
export function validateModelIdentities(models) {
  assert.ok(VERIFIED_TEXT_MODELS.includes(models?.text), "文本模型必须是已核验的 GLM-5.3-Flash 或 qwen3.8-flash。");
  assert.deepEqual(models, { ...MODELS, text: models.text }, "图片与音频模型必须与已核验身份完全一致。");
  return models;
}

/** 这里约束的是逐请求的费用预留上界，不能把模型目录可见或估算冒充实际账单。 */
export function validatePricing(pricing, capCny = MAX_RESERVED_CNY, now = Date.now()) {
  assert.ok(Number.isFinite(capCny) && capCny > 0 && capCny <= MAX_RESERVED_CNY, "本脚本总预留不得超过 5 元。");
  assert.equal(pricing?.currency, "CNY");
  assert.equal(pricing.provider, "maas");
  validateModelIdentities(pricing.models);
  const verified = Date.parse(pricing.verifiedAt);
  assert.ok(Number.isFinite(verified) && now - verified <= 30 * 24 * 60 * 60 * 1000 && verified <= now + 300_000, "计费证据需在最近 30 天核验。");
  assert.ok(typeof pricing.evidence === "string" && pricing.evidence.trim(), "必须提供实际计费核验的来源或证据路径。");
  assert.equal(pricing.verifiedForFourPagesAndServerTokenLimits, true, "费用上限需覆盖服务端文本 token 限额、4 页图片与每页最多 3000 字的 TTS。");
  for (const channel of ["text", "imagePerPage", "audioPerPage"]) assert.ok(Number.isFinite(pricing.maxCny?.[channel]) && pricing.maxCny[channel] > 0, `缺少 ${channel} 单次费用上界。`);
  const total = roundMoney(pricing.maxCny.text + 4 * pricing.maxCny.imagePerPage + 4 * pricing.maxCny.audioPerPage);
  assert.ok(total <= capCny, `一文四图四音频的最大预留 ${total} 元超过 ${capCny} 元上限。`);
  return total;
}

export function mediaReadiness(story) {
  const scenes = Array.isArray(story?.scenes) ? story.scenes : [];
  return {
    image: scenes.filter(scene => scene.imageStatus === "ready" && scene.imageSourceKind === "real" && scene.imageProvider === "maas-z-image" && MEDIA_PATH.test(scene.imageUrl || "")).length,
    audio: scenes.filter(scene => scene.audioStatus === "ready" && scene.audioProvider === "maas-tts" && MEDIA_PATH.test(scene.audioUrl || "")).length,
  };
}
export function assertNoMediaFailure(story) {
  for (const channel of ["image", "audio"]) {
    const diagnostics = story.providerMeta?.diagnostics?.[channel];
    assert.ok(diagnostics?.jobStatus !== "error" && !(diagnostics?.errorSceneCount > 0) && !diagnostics?.lastErrorReason,
      `${channel} 出现失败或结果未知；已停止，不重试收费请求。`);
  }
}
export function assertStoryText(story, childId, expectedTextModel) {
  assert.ok(VERIFIED_TEXT_MODELS.includes(expectedTextModel), "验收预期模型必须来自已核验价格配置。");
  assert.equal(story?.childId, childId); assert.equal(story.fallback, false); assert.equal(story.source, "ai");
  assert.equal(story.providerMeta?.provider, "maas"); assert.equal(story.providerMeta?.textProvider, "maas");
  assert.equal(story.providerMeta?.textDelivery, "real"); assert.equal(story.providerMeta?.realProvider, true);
  // diagnostics.text.model 是当前真实适配器写回的上游模型；其他兼容位置出现时也不能自相矛盾。
  assert.equal(story.providerMeta?.diagnostics?.text?.model, expectedTextModel, "真实文字模型与计费核验文件不一致。");
  for (const container of [story, story.providerMeta]) for (const key of ["model", "textModel"]) {
    if (Object.hasOwn(container, key)) assert.equal(container[key], expectedTextModel, `绘本 ${key} 与计费核验文件不一致。`);
  }
  assert.ok(typeof story.storyId === "string" && story.storyId); assert.ok(typeof story.title === "string" && story.title.trim());
  assert.equal(story.scenes?.length, 4, "必须正好四页，不接受少页或演示占位。");
  assert.deepEqual(new Set(story.scenes.map(scene => scene.sceneIndex)), new Set([1, 2, 3, 4]));
  for (const scene of story.scenes) {
    assert.ok(typeof scene.sceneText === "string" && scene.sceneText.trim().length >= 10);
    assert.ok(typeof scene.audioScript === "string" && scene.audioScript.trim().length >= 10 && scene.audioScript.length <= 3000, "音频文本需有实际内容且处于费用核验长度内。");
  }
}
function embeddedStory(saved) {
  const story = saved?.pages?.map(page => page.response).find(response => response && Array.isArray(response.scenes));
  assert.ok(story, "已保存绘本必须包含完整响应，不能只凭标题判定刷新恢复成功。");
  return story;
}

/** 免费恢复必须已有已保存、严格通过的文字，以及实际收到的媒体正文；未知请求不能凭空重建。 */
export function receivedStoryForReconciliation(state, expectedTextModel) {
  assert.equal(state.saved, true, "先保存已通过的真实文字，再恢复媒体。");
  assert.ok(state.calls.some(call => call.stage === "text" && call.status === "completed"), "缺少已完成的文字意图，不能免费恢复代替重新生成。");
  assertStoryText(state.story, state.childId, expectedTextModel);
  const call = state.calls.findLast(item => item.stage === "media" && Object.hasOwn(item, "responseBody") && ["received-needs-validation", "completed", "superseded-by-reconciliation"].includes(item.status));
  assert.ok(call, "没有已收到的媒体正文；网络未知结果不会被自动重发或伪恢复。");
  assertStoryText(call.responseBody, state.childId, expectedTextModel);
  assert.equal(call.responseBody.storyId, state.story.storyId, "收到的媒体正文必须属于当前已保存绘本。");
  return { requestId: call.requestId, story: structuredClone(call.responseBody) };
}
export function canonicalStoryMediaType(value) {
  const mime = (value || "").split(";", 1)[0].trim().toLowerCase();
  return mime === "audio/x-wav" ? "audio/wav" : mime;
}

/**
 * 业务正文已收到与网络结果未知是两种恢复边界。先原子保存原body，验证失败也不丢失，
 * 恢复只重验原body；只有通过原有严格断言后才替换可继续使用的story。
 */
export async function executePaidStoryRequest({ state, stage, amount, action, validate, persist, onRequestStarted = () => {} }) {
  assert.ok(!state.calls.some(call => ["pending", "unknown"].includes(call.status)), "已有请求结果未知，不重发收费请求。");
  const received = state.calls.filter(call => call.status === "received-needs-validation");
  assert.ok(received.length <= 1, "多个未验证响应需要人工核验，不继续收费请求。");
  if (received.length) assert.equal(received[0].stage, stage, "先验证已收到的原阶段正文，不能跳过后开始新阶段。");
  let call = received[0];
  if (!call) {
    call = { requestId: randomUUID(), stage, status: "pending", startedAt: nowIso(), maximumWithinBookReservationCny: amount };
    state.calls.push(call); state.stage = `${stage}:pending`; await persist();
    onRequestStarted();
    try {
      const body = await action();
      call.finishedAt = nowIso(); call.elapsedMs = Date.parse(call.finishedAt) - Date.parse(call.startedAt);
      call.responseBody = body; call.status = "received-needs-validation"; state.stage = `${stage}:received-needs-validation`;
      // 正文与“已收到、待验证”状态一起落盘，不能把严格验证移回action内部。
      await persist();
    } catch (error) {
      if (call.status === "pending") {
        call.status = "unknown"; call.finishedAt = nowIso(); state.stage = "stopped:unknown";
        state.stopReason = `${stage} 未完成或结果未知，禁止自动重试。`; await persist();
      }
      throw error;
    }
  } else {
    assert.ok(Object.hasOwn(call, "responseBody"), "待验证请求缺少原body，不允许重新生成。");
    call.lastRevalidatedAt = nowIso();
  }
  try {
    await validate(call.responseBody);
  } catch (error) {
    call.validationStatus = "failed"; call.validationFailedAt = nowIso();
    state.stage = "stopped:received-needs-validation";
    state.stopReason = `${stage} 正文已保留但未通过严格验证；仅重验原正文，不重发收费请求。`;
    await persist(); throw error;
  }
  call.status = "completed"; call.validationStatus = "passed"; call.validatedAt = nowIso();
  state.story = call.responseBody; state.stage = `${stage}:completed`; await persist();
  return call.responseBody;
}

export async function inspectMediaBytes(kind, bytes) {
  assert.ok(bytes.byteLength > (kind === "image" ? 12 : 44) && bytes.byteLength <= 4 * 1024 * 1024, "私有媒体大小异常。");
  assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(bytes.subarray(8, 12).toString("ascii"), kind === "image" ? "WEBP" : "WAVE");
  if (kind === "image") {
    const metadata = await sharp(bytes, { limitInputPixels: 16_000_000 }).metadata();
    assert.equal(metadata.format, "webp"); assert.ok(metadata.width > 0 && metadata.height > 0);
    // 解码完整像素，排除只有 RIFF 头却损坏的文件。
    await sharp(bytes, { limitInputPixels: 16_000_000 }).raw().toBuffer();
    return { bytes: bytes.byteLength, width: metadata.width, height: metadata.height, format: "webp" };
  }
  let format, data;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const name = bytes.subarray(offset, offset + 4).toString("ascii"), length = bytes.readUInt32LE(offset + 4), start = offset + 8;
    assert.ok(start + length <= bytes.length, "WAV chunk 越界或被截断。");
    if (name === "fmt ") { assert.ok(length >= 16); format = { encoding: bytes.readUInt16LE(start), channels: bytes.readUInt16LE(start + 2), sampleRate: bytes.readUInt32LE(start + 4), blockAlign: bytes.readUInt16LE(start + 12) }; }
    if (name === "data") data = bytes.subarray(start, start + length);
    offset = start + length + length % 2;
  }
  assert.ok(format && [1, 3, 65534].includes(format.encoding) && format.channels > 0 && format.channels <= 8 && format.sampleRate >= 8000 && format.sampleRate <= 192000 && format.blockAlign > 0, "WAV 缺少有效音频格式。");
  assert.ok(data?.length > format.blockAlign * 100 && data.some(value => value !== 0), "WAV 缺少实际音频采样。");
  return { bytes: bytes.byteLength, format: "wav", ...format, durationSeconds: data.length / format.blockAlign / format.sampleRate };
}

function httpClient(baseUrl) {
  let cookie = "";
  return async function request(endpoint, { body, expected = [200], binary = false, timeoutMs = 25_000, headers = {}, unvalidatedPayload = false } = {}) {
    assert.ok(endpoint.startsWith("/") && !endpoint.startsWith("//"), "只允许同源业务路由。");
    const response = await fetch(`${baseUrl}${endpoint}`, { method: body === undefined ? "GET" : "POST", redirect: "manual", signal: AbortSignal.timeout(timeoutMs),
      headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const cookies = response.headers.getSetCookie?.() || [];
    if (cookies.length) cookie = cookies.map(value => value.split(";", 1)[0]).join("; ");
    assert.ok(expected.includes(response.status), `${endpoint.split("?")[0]} HTTP ${response.status}，已停止，不自动重试。`);
    if (binary) return { response, bytes: Buffer.from(await response.arrayBuffer()) };
    const text = await response.text(); let payload;
    try { payload = JSON.parse(text); } catch { payload = unvalidatedPayload ? text : null; }
    if (response.ok && !unvalidatedPayload) assert.ok(payload && typeof payload === "object", "业务接口未返回 JSON。");
    return { response, payload };
  };
}
async function login(baseUrl, actor) {
  const client = httpClient(baseUrl);
  const { response, payload } = await client("/api/auth/login", { body: { username: actor.username, password: actor.password } });
  assert.equal(payload?.ok, true); assert.equal(payload.user?.accountKind, "normal"); assert.equal(payload.user.id, actor.user.id);
  assert.equal(payload.user.role, actor.role); assert.equal(payload.user.institutionId, actor.user.institutionId);
  assert.match(response.headers.getSetCookie().join(" "), /HttpOnly/iu);
  if (new URL(baseUrl).protocol === "https:") assert.match(response.headers.getSetCookie().join(" "), /Secure/iu);
  return client;
}
async function envelope(client, endpoint, options = {}) {
  const { payload } = await client(endpoint, options); assert.equal(payload?.ok, true, `${endpoint.split("?")[0]} 响应缺少成功 envelope。`); return payload.data;
}

export function buildStoryRequest(snapshot, childId, actorKey) {
  const child = snapshot.children?.find(item => item.id === childId);
  assert.ok(child, "所选合成儿童不在当前普通账号授权快照中。");
  const groups = [["health", "健康晨检"], ["meals", "饮食记录"], ["growth", "成长观察"], ["feedback", "家庭反馈"]];
  const sourceRecords = groups.flatMap(([key, title]) => (snapshot[key] || []).filter(row => row.childId === childId).map(row => ({
    id: row.id || row.recordId || row.feedbackId, date: row.createdAt || row.submittedAt || row.date || "", source: key, title,
    detail: row.description || row.content || row.remark || (key === "meals" ? `${row.meal || "餐食"}：${(row.foods || []).map(food => food.name).filter(Boolean).join("、")}` : key === "health" ? `体温 ${row.temperature}°C；情绪 ${row.mood || "未注明"}` : ""),
  }))).filter(row => row.id && row.detail).sort((a, b) => b.date.localeCompare(a.date));
  assert.ok(sourceRecords.length > 0, "先完成真实教师记录/家庭反馈流程；不伪造儿童经历供 AI 验收。");
  return { sourceRecordIds: [...new Set(sourceRecords.map(row => row.id))], payload: {
    childId, requestSource: `${actorKey === "teacherA1" ? "teacher" : "parent"}-storybook-page:production-real-matrix`, generationMode: "child-personalized", pageCount: 4,
    stylePreset: "sunrise-watercolor", styleMode: "preset", snapshot: { child: { id: child.id, name: child.name, className: child.className }, summary: { growth: { recordCount: (snapshot.growth || []).filter(row => row.childId === childId).length, topCategories: [] }, feedback: { count: (snapshot.feedback || []).filter(row => row.childId === childId).length, keywords: [] } }, recentDetails: sourceRecords.slice(0, 10), ruleFallback: [] },
    highlightCandidates: sourceRecords.slice(0, 4).map((row, index) => ({ kind: row.source === "feedback" ? "guardianFeedback" : "todayGrowth", title: row.title, detail: row.detail, priority: index + 1, source: row.source })),
  } };
}

async function run(options) {
  const manifest = await jsonFile(options.manifest); validateMatrixManifest(manifest);
  const baseUrl = safeOrigin(options.baseUrl || manifest.baseUrl); assert.equal(baseUrl, safeOrigin(manifest.baseUrl));
  assert.ok(["teacherA1", "parentA1"].includes(options.actor), "仅允许同班教师或对应家长创建验收绘本。");
  const child = manifest.accounts.parentA1.children[options.childIndex]; assert.ok(child, "child-index 超出 parentA1 的合成儿童范围。");
  let state = await optionalJson(options.progress);
  if (state) {
    assert.equal(state.version, 1); assert.equal(state.baseUrl, baseUrl); assert.equal(state.childId, child.id);
    assert.equal(state.actorKey, options.actor); assert.equal(state.actorUserId, manifest.accounts[options.actor].user.id);
  } else {
    assert.ok(!options.verifyOnly && !options.reconcileOnly, "只读或恢复模式需要已有任务进度；不会创建或生成新绘本。");
    state = { version: 1, taskId: randomUUID(), baseUrl, actorKey: options.actor, actorUserId: manifest.accounts[options.actor].user.id,
      childId: child.id, createdAt: nowIso(), stage: "new", calls: [], checks: [], timings: {}, story: null, sourceRecordIds: [], saved: false };
  }
  const report = { taskId: state.taskId, baseUrl, mode: options.reconcileOnly ? "reconcile-only" : options.verifyOnly ? "verify-only" : "real-ai", startedAt: nowIso(), status: "running", checks: [], paidAiRequestsThisRun: 0,
    notes: ["仅使用独立合成账号与儿童。", "费用字段为已核验上限的预留，不冒充供应商实际账单。", "不启动独立浏览器；真实 Chrome 播放与视觉验收由主任务另行完成。"] };
  const persist = () => atomicJson(options.progress, state);
  const check = (name, details) => { report.checks.push({ name, status: "passed", ...(details ? { details } : {}) }); };
  try {
    const pricing = options.pricing ? await jsonFile(options.pricing) : state.budget?.pricing;
    const expectedModels = validateModelIdentities(pricing?.models);
    if (state.budget) assert.deepEqual(state.budget.pricing.models, expectedModels, "已有任务的模型身份不能静默变化；改用独立任务或核验原发布配置。");
    if (!options.verifyOnly && !options.reconcileOnly) {
      validatePricing(pricing, options.capCny);
      const bookMaximum = validatePricing(pricing, options.capCny);
      // 先为整册一文四图四音预留。HTTP 轮询有可能只补一类媒体，不能把未开始的
      // 另一类重复记费；服务端幂等租约 + 失败即停 + 单调进展共同限制实际生成次数。
      if (!state.budget) state.budget = { capCny: options.capCny, reservedCny: bookMaximum, pricing, maximumForOneTextFourImagesFourAudioCny: bookMaximum, actualBilledCny: null };
      assert.deepEqual(state.budget.pricing.maxCny, pricing.maxCny, "恢复任务的费用上界不能静默变化；请先核对原预留账本。");
      state.budget.pricing = pricing;
      state.budget.capCny = Math.min(state.budget.capCny, options.capCny);
      assert.ok(state.budget.reservedCny <= state.budget.capCny);
      assert.ok(!state.calls.some(call => ["pending", "unknown"].includes(call.status)), "已有请求结果未知；仅允许 verify-only，不重发收费请求。");
    }
    await persist();
    const creator = await login(baseUrl, manifest.accounts[options.actor]);
    // 独立登录的家长会话，不能拿创建者的 Cookie 冒充家长可读。
    const parent = await login(baseUrl, manifest.accounts.parentA1);
    const otherParentSession = await login(baseUrl, manifest.accounts.parentA1);
    const parentA2 = await login(baseUrl, manifest.accounts.parentA2), parentB1 = await login(baseUrl, manifest.accounts.parentB1), anonymous = httpClient(baseUrl);
    check("normal accounts and independent parent sessions authenticated");

    async function paid(stage, amount, action, validate) {
      assert.ok(!options.verifyOnly && options.ai, "只读模式禁止 AI 路由。");
      assert.ok(state.budget.reservedCny <= state.budget.capCny && state.budget.reservedCny <= MAX_RESERVED_CNY && amount <= state.budget.reservedCny, "费用预留已达上限，未发出请求。");
      const revalidating = state.calls.some(call => call.status === "received-needs-validation");
      const value = await executePaidStoryRequest({ state, stage, amount, action, validate, persist, onRequestStarted: () => { report.paidAiRequestsThisRun += 1; } });
      if (revalidating) report.savedResponsesRevalidatedThisRun = (report.savedResponsesRevalidatedThisRun || 0) + 1;
      return value;
    }
    async function saveStory() {
      state.saved = false; await persist();
      const saved = await envelope(creator, "/api/storybooks", { body: { storybookId: state.story.storyId, childId: child.id, generatedAt: state.story.generatedAt, sourceRecordIds: state.sourceRecordIds, response: state.story }, expected: [201] });
      assert.equal(saved.storybookId, state.story.storyId); assertStoryText(embeddedStory(saved), child.id, expectedModels.text);
      state.saved = true; state.savedAt = nowIso(); await persist();
    }
    const bookEndpoint = () => `/api/storybooks/${encodeURIComponent(state.story.storyId)}`;
    if (options.reconcileOnly) {
      assert.match(options.expectedCommit || "", /^[a-f0-9]{40}$/u, "免费恢复需显式指定修复后候选的完整SHA。");
      const { payload: health } = await anonymous("/api/health"); assert.equal(health.deployment?.commitSha, options.expectedCommit); report.candidateCommit = options.expectedCommit;
      const previous = receivedStoryForReconciliation(state, expectedModels.text), before = mediaReadiness(previous.story);
      const reconciliation = { id: randomUUID(), previousRequestId: previous.requestId, startedAt: nowIso(), mode: "provider-generation-forbidden", status: "started-result-unknown" };
      state.reconciliations ??= []; state.reconciliations.push(reconciliation); await persist();
      const { payload, response } = await creator("/api/ai/parent-storybook/media-status", { body: { childId: child.id, storyId: previous.story.storyId, story: previous.story, prioritySceneIndices: [1, 2, 3, 4], retryFailed: false, reconcileOnly: true }, timeoutMs: 65_000 });
      reconciliation.responseBody = payload; reconciliation.status = "received-needs-validation"; await persist();
      assert.equal(response.headers.get("x-storybook-reconcile-only"), "1", "服务端未确认禁止生成模式；停止，不重复请求。");
      assertStoryText(payload, child.id, expectedModels.text); const after = mediaReadiness(payload);
      assert.ok(after.image >= before.image && after.audio >= before.audio, "免费恢复不得使已知完成媒体倒退。");
      for (const scene of payload.scenes) for (const kind of ["image", "audio"]) {
        if (scene[`${kind}Status`] !== "ready") continue;
        assert.equal(scene[`${kind}Provider`], kind === "image" ? "maas-z-image" : "maas-tts"); const url = scene[`${kind}Url`]; assert.match(url, MEDIA_PATH);
        const { response: mediaResponse, bytes } = await otherParentSession(url, { binary: true, headers: { "x-smartchildcare-require-database": "1" } });
        assert.equal(canonicalStoryMediaType(mediaResponse.headers.get("content-type")), kind === "image" ? "image/webp" : "audio/wav");
        assert.equal(mediaResponse.headers.get("x-smartchildcare-storage-mode"), "private_blob"); await inspectMediaBytes(kind, bytes);
      }
      const complete = after.image === 4 && after.audio === 4;
      assert.ok(complete || after.image > before.image || after.audio > before.audio, "未恢复任何新媒体；旧unknown不能被改成通过。");
      state.story = payload; await saveStory();
      reconciliation.status = complete ? "reconciled-complete" : "reconciled-partial"; reconciliation.validatedAt = nowIso(); reconciliation.before = before; reconciliation.after = after;
      const previousCall = state.calls.find(call => call.requestId === previous.requestId);
      previousCall.status = "superseded-by-reconciliation"; previousCall.reconciledBy = reconciliation.id;
      // 原responseBody和失败validationStatus保持原样；新结果由独立恢复记录证明，不把旧错误冒充passed。
      state.stage = reconciliation.status; await persist(); report.status = reconciliation.status;
      check("operator-requested recovery read actual durable private media without provider generation", { before, after, complete, newProviderRequests: 0 });
      if (!complete) { report.checks.push({ name: "remaining pages require separately authorized generation", status: "blocked", reason: "免费恢复只处理已有成果，不生成尚无成果的页。" }); process.exitCode = 1; }
      return;
    }
    if (options.verifyOnly) {
      assert.ok(state.story?.storyId, "任务尚无可读取的绘本 ID，不能猜测或重新生成。");
      const saved = await envelope(parent, bookEndpoint()); state.story = embeddedStory(saved); assertStoryText(state.story, child.id, expectedModels.text);
      assert.deepEqual(mediaReadiness(state.story), { image: 4, audio: 4 }, "重启后保存结果仍未完整，不调用 AI 补齐。");
      check("saved complete book reopened without any AI request");
    } else {
      if (!state.story) {
        let input;
        if (!state.calls.some(call => call.stage === "text" && call.status === "received-needs-validation")) {
          const { payload: stateBody } = await creator("/api/state"); assert.equal(stateBody.ok, true);
          input = buildStoryRequest(stateBody.snapshot, child.id, options.actor); state.sourceRecordIds = input.sourceRecordIds; state.textStartedAt = nowIso(); await persist();
        }
        await paid("text", state.budget.pricing.maxCny.text, async () => {
          assert.ok(input, "恢复已有正文时不应发出新的文字请求。");
          const { payload } = await creator("/api/ai/parent-storybook", { body: input.payload, timeoutMs: 90_000, unvalidatedPayload: true }); return payload;
        }, payload => assertStoryText(payload, child.id, expectedModels.text));
        state.timings.textResponseMs = state.calls.at(-1).elapsedMs;
      } else assertStoryText(state.story, child.id, expectedModels.text);
      const initialReady = mediaReadiness(state.story), initialObservedMs = Date.now() - Date.parse(state.textStartedAt || state.createdAt);
      state.timings.initialReadyMedia ??= initialReady;
      if (initialReady.image > 0) state.timings.firstImageReadyMs ??= initialObservedMs;
      if (initialReady.audio > 0) state.timings.firstAudioReadyMs ??= initialObservedMs;
      if (initialReady.image === 4) state.timings.allImagesReadyMs ??= initialObservedMs;
      if (initialReady.audio === 4) state.timings.allAudioReadyMs ??= initialObservedMs;
      // 文字返回后立即独立保存，然后再生成媒体；刷新恢复不依赖浏览器内存。
      await saveStory(); check("real MaaS text persisted before completing media");
      let readiness = mediaReadiness(state.story);
      while (readiness.image < 4 || readiness.audio < 4) {
        assertNoMediaFailure(state.story);
        assert.ok(state.calls.filter(call => call.stage === "media").length < MAX_MEDIA_ROUNDS || state.calls.some(call => call.stage === "media" && call.status === "received-needs-validation"), "已达八轮单调补齐上限；未完成的页停止处理，不自动增加调用。");
        const current = [...state.story.scenes].sort((a, b) => a.sceneIndex - b.sceneIndex).find(scene => scene.imageStatus !== "ready" || scene.audioStatus !== "ready");
        assert.ok(current, "媒体状态不一致，未重新生成任何页面。");
        const before = readiness;
        const cost = roundMoney((before.image < 4 ? state.budget.pricing.maxCny.imagePerPage : 0) + (before.audio < 4 ? state.budget.pricing.maxCny.audioPerPage : 0));
        await paid("media", cost, async () => {
          const { payload } = await creator("/api/ai/parent-storybook/media-status", { body: { childId: child.id, storyId: state.story.storyId, prioritySceneIndices: [current.sceneIndex, ...state.story.scenes.map(scene => scene.sceneIndex).filter(index => index !== current.sceneIndex)], retryFailed: false, story: state.story }, timeoutMs: 65_000, unvalidatedPayload: true });
          return payload;
        }, payload => {
          assertStoryText(payload, child.id, expectedModels.text); assertNoMediaFailure(payload);
          const after = mediaReadiness(payload);
          assert.ok(after.image >= before.image && after.audio >= before.audio, "已完成媒体倒退，禁止再次调用以免重新收费。");
          assert.ok(after.image - before.image <= 1 && after.audio - before.audio <= 1, "单轮超出一图一音频契约；停止后续收费请求。");
          assert.ok(after.image > before.image || after.audio > before.audio, "本轮未返回可验证媒体进展，已停止而非自动重复调用。");
        });
        readiness = mediaReadiness(state.story);
        const observedMs = Date.now() - Date.parse(state.textStartedAt || state.createdAt);
        if (readiness.image > 0 && state.timings.firstImageReadyMs === undefined) state.timings.firstImageReadyMs = observedMs;
        if (readiness.audio > 0 && state.timings.firstAudioReadyMs === undefined) state.timings.firstAudioReadyMs = observedMs;
        if (readiness.image === 4) state.timings.allImagesReadyMs ??= observedMs;
        if (readiness.audio === 4) state.timings.allAudioReadyMs ??= observedMs;
        await persist();
        // 即使部分页成功，任何未知/失败也先停止；不在后续轮询里顺手重复收费。
        assertNoMediaFailure(state.story);
        assert.ok(readiness.image >= before.image && readiness.audio >= before.audio, "已完成媒体倒退，禁止再次调用以免重新收费。");
        assert.ok(readiness.image - before.image <= 1 && readiness.audio - before.audio <= 1, "单轮超出一图一音频契约；停止后续收费请求。");
        assert.ok(readiness.image > before.image || readiness.audio > before.audio, "本轮未返回可验证媒体进展，已停止而非自动重复调用。");
        await saveStory();
        if (readiness.image < 4 || readiness.audio < 4) {
          const retryAfterMs = Math.max(0, ...["image", "audio"].map(channel => Number(state.story.providerMeta.diagnostics?.[channel]?.retryAfterMs) || 0));
          assert.ok(retryAfterMs <= 60_000, "服务端要求长退避，停止本轮；可稍后复用同一进度文件。");
          await wait(Math.max(1500, retryAfterMs));
        }
      }
      assert.equal(state.story.providerMeta.imageDelivery, "real"); assert.equal(state.story.providerMeta.audioDelivery, "real");
      state.timings.bookCompleteMs = Date.now() - Date.parse(state.textStartedAt || state.createdAt);
      check("four images and four audio tracks completed with retryFailed=false", mediaReadiness(state.story));
    }

    const reopened = await envelope(otherParentSession, bookEndpoint()); const reopenedStory = embeddedStory(reopened);
    assertStoryText(reopenedStory, child.id, expectedModels.text); assert.equal(reopenedStory.storyId, state.story.storyId); assert.deepEqual(mediaReadiness(reopenedStory), { image: 4, audio: 4 });
    check("another authorized parent session can reopen the complete stored story");
    const listed = await envelope(parent, `/api/storybooks?childId=${encodeURIComponent(child.id)}`); assert.ok(listed.some(book => book.storybookId === state.story.storyId));
    for (const [name, client] of [["parentA2", parentA2], ["parentB1", parentB1], ["anonymous", anonymous]]) {
      await client(bookEndpoint(), { expected: name === "anonymous" ? [401] : [403, 404] });
      await client(`${bookEndpoint()}/export?format=json`, { expected: name === "anonymous" ? [401] : [403, 404] });
      check(`${name} cannot read or export the story`);
    }
    for (const scene of reopenedStory.scenes) for (const kind of ["image", "audio"]) {
      const url = kind === "image" ? scene.imageUrl : scene.audioUrl; assert.match(url, MEDIA_PATH);
      assert.equal(scene[`${kind}Provider`], kind === "image" ? "maas-z-image" : "maas-tts");
      const { response, bytes } = await otherParentSession(url, { binary: true, headers: { "x-smartchildcare-require-database": "1" } });
      assert.equal(canonicalStoryMediaType(response.headers.get("content-type")), kind === "image" ? "image/webp" : "audio/wav");
      assert.equal(response.headers.get("x-smartchildcare-storage-mode"), "private_blob"); assert.match(response.headers.get("cache-control") || "", /private/iu);
      const details = await inspectMediaBytes(kind, bytes); check(`scene ${scene.sceneIndex} ${kind}: decoded real bytes from private Blob`, details);
      for (const [name, client] of [["parentA2", parentA2], ["parentB1", parentB1], ["anonymous", anonymous]]) {
        await client(url, { expected: name === "anonymous" ? [401] : [403, 404], binary: true });
        check(`scene ${scene.sceneIndex} ${kind}: ${name} denied`);
      }
    }
    if (!options.verifyOnly) {
      for (const format of ["json", "markdown", "html", "print-html", "share-text"]) {
        const exported = await envelope(parent, `${bookEndpoint()}/export?format=${format}`);
        assert.equal(exported.kind, "download"); assert.equal(exported.format, format); assert.equal(exported.childId, child.id);
        assert.ok(exported.filename && exported.mimeType && typeof exported.content === "string" && exported.content.includes(state.story.title));
        if (format === "json") assert.equal(JSON.parse(exported.content).storybookId, state.story.storyId);
        check(`existing ${format} export route produces the saved story`);
      }
      for (const [name, client] of [["parentA2", parentA2], ["parentB1", parentB1], ["anonymous", anonymous]]) {
        await client(`${bookEndpoint()}/share`, { body: {}, expected: name === "anonymous" ? [401] : [403, 404] });
        check(`${name} cannot share the story`);
      }
      const shared = await envelope(parent, `${bookEndpoint()}/share`, { body: { summary: state.story.summary } });
      assert.equal(shared.kind, "share-text"); assert.equal(shared.storybookId, state.story.storyId); assert.equal(shared.childId, child.id);
      assert.equal(shared.externalService, "unavailable"); assert.ok(shared.copyText?.includes(state.story.title));
      const sharedRead = await envelope(otherParentSession, bookEndpoint()); assert.ok(sharedRead.share?.localText?.includes(state.story.title));
      check("existing share route persists truthful share text, without inventing an external public service");
    } else report.notes.push("verify-only 未重复调用保存/分享 POST 或 AI 路由；导出分享的先前结果见首轮报告。");
    if (options.verifyOnly) for (const call of state.calls.filter(item => ["pending", "unknown"].includes(item.status))) {
      call.status = "recovered-read-only"; call.recoveredAt = nowIso(); call.resolution = "Complete saved book and all eight private media validated without replay; actual billing remains unconfirmed.";
    }
    state.stage = "passed"; state.verifiedAt = nowIso(); await persist(); report.status = "passed";
  } catch (error) {
    // 不记录原始请求/响应、口令或 Cookie；未完成调用保留在私有进度文件中供人工核验。
    report.status = "stopped"; report.error = error instanceof Error ? error.message : "验收未完成";
    report.stopBoundary = state.stage;
    report.checks.push({ name: "matrix stopped without retry", status: "failed", error: report.error });
    state.lastFailure = { at: nowIso(), reason: report.error }; await persist(); process.exitCode = 1;
  } finally {
    report.finishedAt = nowIso(); report.timings = state.timings; report.budget = state.budget ? { capCny: state.budget.capCny, reservedCny: state.budget.reservedCny, actualBilledCny: null, evidence: state.budget.pricing.evidence, maximumForOneTextFourImagesFourAudioCny: state.budget.maximumForOneTextFourImagesFourAudioCny } : null;
    report.requestDurations = state.calls.map(({ stage, status, elapsedMs, maximumWithinBookReservationCny, validationStatus }) => ({ stage, status, elapsedMs: elapsedMs ?? null, maximumWithinBookReservationCny, ...(validationStatus ? { validationStatus } : {}) }));
    report.notes.push("每次 HTTP 请求的 maximumWithinBookReservationCny 是整册预留内的潜在生成上限，不能相加当作实际账单。paidAiRequestsThisRun 统计可能收费的业务 HTTP 请求，不是供应商实际计费次数。");
    report.timingsMeaning = "客户端观察的文本响应、首图/首音频可读、四图/四音频全部可读耗时；不是供应商内部推理耗时。跨次恢复时包含间隔时间。";
    await atomicJson(options.report, report);
    console.log(JSON.stringify({ mode: report.mode, status: report.status, checks: report.checks.length, paidAiRequestsThisRun: report.paidAiRequestsThisRun, reservedCny: report.budget?.reservedCny ?? 0, actualBilledCny: null, report: options.report, progress: options.progress }, null, 2));
  }
}

async function main() {
  const execute = process.argv.includes("--execute"), ai = process.argv.includes("--ai"), verifyOnly = process.argv.includes("--verify-only"), reconcileOnly = process.argv.includes("--reconcile");
  const options = { ai, verifyOnly, reconcileOnly, expectedCommit: arg("--expected-commit-sha", ""), actor: arg("--actor", "teacherA1"), childIndex: Number(arg("--child-index", "0")), baseUrl: arg("--base-url", ""),
    capCny: Number(arg("--budget-cny", "5")), manifest: artifactPath(arg("--manifest", `${DEFAULT_ARTIFACT}/real-matrix.private.json`)),
    progress: artifactPath(arg("--progress", `${DEFAULT_ARTIFACT}/storybook-media-real.private.json`)),
    report: artifactPath(arg("--report", `${DEFAULT_ARTIFACT}/storybook-media-real-report.json`)),
    pricing: arg("--pricing-file", "") ? artifactPath(arg("--pricing-file", "")) : null };
  if (!execute) {
    console.log(JSON.stringify({ mode: "plan-only", maxReservedCny: MAX_RESERVED_CNY, actor: options.actor, childIndex: options.childIndex,
      actions: ["读取已有 8 角色普通账号 manifest 与合成儿童真实记录", "生成 1 册 4 页文字并先保存", "整册预留一文四图四音的费用上界，最多 8 轮单调补齐，每轮至多一图一音频，retryFailed=false，当前页优先", "检查 4 个 WebP 与 4 个 WAV 的真实字节及私有 Blob", "独立家长会话重开；同机构其他家长/跨机构家长/匿名均拒绝", "验证保存、五种导出格式和分享文本", "2xx正文先原子保留为received-needs-validation；验证失败仅重验原body，任意未知立即停止，不自动重试收费请求"],
      execute: "--execute --ai --pricing-file=artifacts/.../verified-pricing.json", verifyAfterRestart: "--execute --verify-only（不调用任何 AI 路由）", reconcile: "--execute --reconcile --expected-commit-sha=<修复后SHA>（只恢复已有成果，不调用生成器）",
      allowedVerifiedTextModels: VERIFIED_TEXT_MODELS, expectedTextModel: "读取 verified-pricing.json 的 models.text；真实响应必须逐字一致",
      pricingSchema: { currency: "CNY", provider: "maas", models: MODELS, verifiedAt: "实际核验时间 ISO", evidence: "实际价格/配额证据路径或网址", verifiedForFourPagesAndServerTokenLimits: true, maxCny: { text: "正数：单次文本最大费用", imagePerPage: "正数：单页图片最大费用", audioPerPage: "正数：单页音频最大费用" } },
      requestsMade: 0, manifest: options.manifest, progress: options.progress, report: options.report }, null, 2)); return;
  }
  assert.equal([ai, verifyOnly, reconcileOnly].filter(Boolean).length, 1, "执行时必须三选一：--ai、--verify-only或--reconcile。");
  assert.ok(Number.isInteger(options.childIndex) && options.childIndex >= 0);
  assert.ok(options.capCny > 0 && options.capCny <= MAX_RESERVED_CNY);
  assert.notEqual(options.progress, options.manifest); assert.notEqual(options.report, options.manifest); assert.notEqual(options.report, options.progress);
  await mkdir(path.dirname(options.progress), { recursive: true });
  const lockPath = `${options.progress}.lock`;
  const lock = await open(lockPath, "wx", 0o600).catch(error => { if (error.code === "EEXIST") throw new Error("已有同一进度文件的任务锁，先核验原任务状态；不会并发生成或自动删除锁。"); throw error; });
  try { await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: nowIso() })); await run(options); }
  finally { await lock.close(); await unlink(lockPath); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
