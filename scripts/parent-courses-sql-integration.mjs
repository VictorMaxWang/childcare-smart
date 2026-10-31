import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CARE_COURSES, COURSE_CATALOG_VERSION } from "../lib/courses/catalog.ts";
import { emptyInstitutionSnapshot } from "../lib/persistence/bootstrap.ts";
import { getSessionScope } from "../lib/server/session-scope.ts";
import { dbQuery, getDatabasePool } from "../lib/db/server.ts";
import { createCourseRecommendationJob, getCourseRecommendationJob, getParentCourses, listCourseLearning, runCourseRecommendationJob, saveCourseLearning } from "../lib/server/parent-course-service.ts";

const args = process.argv.slice(2);
const option = (name, fallback) => args.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1) || fallback;
const reportFile = path.resolve(option("--report", "artifacts/implementation-20261031/parent-courses-sql-integration.json"));
assert.ok(reportFile.replaceAll("\\", "/").includes("/artifacts/"), "报告只能写入忽略的artifacts目录。");
if (!args.includes("--execute")) {
  console.log(JSON.stringify({ mode: "plan-only", host: "127.0.0.1", port: 13306, database: "childcare", actualAiCalls: 0, instruction: "Use --execute --credentials-file=<private-local-fixture.json>. Requires the test-path loader. No browser or external network is used." }));
  process.exit(0);
}
const credentialsFile = option("--credentials-file");
assert.ok(credentialsFile, "需要显式指定本地隔离库凭据文件。");
const credentials = JSON.parse(await readFile(credentialsFile, "utf8"));
const password = typeof credentials.app === "string" ? credentials.app : credentials.app?.password;
assert.ok(typeof password === "string" && password.length, "本地凭据文件缺少app密码。");

// 固定本地入口并覆盖任何继承的生产配置；该脚本不能接受远程主机或数据库URL。
process.env.DATABASE_URL = `mysql://childcare:${encodeURIComponent(password)}@127.0.0.1:13306/childcare`;
process.env.DATABASE_SSL = "false";
process.env.AI_PROVIDER = "maas";
process.env.AI_API_KEY = "local-integration-no-real-model-key";
process.env.AI_BASE_URL = "http://127.0.0.1:9/compatible-mode/v1";
process.env.AI_SERVICE_UNAVAILABLE = "0";
process.env.AI_TEXT_MODEL = "local-integration-text-model";
process.env.AI_EMBEDDING_MODEL = "local-integration-embedding-model";

const originalFetch = globalThis.fetch;
let blockedNetworkAttempts = 0;
// 故障注入在网络发送之前发生；可检查数据库原子领取和unknown恢复，实际模型调用为零。
globalThis.fetch = async () => { blockedNetworkAttempts++; throw new TypeError("Intentional offline transport interruption"); };
const prefix = `course-sql-${randomUUID().slice(0, 8)}`;
const report = { kind: "local-mysql-synthetic-integration", startedAt: new Date().toISOString(), host: "127.0.0.1", port: 13306, database: "childcare", fixturePrefix: prefix, actualAiCalls: 0, actualExternalNetworkRequests: 0, checks: [] };
const cases = [];
const verify = (name, fn) => cases.push({ name, fn });
const statusIs = status => error => error && typeof error === "object" && error.status === status;
const newRequest = () => `${prefix}-${randomUUID()}`;
let scopeA, scopeA2, scopeB, baseJob;
const userA = { id: `${prefix}-parent-a`, name: "合成家长A", avatar: "P", role: "家长", institutionId: `${prefix}-inst-a`, childIds: [`${prefix}-child-a1`, `${prefix}-child-a2`], accountKind: "normal" };
const userA2 = { ...userA, id: `${prefix}-parent-a2`, name: "合成家长A2", childIds: [`${prefix}-child-a3`] };
const userB = { ...userA, id: `${prefix}-parent-b`, name: "合成家长B", institutionId: `${prefix}-inst-b`, childIds: [`${prefix}-child-b`] };
const childA = userA.childIds[0], childA2 = userA.childIds[1], childA3 = userA2.childIds[0], childB = userB.childIds[0];
const birthDate = months => { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1)).toISOString().slice(0, 10); };
const snapshot = emptyInstitutionSnapshot(new Date().toISOString());
snapshot.children = [
  { id: childA, user: userA, months: 8 }, { id: childA2, user: userA, months: 26 },
  { id: childA3, user: userA2, months: 30 }, { id: childB, user: userB, months: 18 },
].map(({ id, user, months }) => ({ id, name: "合成儿童", institutionId: user.institutionId, birthDate: birthDate(months), gender: "女", allergies: [], heightCm: 0, weightKg: 0, guardians: [], className: "合成验收班", specialNotes: "", avatar: "C", parentUserId: user.id }));
const scopeFor = user => getSessionScope(user, { load: async () => structuredClone(snapshot), save: async () => {} });
const countEvents = async requestId => Number((await dbQuery("SELECT COUNT(*) AS total FROM parent_course_learning_events WHERE institution_id=? AND user_id=? AND request_id=?", [userA.institutionId, userA.id, requestId])).rows[0].total);
const jobInput = (overrides = {}) => ({ childId: childA, module: "all", budgetMinutes: 5, requestId: newRequest(), ...overrides });

verify("local app identity, migrated course tables and deterministic sequence are present", async () => {
  const connection = new URL(process.env.DATABASE_URL);
  assert.equal(connection.hostname, "127.0.0.1"); assert.equal(connection.port, "13306");
  const identity = await dbQuery("SELECT SUBSTRING_INDEX(CURRENT_USER(),'@',1) AS actor,DATABASE() AS current_database");
  assert.equal(identity.rows[0].actor, "childcare"); assert.equal(identity.rows[0].current_database, "childcare");
  const tables = await dbQuery("SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name LIKE 'parent_course_%'");
  assert.equal(tables.rows.length, 4);
  const sequence = await dbQuery("SELECT extra FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='parent_course_learning_events' AND column_name='event_sequence'");
  assert.match(sequence.rows[0].EXTRA || sequence.rows[0].extra, /auto_increment/iu);
});
verify("isolated local normal actors and trusted scopes can be prepared without login bypass claims", async () => {
  for (const user of [userA, userA2, userB]) await dbQuery("INSERT INTO app_users (id,username_normalized,display_name,password_hash,role,institution_id,child_ids,is_demo) VALUES (?,?,?,?,?,?,?,0)", [user.id, user.id, user.name, "invalid-synthetic-password-no-login", user.role, user.institutionId, JSON.stringify(user.childIds)]);
  [scopeA, scopeA2, scopeB] = await Promise.all([scopeFor(userA), scopeFor(userA2), scopeFor(userB)]);
  assert.deepEqual(new Set(scopeA.visibleChildren.map(child => child.id)), new Set([childA, childA2]));
  // 仅本地公共目录夹具刷新元数据时间，使任务领取测试不触发站外核验。
  for (const course of CARE_COURSES) {
    const localCourse = { ...course, video: { ...course.video, verifiedAt: new Date().toISOString(), evidence: "local synthetic metadata fixture; not a new source verification" } };
    await dbQuery("INSERT INTO parent_course_catalog (course_id,catalog_version,course_json) VALUES (?,?,?) ON DUPLICATE KEY UPDATE catalog_version=VALUES(catalog_version),course_json=VALUES(course_json)", [course.id, COURSE_CATALOG_VERSION, JSON.stringify(localCourse)]);
  }
});
verify("same event request replays exactly once despite MySQL JSON key reordering", async () => {
  const requestId = newRequest(), input = { childId: childA, requestId, type: "practice", completed: true, note: "本地合成观察" };
  const first = await saveCourseLearning(scopeA, "nutrition-signals", input);
  const second = await saveCourseLearning(scopeA, "nutrition-signals", { note: input.note, type: input.type, requestId, completed: true, childId: childA });
  assert.deepEqual(second, first); assert.equal(await countEvents(requestId), 1);
});
verify("ten concurrent duplicate event writes persist one event", async () => {
  const requestId = newRequest(), input = { childId: childA, requestId, type: "opened" };
  const saved = await Promise.all(Array.from({ length: 10 }, () => saveCourseLearning(scopeA, "nutrition-signals", input)));
  assert.equal(saved.length, 10); assert.equal(await countEvents(requestId), 1);
});
verify("ten concurrent distinct event writes have no lost updates", async () => {
  const requests = Array.from({ length: 10 }, newRequest);
  await Promise.all(requests.map(requestId => saveCourseLearning(scopeA, "nutrition-signals", { childId: childA, requestId, type: "opened" })));
  for (const requestId of requests) assert.equal(await countEvents(requestId), 1);
});
verify("conflicting event data and another owned child cannot reuse a request id", async () => {
  const requestId = newRequest();
  await saveCourseLearning(scopeA, "nutrition-signals", { childId: childA, requestId, type: "opened" });
  await assert.rejects(saveCourseLearning(scopeA, "nutrition-signals", { childId: childA, requestId, type: "practice", completed: true }), statusIs(409));
  await assert.rejects(saveCourseLearning(scopeA, "nutrition-signals", { childId: childA2, requestId, type: "opened" }), statusIs(409));
  assert.equal(await countEvents(requestId), 1);
});
verify("same request identifiers remain independent between parents and institutions", async () => {
  const requestId = newRequest();
  await saveCourseLearning(scopeA, "nutrition-signals", { childId: childA, requestId, type: "opened" });
  await saveCourseLearning(scopeB, "nutrition-signals", { childId: childB, requestId, type: "opened" });
  const rows = await dbQuery("SELECT COUNT(*) AS total FROM parent_course_learning_events WHERE request_id=?", [requestId]);
  assert.equal(Number(rows.rows[0].total), 2);
});
verify("same-institution and cross-institution child reads and writes are denied", async () => {
  for (const foreign of [childA3, childB]) {
    await assert.rejects(getParentCourses(scopeA, foreign), statusIs(404));
    await assert.rejects(saveCourseLearning(scopeA, "nutrition-signals", { childId: foreign, requestId: newRequest(), type: "opened", institutionId: userA.institutionId }), statusIs(404));
  }
});
verify("demo writes, invalid answers and unsuitable age ranges fail without persistence", async () => {
  const demoScope = { ...scopeA, user: { ...scopeA.user, accountKind: "demo" } };
  await assert.rejects(saveCourseLearning(demoScope, "nutrition-signals", { childId: childA, requestId: newRequest(), type: "opened" }), statusIs(403));
  await assert.rejects(saveCourseLearning(scopeA, "nutrition-signals", { childId: childA, requestId: newRequest(), type: "answer", answer: 999 }), statusIs(400));
  await assert.rejects(saveCourseLearning(scopeA, "psychology-peers", { childId: childA, requestId: newRequest(), type: "opened" }), statusIs(403));
});
verify("latest feedback follows insertion order even with equal timestamps", async () => {
  const first = newRequest(), second = newRequest();
  await saveCourseLearning(scopeA, "nutrition-signals", { childId: childA, requestId: first, type: "feedback", feedback: "helpful" });
  await saveCourseLearning(scopeA, "nutrition-signals", { childId: childA, requestId: second, type: "feedback", feedback: "not-helpful" });
  await dbQuery("UPDATE parent_course_learning_events SET created_at='2026-01-01 00:00:00' WHERE institution_id=? AND user_id=? AND request_id IN (?,?)", [userA.institutionId, userA.id, first, second]);
  const latest = (await listCourseLearning(scopeA, childA)).find(event => [first, second].includes(event.requestId));
  assert.equal(latest.requestId, second); assert.equal(latest.feedback, "not-helpful");
});
verify("ten concurrent identical recommendations create only one pending task", async () => {
  const input = jobInput();
  const jobs = await Promise.all(Array.from({ length: 10 }, () => createCourseRecommendationJob(scopeA, input)));
  assert.equal(new Set(jobs.map(job => job.jobId)).size, 1); assert.equal(jobs[0].status, "pending"); baseJob = jobs[0];
  const replay = await createCourseRecommendationJob(scopeA, jobInput());
  assert.equal(replay.jobId, baseJob.jobId);
});
verify("request conflicts take precedence over a newer matching result cache", async () => {
  const other = await createCourseRecommendationJob(scopeA, jobInput({ budgetMinutes: 10 }));
  assert.notEqual(other.jobId, baseJob.jobId);
  await assert.rejects(createCourseRecommendationJob(scopeA, jobInput({ requestId: baseJob.requestId, budgetMinutes: 10 })), statusIs(409));
  await assert.rejects(createCourseRecommendationJob(scopeA, jobInput({ requestId: baseJob.requestId, childId: childA2 })), statusIs(409));
});
verify("private task reads are isolated by both parent and institution", async () => {
  await assert.rejects(getCourseRecommendationJob(scopeA2, baseJob.jobId), statusIs(404));
  await assert.rejects(getCourseRecommendationJob(scopeB, baseJob.jobId), statusIs(404));
});
verify("task input uses trusted child facts and ignores a client-supplied facts payload", async () => {
  const job = await createCourseRecommendationJob(scopeA, jobInput({ childId: childA2, facts: { injectedSecret: "must-not-be-stored" }, institutionId: userB.institutionId }));
  const stored = await dbQuery("SELECT institution_id,input_json FROM parent_course_recommendation_jobs WHERE job_id=?", [job.jobId]);
  const input = stored.rows[0].input_json;
  assert.equal(stored.rows[0].institution_id, userA.institutionId); assert.equal(input.childId, childA2);
  assert.equal(input.facts.injectedSecret, undefined); assert.ok(input.facts.ageMonths >= 26);
});
verify("text and embedding model identities invalidate private recommendation caches", async () => {
  process.env.AI_TEXT_MODEL = "local-integration-text-model-two";
  const textChanged = await createCourseRecommendationJob(scopeA, jobInput());
  assert.notEqual(textChanged.jobId, baseJob.jobId);
  process.env.AI_EMBEDDING_MODEL = "local-integration-embedding-model-two";
  const embeddingChanged = await createCourseRecommendationJob(scopeA, jobInput());
  assert.notEqual(embeddingChanged.jobId, textChanged.jobId);
  process.env.AI_TEXT_MODEL = "local-integration-text-model"; process.env.AI_EMBEDDING_MODEL = "local-integration-embedding-model";
});
verify("expired task caches cannot be reused under a new request id", async () => {
  const old = await createCourseRecommendationJob(scopeB, jobInput({ childId: childB }));
  await dbQuery("UPDATE parent_course_recommendation_jobs SET expires_at=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE job_id=?", [old.jobId]);
  const next = await createCourseRecommendationJob(scopeB, jobInput({ childId: childB }));
  assert.notEqual(next.jobId, old.jobId);
});
verify("completed synthetic result JSON replays without dispatch and binds only its own child/course", async () => {
  const job = await createCourseRecommendationJob(scopeA, jobInput({ childId: childA2 }));
  // 这里只验证持久化契约，结果明确是合成夹具，不作为模型生成成功证据。
  const syntheticResult = { courseIds: ["nutrition-signals"], reason: "合成数据库回放夹具", goals: ["回应喂养"], score: { total: 0.5, coverage: 1, relevance: 0.5, complementarity: 0.5, preference: 0, redundancy: 0, durationSeconds: 101 }, algorithmVersion: "local-fixture-only", model: "not-a-real-model-output", embeddingModel: "not-a-real-embedding-output", embeddingDimension: 3, reused: false };
  await dbQuery("UPDATE parent_course_recommendation_jobs SET status='completed',result_json=? WHERE job_id=?", [JSON.stringify(syntheticResult), job.jobId]);
  assert.deepEqual((await getCourseRecommendationJob(scopeA, job.jobId)).result, syntheticResult);
  const replay = await createCourseRecommendationJob(scopeA, jobInput({ childId: childA2 }));
  assert.equal(replay.jobId, job.jobId); assert.equal(replay.status, "completed");
  const attempts = blockedNetworkAttempts; await runCourseRecommendationJob(scopeA, job.jobId); assert.equal(blockedNetworkAttempts, attempts);
  await assert.rejects(saveCourseLearning(scopeA, "nutrition-texture", { childId: childA2, requestId: newRequest(), type: "feedback", feedback: "helpful", recommendationJobId: job.jobId }), statusIs(403));
  await assert.rejects(saveCourseLearning(scopeA, "nutrition-signals", { childId: childA, requestId: newRequest(), type: "feedback", feedback: "helpful", recommendationJobId: job.jobId }), statusIs(403));
  const requestId = newRequest();
  await saveCourseLearning(scopeA, "nutrition-signals", { childId: childA2, requestId, type: "feedback", feedback: "helpful", recommendationJobId: job.jobId });
  assert.equal((await listCourseLearning(scopeA, childA2)).find(event => event.requestId === requestId).recommendationJobId, job.jobId);
  const changed = await createCourseRecommendationJob(scopeA, jobInput({ childId: childA2 }));
  assert.notEqual(changed.jobId, job.jobId, "explicit new feedback changes the private data version");
});
verify("parallel workers grant one dispatch attempt and transport loss becomes unknown", async () => {
  const attempts = blockedNetworkAttempts;
  await Promise.all(Array.from({ length: 10 }, () => runCourseRecommendationJob(scopeA, baseJob.jobId)));
  assert.equal(blockedNetworkAttempts - attempts, 1, "only one worker reaches the blocked transport");
  assert.equal((await getCourseRecommendationJob(scopeA, baseJob.jobId)).status, "unknown");
  await Promise.all(Array.from({ length: 3 }, () => runCourseRecommendationJob(scopeA, baseJob.jobId)));
  assert.equal(blockedNetworkAttempts - attempts, 1, "unknown must never resubmit on refresh");
});
verify("stale running lease becomes unknown and does not automatically dispatch", async () => {
  const job = await createCourseRecommendationJob(scopeA2, jobInput({ childId: childA3 }));
  await dbQuery("UPDATE parent_course_recommendation_jobs SET status='running' WHERE job_id=?", [job.jobId]);
  assert.equal((await getCourseRecommendationJob(scopeA2, job.jobId)).status, "running");
  await dbQuery("UPDATE parent_course_recommendation_jobs SET updated_at=DATE_SUB(NOW(),INTERVAL 6 MINUTE) WHERE job_id=?", [job.jobId]);
  assert.equal((await getCourseRecommendationJob(scopeA2, job.jobId)).status, "unknown");
  const attempts = blockedNetworkAttempts;
  await runCourseRecommendationJob(scopeA2, job.jobId);
  assert.equal(blockedNetworkAttempts, attempts);
});
verify("revoked child authorization hides a previously owned task", async () => {
  const revokedSnapshot = structuredClone(snapshot);
  revokedSnapshot.children.filter(child => userA.childIds.includes(child.id)).forEach(child => { child.parentUserId = userA2.id; });
  const revoked = await getSessionScope({ ...userA, childIds: [] }, { load: async () => revokedSnapshot, save: async () => {} });
  await assert.rejects(getCourseRecommendationJob(revoked, baseJob.jobId), statusIs(404));
});
verify("learning and task state survive closing and recreating the database pool", async () => {
  const events = await listCourseLearning(scopeA, childA);
  await getDatabasePool().end(); delete globalThis.__smartChildcareDbPool;
  const reloaded = await listCourseLearning(scopeA, childA);
  assert.equal(reloaded.length, events.length);
  assert.equal((await getCourseRecommendationJob(scopeA, baseJob.jobId)).status, "unknown");
  assert.equal((await getParentCourses(scopeA, childA)).selectedChildId, childA);
});

try {
  for (const item of cases) {
    const started = performance.now();
    try { await item.fn(); report.checks.push({ name: item.name, status: "passed", elapsedMs: Math.round((performance.now() - started) * 100) / 100 }); }
    catch (error) { report.checks.push({ name: item.name, status: "failed", error: error.message, elapsedMs: Math.round((performance.now() - started) * 100) / 100 }); }
  }
} finally {
  globalThis.fetch = originalFetch;
  report.finishedAt = new Date().toISOString(); report.blockedOfflineFaultInjections = blockedNetworkAttempts;
  report.passed = report.checks.filter(item => item.status === "passed").length; report.failed = report.checks.filter(item => item.status === "failed").length;
  report.limits = ["Synthetic service scopes exercise real MySQL persistence; they do not certify browser login or cookie authorization.", "No successful model outputs are claimed; transport failure is deliberately injected before sending any network request.", "Synthetic rows remain under the recorded local fixture prefix; nothing is deleted and no production database is reachable through this script."];
  await mkdir(path.dirname(reportFile), { recursive: true }); await writeFile(reportFile, JSON.stringify(report, null, 2));
  await getDatabasePool().end(); delete globalThis.__smartChildcareDbPool;
}
console.log(JSON.stringify({ passed: report.passed, failed: report.failed, actualAiCalls: 0, actualExternalNetworkRequests: 0, blockedOfflineFaultInjections: blockedNetworkAttempts, reportFile }));
if (report.failed) process.exitCode = 1;
