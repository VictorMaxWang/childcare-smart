import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { validateMatrixManifest } from "./parent-courses-real-matrix.mjs";
import { responseContentHash } from "./core-journey-real-matrix.mjs";

// 上界根据当前路由核验：OCR后健康分析、intent、向量记忆为确定性处理，不额外调用收费模型。
export const ENTRANCE_STAGES = {
  intent: { modelCallsUpper: 0, maxReserveCny: 0 },
  vision: { modelCallsUpper: 1, maxReserveCny: 0.3 },
  diet: { modelCallsUpper: 1, maxReserveCny: 0.2 },
  health: { modelCallsUpper: 1, maxReserveCny: 0.3 },
  "teacher-voice": { modelCallsUpper: 1, maxReserveCny: 0.2, maxAudioSeconds: 3 },
  asr: { modelCallsUpper: 1, maxReserveCny: 0.2, maxAudioSeconds: 3 },
  "follow-up": { modelCallsUpper: 1, maxReserveCny: 0.2 },
  trend: { modelCallsUpper: 1, maxReserveCny: 0.2 },
  "admin-daily": { modelCallsUpper: 1, maxReserveCny: 0.2 },
  "admin-follow-up": { modelCallsUpper: 1, maxReserveCny: 0.2 },
  "admin-weekly": { modelCallsUpper: 1, maxReserveCny: 0.3 },
};
const option = (args, name, fallback) => args.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1) || fallback;
const artifactPath = file => { const resolved = path.resolve(file); assert.ok(resolved.replaceAll("\\", "/").includes("/artifacts/"), "私有日志、凭据和报告必须位于忽略的artifacts目录。"); return resolved; };
export function entrancesPlan(stages = Object.keys(ENTRANCE_STAGES)) {
  assert.ok(stages.length && stages.every(stage => stage in ENTRANCE_STAGES), "未知入口阶段。");
  return { stages: stages.map(stage => ({ stage, ...ENTRANCE_STAGES[stage] })), defaultMode: "plan-only", actors: ["teacherA1", "parentA1", "directorA"], maxTotalReserveCny: 3, browser: "none", actualModelCalls: 0 };
}
export function validateEntrancesBudget(plan, stages, now = Date.now()) {
  assert.equal(plan.currency, "CNY"); assert.ok(typeof plan.budgetId === "string" && plan.budgetId.length > 3);
  assert.ok(Number.isFinite(plan.maxTotalCny) && plan.maxTotalCny > 0 && plan.maxTotalCny <= 3, "全部入口收费预留合计必须≤3元。");
  const verified = Date.parse(plan.confirmedAt);
  assert.ok(Number.isFinite(verified) && verified <= now && now - verified < 86400000, "需最近24小时的实际计费核验。");
  assert.ok(typeof plan.pricingEvidence === "string" && plan.pricingEvidence.trim().length > 5);
  let total = 0;
  for (const stage of stages) {
    const policy = ENTRANCE_STAGES[stage]; assert.ok(policy);
    if (!policy.modelCallsUpper) continue;
    const entry = plan.requests?.[stage];
    assert.equal(entry?.includesAllInternalCalls, true, `${stage}预留必须包含内部全部调用。`);
    assert.ok(Number.isFinite(entry.reserveCny) && entry.reserveCny > 0 && entry.reserveCny <= policy.maxReserveCny, `${stage}预留超过单业务请求上限或未填写。`);
    assert.ok(Number.isInteger(entry.maxModelCalls) && entry.maxModelCalls >= policy.modelCallsUpper, `${stage}调用数上界不足。`);
    assert.ok(entry.maxOutputTokensTotal >= 6000 * entry.maxModelCalls, `${stage}预留须覆盖每次调用最多6000输出token。`);
    assert.ok(entry.maxInputTokensTotal >= 6000 * entry.maxModelCalls, `${stage}预留须覆盖输入上下文。`);
    if (policy.maxAudioSeconds) assert.ok(entry.maxAudioSeconds >= policy.maxAudioSeconds, "ASR预留按真实≤3秒音频计费，不得谎报2秒时长。");
    total += entry.reserveCny;
  }
  assert.ok(total <= plan.maxTotalCny + 1e-9);
  return Math.round(total * 10000) / 10000;
}

/** 校验归一化PCM WAV的真实数据时长，拒绝仍带流式占位长度的头部。 */
export function inspectPcmWav(input) {
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  assert.ok(bytes.length >= 44 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE");
  assert.equal(bytes.readUInt32LE(4), bytes.length - 8, "RIFF长度未归一化。");
  let format, audio;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const id = bytes.toString("ascii", offset, offset + 4), length = bytes.readUInt32LE(offset + 4), start = offset + 8;
    assert.ok(start + length <= bytes.length, "WAV chunk长度越界。");
    if (id === "fmt ") { assert.ok(length >= 16); format = { encoding: bytes.readUInt16LE(start), channels: bytes.readUInt16LE(start + 2), sampleRate: bytes.readUInt32LE(start + 4), byteRate: bytes.readUInt32LE(start + 8), bits: bytes.readUInt16LE(start + 14) }; }
    if (id === "data") audio = { length };
    offset = start + length + (length % 2);
  }
  assert.ok(format && audio && audio.length > 0); assert.equal(format.encoding, 1); assert.equal(format.channels, 1); assert.equal(format.bits, 16); assert.ok([16000, 24000, 48000].includes(format.sampleRate));
  assert.equal(format.byteRate, format.sampleRate * 2); assert.equal(audio.length % 2, 0);
  const durationMs = audio.length / format.byteRate * 1000; assert.ok(durationMs > 0 && durationMs <= 3000, "ASR合成fixture应不超过真实3秒。");
  return { ...format, dataBytes: audio.length, durationMs };
}
export function liveEntranceEvidence(body, text = "") {
  assert.ok(body && typeof body === "object");
  const trace = body.providerTrace || {}, provider = body.provider || trace.provider, model = body.model || trace.model;
  assert.notEqual(body.mock, true); assert.notEqual(body.fallback, true); assert.notEqual(trace.fallback, true);
  assert.ok(body.live === true || body.realProvider === true || trace.realProvider === true, "只有配置状态不能证明真实调用。");
  assert.ok(typeof provider === "string" && /maas/iu.test(provider), "返回的真实provider不是本轮配置的MaaS。");
  assert.ok(typeof model === "string" && model.length && !/mock|fallback|rule/iu.test(model), "缺少实际model身份。");
  assert.ok(!["mock", "fallback", "rule", "unavailable", "provided_transcript", "text_fallback"].includes(String(body.source)));
  if (text) assert.ok(text.trim().length >= 3);
  const preview = text || body.summary || body.answer || body.transcript || body.explanation || body.mealComment || "";
  return { provider, model, mode: body.mode || trace.mode || "live", source: body.source || trace.source, contentPreview: String(preview).slice(0, 240), contentSha256: responseContentHash(body), contentHashFormat: "canonical-json-v1" };
}
export function verifyIntentResult(body, role, target) {
  assert.equal(body.detectedRole, role); assert.equal(body.targetWorkflow, target); assert.match(body.ruleId, /^intent-router:/u);
  assert.ok(Array.isArray(body.matchedSignals) && body.matchedSignals.length); assert.ok(body.previewCard?.title && body.previewCard?.ctaLabel);
  assert.ok(typeof body.deeplink === "string" && body.deeplink.startsWith(`/${role}/`));
  assert.notEqual(body.realProvider, true); assert.notEqual(body.providerTrace?.realProvider, true);
  return { source: "deterministic-rule", ruleId: body.ruleId, targetWorkflow: body.targetWorkflow, actualModelCalls: 0 };
}
export function verifyTrendNumbers(body, meals, childId) {
  assert.equal(body.query.childId, childId); assert.equal(body.intent, "diet"); assert.equal(body.metric, "diet_quality_score"); assert.equal(body.windowDays, 7);
  assert.equal(body.providerTrace?.analyticsSource, "server-deterministic");
  assert.ok(typeof body.dataQuality?.source === "string" && !/demo|mock/iu.test(body.dataQuality.source));
  assert.equal(body.labels.length, 7); assert.ok(Array.isArray(body.series) && body.series.length >= 2);
  const hydration = body.series.find(series => series.id === "hydration_ml"); assert.ok(hydration); assert.equal(hydration.data.length, 7);
  let observed = 0;
  for (const point of hydration.data) {
    const actual = meals.filter(record => String(record.date).slice(0, 10) === point.date);
    assert.equal(point.rawCount, actual.length);
    if (actual.length) { observed++; assert.equal(point.missing, false); assert.equal(point.value, actual.reduce((sum, record) => sum + Number(record.waterMl || 0), 0)); }
    else { assert.equal(point.missing, true); assert.equal(point.value, null); }
  }
  assert.equal(body.dataQuality.observedDays, observed);
  for (const series of body.series) for (const point of series.data) assert.ok(point.value === null || Number.isFinite(point.value));
  return { source: "server-deterministic", verifiedSeries: "hydration_ml", observedDays: observed, numericContentSha256: responseContentHash({ labels: body.labels, series: body.series, comparison: body.comparison, trendScore: body.trendScore }) };
}
export function healthParsePersistence(body, files) {
  // 按健康材料页面既有契约包装原始签名回执，不能直接把桥接body当parseResult。
  return { summary: body.summary, riskItems: body.riskItems, followUpHints: body.followUpHints, rawResponse: body,
    provenance: { provider: body.provider, model: body.model, fallback: body.fallback, mock: body.mock, providerStatus: body.providerStatus, extractedText: body.extractedText, generatedAt: body.generatedAt, files } };
}
/** 健康材料状态沿用页面与服务端枚举；未知的parsed会退回pending，不能误判OCR未保存。 */
export function completedHealthParseRequest(body, files) {
  return { parseStatus: "completed", parseResult: healthParsePersistence(body, files) };
}
/** live说明来源证据，不说明本轮是否请求；必须使用独立布尔字段计数。 */
export function summarizeEntranceRequests(calls) {
  return {
    newBusinessModelRequests: calls.filter(call => call.actualRequestStarted === true).length,
    savedResultsRevalidated: calls.filter(call => call.actualRequestStarted === false && call.requestMode === "saved-result-revalidated-no-new-call").length,
  };
}
export async function entranceInputFingerprint(body) {
  if (!(body instanceof FormData)) return responseContentHash(body);
  const fields = [];
  for (const [name, value] of body.entries()) fields.push([name, typeof value === "string" ? value : { name: value.name, type: value.type, size: value.size, sha256: responseContentHash(new Uint8Array(await value.arrayBuffer())) }]);
  return responseContentHash(fields.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
}

export async function runAiEntrances(args) {
  const stages = [...new Set(option(args, "--stage", Object.keys(ENTRANCE_STAGES).join(",")).split(","))], plan = entrancesPlan(stages);
  if (!args.includes("--execute")) { console.log(JSON.stringify(plan, null, 2)); return; }
  assert.ok(args.includes("--ai"), "调用入口必须显式--execute --ai并提供已核实计费依据。");
  const budgetFile = option(args, "--ai-budget-plan"); assert.ok(budgetFile);
  const budget = JSON.parse(await readFile(budgetFile, "utf8")); validateEntrancesBudget(budget, stages);
  const manifest = JSON.parse(await readFile(artifactPath(option(args, "--manifest", "artifacts/implementation-20261031/real-matrix.private.json")), "utf8")); validateMatrixManifest(manifest);
  const baseUrl = manifest.baseUrl.replace(/\/+$/u, ""), target = new URL(baseUrl); assert.ok(target.protocol === "https:" || ["localhost", "127.0.0.1"].includes(target.hostname));
  const journalFile = artifactPath(option(args, "--journal", "artifacts/implementation-20261031/ai-entrances.private.json"));
  const reportFile = artifactPath(option(args, "--report", "artifacts/implementation-20261031/ai-entrances-real-report.json"));
  await mkdir(path.dirname(journalFile), { recursive: true }); const lock = await open(`${journalFile}.lock`, "wx");
  const childId = manifest.accounts.parentA1.children[0].id;
  let journal;
  const report = { kind: "ordinary-account-ai-entrances", startedAt: new Date().toISOString(), origin: baseUrl, stages, checks: [], calls: [], budget: { budgetId: budget.budgetId, maxTotalCny: budget.maxTotalCny, pricingEvidence: budget.pricingEvidence, confirmedAt: budget.confirmedAt, actualCostCny: null }, limits: ["请求费用为保守预留，实际用量须由根代理核对网关账单。", "OCR真实提取与规则健康分析分别报告，不把规则分析说成模型生成。", "公开HTTP无Brain写回读取接口；SQLite耐久性由根代理另行检查。", "HTTP验收不替代真实Chrome、移动端和重启验收。"] };
  const persist = () => writeFile(journalFile, JSON.stringify(journal, null, 2), { mode: 0o600 });
  const envelope = payload => { assert.equal(payload?.ok, true); return payload.data; };
  function client() {
    let cookie = "";
    return async (endpoint, { body, method = body === undefined ? "GET" : "POST", expected = 200, timeoutMs = 180000 } = {}) => {
      assert.ok(endpoint.startsWith("/api/") && !endpoint.startsWith("//"));
      const form = body instanceof FormData, started = performance.now();
      const response = await fetch(`${baseUrl}${endpoint}`, { method, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(timeoutMs), headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined || form ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : form ? body : JSON.stringify(body) });
      const cookies = response.headers.getSetCookie?.() || []; if (cookies.length) cookie = cookies.map(item => item.split(";", 1)[0]).join("; ");
      const payload = await response.json().catch(() => null);
      assert.equal(response.status, expected, `${method} ${endpoint} returned ${response.status}: ${payload?.error || "invalid response"}`);
      return { payload, response, elapsedMs: Math.round(performance.now() - started) };
    };
  }
  const clients = {};
  async function modelCall(stage, actor, endpoint, body, validate) {
    const inputFingerprint = await entranceInputFingerprint(body);
    const prior = journal.requests[stage];
    if (prior) {
      assert.ok(["completed", "response-received-needs-validation"].includes(prior.status), `${stage}原意图${prior.status}，禁止自动重复发送。`); assert.ok(prior.responseBody);
      assert.equal(prior.inputFingerprint, inputFingerprint, "同一入口已保存结果的输入不同，不能把旧结果当新输入通过，也不会自动重发。");
      const evidence = validate(prior.responseBody);
      journal.requests[stage] = { ...prior, status: "completed", evidence }; await persist();
      report.calls.push({ stage, ...evidence, requestMode: "saved-result-revalidated-no-new-call", actualRequestStarted: false }); return prior.responseBody;
    }
    const entry = budget.requests[stage], reserved = Object.values(journal.requests).reduce((sum, value) => sum + value.reserveCny, 0);
    assert.ok(reserved + entry.reserveCny <= budget.maxTotalCny + 1e-9);
    journal.requests[stage] = { status: "started-result-unknown", inputFingerprint, reserveCny: entry.reserveCny, modelCallsUpper: ENTRANCE_STAGES[stage].modelCallsUpper, startedAt: new Date().toISOString() }; await persist();
    const call = { stage, requestMode: "real-business-request", actualRequestStarted: true, reserveCny: entry.reserveCny, modelCallsUpper: ENTRANCE_STAGES[stage].modelCallsUpper, result: "unknown" }; report.calls.push(call);
    const response = await clients[actor](endpoint, { body });
    journal.requests[stage] = { ...journal.requests[stage], status: "response-received-needs-validation", responseBody: response.payload }; await persist();
    const evidence = validate(response.payload);
    journal.requests[stage] = { ...journal.requests[stage], status: "completed", responseBody: response.payload, evidence }; await persist();
    Object.assign(call, { elapsedMs: response.elapsedMs, result: "completed", ...evidence });
    return response.payload;
  }
  async function ordinaryMeal(foods, recordSource) {
    const saved = envelope((await clients.teacherA1("/api/records", { body: { type: "meal", childId, sourceDraftId: journal.runId, sourceRecordId: `${journal.runId}-${recordSource}`, date: journal.date, meal: "午餐", foods: foods || [{ name: "南瓜泥", category: "蔬菜", amount: "少量" }], intakeLevel: "适中", preference: "正常", waterMl: 0, notes: `${journal.runId} 合成入口验收记录。` }, expected: 201 })).payload);
    journal.mealId = saved.id; await persist(); return saved;
  }
  async function healthFixture() {
    const png = await readFile(option(args, "--ocr-image-file", "artifacts/implementation-20261031/synthetic-ocr.png"));
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    const filename = `${journal.runId}-synthetic-ocr.png`;
    const materials = envelope((await clients.teacherA1(`/api/health-materials?childId=${encodeURIComponent(childId)}`)).payload);
    const previous = materials.filter(material => material.filename === filename); assert.ok(previous.length <= 1);
    const material = previous[0] || envelope((await clients.teacherA1("/api/health-materials", { body: { childId, filename, fileType: "image/png", description: `${journal.runId} 合成OCR材料，非真实儿童资料。` }, expected: 201 })).payload);
    journal.materialId = material.materialId; await persist();
    const form = new FormData(); form.set("file", new File([png], filename, { type: "image/png" })); form.set("childId", childId); form.set("relatedType", "health-material"); form.set("relatedId", material.materialId); form.set("uploadRequestId", `${journal.runId}-health-image`);
    const attachment = envelope((await clients.teacherA1("/api/attachments/upload", { body: form, expected: 201 })).payload);
    assert.equal(attachment.metadataOnly, false); assert.equal(attachment.storageProvider, "vercel_blob"); journal.healthAttachmentId = attachment.attachmentId; await persist();
    return { material, attachment, png };
  }
  async function voiceForm() {
    const wav = await readFile(option(args, "--audio-file", "artifacts/implementation-20261031/synthetic-speech-normalized.wav"));
    const audio = inspectPcmWav(wav), form = new FormData();
    form.set("audio", new File([wav], "synthetic-speech-normalized.wav", { type: "audio/wav" })); form.set("durationMs", String(Math.round(audio.durationMs))); form.set("childId", childId); form.set("scene", "synthetic-real-entrance");
    journal.audioFixture = { ...audio, sha256: responseContentHash(wav) }; await persist(); return form;
  }
  try {
    journal = await readFile(journalFile, "utf8").then(JSON.parse).catch(error => { if (error.code !== "ENOENT") throw error; const now = new Date(); return { version: 1, origin: baseUrl, childId, runId: `qa-entrances-${randomUUID().slice(0, 12)}`, date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(now), budgetId: budget.budgetId, requests: {} }; });
    assert.equal(journal.origin, baseUrl); assert.equal(journal.childId, childId); assert.equal(journal.budgetId, budget.budgetId); await persist();
    for (const key of ["teacherA1", "parentA1", "directorA"]) {
      const actor = manifest.accounts[key], send = client(); const login = await send("/api/auth/login", { body: { username: actor.username, password: actor.password } });
      assert.equal(login.payload.ok, true); assert.equal(login.payload.user.id, actor.user.id); assert.equal(login.payload.user.role, actor.role); assert.equal(login.payload.user.accountKind, "normal"); clients[key] = send;
    }
    const child = envelope((await clients.parentA1(`/api/children/${encodeURIComponent(childId)}`)).payload);
    for (let index = 0; index < stages.length; index++) {
      const stage = stages[index], start = performance.now();
      try {
        let evidence;
        if (stage === "intent") {
          const cases = [{ actor: "teacherA1", role: "teacher", message: "给家长整理沟通草稿", target: "teacher.agent.communication" }, { actor: "parentA1", role: "parent", message: "查看孩子最近饮食趋势", target: "parent.trend.query" }, { actor: "directorA", role: "admin", message: "今日机构优先事项", target: "admin.agent.daily-priority" }];
          const routes = [];
          for (const item of cases) { const result = await clients[item.actor]("/api/ai/intent-router", { body: { message: item.message, roleHint: item.role, sourcePage: `/${item.role}/agent`, childId, institutionId: manifest.accounts[item.actor].user.institutionId } }); routes.push(verifyIntentResult(result.payload, item.role, item.target)); }
          evidence = { routes, source: "deterministic-rule", actualModelCalls: 0 };
        } else if (stage === "vision") {
          const photo = await readFile(option(args, "--vision-image-file", "public/demo-media/gpt-image2/meals/demo-meal-auto-001.webp"));
          const result = await modelCall(stage, "teacherA1", "/api/ai/vision-meal", { childId, imageDataUrl: `data:image/webp;base64,${photo.toString("base64")}` }, body => { const live = liveEntranceEvidence(body); assert.ok(Array.isArray(body.foods) && body.foods.length && body.foods.every(food => typeof food.name === "string" && food.name.trim())); return { ...live, foodCount: body.foods.length, recognizedFoods: body.foods.map(food => food.name) }; });
          const saved = await ordinaryMeal(result.foods, "vision-meal"); assert.ok(saved.foods.some(food => food.source === "ai" && /maas/iu.test(food.provider || "")));
          const parentRecords = envelope((await clients.parentA1(`/api/records?type=meal&childId=${encodeURIComponent(childId)}`)).payload); const persisted = parentRecords.find(item => item.id === saved.id); assert.ok(persisted); assert.deepEqual(persisted.foods.map(food => food.name), result.foods.map(food => food.name)); evidence = { actualModel: result.model, foodsPersisted: true, parentReadback: true, mealId: saved.id };
        } else if (stage === "diet") {
          const meal = await ordinaryMeal(undefined, "diet-meal"); const months = (new Date().getUTCFullYear() - new Date(child.birthDate).getUTCFullYear()) * 12 + new Date().getUTCMonth() - new Date(child.birthDate).getUTCMonth();
          const foods = meal.foods.map(food => ({ name: food.name, category: food.category || "其他", amount: food.amount || "少量" }));
          const input = { childName: child.name, ageText: `${months}月龄`, ageBand: "0-3岁", mealType: "午餐", mealFoods: foods, todayMeals: [{ meal: "午餐", foods, waterMl: 0 }], recentMeals: [{ date: journal.date, meal: "午餐", foods, waterMl: 0 }] };
          const result = await modelCall(stage, "teacherA1", "/api/ai/diet-evaluation", { childId, input }, body => { const evaluation = body.evaluation; const live = liveEntranceEvidence(evaluation); for (const key of ["mealScore", "todayScore", "recentScore"]) assert.ok(Number.isFinite(evaluation[key]) && evaluation[key] >= 0 && evaluation[key] <= 100); assert.ok(evaluation.suggestions?.length); return { ...live, suggestions: evaluation.suggestions.length }; });
          envelope((await clients.teacherA1(`/api/records/${encodeURIComponent(meal.id)}`, { method: "PATCH", body: { type: "meal", aiEvaluation: result.evaluation, nutritionScore: result.evaluation.mealScore } })).payload);
          const persisted = envelope((await clients.parentA1(`/api/records?type=meal&childId=${encodeURIComponent(childId)}`)).payload).find(item => item.id === meal.id); liveEntranceEvidence(persisted.aiEvaluation); assert.equal(persisted.aiEvaluation.mealScore, result.evaluation.mealScore); evidence = { evaluationPersisted: true, parentReadback: true, model: result.evaluation.model };
        } else if (stage === "health") {
          const fixture = await healthFixture();
          const result = await modelCall(stage, "teacherA1", "/api/ai/health-file-bridge", { childId, sourceRole: "teacher", fileKind: "lab-report", requestSource: "synthetic-real-entrance", traceId: journal.runId, files: [{ fileId: `${journal.runId}-ocr`, name: fixture.material.filename, mimeType: "image/png", sizeBytes: fixture.png.length, attachmentId: fixture.attachment.attachmentId }] }, body => {
            assert.notEqual(body.mock, true); assert.match(body.extractedText || "", /36[.,]5/u); assert.ok(Array.isArray(body.extractedFacts) && body.extractedFacts.length);
            const ocr = body.providerStatus?.ocr, files = body.providerStatus?.files; assert.ok(ocr && Array.isArray(files) && files.some(file => file.isRealProvider === true && file.live === true && file.fallback === false)); assert.ok(/maas/iu.test(ocr.providerName || "")); assert.ok(typeof ocr.model === "string" && ocr.model.length);
            assert.ok(body.bridgeWriteback?.childScopedArtifacts?.length); assert.ok(!(body.warnings || []).some(warning => /写回暂未完成/iu.test(warning)));
            return { ocrLive: true, ocrModel: ocr.model, extractedTextPreview: body.extractedText.slice(0, 240), analysisSource: body.live && !body.fallback ? "live-model-analysis" : "conservative-deterministic-rules", overallLive: body.live, overallFallback: body.fallback, brainWritebackReportedFailure: false, brainDurability: "requires independent SQLite verification" };
          });
          const parseRequest = completedHealthParseRequest(result, [{ attachmentId: fixture.attachment.attachmentId, name: fixture.material.filename, mimeType: "image/png", sizeBytes: fixture.png.length }]);
          envelope((await clients.teacherA1(`/api/health-materials/${encodeURIComponent(fixture.material.materialId)}/parse`, { body: parseRequest })).payload);
          const persisted = envelope((await clients.parentA1(`/api/health-materials?childId=${encodeURIComponent(childId)}`)).payload).find(item => item.materialId === fixture.material.materialId); assert.equal(persisted.parseStatus, "completed"); assert.match(persisted.parseResult.rawResponse.extractedText, /36[.,]5/u); assert.ok(persisted.parseResult.rawResponse.providerStatus?.files?.some(file => file.isRealProvider === true)); assert.notEqual(persisted.parseResult.requiresHumanReview, true); assert.equal(responseContentHash(persisted.parseResult.rawResponse), responseContentHash(result)); evidence = { ocrPersisted: true, signedResponseRetained: true, parentReadback: true, materialId: fixture.material.materialId, brainDurability: "not proven by public API" };
        } else if (stage === "teacher-voice" || stage === "asr") {
          const result = await modelCall(stage, stage === "teacher-voice" ? "teacherA1" : "parentA1", stage === "teacher-voice" ? "/api/ai/teacher-voice-upload" : "/api/ai/voice-asr", await voiceForm(), body => { const value = stage === "asr" ? envelope(body) : body; const live = liveEntranceEvidence(value, value.transcript || ""); assert.ok(typeof value.transcript === "string" && value.transcript.trim().length >= 3); if (stage === "teacher-voice") { assert.equal(value.status, "uploaded"); assert.equal(value.draftContent, value.transcript); } return { ...live, transcriptLength: value.transcript.length, durationMs: journal.audioFixture.durationMs, noFallbackTranscriptSupplied: true }; });
          const value = stage === "asr" ? result.data : result;
          if (stage === "teacher-voice") { const saved = envelope((await clients.teacherA1("/api/records", { body: { type: "growth", childId, sourceDraftId: journal.runId, sourceRecordId: `${journal.runId}-voice-growth`, category: "合成语音验收", tags: ["合成验收"], description: value.transcript, needsAttention: false }, expected: 201 })).payload); const readback = envelope((await clients.parentA1(`/api/records?type=growth&childId=${encodeURIComponent(childId)}`)).payload).find(item => item.id === saved.id); assert.equal(readback.description, value.transcript); evidence = { model: value.providerTrace.model, transcriptPersisted: true, parentReadback: true, growthId: saved.id }; }
          else evidence = { model: value.providerTrace.model, source: value.source, persistenceContract: "ASR returns transcript only; private journal retains test response" };
        } else if (stage === "follow-up") {
          const core = JSON.parse(await readFile(artifactPath(option(args, "--core-journal", "artifacts/implementation-20261031/core-journey.private.json")), "utf8")); assert.equal(core.origin, baseUrl); assert.equal(core.childId, childId);
          const previous = core.ai["suggestions-update"]?.responseBody || core.ai["suggestions-initial"]?.responseBody; assert.ok(previous?.summary, "缺少已有真实方案body，不能付费补造前置方案。");
          const body = { scope: "child", snapshot: { child: { id: childId }, summary: {}, ruleFallback: [] }, suggestionTitle: previous.summary.slice(0, 200), question: "请结合家长已经提交的执行反馈，调整今晚的一个照护动作，说明明早观察什么。", history: [{ role: "assistant", content: previous.summary }] };
          const result = await modelCall(stage, "parentA1", "/api/ai/follow-up", body, response => { const live = liveEntranceEvidence(response, response.answer || ""); assert.ok(response.nextSteps?.length && response.homeSteps?.length && response.reviewIn48h); return live; }); evidence = { model: result.model, nextSteps: result.nextSteps.length, persistenceContract: "follow-up response and Brain trace; no direct MySQL result route" };
        } else if (stage === "trend") {
          const meals = envelope((await clients.parentA1(`/api/records?type=meal&childId=${encodeURIComponent(childId)}`)).payload);
          const result = await modelCall(stage, "parentA1", "/api/ai/parent-trend-query", { childId, question: "最近7天饮食和补水趋势如何？请根据现有记录解释，不编造经历。", windowDays: 7 }, body => ({ numeric: verifyTrendNumbers(body, meals, childId), explanation: liveEntranceEvidence(body, body.explanation || "") })); evidence = { deterministicNumbers: verifyTrendNumbers(result, meals, childId), realExplanation: liveEntranceEvidence(result, result.explanation), persistenceContract: "deterministic query plus live explanation; source records persist independently" };
        } else {
          const workflow = { "admin-daily": "daily-priority", "admin-follow-up": "question-follow-up", "admin-weekly": "weekly-ops-report" }[stage];
          const visibleChildren = envelope((await clients.directorA("/api/children")).payload), visibleIds = new Set(visibleChildren.map(item => item.id));
          const result = await modelCall(stage, "directorA", "/api/ai/admin-agent", { workflow, question: "请仅依据本机构已有合成验收记录，列出当前优先处理事项、责任人及回看时间。" }, body => { const live = liveEntranceEvidence(body, body.summary || body.assistantAnswer || ""); if (body.workflow !== undefined) assert.equal(body.workflow, workflow); assert.ok(Array.isArray(body.actionItems) && body.actionItems.length); assert.equal(body.institutionScope.visibleChildren, visibleChildren.length); assert.ok(body.institutionScope.institutionName); for (const item of body.riskChildren || []) assert.ok(visibleIds.has(item.childId)); return { ...live, actionCount: body.actionItems.length }; }); evidence = { workflow, model: result.model, source: result.source, actionItems: result.actionItems.length, persistenceContract: "admin result artifact; no automatic dispatch is performed" };
        }
        report.checks.push({ stage, status: "passed", elapsedMs: Math.round(performance.now() - start), evidence });
      } catch (error) {
        report.checks.push({ stage, status: "failed", elapsedMs: Math.round(performance.now() - start), error: error.message });
        for (const pending of stages.slice(index + 1)) report.checks.push({ stage: pending, status: "blocked", reason: "前一入口失败或上游结果未知；停止后续收费，等待核查。" });
        break;
      }
      await persist();
    }
  } catch (error) { report.checks.push({ stage: "prerequisites", status: "failed", error: error.message }); }
  finally {
    report.finishedAt = new Date().toISOString(); report.passed = report.checks.filter(item => item.status === "passed").length; report.failed = report.checks.filter(item => item.status === "failed").length; report.blocked = report.checks.filter(item => item.status === "blocked").length; report.reservedTotalCny = Object.values(journal?.requests || {}).reduce((sum, entry) => sum + entry.reserveCny, 0);
    Object.assign(report, summarizeEntranceRequests(report.calls));
    await mkdir(path.dirname(reportFile), { recursive: true }); await writeFile(reportFile, JSON.stringify(report, null, 2)); await lock.close(); await unlink(`${journalFile}.lock`);
    console.log(JSON.stringify({ passed: report.passed, failed: report.failed, blocked: report.blocked, reservedTotalCny: report.reservedTotalCny, newBusinessModelRequests: report.newBusinessModelRequests, savedResultsRevalidated: report.savedResultsRevalidated, reportFile }));
  }
  if (report.failed || report.blocked) process.exitCode = 1;
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) runAiEntrances(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
