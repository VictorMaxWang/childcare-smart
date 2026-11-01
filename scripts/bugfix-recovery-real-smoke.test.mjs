import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { matrixPlan } from "./parent-courses-real-matrix.mjs";
import { assertAllowedRecoveryRequest, assertConsentProof, assertOnlyExpectedChildAdded, expectedBusinessMonths, recoverySmokePlan, runBugfixRecoverySmoke, validateRecoveryScope } from "./bugfix-recovery-real-smoke.mjs";

const sha = "a".repeat(40);
function manifest() {
  const prefix = "qa-care-recovery-offline";
  const accounts = Object.fromEntries(matrixPlan(prefix).map(actor => [actor.key, { ...actor, user: { id: actor.key, institutionId: actor.institution, accountKind: "normal" }, children: (actor.months || []).map((_, index) => ({ id: `${actor.key}-${index}`, name: `合成儿童-${actor.key}-${index}` })) }]));
  return { version: 1, baseUrl: "https://www.smartchildcare.cn", prefix, accounts };
}
test("default recovery execution is plan-only and declares zero paid models and no new users", async () => {
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("plan mode must never access network"); };
  try { assert.deepEqual(await runBugfixRecoverySmoke([]), recoverySmokePlan()); }
  finally { globalThis.fetch = savedFetch; }
  assert.equal(recoverySmokePlan().paidModelCalls, 0); assert.equal(recoverySmokePlan().newUsers, 0);
});
test("missing or abbreviated expected SHA refuses execution before reading manifests or using network", async () => {
  await assert.rejects(runBugfixRecoverySmoke(["--execute"]), /SHA/);
  await assert.rejects(runBugfixRecoverySmoke(["--execute", "--expected-sha=abc1234"]), /SHA/);
});
test("recovery refuses real accounts, demo accounts, unmarked children and foreign origins", () => {
  validateRecoveryScope(manifest(), sha);
  for (const mutate of [value => { value.accounts.parentA1.username = "someone-real"; }, value => { value.accounts.parentA1.user.accountKind = "demo"; }, value => { value.accounts.parentA1.children[0].name = "真实儿童"; }, value => { value.baseUrl = "https://attacker.test"; }, value => { value.accounts.parentA1.displayName = "真实家长"; }]) {
    const value = manifest(); mutate(value); assert.throws(() => validateRecoveryScope(value, sha));
  }
});
test("request allowlist blocks model generation, registration, deletion, methods and off-site URLs", () => {
  assertAllowedRecoveryRequest("GET", "/api/health");
  assertAllowedRecoveryRequest("GET", "/api/parent/courses?child=synthetic");
  assertAllowedRecoveryRequest("POST", "/api/parent/children");
  for (const [method, endpoint] of [["POST", "/api/ai/parent-storybook"], ["POST", "/api/parent/course-recommendations"], ["POST", "/api/auth/register"], ["DELETE", "/api/children"], ["POST", "https://attacker.test/api/auth/login"], ["GET", "//api/health"]]) assert.throws(() => assertAllowedRecoveryRequest(method, endpoint));
});
test("replay checks detect duplicate children, lost old children and unintended extra children", () => {
  assertOnlyExpectedChildAdded(["old"], [{ id: "old" }, { id: "expected" }], "expected");
  for (const children of [[{ id: "expected" }], [{ id: "old" }, { id: "expected" }, { id: "another" }], [{ id: "old" }, { id: "expected" }, { id: "expected" }]]) assert.throws(() => assertOnlyExpectedChildAdded(["old"], children, "expected"));
});
test("business-day age assertions include 6,12,18,24,36 and37 month boundaries", () => {
  for (const months of [6, 12, 18, 24, 36, 37]) {
    const birth = new Date(Date.UTC(2026, 10 - months, 2)).toISOString().slice(0, 10);
    assert.equal(expectedBusinessMonths(birth, new Date("2026-11-01T16:00:00Z")), months);
    assert.equal(expectedBusinessMonths(birth, new Date("2026-11-01T15:59:59Z")), months - 1);
  }
  assert.throws(() => expectedBusinessMonths("2025-02-30"));
  assert.throws(() => expectedBusinessMonths("2099-01-01"));
});
test("consent verification requires exactly three correctly scoped SQL rows with matching deployment", () => {
  const journal = { institutionId: "inst", userId: "parent", expectedChildId: "child" };
  const proof = { source: "production-mysql-read-only", deploymentCommitSha: sha, institutionId: "inst", userId: "parent", childId: "child", capturedAt: "2026-11-01T12:00:00Z", records: ["guardian_authorization", "terms_of_service", "child_privacy_policy"].map(consentType => ({ institutionId: "inst", userId: "parent", childId: "child", consentType, policyVersion: "2026-07-04-child-onboarding-v1", agreedAt: "2026-11-01T11:00:00Z" })) };
  assert.equal(assertConsentProof(proof, journal, sha).recordCount, 3);
  for (const mutate of [value => { value.records.pop(); }, value => { value.records.push(value.records[0]); }, value => { value.records[0].userId = "foreign"; }, value => { value.deploymentCommitSha = "b".repeat(40); }, value => { value.source = "http-201"; }]) {
    const value = structuredClone(proof); mutate(value); assert.throws(() => assertConsentProof(value, journal, sha));
  }
});

test("offline HTTP simulation exercises full smoke and SQL-evidence phases without any real model or registration calls", async () => {
  const root = path.resolve("artifacts/bugfix-20261101"); await mkdir(root, { recursive: true });
  const directory = await mkdtemp(path.join(root, "recovery-unit-"));
  const files = Object.fromEntries(["manifest", "journal", "report", "proof"].map(name => [name, path.join(directory, `${name}.json`)]));
  const actors = manifest(), states = new Map();
  for (const [key, actor] of Object.entries(actors.accounts)) {
    actor.password = "offline-synthetic-password";
    states.set(key, actor.children.map(child => ({ ...child, birthDate: "2025-01-01", gender: "女" })));
  }
  const observed = [], savedFetch = globalThis.fetch;
  const response = (body, status = 200, cookie) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...(cookie ? { "set-cookie": `ccs_session=${cookie}; HttpOnly; Secure; SameSite=Lax` } : {}) } });
  globalThis.fetch = async (url, options = {}) => {
    const target = new URL(url), method = options.method ?? "GET";
    assertAllowedRecoveryRequest(method, target.pathname);
    observed.push([method, target.pathname]);
    const key = new Headers(options.headers).get("cookie")?.match(/ccs_session=([^;]+)/u)?.[1];
    if (target.pathname === "/api/health") return response({ status: "ok", deployment: { commitSha: sha, deploymentId: "offline" } });
    const input = options.body ? JSON.parse(options.body) : null;
    if (target.pathname === "/api/auth/login") {
      const actor = Object.values(actors.accounts).find(item => item.username === input.username); assert.ok(actor);
      return response({ ok: true, user: actor.user }, 200, actor.key);
    }
    assert.ok(key && states.has(key), "all non-health requests need an authenticated synthetic session");
    if (target.pathname === "/api/children") return response({ ok: true, data: states.get(key) });
    if (target.pathname === "/api/parent/children") {
      if (!["男", "女"].includes(input.gender) || typeof input.ageMonth !== "number" || !Number.isInteger(input.ageMonth)) return response({ ok: false, code: "invalid_request" }, 400);
      const actor = actors.accounts[key], id = `c-${createHash("sha256").update(`${actor.user.institutionId}\0${actor.user.id}\0${input.requestId}`).digest("hex").slice(0, 32)}`;
      let child = states.get(key).find(value => value.id === id);
      if (!child) { child = { id, name: input.name, gender: input.gender, birthDate: "2025-11-01" }; states.get(key).push(child); }
      return response({ ok: true, data: child }, 201);
    }
    const childId = target.searchParams.get("child") ?? input?.childId;
    const child = states.get(key).find(value => value.id === childId);
    if (!child) return response({ ok: false, code: "not_found" }, 404);
    assert.equal(method, "GET", "scope-denial event write must never succeed");
    return response({ ok: true, data: { selectedChildId: child.id, children: states.get(key), ageMonths: expectedBusinessMonths(child.birthDate), courses: [{ id: "nutrition-signals", minAgeMonths: 0, maxAgeMonths: 36 }] } });
  };
  try {
    await writeFile(files.manifest, JSON.stringify(actors));
    const common = [`--expected-sha=${sha}`, `--manifest=${files.manifest}`, `--journal=${files.journal}`, `--report=${files.report}`];
    const result = await runBugfixRecoverySmoke(["--execute", ...common]);
    assert.equal(result.status, "needs-db-proof"); assert.equal(result.checks, 21); assert.equal(states.get("parentA1").length, 3);
    const journal = JSON.parse(await readFile(files.journal, "utf8"));
    const proof = { source: "production-mysql-read-only", deploymentCommitSha: sha, institutionId: journal.institutionId, userId: journal.userId, childId: journal.expectedChildId, capturedAt: new Date().toISOString(), records: ["guardian_authorization", "terms_of_service", "child_privacy_policy"].map(consentType => ({ institutionId: journal.institutionId, userId: journal.userId, childId: journal.expectedChildId, consentType, policyVersion: "2026-07-04-child-onboarding-v1", agreedAt: new Date().toISOString() })) };
    await writeFile(files.proof, JSON.stringify(proof));
    const count = observed.length;
    const final = await runBugfixRecoverySmoke(["--verify-consent-proof", `--consent-proof=${files.proof}`, ...common]);
    assert.equal(final.status, "passed"); assert.equal(final.checks, 22); assert.equal(observed.length, count, "SQL proof verification is offline and cannot replay writes");
    const report = JSON.parse(await readFile(files.report, "utf8"));
    assert.equal(report.paidModelCalls, 0); assert.equal(report.newUsers, 0);
    assert.equal(report.requests.filter(item => item.responseBodyDiscarded).length, 1);
    const asText = JSON.stringify(report); assert.doesNotMatch(asText, /offline-synthetic-password|ccs_session=/);
  } finally {
    globalThis.fetch = savedFetch;
    for (const file of Object.values(files)) await unlink(file).catch(error => { if (error.code !== "ENOENT") throw error; });
    await rmdir(directory);
  }
});
