import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { validateMatrixManifest } from "./parent-courses-real-matrix.mjs";

const CONSENT_TYPES = ["guardian_authorization", "terms_of_service", "child_privacy_policy"];
const option = (args, name, fallback) => args.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const privatePath = file => {
  const absolute = path.resolve(file);
  assert.ok(absolute.replaceAll("\\", "/").includes("/artifacts/"), "验收清单、日志和报告必须放在忽略的artifacts目录。");
  return absolute;
};

export function recoverySmokePlan() {
  return {
    mode: "plan-only", paidModelCalls: 0, newUsers: 0, newSyntheticChildren: 1,
    allowedRequests: ["GET /api/health", "POST /api/auth/login", "GET /api/children", "POST /api/parent/children", "GET /api/parent/courses?child=...", "POST /api/parent/courses/nutrition-signals/events (foreign-child denial only)"],
    scopes: "现有qa-care-合成机构的parentA1/A2/B1和旧4儿童；仅parentA1创建1个稳定编号的合成档案。",
    consentEvidence: "需root另外只读查询MySQL三条同意记录；HTTP201不算此项通过。",
    limits: ["本脚本不启动浏览器，不能替代真实手机号注册和表单提交。", "丢回执为客户端丢弃首次响应正文，不冒称真实TCP断网。", "不注册账号、不生成推荐、不调用任何收费AI接口，不删除已有资料。"],
  };
}

export function validateRecoveryScope(manifest, expectedSha) {
  assert.match(expectedSha ?? "", /^[a-f0-9]{40}$/u, "--expected-sha须为拟验收发布的完整40位SHA。");
  validateMatrixManifest(manifest);
  assert.match(manifest.prefix, /^qa-care-[a-z0-9-]{4,35}$/u, "仅允许既有合成QA夹具。");
  const origin = new URL(manifest.baseUrl);
  assert.ok(origin.origin === "https://www.smartchildcare.cn" || ["localhost", "127.0.0.1"].includes(origin.hostname), "拒绝向非正式站或非本地站发送验收凭据。");
  assert.equal(origin.username, ""); assert.equal(origin.password, "");
  for (const [key, actor] of Object.entries(manifest.accounts)) {
    assert.equal(actor.user.accountKind, "normal");
    assert.ok(actor.username.startsWith(`${manifest.prefix}-`), `${key}不属于合成账号前缀。`);
    assert.ok(actor.displayName?.startsWith("合成验收-"), `${key}不是明确标注的合成验收账号。`);
    for (const child of actor.children || []) assert.ok(child.name?.startsWith("合成儿童-"), "拒绝把真实儿童放入验收清单。");
  }
}

export function assertAllowedRecoveryRequest(method, endpoint) {
  const pathname = endpoint.split("?", 1)[0];
  const allowed = method === "GET" && ["/api/health", "/api/children", "/api/parent/courses"].includes(pathname)
    || method === "POST" && ["/api/auth/login", "/api/parent/children", "/api/parent/courses/nutrition-signals/events"].includes(pathname);
  assert.ok(allowed && endpoint.startsWith("/api/") && !endpoint.startsWith("//"), "恢复验收禁止注册、收费生成、删除或站外请求。");
}

/** 完整月龄独立核算业务日，异常日期不能被系统归零后错配婴儿课程。 */
export function expectedBusinessMonths(birthDate, now = new Date()) {
  assert.match(birthDate, /^\d{4}-\d{2}-\d{2}$/u);
  const birth = new Date(`${birthDate}T00:00:00Z`);
  assert.equal(birth.toISOString().slice(0, 10), birthDate);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  assert.ok(birthDate <= today);
  const [year, month, day] = today.split("-").map(Number);
  return (year - birth.getUTCFullYear()) * 12 + month - 1 - birth.getUTCMonth() - Number(day < birth.getUTCDate());
}

export function assertOnlyExpectedChildAdded(beforeIds, children, expectedId) {
  const currentIds = children.map(child => child.id);
  assert.equal(new Set(currentIds).size, currentIds.length, "不能有重复儿童编号。");
  for (const id of beforeIds) assert.ok(currentIds.includes(id), "验收不能导致旧儿童丢失。");
  const added = currentIds.filter(id => !beforeIds.includes(id));
  assert.deepEqual(added, [expectedId], "稳定请求同次/跨会话/丢回执重放后必须只新增1儿童。");
}

export function assertConsentProof(proof, journal, expectedSha) {
  assert.equal(proof.source, "production-mysql-read-only");
  assert.equal(proof.deploymentCommitSha, expectedSha);
  assert.equal(proof.institutionId, journal.institutionId); assert.equal(proof.userId, journal.userId); assert.equal(proof.childId, journal.expectedChildId);
  assert.ok(Number.isFinite(Date.parse(proof.capturedAt)), "同意证据必须注明采集时间。");
  assert.equal(proof.records.length, 3, "必须恰好3条同意记录，不能只检查类型去重后数量。");
  assert.deepEqual(proof.records.map(record => record.consentType).sort(), [...CONSENT_TYPES].sort());
  for (const record of proof.records) {
    assert.equal(record.institutionId, journal.institutionId); assert.equal(record.userId, journal.userId); assert.equal(record.childId, journal.expectedChildId);
    assert.equal(record.policyVersion, "2026-07-04-child-onboarding-v1"); assert.ok(Number.isFinite(Date.parse(record.agreedAt)));
  }
  return { source: proof.source, capturedAt: proof.capturedAt, recordCount: 3, types: [...CONSENT_TYPES] };
}

export async function runBugfixRecoverySmoke(args) {
  const verifyOnly = args.includes("--verify-consent-proof");
  if (!args.includes("--execute") && !verifyOnly) return recoverySmokePlan();
  assert.ok(!verifyOnly || !args.includes("--execute"), "同意证据复核和线上执行分两阶段，不能混在一次命令中。");
  const expectedSha = option(args, "--expected-sha", "");
  assert.match(expectedSha, /^[a-f0-9]{40}$/u, "执行前必须指定完整发布SHA。");
  const manifestFile = privatePath(option(args, "--manifest", "artifacts/implementation-20261031/real-matrix.private.json"));
  const journalFile = privatePath(option(args, "--journal", "artifacts/bugfix-20261101/recovery-smoke.private.json"));
  const reportFile = privatePath(option(args, "--report", "artifacts/bugfix-20261101/recovery-smoke-report.json"));
  if (verifyOnly) {
    const journal = JSON.parse(await readFile(journalFile, "utf8")), report = JSON.parse(await readFile(reportFile, "utf8"));
    assert.equal(journal.expectedSha, expectedSha); assert.equal(report.expectedSha, expectedSha); assert.equal(report.status, "needs-db-proof");
    const proofFile = privatePath(option(args, "--consent-proof", "artifacts/bugfix-20261101/recovery-consent-proof.json"));
    const evidence = assertConsentProof(JSON.parse(await readFile(proofFile, "utf8")), journal, expectedSha);
    report.checks.push({ name: "three scoped consent rows after all replays", status: "passed", evidence });
    report.status = "passed"; report.consentVerifiedAt = new Date().toISOString();
    await writeFile(reportFile, JSON.stringify(report, null, 2), { mode: 0o600 });
    return { status: report.status, checks: report.checks.length, paidModelCalls: 0, reportFile };
  }
  const manifest = JSON.parse(await readFile(manifestFile, "utf8")); validateRecoveryScope(manifest, expectedSha);
  const baseUrl = new URL(manifest.baseUrl).origin;
  const runId = option(args, "--run-id", "qa-recovery-20261101-core");
  assert.match(runId, /^qa-recovery-[a-z0-9-]{8,50}$/u);
  await mkdir(path.dirname(journalFile), { recursive: true });
  const lockPath = `${journalFile}.lock`, lock = await open(lockPath, "wx").catch(() => { throw new Error("该恢复日志已有执行者，请核对原进程，禁止并发重放。"); });
  const report = { kind: "bugfix-recovery-real-api", startedAt: new Date().toISOString(), expectedSha, origin: baseUrl, status: "running", paidModelCalls: 0, newUsers: 0, checks: [], requests: [], limits: recoverySmokePlan().limits };
  let journal;
  const save = async () => { await writeFile(journalFile, JSON.stringify(journal, null, 2), { mode: 0o600 }); await writeFile(reportFile, JSON.stringify(report, null, 2), { mode: 0o600 }); };
  function newClient() {
    let cookie = "";
    return async (endpoint, { body, expected = [200], discardBody = false } = {}) => {
      const method = body === undefined ? "GET" : "POST";
      assertAllowedRecoveryRequest(method, endpoint);
      const response = await fetch(`${baseUrl}${endpoint}`, { method, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(25000), headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
      report.requests.push({ method, path: endpoint.split("?", 1)[0], status: response.status, paid: false, responseBodyDiscarded: discardBody });
      const setCookies = response.headers.getSetCookie?.() || [];
      if (setCookies.length) cookie = setCookies.map(value => value.split(";", 1)[0]).join("; ");
      const payload = discardBody ? (await response.arrayBuffer(), null) : await response.json().catch(() => null);
      assert.ok(expected.includes(response.status), `${method} ${endpoint.split("?", 1)[0]} expected ${expected.join("/")}, got ${response.status}`);
      if (!discardBody && response.status < 400 && endpoint !== "/api/health") assert.equal(payload?.ok, true, "必须是业务成功envelope。");
      return { payload, response };
    };
  }
  const anonymous = newClient();
  async function assertHealth() {
    const { payload } = await anonymous("/api/health");
    assert.equal(payload.status, "ok"); assert.equal(payload.deployment.commitSha, expectedSha, "发布身份变化，停止写入。");
    return { sha: payload.deployment.commitSha, deploymentId: payload.deployment.deploymentId };
  }
  async function login(key) {
    const actor = manifest.accounts[key], request = newClient();
    const { payload, response } = await request("/api/auth/login", { body: { username: actor.username, password: actor.password } });
    assert.equal(payload.user.accountKind, "normal"); assert.equal(payload.user.id, actor.user.id); assert.equal(payload.user.institutionId, actor.user.institutionId);
    const setCookie = response.headers.getSetCookie?.().join(" ") || "";
    assert.match(setCookie, /HttpOnly/iu); if (baseUrl.startsWith("https:")) assert.match(setCookie, /Secure/iu);
    return request;
  }
  const children = async request => (await request("/api/children")).payload.data;
  const check = async (name, action) => { const evidence = await action(); report.checks.push({ name, status: "passed", ...(evidence ? { evidence } : {}) }); await save(); };
  try {
    const identity = await assertHealth();
    journal = await readFile(journalFile, "utf8").then(JSON.parse).catch(error => { if (error.code !== "ENOENT") throw error; return null; });
    const actor = manifest.accounts.parentA1;
    if (!journal) journal = { version: 1, runId, expectedSha, identity, userId: actor.user.id, institutionId: actor.user.institutionId, input: { name: "合成验收-恢复补测", ageMonth: 12, gender: "男", consentAccepted: true, requestId: `${runId}-child` }, beforeIds: null };
    assert.equal(journal.runId, runId); assert.equal(journal.expectedSha, expectedSha); assert.equal(journal.userId, actor.user.id); assert.equal(journal.institutionId, actor.user.institutionId);
    journal.expectedChildId = `c-${createHash("sha256").update(`${journal.institutionId}\0${journal.userId}\0${journal.input.requestId}`).digest("hex").slice(0, 32)}`;
    const parent = await login("parentA1");
    if (!journal.beforeIds) journal.beforeIds = (await children(parent)).map(child => child.id);
    assert.ok(!journal.beforeIds.includes(journal.expectedChildId), "基线必须在首次提交前落盘，不能把新档案倒填成旧基线。");
    await save();
    const invalidInputs = [
      ...[undefined, null, "", "unspecified", true, []].map((gender, index) => ({ name: `invalid gender ${index}`, input: { ...journal.input, gender, requestId: `${runId}-gender-${index}` } })),
      ...[true, false, [], [24], {}, "", "   "].map((ageMonth, index) => ({ name: `invalid age ${index}`, input: { ...journal.input, ageMonth, requestId: `${runId}-age-${index}` } })),
    ];
    for (const invalid of invalidInputs) await check(`${invalid.name}: 400 and child IDs unchanged`, async () => {
      const before = (await children(parent)).map(child => child.id).sort();
      await assertHealth();
      const { payload } = await parent("/api/parent/children", { body: invalid.input, expected: [400] });
      assert.equal(payload?.ok, false); assert.equal(payload?.code, "invalid_request");
      assert.deepEqual((await children(parent)).map(child => child.id).sort(), before);
      return { status: 400, count: before.length };
    });
    await check("first legitimate response body deliberately discarded; stable request recovered", async () => {
      await assertHealth();
      await parent("/api/parent/children", { body: journal.input, expected: [201], discardBody: true });
      journal.firstResponseDiscarded = true; await save();
      const { payload } = await parent("/api/parent/children", { body: journal.input, expected: [201] });
      assert.equal(payload.data.id, journal.expectedChildId); assert.equal(payload.data.gender, "男");
      assertOnlyExpectedChildAdded(journal.beforeIds, await children(parent), journal.expectedChildId);
      return { childId: journal.expectedChildId, browserOrTcpDisconnectClaimed: false, newChildCount: 1 };
    });
    await check("fresh independent parent session replays same ID without a second child", async () => {
      const fresh = await login("parentA1"); await assertHealth();
      const { payload } = await fresh("/api/parent/children", { body: journal.input, expected: [201] });
      assert.equal(payload.data.id, journal.expectedChildId);
      assertOnlyExpectedChildAdded(journal.beforeIds, await children(fresh), journal.expectedChildId);
      return { newChildCount: 1, stableRequestId: journal.input.requestId };
    });
    for (const key of ["parentA2", "parentB1"]) await check(`${key}: foreign new child catalog and event write rejected`, async () => {
      const foreign = await login(key);
      await foreign(`/api/parent/courses?child=${encodeURIComponent(journal.expectedChildId)}`, { expected: [403, 404] });
      await assertHealth();
      await foreign("/api/parent/courses/nutrition-signals/events", { body: { childId: journal.expectedChildId, requestId: `${runId}-foreign-${key}`, type: "opened" }, expected: [403, 404] });
      assert.ok(!(await children(foreign)).some(child => child.id === journal.expectedChildId));
      return { scopes: "same institution / other institution", rejected: true };
    });
    for (const key of ["parentA1", "parentA2", "parentB1"]) {
      const request = await login(key);
      const current = await children(request);
      for (const original of manifest.accounts[key].children) await check(`${key}/${original.id}: original child gets only eligible courses`, async () => {
        const child = current.find(value => value.id === original.id); assert.ok(child, "旧合成儿童必须仍可读取。");
        const { payload } = await request(`/api/parent/courses?child=${encodeURIComponent(child.id)}`);
        const months = expectedBusinessMonths(child.birthDate);
        assert.equal(payload.data.selectedChildId, child.id); assert.equal(payload.data.ageMonths, months);
        assert.deepEqual(new Set(payload.data.children.map(value => value.id)), new Set(current.map(value => value.id)));
        for (const course of payload.data.courses) assert.ok(months >= course.minAgeMonths && months <= course.maxAgeMonths, "不能包含超龄课程。");
        assert.ok(payload.data.courses.length > 0, "旧4合成儿童处于适龄范围，应有真实课程。");
        return { months, courseIds: payload.data.courses.map(course => course.id) };
      });
    }
    report.healthAfter = await assertHealth();
    report.status = "needs-db-proof";
    report.consentVerification = { status: "pending", expectedSha, institutionId: journal.institutionId, userId: journal.userId, childId: journal.expectedChildId, expectedTypes: CONSENT_TYPES, requiredRows: 3, instruction: "root只读查询consent_records，按上述scope输出production-mysql-read-only证据后执行--verify-consent-proof；当前不得宣称此项通过。" };
    await save();
    return { status: report.status, checks: report.checks.length, paidModelCalls: 0, reportFile, consentVerification: report.consentVerification };
  } catch (error) {
    report.status = "failed"; report.failure = error instanceof Error ? error.message : "Unknown failure";
    if (journal) await save();
    else await writeFile(reportFile, JSON.stringify(report, null, 2), { mode: 0o600 });
    throw error;
  } finally { await lock.close(); await unlink(lockPath); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await runBugfixRecoverySmoke(process.argv.slice(2));
    console.log(JSON.stringify(result, null, 2));
    if (result.status === "needs-db-proof") process.exitCode = 2;
  } catch (error) { console.error(error instanceof Error ? error.message : "Recovery smoke failed"); process.exitCode = 1; }
}
