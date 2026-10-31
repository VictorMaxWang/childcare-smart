import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { validateMatrixManifest } from "./parent-courses-real-matrix.mjs";

export const CORE_STAGES = ["core", "isolation", "concurrency", "session", "ai"];
export const PAID_AI_STEPS = ["suggestions-initial", "suggestions-update", "teacher-communication", "weekly-report", "consultation-sse", "parent-reflexion"];
const DEFAULT_AI_STEPS = PAID_AI_STEPS.filter(step => step !== "parent-reflexion");
const SUGGESTION_CACHE_BASELINES = { "suggestions-cache": "suggestions-initial", "suggestions-cache-initial": "suggestions-initial", "suggestions-cache-update": "suggestions-update" };
const option = (args, name, fallback) => args.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1) || fallback;
function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, item]) => [key, canonicalJson(item)]));
  return value;
}
/** 数据库JSON键顺序不影响语义；数组顺序保留，文件仍按原始字节校验。 */
export function responseContentHash(value) {
  const bytes = typeof value === "string" || ArrayBuffer.isView(value) ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : JSON.stringify(canonicalJson(value));
  return createHash("sha256").update(bytes).digest("hex");
}
const hash = responseContentHash;
const artifactPath = file => { const resolved = path.resolve(file); assert.ok(resolved.replaceAll("\\", "/").includes("/artifacts/"), "私有清单、运行日志与报告必须位于忽略的artifacts目录。"); return resolved; };
const unique = values => [...new Set(values)];
export function coreJourneyPlan(stages = CORE_STAGES.filter(stage => stage !== "ai"), aiSteps = DEFAULT_AI_STEPS) {
  assert.ok(stages.every(stage => CORE_STAGES.includes(stage)), "未知阶段。");
  assert.ok(aiSteps.every(step => [...PAID_AI_STEPS, ...Object.keys(SUGGESTION_CACHE_BASELINES)].includes(step)), "未知AI步骤。");
  return { stages, actors: ["teacherA1", "teacherA2", "teacherB1", "parentA1", "parentA2", "parentB1"], child: "parentA1.children[0]", defaultActualAiCalls: 0, writes: ["stable health/meal/growth records", "one private image with stable uploadRequestId", "structured family feedback", "ten distinct and ten duplicate concurrent growth writes"], aiSteps, browser: "none", sessionContract: "logout clears the browser cookie; stateless signed tokens are not centrally revoked" };
}
export function validateAiBudgetPlan(plan, steps, now = Date.now()) {
  assert.equal(plan.currency, "CNY");
  assert.ok(typeof plan.budgetId === "string" && plan.budgetId.length > 3);
  assert.ok(Number.isFinite(plan.maxTotalCny) && plan.maxTotalCny > 0 && plan.maxTotalCny <= 10, "本脚本全部收费业务请求保守预留合计最多10元。");
  assert.ok(typeof plan.pricingEvidence === "string" && plan.pricingEvidence.trim().length > 5, "必须注明已核实计费的依据。");
  const confirmed = Date.parse(plan.confirmedAt);
  assert.ok(Number.isFinite(confirmed) && confirmed <= now && now - confirmed < 24 * 3600 * 1000, "计费核验须在最近24小时内。");
  let total = 0;
  for (const step of steps.filter(step => PAID_AI_STEPS.includes(step))) {
    const reservation = plan.requests?.[step];
    assert.equal(reservation?.includesAllInternalCalls, true, `${step} 预留须包含业务内部全部模型调用与输入/输出。`);
    assert.ok(Number.isFinite(reservation.reserveCny) && reservation.reserveCny > 0 && reservation.reserveCny <= 10, `${step} 缺少正的保守费用预留。`);
    total += reservation.reserveCny;
  }
  assert.ok(total <= plan.maxTotalCny + 1e-9, "所选收费步骤预留超过预算。");
  return Math.round(total * 10000) / 10000;
}
export function cookieExpiry(cookie) {
  const token = cookie.match(/(?:^|;\s*)ccs_session=([^;]+)/u)?.[1];
  assert.ok(token, "未提供ccs_session。");
  const [payload, signature] = token.split(".");
  assert.ok(payload && signature, "会话token结构无效。");
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  assert.ok(typeof decoded.userId === "string" && Number.isFinite(decoded.exp));
  return { userId: decoded.userId, expiresAt: decoded.exp * 1000 };
}
export function parseSseBlock(block) {
  const lines = block.replaceAll("\r\n", "\n").split("\n");
  const event = lines.find(line => line.startsWith("event:"))?.slice(6).trim() || "message";
  const data = lines.filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
  return data ? { event, data: JSON.parse(data) } : null;
}
export function assertLiveAi(body) {
  assert.ok(body && typeof body === "object");
  assert.notEqual(body.fallback, true); assert.notEqual(body.mock, true);
  assert.ok(!["fallback", "mock", "rule"].includes(String(body.source)), "规则/演示结果不能算真实AI成功。");
  const trace = body.providerTrace || body.evaluationMeta || {};
  assert.ok(body.source === "ai" || body.realProvider === true || trace.realProvider === true || trace.isRealProvider === true || trace.fallback === false && typeof trace.model === "string", "缺少真实模型来源证据。");
  const model = body.model || trace.model;
  assert.ok(typeof model === "string" && model.trim() && !/mock|fallback|rule/iu.test(model), "缺少有效模型身份。");
  const text = body.summary || body.finalOutput?.summary || body.coordinatorSummary?.finalConclusion || body.parentMessageDraft;
  assert.ok(typeof text === "string" && text.trim().length >= 8, "AI输出缺少有效业务内容。");
  return { model, source: body.source || trace.source || "real-provider", provider: body.provider || trace.provider || trace.llm || null, contentSha256: hash(body), contentHashFormat: "canonical-json-v1" };
}
function percentile(values, p) { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); return Math.round(sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] * 100) / 100; }

/** 仅使用普通HTTP会话，不启动浏览器。写入和收费步骤均由显式CLI选项控制。 */
export async function runCoreJourney(args) {
  const stages = unique(option(args, "--stage", args.includes("--ai") ? "core,isolation,concurrency,session,ai" : "core,isolation,concurrency,session").split(","));
  const aiSteps = unique(option(args, "--ai-steps", [...DEFAULT_AI_STEPS.slice(0, 1), "suggestions-cache", ...DEFAULT_AI_STEPS.slice(1)].join(",")).split(","));
  const plan = coreJourneyPlan(stages, aiSteps);
  if (!args.includes("--execute")) { console.log(JSON.stringify({ mode: "plan-only", ...plan }, null, 2)); return; }
  assert.ok(!stages.includes("ai") || args.includes("--ai"), "执行AI阶段必须显式 --ai。");
  const manifestFile = artifactPath(option(args, "--manifest", "artifacts/implementation-20261031/real-matrix.private.json"));
  const journalFile = artifactPath(option(args, "--journal", "artifacts/implementation-20261031/core-journey.private.json"));
  const reportFile = artifactPath(option(args, "--report", "artifacts/implementation-20261031/core-journey-real-report.json"));
  const manifest = JSON.parse(await readFile(manifestFile, "utf8")); validateMatrixManifest(manifest);
  const baseUrl = manifest.baseUrl.replace(/\/+$/u, ""), origin = new URL(baseUrl);
  assert.ok(origin.protocol === "https:" || ["localhost", "127.0.0.1"].includes(origin.hostname), "真实验收必须HTTPS。");
  await mkdir(path.dirname(journalFile), { recursive: true });
  const lock = await open(`${journalFile}.lock`, "wx").catch(() => { throw new Error("该日志已有执行者；先核实原进程状态，不能并发重放。"); });
  let journal, budget;
  const report = { kind: "ordinary-account-core-journey", startedAt: new Date().toISOString(), origin: baseUrl, stages, aiEnabled: stages.includes("ai"), checks: [], requestMetrics: [], paidBusinessRequests: [], limits: ["HTTP业务验收不替代Chrome交互、LCP或视觉验收。", "费用是核实后保守预留，不能冒充实际账单；失败或未知请求预留不会自动释放。", "当前logout仅清客户端Cookie，不提供服务端令牌全局撤销。"] };
  const persist = () => writeFile(journalFile, JSON.stringify(journal, null, 2), { mode: 0o600 });
  const check = async (name, action, dependencies = []) => {
    if (dependencies.some(key => !journal[key])) { report.checks.push({ name, status: "blocked", reason: `前置数据未完成：${dependencies.join(",")}` }); return false; }
    const start = performance.now();
    try { const evidence = await action(); report.checks.push({ name, status: "passed", elapsedMs: Math.round(performance.now() - start), ...(evidence ? { evidence } : {}) }); }
    catch (error) { report.checks.push({ name, status: "failed", error: error.message, elapsedMs: Math.round(performance.now() - start) }); }
    await persist();
    return report.checks.at(-1).status === "passed";
  };
  function newClient() {
    let cookie = "";
    const send = async (endpoint, { body, method = body === undefined ? "GET" : "POST", expected = [200], headers = {}, cookieOverride, binary = false, timeoutMs = 30000, paid = false } = {}) => {
      assert.ok(endpoint.startsWith("/api/") && !endpoint.startsWith("//"), "拒绝向站外地址发送会话。");
      const start = performance.now(), isForm = body instanceof FormData;
      const response = await fetch(`${baseUrl}${endpoint}`, { method, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(timeoutMs), headers: { ...((cookieOverride ?? cookie) ? { Cookie: cookieOverride ?? cookie } : {}), ...(body === undefined || isForm ? {} : { "content-type": "application/json" }), ...headers }, body: body === undefined ? undefined : isForm ? body : JSON.stringify(body) });
      const setCookies = response.headers.getSetCookie?.() || [];
      if (setCookies.length && cookieOverride === undefined) cookie = setCookies.map(item => item.split(";", 1)[0]).join("; ");
      report.requestMetrics.push({ method, path: endpoint.split("?")[0], status: response.status, elapsedMs: Math.round((performance.now() - start) * 100) / 100, paid });
      const payload = binary ? new Uint8Array(await response.arrayBuffer()) : await response.json().catch(() => null);
      assert.ok(expected.includes(response.status), `${method} ${endpoint.split("?")[0]} expected ${expected.join("/")}, got ${response.status}: ${binary ? "binary response" : payload?.error || "invalid envelope"}`);
      return { response, payload, cookie, elapsedMs: performance.now() - start };
    };
    return { send, getCookie: () => cookie };
  }
  const clients = {};
  async function login(key) {
    const actor = manifest.accounts[key], client = newClient();
    const { payload, response } = await client.send("/api/auth/login", { body: { username: actor.username, password: actor.password } });
    assert.equal(payload?.ok, true); assert.equal(payload.user.id, actor.user.id); assert.equal(payload.user.accountKind, "normal"); assert.equal(payload.user.role, actor.role);
    const setCookie = response.headers.getSetCookie?.().join(" ") || "";
    assert.match(setCookie, /HttpOnly/iu); assert.match(setCookie, /SameSite=Lax/iu); if (origin.protocol === "https:") assert.match(setCookie, /Secure/iu);
    return client;
  }
  const child = manifest.accounts.parentA1.children[0], childId = child.id;
  const recordBody = (type, suffix = type) => ({ type, childId, sourceDraftId: `${journal.runId}-draft`, sourceRecordId: `${journal.runId}-${suffix}`,
    ...(type === "health" ? { date: journal.date, temperature: 36.6, mood: "平稳", handMouthEye: "正常", isAbnormal: false, remark: `${journal.marker} 合成晨检，精神平稳。` } : type === "meal" ? { date: journal.date, meal: "午餐", foods: [{ name: "南瓜泥", category: "蔬菜", amount: "少量" }], intakeLevel: "适中", preference: "正常", waterMl: 0, notes: `${journal.marker} 合成进食记录。` } : { createdAt: journal.startedAt, category: "情绪表现", tags: ["合成验收"], description: `${journal.marker} 愿意与熟悉照护者平静互动，记录为合成验收数据。`, needsAttention: false, followUpAction: "家园共同记录下一次实际回应。" }),
  });
  const feedbackBody = suffix => ({ feedbackId: `${journal.runId}-feedback-${suffix}`, childId, sourceChannel: "core-real-matrix", executionStatus: "completed", executionCount: 1, executorRole: "parent", childReaction: "accepted", improvementStatus: "slight_improvement", barriers: [], notes: `${journal.marker} 合成家长反馈：照护者温和回应后，孩子愿意继续互动。${suffix}`, submittedAt: journal.startedAt, attachments: {}, relatedTaskId: undefined });
  const requireEnvelope = payload => { assert.equal(payload?.ok, true); return payload.data; };
  const recordsFor = async (client, type) => requireEnvelope((await client.send(`/api/records?type=${type}&childId=${encodeURIComponent(childId)}&includeArchived=1`)).payload);
  async function uploadForm() {
    assert.ok(journal.growthId, "缺少成长记录。");
    const file = option(args, "--image-file", "public/demo-media/gpt-image2/meals/demo-meal-auto-001.webp"), bytes = await readFile(file);
    assert.ok(bytes.length > 100 && bytes.length < 5 * 1024 * 1024);
    const form = new FormData(); form.set("file", new File([bytes], `${journal.runId}.webp`, { type: "image/webp" }));
    form.set("childId", childId); form.set("relatedType", "growth"); form.set("relatedId", journal.growthId); form.set("uploadRequestId", `${journal.runId}-growth-image`);
    return { form, bytes };
  }
  async function paidRequest(step, client, endpoint, body, sse = false) {
    const previous = journal.ai[step];
    if (previous) throw new Error(`${step} 已有${previous.status}收费意图；不会自动重发，请先核对原结果和账单。`);
    const reserveCny = budget.requests[step].reserveCny;
    const used = Object.values(journal.ai).reduce((sum, item) => sum + item.reserveCny, 0);
    assert.ok(used + reserveCny <= budget.maxTotalCny + 1e-9, "本次预留将超出10元内的明确预算。");
    journal.ai[step] = { status: "started-result-unknown", reserveCny, startedAt: new Date().toISOString() }; await persist();
    report.paidBusinessRequests.push({ step, reserveCny, result: "unknown" });
    try {
      let result;
      if (sse) {
        const start = performance.now();
        const response = await fetch(`${baseUrl}${endpoint}`, { method: "POST", headers: { Cookie: client.getCookie(), "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(body), signal: AbortSignal.timeout(180000), redirect: "manual" });
        assert.equal(response.status, 200); assert.match(response.headers.get("content-type") || "", /text\/event-stream/iu);
        const reader = response.body.getReader(), decoder = new TextDecoder(), events = []; let carry = "", bytes = 0, firstStatusMs = null;
        try { while (true) { const item = await reader.read(); if (item.done) break; bytes += item.value.byteLength; assert.ok(bytes <= 2000000, "SSE输出超过验收限额。"); carry = (carry + decoder.decode(item.value, { stream: true })).replaceAll("\r\n", "\n"); let delimiter; while ((delimiter = carry.indexOf("\n\n")) >= 0) { const event = parseSseBlock(carry.slice(0, delimiter)); carry = carry.slice(delimiter + 2); if (!event) continue; events.push(event); if (firstStatusMs === null && ["status", "text"].includes(event.event)) firstStatusMs = Math.round(performance.now() - start); } } }
        finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
        assert.ok(events.some(event => event.event === "status"), "SSE未出现真实流事件。"); assert.ok(!events.some(event => event.event === "error"), "SSE返回error事件。");
        const done = events.findLast(event => event.event === "done"); assert.ok(done, "SSE缺少done事件。");
        assert.equal(done.data.realProvider ?? done.data.providerTrace?.realProvider, true); assert.notEqual(done.data.fallback, true);
        const evidence = assertLiveAi({ ...done.data.result, providerTrace: done.data.providerTrace, realProvider: true, model: done.data.result?.model || done.data.providerTrace?.model });
        result = { body: done.data.result, evidence: { ...evidence, eventCount: events.length, firstStatusMs, completedMs: Math.round(performance.now() - start) } };
      } else {
        const response = await client.send(endpoint, { body, timeoutMs: 180000, paid: true });
        result = { body: response.payload, evidence: { ...assertLiveAi(response.payload), cache: response.response.headers.get("x-ai-cache"), elapsedMs: Math.round(response.elapsedMs) } };
      }
      // 原始成功业务body只保存于私有journal；公开报告仅包含语义哈希和模型身份。
      journal.ai[step] = { ...journal.ai[step], status: "completed", evidence: result.evidence, responseBody: result.body }; report.paidBusinessRequests.at(-1).result = "completed"; await persist(); return result;
    } catch (error) { journal.ai[step].error = error.message; await persist(); throw error; }
  }
  try {
    journal = await readFile(journalFile, "utf8").then(JSON.parse).catch(error => { if (error.code !== "ENOENT") throw error; const runId = option(args, "--run-id", `qa-journey-${randomUUID().slice(0, 12)}`), now = new Date(); assert.match(runId, /^qa-journey-[a-z0-9-]{4,50}$/u); return { version: 1, runId, marker: `SYNTHETIC-${runId}`, origin: baseUrl, childId, startedAt: now.toISOString(), date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now), ai: {} }; });
    assert.equal(journal.origin, baseUrl); assert.equal(journal.childId, childId); if (option(args, "--run-id")) assert.equal(journal.runId, option(args, "--run-id"));
    report.runId = journal.runId; await persist();
    if (stages.includes("ai")) {
      const file = option(args, "--ai-budget-plan"); assert.ok(file, "AI阶段需要计费核验与费用预留JSON。");
      budget = JSON.parse(await readFile(file, "utf8")); validateAiBudgetPlan(budget, aiSteps);
      if (journal.budgetId) assert.equal(journal.budgetId, budget.budgetId); else journal.budgetId = budget.budgetId;
      report.budget = { budgetId: budget.budgetId, maxTotalCny: budget.maxTotalCny, pricingEvidence: budget.pricingEvidence, confirmedAt: budget.confirmedAt, actualCostCny: null };
    }
    for (const key of plan.actors) clients[key] = await login(key);
    const teacher = clients.teacherA1, parent = clients.parentA1;
    if (stages.includes("core")) {
      for (const type of ["health", "meal", "growth"]) await check(`teacher creates idempotent ${type} record`, async () => {
        const record = requireEnvelope((await teacher.send("/api/records", { body: recordBody(type), expected: [201] })).payload);
        assert.ok(record.id); assert.equal(record.childId, childId); journal[`${type}Id`] = record.id;
        const replay = requireEnvelope((await teacher.send("/api/records", { body: recordBody(type), expected: [201] })).payload); assert.equal(replay.id, record.id);
        return { recordId: record.id };
      });
      await check("private attachment upload, idempotent replay and growth photo linkage", async () => {
        const { form, bytes } = await uploadForm();
        const saved = requireEnvelope((await teacher.send("/api/attachments/upload", { body: form, expected: [201], timeoutMs: 60000 })).payload);
        assert.equal(saved.metadataOnly, false); assert.equal(saved.storageMode, "object_storage"); assert.equal(saved.storageProvider, "vercel_blob");
        assert.match(saved.downloadUrl, /^\/api\/attachments\/[^/]+\/content$/u); journal.attachmentId = saved.attachmentId; journal.attachmentUrl = saved.downloadUrl; journal.imageSha256 = hash(bytes);
        const replay = requireEnvelope((await teacher.send("/api/attachments/upload", { body: (await uploadForm()).form, expected: [201], timeoutMs: 60000 })).payload); assert.equal(replay.attachmentId, saved.attachmentId);
        requireEnvelope((await teacher.send(`/api/records/${encodeURIComponent(journal.growthId)}`, { method: "PATCH", body: { type: "growth", mediaUrls: [saved.downloadUrl], mediaRefs: [saved.attachmentId] } })).payload);
        return { attachmentId: saved.attachmentId, imageSha256: journal.imageSha256 };
      }, ["growthId"]);
      await check("another parent session reads teacher health/meal/growth and private image", async () => {
        const anotherParentSession = await login("parentA1");
        for (const type of ["health", "meal", "growth"]) { const records = await recordsFor(anotherParentSession, type); assert.ok(records.some(record => record.id === journal[`${type}Id`])); }
        const growth = (await recordsFor(anotherParentSession, "growth")).find(record => record.id === journal.growthId); assert.ok(growth.mediaUrls.includes(journal.attachmentUrl));
        const image = await anotherParentSession.send(journal.attachmentUrl, { binary: true, timeoutMs: 60000 }); assert.equal(hash(image.payload), journal.imageSha256); assert.match(image.response.headers.get("cache-control") || "", /private/iu);
      }, ["healthId", "mealId", "growthId", "attachmentUrl"]);
      await check("parent execution feedback persists and teacher reads the same feedback", async () => {
        // 创建反馈按既有ApiFeedbackDetail契约返回data.feedback，不是裸记录。
        const detail = requireEnvelope((await parent.send("/api/feedback", { body: feedbackBody("core"), expected: [201] })).payload);
        assert.ok(detail.feedback && detail.child); assert.equal(detail.child.id, childId);
        const feedback = detail.feedback;
        journal.feedbackId = feedback.feedbackId || feedback.id; assert.ok(journal.feedbackId);
        const latest = requireEnvelope((await teacher.send(`/api/feedback?childId=${encodeURIComponent(childId)}`)).payload);
        assert.ok(latest.some(item => (item.feedbackId || item.id) === journal.feedbackId && item.notes.includes(journal.marker)));
      });
    }
    if (stages.includes("isolation")) {
      for (const key of ["teacherA2", "parentA2", "teacherB1", "parentB1"]) {
        const outsider = clients[key];
        await check(`${key}: foreign child record read and write denied`, async () => {
          await outsider.send(`/api/records?type=growth&childId=${encodeURIComponent(childId)}`, { expected: [403, 404] });
          await outsider.send("/api/records", { body: recordBody("growth", `forbidden-${key}`), expected: [403, 404] });
          await outsider.send(`/api/records/${encodeURIComponent(journal.growthId)}`, { method: "PATCH", body: { type: "growth", description: `${journal.marker} UNAUTHORIZED_WRITE_PROBE` }, expected: [403, 404] });
        }, ["growthId"]);
        await check(`${key}: private attachment and feedback read denied`, async () => {
          await outsider.send(journal.attachmentUrl, { expected: [403, 404], binary: true });
          await outsider.send(`/api/feedback/${encodeURIComponent(journal.feedbackId)}`, { expected: [403, 404] });
        }, ["attachmentUrl", "feedbackId"]);
      }
      await check("parent cannot create teacher-only records for its own child", async () => { await parent.send("/api/records", { body: recordBody("growth", "parent-forbidden"), expected: [403, 404] }); });
      await check("anonymous core reads, writes and private media all return 401", async () => {
        const anonymous = newClient();
        await anonymous.send(`/api/records?type=growth&childId=${encodeURIComponent(childId)}`, { expected: [401] });
        await anonymous.send("/api/records", { body: recordBody("growth", "anonymous-forbidden"), expected: [401] });
        await anonymous.send(journal.attachmentUrl, { expected: [401], binary: true });
      }, ["attachmentUrl"]);
    }
    if (stages.includes("concurrency")) {
      await check("ten distinct concurrent growth records persist without lost writes", async () => {
        const requests = Array.from({ length: 10 }, (_, index) => recordBody("growth", `parallel-distinct-${index}`));
        const settled = await Promise.allSettled(requests.map(body => teacher.send("/api/records", { body, expected: [201] })));
        assert.ok(settled.every(item => item.status === "fulfilled"), `10并发中${settled.filter(item => item.status === "rejected").length}条写入失败；已等所有请求结束再读回。`);
        const responses = settled.map(item => item.value);
        const ids = responses.map(response => requireEnvelope(response.payload).id); assert.equal(new Set(ids).size, 10);
        const records = await recordsFor(parent, "growth"); for (const id of ids) assert.equal(records.filter(record => record.id === id).length, 1);
        journal.parallelRecordIds = ids; return { persistedRecords: ids.length, p95Ms: percentile(responses.map(response => response.elapsedMs), 0.95) };
      });
      await check("ten duplicate concurrent growth submissions create one record", async () => {
        const body = recordBody("growth", "parallel-duplicate");
        const settled = await Promise.allSettled(Array.from({ length: 10 }, () => teacher.send("/api/records", { body, expected: [201] })));
        assert.ok(settled.every(item => item.status === "fulfilled"), `10并发重复提交中${settled.filter(item => item.status === "rejected").length}条请求失败。`);
        const responses = settled.map(item => item.value);
        const ids = responses.map(response => requireEnvelope(response.payload).id); assert.equal(new Set(ids).size, 1);
        const persisted = (await recordsFor(parent, "growth")).filter(record => record.sourceDraftId === body.sourceDraftId && record.sourceRecordId === body.sourceRecordId); assert.equal(persisted.length, 1);
        return { persistedRecords: persisted.length };
      });
    }
    if (stages.includes("session")) {
      await check("logout clears the ordinary browser cookie and subsequent reads return 401", async () => {
        const loggingOut = await login("parentA1"), retained = loggingOut.getCookie();
        const expiredAt = cookieExpiry(retained).expiresAt;
        const logout = await loggingOut.send("/api/auth/logout", { body: {} }); assert.equal(logout.payload.ok, true);
        assert.match(logout.response.headers.getSetCookie?.().join(" ") || "", /Max-Age=0/iu);
        await loggingOut.send("/api/auth/session", { expected: [401] });
        // 旧token重放是当前无服务端撤销表的既有契约，必须明确披露而非假称已撤销。
        const retainedRead = await loggingOut.send("/api/auth/session", { cookieOverride: retained }); assert.equal(retainedRead.payload.user.id, manifest.accounts.parentA1.user.id);
        return { clientCookieCleared: true, serverTokenRevocationSupported: false, retainedValidTokenReadableUntil: new Date(expiredAt).toISOString() };
      });
      const expiredFile = option(args, "--expired-cookie-file");
      if (!expiredFile) report.checks.push({ name: "a real signed expired session returns 401", status: "blocked", reason: "未提供私有签名过期cookie夹具；篡改签名不能冒充过期测试。" });
      else await check("a supplied signed expired session returns 401 without any signing secret", async () => {
        const expiredCookie = (await readFile(artifactPath(expiredFile), "utf8")).trim();
        const expiry = cookieExpiry(expiredCookie); assert.ok(expiry.expiresAt < Date.now()); assert.ok(Object.values(manifest.accounts).some(actor => actor.user.id === expiry.userId), "过期夹具必须属于本次合成验收账号。");
        const expired = newClient(); await expired.send("/api/auth/session", { cookieOverride: expiredCookie, expected: [401] }); await expired.send(`/api/records?type=growth&childId=${encodeURIComponent(childId)}`, { cookieOverride: expiredCookie, expected: [401] });
        return { suppliedFixtureExpiredAt: new Date(expiry.expiresAt).toISOString(), signatureProvenance: "provided by root; no server signing secret read by this script" };
      });
    }
    if (stages.includes("ai")) {
      const suggestionBody = (noise = "CLIENT_SNAPSHOT_MUST_BE_REBUILT") => ({ scope: "child", question: `${journal.marker} 请结合已保存记录，给出一个适合月龄的家庭照护动作和回看时间。`, snapshot: { child: { id: childId, name: noise }, summary: { health: { abnormalCount: 99999 }, injectedClientOnly: noise }, ruleFallback: [] } });
      for (let index = 0; index < aiSteps.length; index++) {
        const step = aiSteps[index];
        const passed = await check(`real AI: ${step}`, async () => {
        if (step in SUGGESTION_CACHE_BASELINES) {
          const baseline = SUGGESTION_CACHE_BASELINES[step];
          assert.equal(journal.ai[baseline]?.status, "completed", `先完成${baseline}对应真实建议再查缓存。`);
          const baselineFile = option(args, "--ai-baseline-body-file");
          const baselineBody = journal.ai[baseline].responseBody ?? (baselineFile ? JSON.parse(await readFile(artifactPath(baselineFile), "utf8")) : null);
          assert.ok(baselineBody, "旧journal未保存成功body，不能由旧序列化SHA推断语义相等；请明确提供原始成功body私有文件，不会重新生成。");
          const baselineEvidence = assertLiveAi(baselineBody);
          const cached = await parent.send("/api/ai/suggestions", { body: suggestionBody("DIFFERENT_FORGED_CLIENT_SNAPSHOT"), headers: { "x-ai-cache-only": "1" }, timeoutMs: 30000 });
          assert.equal(cached.response.headers.get("x-ai-cache"), "hit"); const evidence = assertLiveAi(cached.payload); assert.equal(evidence.contentSha256, baselineEvidence.contentSha256);
          return { ...evidence, baseline, cacheOnly: true, changedClientSnapshotIgnored: true };
        }
        if (step === "suggestions-initial" || step === "suggestions-update") {
          if (step === "suggestions-update") {
            assert.equal(journal.ai["suggestions-initial"]?.status, "completed", "先生成已有方案。");
            if (!journal.aiUpdateFeedbackWritten) { requireEnvelope((await parent.send("/api/feedback", { body: feedbackBody("after-ai-plan"), expected: [201] })).payload); journal.aiUpdateFeedbackWritten = true; await persist(); }
            const beforeUpdate = await parent.send("/api/ai/suggestions", { body: suggestionBody(), headers: { "x-ai-cache-only": "1" } }); assert.equal(beforeUpdate.response.headers.get("x-ai-cache"), "miss", "家庭反馈应改变可信数据版本。");
          }
          const result = await paidRequest(step, parent, "/api/ai/suggestions", suggestionBody()); assert.ok(Array.isArray(result.body.actions) && result.body.actions.length); assert.ok(result.body.actionPlan?.familyActions?.length); assert.ok(result.body.actionPlan?.reviewActions?.length); assert.ok(!JSON.stringify(result.body).includes("CLIENT_SNAPSHOT_MUST_BE_REBUILT")); return result.evidence;
        }
        if (step === "teacher-communication") {
          const result = await paidRequest(step, teacher, "/api/ai/teacher-agent", { workflow: "communication", scope: "child", targetChildId: childId, question: `${journal.marker} 请把最新一日记录与家长反馈润色成简短、具体的家园沟通文字。` }); assert.ok(typeof result.body.parentMessageDraft === "string" && result.body.parentMessageDraft.trim().length >= 8); return result.evidence;
        }
        if (step === "weekly-report") return (await paidRequest(step, teacher, "/api/ai/weekly-report", { role: "teacher", scopeType: "child", scopeId: childId, question: `${journal.marker} 只依据实际记录生成周报。`, snapshot: { institutionName: manifest.accounts.teacherA1.user.institutionId, periodLabel: "最近7天", role: "teacher", overview: {}, diet: {} } })).evidence;
        if (step === "parent-reflexion") return (await paidRequest(step, parent, "/api/ai/parent-message-reflexion", { targetChildId: childId, teacherNote: `${journal.marker} 请根据已保存记录形成家长可执行的简短反馈。` })).evidence;
        if (step === "consultation-sse") return (await paidRequest(step, teacher, "/api/ai/high-risk-consultation/stream", { targetChildId: childId, teacherNote: `${journal.marker} 合成验收，请结合真实保存记录说明需要观察的情况，不编造病情。`, currentUser: manifest.accounts.teacherA1.user, visibleChildren: [], presentChildren: [], healthCheckRecords: [], growthRecords: [], guardianFeedbacks: [] }, true)).evidence;
        }, ["healthId", "mealId", "growthId", "feedbackId"]);
        if (!passed) {
          for (const remaining of aiSteps.slice(index + 1)) report.checks.push({ name: `real AI: ${remaining}`, status: "blocked", reason: "前一AI步骤失败或结果未知；停止后续收费请求，等待核对原任务与账单。" });
          break;
        }
      }
    }
  } catch (error) { report.checks.push({ name: "execution prerequisites", status: "failed", error: error.message }); }
  finally {
    report.finishedAt = new Date().toISOString(); report.passed = report.checks.filter(item => item.status === "passed").length; report.failed = report.checks.filter(item => item.status === "failed").length; report.blocked = report.checks.filter(item => item.status === "blocked").length;
    const ordinary = report.requestMetrics.filter(item => !item.paid && !item.path.startsWith("/api/ai/")); report.nonAiLatency = { requestCount: ordinary.length, p50Ms: percentile(ordinary.map(item => item.elapsedMs), 0.5), p95Ms: percentile(ordinary.map(item => item.elapsedMs), 0.95) };
    report.reservedTotalCny = Object.values(journal?.ai || {}).reduce((sum, item) => sum + item.reserveCny, 0); report.actualCostCny = null;
    await mkdir(path.dirname(reportFile), { recursive: true }); await writeFile(reportFile, JSON.stringify(report, null, 2)); await lock.close(); await unlink(`${journalFile}.lock`);
    console.log(JSON.stringify({ passed: report.passed, failed: report.failed, blocked: report.blocked, paidBusinessRequestsStarted: report.paidBusinessRequests.length, reservedTotalCny: report.reservedTotalCny, reportFile }));
  }
  if (report.failed || report.blocked) process.exitCode = 1;
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) runCoreJourney(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
