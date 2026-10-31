import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { access, mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sourceInventory } from "./acceptance-inventory.mjs";
import { inspectPcmWav } from "./ai-entrances-real-matrix.mjs";
import { responseContentHash } from "./core-journey-real-matrix.mjs";
import { validateMatrixManifest } from "./parent-courses-real-matrix.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), ARTIFACT = "artifacts/implementation-20261031";
const STAGES = ["anonymous", "commands", "quality", "feed", "teacher-understand", "consultation-json"];
const PAID = { "teacher-understand": { reserveCny: 0.2, callsUpper: 1 }, "consultation-json": { reserveCny: 0.5, callsUpper: 1 } };
const now = () => new Date().toISOString();
const arg = (args, key, fallback) => args.find(value => value.startsWith(`${key}=`))?.slice(key.length + 1) || fallback;
const envelope = body => { assert.equal(body?.ok, true); return body.data; };
function privatePath(file) { const absolute = path.resolve(ROOT, file), relative = path.relative(path.join(ROOT, "artifacts"), absolute); assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative)); return absolute; }
async function json(file) { return JSON.parse(await readFile(file, "utf8")); }
async function optionalJson(file) { try { return await json(file); } catch (error) { if (error.code === "ENOENT") return null; throw error; } }
async function atomic(file, body) { const temp = `${file}.${randomUUID()}.tmp`; await mkdir(path.dirname(file), { recursive: true }); try { await writeFile(temp, JSON.stringify(body, null, 2), { mode: 0o600 }); await rename(temp, file); } finally { await unlink(temp).catch(error => { if (error.code !== "ENOENT") throw error; }); } }

/** 只允许本次隔离候选，避免误把补充脚本指向生产或任意第三方地址。 */
export function localOrigin(value) { const url = new URL(value); assert.equal(url.origin, "http://localhost:18080"); assert.equal(url.pathname, "/"); assert.ok(!url.username && !url.password && !url.search && !url.hash); return url.origin; }

/** 审查实际入口函数中的guard顺序；生成报告不发HTTP。新增/移位入口需重新人工审查。 */
export async function anonymousAudit() {
  const inventory = await sourceInventory(), routes = inventory.routes.filter(item => item.path.startsWith("/api/ai/"));
  const audit = [];
  for (const route of routes) {
    const source = await readFile(path.join(ROOT, route.sourceFile), "utf8");
    const start = source.search(route.path === "/api/ai/vision-meal" ? /export async function handleVisionMealRequest/u : route.path === "/api/ai/teacher-voice-understand" ? /export async function handleTeacherVoiceUnderstandRequest/u : /export\s+(?:async\s+)?function\s+(?:GET|POST)\(/u);
    assert.ok(start >= 0, `未识别入口：${route.path}`);
    const entry = source.slice(start), guard = /await\s+(?:authorizeAiRouteSession|authorizeAiRoute|dependencies\.authorize)\(/u.exec(entry);
    assert.ok(guard, `${route.path}未发现审查过的guard，禁止发送匿名请求。`);
    const charged = /(?:await\s+)?(?:forwardBrainRequest|dependencies\.forwardBrain|requestMaas\w*|requestVivo\w*)\(|\.transcribe\(/u.exec(entry);
    assert.ok(!charged || guard.index < charged.index, `${route.path}guard晚于潜在模型调用，禁止探测。`);
    for (const method of route.methods) audit.push({ path: route.path, endpoint: route.path.replace("[mediaKey]", "0".repeat(40)), method, expected: 401,
      guardLine: source.slice(0, start + guard.index).split("\n").length, sourceFile: route.sourceFile,
      beforeGuard: /teacher-voice|voice-asr|health-file-bridge|vision-meal/u.test(route.path) ? "仅原始流长度限制；空JSON不会调用模型" : "入口直接鉴权或仅计算截止时间", guardReviewedBeforeModel: true });
  }
  const courseFiles = inventory.routes.filter(item => item.path.startsWith("/api/parent/courses") || item.path.startsWith("/api/parent/course-recommendations"));
  const courseService = await readFile(path.join(ROOT, "lib/server/parent-course-service.ts"), "utf8");
  assert.match(courseService, /parentCourseScope\(request: Request\)\s*\{\s*const session = await requireSession\(request\)/u);
  for (const route of courseFiles) {
    const source = await readFile(path.join(ROOT, route.sourceFile), "utf8"); assert.match(source, /parentCourseScope\(request\)/u);
    for (const method of route.methods) audit.push({ path: route.path, endpoint: route.path.replace("[courseId]", "qa-missing-course").replace("[jobId]", "qa-missing-job"), method, expected: 401,
      sourceFile: route.sourceFile, guardReviewedBeforeModel: true, beforeGuard: "parentCourseScope首先requireSession；未鉴权不创建任务" });
  }
  const commandFile = "lib/voice-assistant/command-bus.ts", commandSource = await readFile(path.join(ROOT, commandFile), "utf8");
  for (const name of ["planAssistantCommand", "executePlannedAssistantCommand"]) assert.match(commandSource, new RegExp(`export async function ${name}\\([\\s\\S]*?\\)\\s*(?::[^\\{]+)?\\{\\s*const session = await requireSession\\(request\\)`, "u"));
  audit.push({ path: "/api/voice-assistant/commands", endpoint: "/api/voice-assistant/commands", method: "POST", expected: 401, sourceFile: commandFile,
    guardReviewedBeforeModel: true, beforeGuard: "仅readJsonBody；plan/execute先requireSession，空对象进入plan后401" });
  const legacyFile = "app/api/storybooks/lin-xiaoyu/tts/route.ts", legacy = await readFile(path.join(ROOT, legacyFile), "utf8");
  assert.match(legacy, /async function handleTts\(request: Request\)\s*\{\s*const session = await resolveRequestSession\(request\);\s*if \(!session\)/u);
  for (const method of ["GET", "POST"]) audit.push({ path: "/api/storybooks/lin-xiaoyu/tts", endpoint: "/api/storybooks/lin-xiaoyu/tts", method, expected: 401,
    sourceFile: legacyFile, beforeGuard: "handleTts先会话检查，早于静态媒体读取或TTS", guardReviewedBeforeModel: true });
  return { reviewedAt: now(), sourceAiRoutes: routes.length, sourceRelatedRoutes: courseFiles.length + 2, routes: new Set(audit.map(item => item.path)).size, operations: audit.length, expect: "全部401；不接受400/403/423替代未登录拒绝", requests: audit };
}

export function validateRemainingBudget(budget, stages, timestamp = Date.now()) {
  assert.equal(budget?.currency, "CNY"); assert.equal(budget.maxTotalCny, 0.7); assert.ok(budget.budgetId && budget.pricingEvidence);
  const verified = Date.parse(budget.confirmedAt); assert.ok(verified <= timestamp && timestamp - verified < 86400000);
  assert.deepEqual(budget.models, { text: "qwen3.8-flash", asr: "qwen-audio-3.0-asr-flash" });
  for (const stage of stages.filter(item => PAID[item])) {
    const entry = budget.requests?.[stage]; assert.equal(entry?.reserveCny, PAID[stage].reserveCny); assert.equal(entry.callsUpper, 1); assert.equal(entry.includesAllInternalCalls, true);
    if (stage === "teacher-understand") assert.ok(entry.maxAudioSeconds >= 3);
    else { assert.ok(entry.maxInputTokensTotal >= 20000); assert.ok(entry.maxOutputTokensTotal >= 6000); }
  }
}
export function verifyUnderstanding(body, model) {
  assert.equal(body?.fallback, false); assert.equal(body.providerTrace?.realProvider, true); assert.equal(body.providerTrace?.mode, "live");
  assert.equal(body.providerTrace?.model, model); assert.equal(body.model?.asr, model); assert.match(body.providerTrace?.provider || "", /maas/u);
  assert.equal(body.transcript?.fallback, false); assert.ok(body.transcript.text.trim().length >= 3); assert.equal(body.source?.asr, "provider");
  assert.equal(body.source.router, "rule"); assert.equal(body.source.chaining, "rule"); assert.equal(body.model.router, "rule-router-v1"); assert.equal(body.model.chaining, "rule-chain-v1");
  assert.ok(body.draft_items?.length && body.draft_items.every(item => item.source === "rule-chain" && item.summary));
  return { model, asr: "real-MaaS", router: "rule", chaining: "rule", transcriptLength: body.transcript.text.length, draftItems: body.draft_items.length, bodySha256: responseContentHash(body) };
}
export function verifyQuality(body, expectedChildren) {
  assert.equal(body.schemaVersion, "v1-admin-quality-metrics"); assert.equal(body.dataQuality?.totalChildren, expectedChildren); assert.equal(body.dataQuality.demoOnly, false);
  assert.ok(typeof body.source === "string" && !/demo|mock/u.test(body.source));
  const keys = ["consultationClosureRate", "followUp48hCompletionRate", "guardianFeedbackRate", "homeTaskExecutionRate", "teacherLowConfidenceRate", "morningCheckResponseLatency", "recurringIssueHeat", "suggestionEffectiveness"];
  for (const key of keys) { const metric = body[key]; assert.ok(metric?.id && Number.isFinite(metric.value)); assert.equal(metric.source?.demoOnly, false); assert.ok(Number.isFinite(metric.coverage?.eligibleCount) && Number.isFinite(metric.coverage?.observedCount)); }
  return { source: "deterministic-rule-engine", metrics: keys.length, totalChildren: expectedChildren, actualModelCalls: 0 };
}

export async function runRemaining(args) {
  const stages = [...new Set(arg(args, "--stage", "anonymous,commands,quality,feed").split(","))]; assert.ok(stages.length && stages.every(stage => STAGES.includes(stage)));
  const audit = stages.includes("anonymous") ? await anonymousAudit() : null;
  if (!args.includes("--execute")) { const plan = { mode: "plan-only", stages, browser: "none", networkRequests: 0, authorizedPaidMaximumCny: 0.7,
    paidPlan: { "teacher-understand": "1 ASR <=3sec, reserve0.2; subsequent router/chaining rule", "consultation-json": "1 text summarize <=6000 output token, reserve0.5; local memory/no paid embedding" }, anonymous: audit };
    console.log(JSON.stringify(plan, null, 2)); return plan; }
  const manifest = await json(privatePath(arg(args, "--manifest", `${ARTIFACT}/local-matrix.private.json`))); validateMatrixManifest(manifest);
  const origin = localOrigin(manifest.baseUrl), journalFile = privatePath(arg(args, "--journal", `${ARTIFACT}/local-remaining.private.json`)), reportFile = privatePath(arg(args, "--report", `${ARTIFACT}/local-remaining-report.json`));
  assert.notEqual(journalFile, reportFile); try { await access(reportFile); throw new Error("报告已存在，必须使用新报告名称，保留旧证据。"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const paidStages = stages.filter(stage => PAID[stage]); let budget = null;
  if (paidStages.length) { assert.ok(args.includes("--ai"), "收费阶段需显式--ai及已核验budget。"); budget = await json(privatePath(arg(args, "--budget-file", ""))); validateRemainingBudget(budget, paidStages); }
  await mkdir(path.dirname(journalFile), { recursive: true }); const lock = await open(`${journalFile}.lock`, "wx");
  let journal;
  try {
    journal = await optionalJson(journalFile); if (!journal) journal = { version: 1, origin, runId: `qa-remaining-${randomUUID()}`, createdAt: now(), childId: manifest.accounts.parentA1.children[0].id, writes: {}, paid: {} };
    assert.equal(journal.origin, origin); assert.equal(journal.childId, manifest.accounts.parentA1.children[0].id);
  } catch (error) { await lock.close(); await unlink(`${journalFile}.lock`); throw error; }
  const childId = journal.childId;
  const persist = () => atomic(journalFile, journal), report = { kind: "remaining-visible-ai-local", origin, startedAt: now(), stages, checks: [], calls: [], anonymousAudit: audit, limitations: ["仅隔离本地普通账号HTTP；不替代正式Chrome、录音设备、页面布局或部署后验收。", "费用是已批准预留，实际费用需主任务统一核对。", "ASR真实；理解/质量指标/命令分别标明规则，不冒充LLM。"] };
  const clients = {};
  function client() { let cookie = ""; return async (endpoint, options = {}) => {
    assert.ok(endpoint.startsWith("/api/") && !endpoint.startsWith("//")); const { body, method = body === undefined ? "GET" : "POST", expected = [200], unchecked = false } = options;
    const form = body instanceof FormData, response = await fetch(`${origin}${endpoint}`, { method, redirect: "manual", signal: AbortSignal.timeout(180000),
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined || form ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : form ? body : JSON.stringify(body) });
    const cookies = response.headers.getSetCookie?.() || []; if (cookies.length) cookie = cookies.map(item => item.split(";", 1)[0]).join("; ");
    const payload = await response.json().catch(() => null); if (!unchecked) assert.ok(expected.includes(response.status), `${method} ${endpoint.split("?")[0]} HTTP ${response.status}`); return { status: response.status, payload };
  }; }
  async function signed(key) { if (clients[key]) return clients[key]; const actor = manifest.accounts[key], send = client(), result = await send("/api/auth/login", { body: { username: actor.username, password: actor.password } });
    assert.equal(result.payload.user?.accountKind, "normal"); assert.equal(result.payload.user.id, actor.user.id); assert.equal(result.payload.user.role, actor.role); clients[key] = send; return send; }
  async function check(name, action) { const start = performance.now(); try { const evidence = await action(); report.checks.push({ name, status: "passed", elapsedMs: Math.round(performance.now() - start), evidence }); return true; }
    catch (error) { report.checks.push({ name, status: "failed", error: error.message, elapsedMs: Math.round(performance.now() - start) }); return false; } }
  async function paid(stage, actor, endpoint, body, validate) {
    let entry = journal.paid[stage]; const fingerprint = body instanceof FormData ? responseContentHash(journal.audioFixture) : responseContentHash(body);
    if (entry) { assert.equal(entry.inputFingerprint, fingerprint); assert.ok(["completed", "received-needs-validation"].includes(entry.status), "原收费请求未知，禁止重发。"); report.savedResponsesRevalidated = (report.savedResponsesRevalidated || 0) + 1; }
    else {
      const reserved = Object.values(journal.paid).reduce((sum, value) => sum + value.reserveCny, 0); assert.ok(reserved + PAID[stage].reserveCny <= budget.maxTotalCny + 1e-9);
      entry = journal.paid[stage] = { status: "started-result-unknown", reserveCny: PAID[stage].reserveCny, inputFingerprint: fingerprint, startedAt: now() }; await persist();
      report.calls.push({ stage, actualRequestStarted: true, reserveCny: entry.reserveCny });
      const result = await (await signed(actor))(endpoint, { body, unchecked: true }); entry.responseStatus = result.status; entry.responseBody = result.payload; entry.status = "received-needs-validation"; await persist();
    }
    const evidence = validate(entry.responseBody, entry.responseStatus); entry.status = "completed"; entry.evidence = evidence; await persist(); return entry.responseBody;
  }
  try {
    await persist();
    for (const stage of stages) {
      const ok = await check(stage, async () => {
        if (stage === "anonymous") {
          for (const item of audit.requests) { const send = client(), result = await send(item.endpoint, { method: item.method, body: item.method === "GET" ? undefined : {}, expected: [401] }); assert.equal(result.payload?.ok, false); }
          return { routes: audit.routes, operations: audit.operations, allStatus: 401, cookiesSent: false, modelRequestsExpected: 0 };
        }
        if (stage === "commands") {
          for (const [actor, role] of [["teacherA1", "teacher"], ["parentA1", "parent"], ["directorA", "director"]]) {
            const send = await signed(actor), planned = envelope((await send("/api/voice-assistant/commands", { body: { action: "plan", utterance: { text: "打开成长档案", inputMode: "text" }, context: { currentQuery: { childId } } } })).payload);
            assert.equal(planned.command.intent, "navigate"); assert.equal(planned.command.role, role); assert.equal(planned.command.status, "ready"); assert.equal(planned.command.requiredConfirmation, false);
            const done = envelope((await send("/api/voice-assistant/commands", { body: { action: "execute", command: planned.command } })).payload); assert.equal(done.command.status, "executed"); assert.ok(done.deeplink.startsWith("/growth"));
          }
          const teacher = await signed("teacherA1"), parent = await signed("parentA1"), child = envelope((await parent(`/api/children/${encodeURIComponent(childId)}`)).payload);
          for (const [key, actor, intent, utterance, listPath] of [
            ["growth", "teacherA1", "create_growth_record", `新增${child.name}成长，${journal.runId}今天尝试自己用勺子进食。`, `/api/records?type=growth&childId=${encodeURIComponent(childId)}`],
            ["feedback", "parentA1", "create_feedback", `提交${child.name}反馈，${journal.runId}今天家庭执行平稳。`, `/api/feedback?childId=${encodeURIComponent(childId)}`],
          ]) {
            const send = await signed(actor); let write = journal.writes[key];
            if (!write) { const planned = envelope((await send("/api/voice-assistant/commands", { body: { action: "plan", utterance: { text: utterance, inputMode: "text" }, context: { currentQuery: { childId } } } })).payload);
              assert.equal(planned.command.intent, intent); assert.equal(planned.command.status, "needs_confirmation"); assert.ok(planned.command.confirmationToken);
              write = journal.writes[key] = { status: "planned", command: planned.command }; await persist(); }
            if (write.status === "planned") {
              const unconfirmed = await send("/api/voice-assistant/commands", { body: { action: "execute", command: write.command, confirmed: false }, expected: [422] }); assert.equal(unconfirmed.payload.code, "needs_confirmation");
              const tampered = structuredClone(write.command); tampered.params[key === "growth" ? "description" : "content"] += "篡改";
              await send("/api/voice-assistant/commands", { body: { action: "execute", command: tampered, confirmed: true }, expected: [422] });
              write.status = "started-result-unknown"; await persist();
              write.result = envelope((await send("/api/voice-assistant/commands", { body: { action: "execute", command: write.command, confirmed: true } })).payload);
              write.status = "completed"; await persist();
            }
            assert.equal(write.status, "completed", "未知写入只可人工核验，不能重新执行。"); assert.equal(write.result.command.status, "executed");
            const replay = await send("/api/voice-assistant/commands", { body: { action: "execute", command: write.command, confirmed: true }, expected: [422] }); assert.equal(replay.payload.code, "needs_confirmation");
            const records = envelope((await (key === "growth" ? parent : teacher)(listPath)).payload), matched = records.filter(item => JSON.stringify(item).includes(journal.runId));
            assert.equal(matched.length, 1, "必须只持久化一条命令结果，且另一角色能读回。");
          }
          for (const key of ["teacherA2", "teacherB1", "parentA2", "parentB1"]) { const send = await signed(key), forged = structuredClone(journal.writes.growth.command); forged.role = key.startsWith("parent") ? "parent" : "teacher";
            const plan = envelope((await send("/api/voice-assistant/commands", { body: { action: "plan", command: forged } })).payload); assert.equal(plan.command.status, "forbidden");
            await send("/api/voice-assistant/commands", { body: { action: "execute", command: forged, confirmed: true }, expected: [403] }); }
          return { navigationRoles: 3, confirmedWrites: 2, noConfirmAndTamperRejected: true, replayRejected: true, privateReadback: true, forbiddenActors: 4, source: "deterministic-rule-and-DB", actualModelCalls: 0 };
        }
        if (stage === "quality") {
          const results = [];
          for (const actor of ["directorA", "directorB"]) { const send = await signed(actor), children = envelope((await send("/api/children")).payload);
            const body = (await send("/api/ai/admin-quality-metrics", { body: { windowDays: 7, includeDemoFallback: false, institutionId: manifest.accounts[actor === "directorA" ? "directorB" : "directorA"].user.institutionId,
              snapshot: { children: [{ id: "FORGED_FOREIGN_CHILD" }] }, appSnapshot: { children: [] } } })).payload;
            results.push(verifyQuality(body, children.length)); assert.ok(!JSON.stringify(body).includes("FORGED_FOREIGN_CHILD")); }
          for (const actor of ["teacherA1", "parentA1"]) await (await signed(actor))("/api/ai/admin-quality-metrics", { body: {}, expected: [403] });
          return { institutions: results, forgedTenantAndSnapshotsIgnored: true, nonAdminRejected: true, actualModelCalls: 0 };
        }
        if (stage === "feed") {
          const fixtures = [];
          for (const [key, target] of [["teacherA1", childId], ["teacherB1", manifest.accounts.parentB1.children[0].id]]) { const send = await signed(key);
            const list = envelope((await send(`/api/consultations?childId=${encodeURIComponent(target)}`)).payload);
            const prior = list.find(item => item.summary?.includes(`${journal.runId}-${key}`));
            const consultation = prior || envelope((await send("/api/consultations", { body: { childId: target, summary: `${journal.runId}-${key} 合成手工会诊记录，未调用模型。`, riskLevel: "low" }, expected: [201] })).payload);
            fixtures.push({ key, id: consultation.consultationId, childId: target }); }
          for (const actor of ["teacherA1", "directorA", "teacherB1"]) { const send = await signed(actor), allowed = envelope((await send("/api/children")).payload), ids = new Set(allowed.map(item => item.id));
            const feed = (await send("/api/ai/high-risk-consultation/feed?limit=100")).payload; assert.equal(feed.source, "session-scope"); assert.equal(feed.fallback, false); assert.equal(feed.count, feed.items.length); assert.ok(feed.items.every(item => ids.has(item.childId)));
            const own = fixtures.find(item => ids.has(item.childId)), other = fixtures.find(item => !ids.has(item.childId)); assert.ok(feed.items.some(item => item.consultationId === own.id)); assert.ok(!feed.items.some(item => item.consultationId === other.id)); }
          for (const actor of ["teacherA2", "teacherB1"]) await (await signed(actor))(`/api/ai/high-risk-consultation/feed?child_id=${encodeURIComponent(childId)}`, { expected: [403] });
          await (await signed("parentA1"))("/api/ai/high-risk-consultation/feed", { expected: [403] });
          return { realScopedManualFixtures: 2, staffReaders: 3, crossClassAndTenantRejected: true, parentRejected: true, source: "session-scope", actualModelCalls: 0 };
        }
        if (stage === "teacher-understand") {
          const bytes = await readFile(privatePath(arg(args, "--audio-file", `${ARTIFACT}/synthetic-speech-normalized.wav`))), wav = inspectPcmWav(bytes);
          journal.audioFixture = { ...wav, sha256: responseContentHash(bytes), childId }; await persist(); const form = new FormData();
          form.set("audio", new File([bytes], "synthetic-speech-normalized.wav", { type: "audio/wav" })); form.set("childId", childId); form.set("durationMs", String(Math.round(wav.durationMs))); form.set("scene", "synthetic-remaining-visible-entrance");
          const body = await paid(stage, "teacherA1", "/api/ai/teacher-voice-understand", form, (body, status) => { assert.equal(status, 200); return verifyUnderstanding(body, budget.models.asr); });
          const teacher = await signed("teacherA1"), parent = await signed("parentA1");
          const saved = envelope((await teacher("/api/records", { body: { type: "growth", childId, sourceDraftId: journal.runId, sourceRecordId: `${journal.runId}-understand`, category: "合成语音理解验收", description: body.transcript.text, tags: ["合成验收"], needsAttention: false }, expected: [201] })).payload);
          const records = envelope((await parent(`/api/records?type=growth&childId=${encodeURIComponent(childId)}`)).payload); assert.equal(records.find(item => item.id === saved.id)?.description, body.transcript.text);
          for (const actor of ["parentA1", "teacherA2", "teacherB1"]) await (await signed(actor))("/api/ai/teacher-voice-understand", { body: { childId, transcript: "合成拒绝测试" }, expected: [403] });
          return { ...verifyUnderstanding(body, budget.models.asr), persistedTranscriptAndParentReadback: true, wrongRoleAndChildRejected: true };
        }
        const payload = { targetChildId: childId, teacherNote: `${journal.runId} 合成验收，请根据既有记录说明园内和家庭动作与48小时复看，不编造儿童病情。`, currentUser: manifest.accounts.teacherA1.user, visibleChildren: [], presentChildren: [], healthCheckRecords: [], growthRecords: [], guardianFeedbacks: [] };
        const body = await paid(stage, "teacherA1", "/api/ai/high-risk-consultation", payload, (body, status) => {
          assert.equal(status, 200); assert.equal(body.fallback, false); assert.equal(body.realProvider ?? body.providerTrace?.realProvider, true); assert.equal(body.model, budget.models.text); assert.match(body.provider || body.providerTrace?.provider || "", /maas/u);
          assert.ok(body.summary?.trim().length >= 10 && body.todayInSchoolActions?.length && body.tonightAtHomeActions?.length && body.followUp48h?.length); assert.equal(body.childId || body.targetChildId, childId);
          return { model: body.model, actualProvider: body.provider, bodySha256: responseContentHash(body) };
        });
        const send = await signed("teacherA1"), saved = envelope((await send("/api/consultations", { body: { ...body, childId }, expected: [201] })).payload);
        assert.equal(saved.consultationId, body.consultationId); const parent = await signed("parentA1"), list = envelope((await parent(`/api/consultations?childId=${encodeURIComponent(childId)}`)).payload);
        assert.ok(list.some(item => item.consultationId === body.consultationId)); const feed = (await send(`/api/ai/high-risk-consultation/feed?child_id=${encodeURIComponent(childId)}&limit=100`)).payload; assert.ok(feed.items.some(item => item.consultationId === body.consultationId));
        for (const actor of ["parentA1", "teacherA2", "teacherB1"]) await (await signed(actor))("/api/ai/high-risk-consultation", { body: payload, expected: [403] });
        return { model: body.model, realProvider: true, jsonResponseAndMysqlPersisted: true, independentParentReadback: true, ordinaryFeedContainsSavedResult: true, wrongRoleAndChildRejected: true };
      });
      if (!ok) { for (const pending of stages.slice(stages.indexOf(stage) + 1)) report.checks.push({ name: pending, status: "blocked", reason: "先前阶段失败，停止后续阶段，收费未知不重发。" }); break; }
    }
  } finally {
    report.finishedAt = now(); report.passed = report.checks.filter(item => item.status === "passed").length; report.failed = report.checks.filter(item => item.status === "failed").length; report.blocked = report.checks.filter(item => item.status === "blocked").length;
    report.newBusinessModelRequests = report.calls.filter(item => item.actualRequestStarted).length; report.reservedTotalCny = Object.values(journal.paid).reduce((sum, entry) => sum + entry.reserveCny, 0); report.actualCostCny = null;
    await atomic(reportFile, report); await lock.close(); await unlink(`${journalFile}.lock`);
    console.log(JSON.stringify({ passed: report.passed, failed: report.failed, blocked: report.blocked, newBusinessModelRequests: report.newBusinessModelRequests, reservedTotalCny: report.reservedTotalCny, reportFile }));
  }
  if (report.failed || report.blocked) process.exitCode = 1; return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) runRemaining(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
