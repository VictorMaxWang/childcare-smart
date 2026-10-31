import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** 普通账号验收夹具。默认只打印计划；显式 --execute 才会写入独立合成账号。 */
export function matrixPlan(prefix) {
  return [
    { key: "directorA", role: "机构管理员", institution: "A" },
    { key: "directorB", role: "机构管理员", institution: "B" },
    { key: "teacherA1", role: "教师", institution: "A", className: "验收向阳班" },
    { key: "teacherA2", role: "教师", institution: "A", className: "验收月亮班" },
    { key: "teacherB1", role: "教师", institution: "B", className: "验收向阳班" },
    { key: "parentA1", role: "家长", institution: "A", className: "验收向阳班", months: [8, 26] },
    { key: "parentA2", role: "家长", institution: "A", className: "验收月亮班", months: [30] },
    { key: "parentB1", role: "家长", institution: "B", className: "验收向阳班", months: [18] },
  ].map(item => ({ ...item, username: `${prefix}-${item.key.toLowerCase()}`, displayName: `合成验收-${item.key}` }));
}

export function validateMatrixManifest(manifest) {
  assert.equal(manifest.version, 1);
  assert.ok(typeof manifest.baseUrl === "string");
  assert.equal(Object.keys(manifest.accounts).length, 8);
  assert.equal(Object.values(manifest.accounts).filter(actor => actor.role === "家长").length, 3);
  assert.equal(Object.values(manifest.accounts).flatMap(actor => actor.children || []).length, 4);
  const targetInstitutions = new Set([manifest.accounts.directorA.user.institutionId, manifest.accounts.directorB.user.institutionId]);
  assert.equal(targetInstitutions.size, 2);
  for (const actor of Object.values(manifest.accounts)) {
    assert.equal(actor.user.accountKind, "normal");
    assert.ok(targetInstitutions.has(actor.user.institutionId));
    assert.ok(actor.username.startsWith(manifest.prefix));
  }
}

function option(name, fallback) { const found = process.argv.find(value => value.startsWith(`${name}=`)); return found ? found.slice(name.length + 1) : fallback; }
function requirePrivateArtifact(file) {
  const resolved = path.resolve(file);
  assert.ok(resolved.replaceAll("\\", "/").includes("/artifacts/"), "凭据清单必须位于被gitignore排除的artifacts目录。");
  return resolved;
}
async function saveManifest(file, manifest) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(manifest, null, 2), { mode: 0o600 }); }
function client(baseUrl) {
  let cookie = "";
  return async (endpoint, body, expected = [200], overrideCookie) => {
    const response = await fetch(new URL(endpoint, baseUrl), {
      method: body === undefined ? "GET" : "POST", redirect: "manual", signal: AbortSignal.timeout(25000),
      headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...((overrideCookie ?? cookie) ? { cookie: overrideCookie ?? cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    assert.ok(expected.includes(response.status), `${endpoint} expected ${expected.join("/")}, got ${response.status}: ${payload?.error || "non-JSON response"}`);
    if (expected.length === 1 && response.status < 400) assert.equal(payload?.ok, true, `${endpoint} response envelope`);
    const cookies = response.headers.getSetCookie?.() || [];
    if (cookies.length) cookie = cookies.map(value => value.split(";", 1)[0]).join("; ");
    return { payload, response, cookie };
  };
}
async function loginActor(baseUrl, actor) {
  const request = client(baseUrl);
  const { payload, response } = await request("/api/auth/login", { username: actor.username, password: actor.password });
  assert.equal(payload.user.accountKind, "normal", "验收不得使用演示账号");
  assert.equal(payload.user.id, actor.user.id);
  const sessionHeader = response.headers.getSetCookie?.().join(" ") || "";
  assert.match(sessionHeader, /HttpOnly/iu);
  if (new URL(baseUrl).protocol === "https:") assert.match(sessionHeader, /Secure/iu);
  return request;
}

async function setup(baseUrl, prefix, file) {
  assert.match(prefix, /^qa-care-[a-z0-9-]{4,35}$/u, "专用合成账号前缀必须以qa-care-开头。");
  // 每一步落盘，网络失败后保留已经创建的数据；不自动删除任何账号或机构。
  const manifest = await readFile(file, "utf8").then(JSON.parse).catch(error => { if (error.code !== "ENOENT") throw error; return { version: 1, baseUrl, prefix, createdAt: new Date().toISOString(), accounts: {} }; });
  assert.equal(manifest.baseUrl, baseUrl); assert.equal(manifest.prefix, prefix);
  for (const plan of matrixPlan(prefix)) {
    if (!manifest.accounts[plan.key]) {
      const password = `Qa!${randomBytes(18).toString("base64url")}`;
      const request = client(baseUrl);
      const { payload } = await request("/api/auth/register", { username: plan.username, displayName: plan.displayName, role: plan.role, className: plan.className, password, confirmPassword: password });
      assert.equal(payload.user.accountKind, "normal");
      manifest.accounts[plan.key] = { ...plan, password, user: payload.user, children: [] };
      await saveManifest(file, manifest);
    }
  }
  for (const plan of matrixPlan(prefix).filter(actor => actor.role !== "机构管理员")) {
    const actor = manifest.accounts[plan.key], request = await loginActor(baseUrl, actor);
    for (let index = actor.children.length; index < (plan.months?.length || 0); index++) {
      const input = { requestId: `${prefix}-${plan.key}-child-${index}`, name: `合成儿童-${plan.key}-${index + 1}`, ageMonth: plan.months[index], gender: index % 2 ? "男" : "女", consentAccepted: true };
      const { payload } = await request("/api/parent/children", input, [201]);
      actor.children.push(payload.data); await saveManifest(file, manifest);
    }
    const director = manifest.accounts[`director${plan.institution}`];
    if (actor.user.institutionId !== director.user.institutionId) {
      const directorRequest = await loginActor(baseUrl, director);
      const { payload: invitation } = await directorRequest("/api/admin/member-invitations", { role: plan.role, className: plan.className }, [201]);
      const { payload: accepted } = await request("/api/account/member-invitations/accept", { code: invitation.data.code });
      assert.equal(accepted.data.institutionId, director.user.institutionId);
      const { payload: refreshed } = await request("/api/auth/login", { username: actor.username, password: actor.password });
      actor.user = refreshed.user; await saveManifest(file, manifest);
    }
  }
  validateMatrixManifest(manifest);
  return manifest;
}

async function verify(manifest) {
  validateMatrixManifest(manifest);
  const checks = [], startedAt = new Date().toISOString();
  const run = async (name, action) => { try { await action(); checks.push({ name, status: "passed" }); } catch (error) { checks.push({ name, status: "failed", error: error.message }); } };
  const clients = Object.fromEntries(await Promise.all(Object.entries(manifest.accounts).map(async ([key, actor]) => [key, await loginActor(manifest.baseUrl, actor)])));
  const parents = ["parentA1", "parentA2", "parentB1"];
  for (const [key, actor] of Object.entries(manifest.accounts)) {
    await run(`${key}: institution, class and parent child lists stay isolated`, async () => {
      const expected = Object.values(manifest.accounts).filter(other => other.role === "家长" && other.institution === actor.institution && (actor.role === "机构管理员" || (actor.role === "教师" ? other.className === actor.className : other.key === actor.key))).flatMap(other => other.children.map(child => child.id));
      const { payload } = await clients[key]("/api/children");
      assert.deepEqual(new Set(payload.data.map(child => child.id)), new Set(expected));
    });
  }
  await run("anonymous course catalog rejects unauthenticated access", async () => { await client(manifest.baseUrl)("/api/parent/courses", undefined, [401]); });
  for (const key of ["directorA", "directorB", "teacherA1", "teacherA2", "teacherB1"]) {
    await run(`${key}: course APIs reject a non-parent role`, async () => { await clients[key]("/api/parent/courses", undefined, [403]); });
  }
  for (const key of parents) {
    const actor = manifest.accounts[key], request = clients[key];
    for (const child of actor.children) {
      await run(`${key}/${child.id}: catalog, self-test, practice, feedback and replay persist`, async () => {
        const { payload: catalog } = await request(`/api/parent/courses?child=${encodeURIComponent(child.id)}`);
        assert.equal(catalog.data.selectedChildId, child.id); assert.equal(catalog.data.canSave, true);
        assert.deepEqual(new Set(catalog.data.children.map(item => item.id)), new Set(actor.children.map(item => item.id)));
        assert.ok(catalog.data.courses.length > 0);
        const course = catalog.data.courses[0], endpoint = `/api/parent/courses/${course.id}/events`;
        const opened = { childId: child.id, type: "opened", requestId: randomUUID() };
        await request(endpoint, opened, [201]); await request(endpoint, opened, [201]);
        await request(endpoint, { ...opened, type: "practice", completed: true }, [409]);
        await request(endpoint, { childId: child.id, type: "answer", answer: course.question.answer, requestId: randomUUID() }, [201]);
        await request(endpoint, { childId: child.id, type: "practice", completed: true, note: "合成验收：与照护者完成一次家庭实践。", requestId: randomUUID() }, [201]);
        await request(endpoint, { childId: child.id, type: "feedback", feedback: "helpful", requestId: randomUUID() }, [201]);
        const { payload: persisted } = await request(`/api/parent/courses?child=${encodeURIComponent(child.id)}`);
        const events = persisted.data.learning.filter(event => event.requestId === opened.requestId);
        assert.equal(events.length, 1); assert.equal(events[0].type, "opened"); assert.equal(events[0].completed, undefined);
        assert.ok(persisted.data.learning.some(event => event.type === "practice" && event.completed));
        const secondSession = await loginActor(manifest.baseUrl, actor);
        const { payload: secondRead } = await secondSession(`/api/parent/courses?child=${encodeURIComponent(child.id)}`);
        assert.ok(secondRead.data.learning.some(event => event.requestId === opened.requestId));
      });
    }
    for (const other of parents.filter(otherKey => otherKey !== key)) {
      const foreignChild = manifest.accounts[other].children[0];
      await run(`${key}: cannot read/write ${other}'s child (same or different institution)`, async () => {
        await request(`/api/parent/courses?child=${encodeURIComponent(foreignChild.id)}`, undefined, [403, 404]);
        await request("/api/parent/courses/nutrition-signals/events", { childId: foreignChild.id, type: "opened", requestId: randomUUID() }, [403, 404]);
      });
    }
  }
  return { startedAt, finishedAt: new Date().toISOString(), origin: manifest.baseUrl, normalAccounts: 8, syntheticChildren: 4, paidAiCalls: 0, checks,
    remaining: ["Chrome desktop/390px/768px visual interactions", "teacher daily records and media to parent feedback journey", "one explicitly budgeted real recommendation plus cross-parent job read denial", "restart persistence and unknown-task no-resubmit check"],
  };
}

async function main() {
  const prefix = option("--prefix", `qa-care-${Date.now().toString(36)}`);
  const baseUrl = option("--base-url", "https://www.smartchildcare.cn").replace(/\/+$/u, "");
  const manifestFile = requirePrivateArtifact(option("--manifest", "artifacts/implementation-20261031/real-matrix.private.json"));
  const reportFile = requirePrivateArtifact(option("--report", "artifacts/implementation-20261031/parent-courses-real-report.json"));
  if (!process.argv.includes("--execute")) { console.log(JSON.stringify({ mode: "plan-only", baseUrl, prefix, actors: matrixPlan(prefix), paidAiCalls: 0, instructions: "Add --execute --setup to create isolated users, or --execute to verify an existing private manifest. No browser is launched." }, null, 2)); return; }
  const target = new URL(baseUrl);
  assert.ok(target.protocol === "https:" || ["localhost", "127.0.0.1"].includes(target.hostname), "正式验收必须使用HTTPS。");
  const manifest = process.argv.includes("--setup") || process.argv.includes("--setup-only") ? await setup(baseUrl, prefix, manifestFile) : JSON.parse(await readFile(manifestFile, "utf8"));
  assert.equal(manifest.baseUrl, baseUrl);
  if (process.argv.includes("--setup-only")) {
    validateMatrixManifest(manifest);
    console.log(JSON.stringify({ mode: "setup-only", normalAccounts: 8, targetInstitutions: 2, syntheticChildren: 4, paidAiCalls: 0 }));
    return;
  }
  const report = await verify(manifest);
  await mkdir(path.dirname(reportFile), { recursive: true }); await writeFile(reportFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.checks.filter(item => item.status === "passed").length, failed: report.checks.filter(item => item.status === "failed").length, paidAiCalls: 0, reportFile }));
  if (report.checks.some(item => item.status === "failed")) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
