import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createPool } from "mysql2/promise";
import { DatabaseStorybookMediaTaskStore } from "../lib/server/storybook-media-task-store.ts";

const args = process.argv.slice(2), arg = (key, fallback) => args.find(item => item.startsWith(`${key}=`))?.slice(key.length + 1) || fallback;
if (!args.includes("--execute")) { console.log(JSON.stringify({ mode: "plan-only", host: "127.0.0.1", port: 13306, database: "childcare", actualAiCalls: 0, note: "Requires --credentials-file for the existing isolated local fixture; no provider/Blob requests." })); process.exit(0); }
const credentialsFile = arg("--credentials-file"); assert.ok(credentialsFile);
const credentials = JSON.parse(await readFile(credentialsFile, "utf8")), password = typeof credentials.app === "string" ? credentials.app : credentials.app?.password;
assert.ok(typeof password === "string" && password.length);
const poolOptions = { host: "127.0.0.1", port: 13306, user: "childcare", password, database: "childcare", timezone: "Z", connectionLimit: 4 };
let pool = createPool(poolOptions), store = new DatabaseStorybookMediaTaskStore(pool);
const reportPath = path.resolve(arg("--report", "artifacts/implementation-20261031/storybook-receipts-sql-integration.json")); assert.ok(reportPath.replaceAll("\\", "/").includes("/artifacts/"));
const prefix = `receipt-sql-${randomUUID()}`, timestamp = Date.now();
const identity = sceneIndex => ({ institutionId: `${prefix}-inst`, userId: `${prefix}-teacher`, childId: `${prefix}-child`, storybookId: `${prefix}-story`, sceneIndex, channel: "image", provider: "maas-z-image", providerModel: "z-image-turbo", inputDigest: "a".repeat(64) });
const receipt = { version: 1, model: "z-image-turbo", requestId: "synthetic-receipt", contentType: "image/png", kind: "url", data: "https://synthetic.oss-cn-beijing.aliyuncs.com/image.png?Signature=private-test-no-network", receivedAtMs: timestamp };
const report = { kind: "local-mysql-storybook-receipts", host: "127.0.0.1", port: 13306, database: "childcare", startedAt: new Date().toISOString(), actualAiCalls: 0, actualExternalProviderRequests: 0, checks: [] };
async function verify(name, action) { try { await action(); report.checks.push({ name, status: "passed" }); } catch (error) { report.checks.push({ name, status: "failed", code: error.code || error.name, error: "SQL receipt invariant failed; inspect local test source, not private data." }); throw error; } }
async function seed(scene) { const target = identity(scene), claim = await store.claim(target, { nowMs: timestamp }); assert.equal(claim.action, "submit"); assert.ok(claim.leaseToken); return { target, claim }; }
async function block(target, leaseToken) { assert.equal(await store.markSubmissionFailure(target, leaseToken, { retryable: false, nextRetryAtMs: timestamp, reason: "materialization-download-interrupted" }, { nowMs: timestamp }), true); }
let saved;
try {
  await verify("the additive receipt migration executes twice without replacing existing tasks", async () => {
    const [before] = await pool.query("SELECT COUNT(*) AS total FROM storybook_media_tasks");
    const sql = await readFile("supabase/sql/20261031_storybook_media_receipts.sql", "utf8"); await pool.query(sql); await pool.query(sql);
    const [after] = await pool.query("SELECT COUNT(*) AS total FROM storybook_media_tasks"); assert.equal(after[0].total, before[0].total);
    const [rows] = await pool.query("SELECT data_type FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='storybook_media_receipts' AND column_name='result_json'"); assert.equal(rows[0].DATA_TYPE || rows[0].data_type, "longblob");
  });
  await verify("synchronous MaaS image reaches ready in the real SQL store without an asynchronous task id", async () => {
    const { target, claim } = await seed(1); assert.equal(await store.markReady(target, { leaseToken: claim.leaseToken, mediaKey: "b".repeat(40) }), true); assert.equal((await store.claim(target)).action, "ready");
  });
  await verify("receipt insertion is tied to the current actor and submission lease", async () => {
    const { target, claim } = await seed(2); saved = { target, claim };
    assert.equal(await store.saveProviderReceipt(target, "wrong-lease", receipt), false);
    assert.equal(await store.saveProviderReceipt({ ...target, userId: "foreign-actor" }, claim.leaseToken, receipt), false);
    assert.equal(await store.saveProviderReceipt(target, claim.leaseToken, receipt), true);
    assert.equal(await store.saveProviderReceipt(target, claim.leaseToken, { ...receipt, requestId: "must-not-overwrite" }), false);
    assert.ok(!JSON.stringify(await store.claim(target, { nowMs: timestamp })).includes("Signature="));
  });
  await verify("download failure preserves a receipt, permits only one free recovery lease and never increments generation attempts", async () => {
    await block(saved.target, saved.claim.leaseToken);
    const claims = await Promise.all([store.claimProviderReceipt(saved.target, { nowMs: timestamp }), store.claimProviderReceipt(saved.target, { nowMs: timestamp })]);
    assert.equal(claims.filter(item => item.action === "resume").length, 1); assert.equal(claims.filter(item => item.action === "wait").length, 1);
    const resumed = claims.find(item => item.action === "resume"); assert.deepEqual(resumed.receipt, receipt);
    const [rows] = await pool.execute("SELECT attempt_count FROM storybook_media_tasks WHERE institution_id=? AND scene_index=2", [saved.target.institutionId]); assert.equal(rows[0].attempt_count, 1);
    assert.equal(await store.markReady(saved.target, { leaseToken: resumed.leaseToken, mediaKey: "c".repeat(40) }), true);
  });
  await verify("institution, child and model identities cannot read another private receipt", async () => {
    for (const changed of [{ institutionId: "foreign-inst" }, { childId: "foreign-child" }, { providerModel: "foreign-model" }, { storybookId: "foreign-story" }]) assert.equal((await store.claimProviderReceipt({ ...saved.target, ...changed })).action, "none");
  });
  await verify("connection recreation resumes an unacknowledged known result without a second generation", async () => {
    const { target, claim } = await seed(3); assert.equal(await store.saveProviderReceipt(target, claim.leaseToken, receipt), true); await block(target, claim.leaseToken);
    await pool.end(); pool = createPool(poolOptions); store = new DatabaseStorybookMediaTaskStore(pool);
    const recovered = await store.claimProviderReceipt(target, { nowMs: timestamp }); assert.equal(recovered.action, "resume"); assert.deepEqual(recovered.receipt, receipt);
    assert.equal(await store.markReady(target, { leaseToken: recovered.leaseToken, mediaKey: "d".repeat(40) }), true);
  });
  await verify("a receipt-less legacy unknown remains blocked and cannot be supplied a fabricated replacement receipt", async () => {
    const { target, claim } = await seed(4); await block(target, claim.leaseToken);
    assert.equal((await store.claimProviderReceipt(target, { nowMs: timestamp + 120000 })).action, "none");
    assert.equal((await store.claim(target, { nowMs: timestamp + 120000 })).action, "blocked"); assert.equal(await store.saveProviderReceipt(target, claim.leaseToken, receipt), false);
  });
  await verify("a process interruption after receipt commit resumes after lease expiry, not before", async () => {
    const { target, claim } = await seed(5); assert.equal(await store.saveProviderReceipt(target, claim.leaseToken, receipt), true);
    assert.equal((await store.claimProviderReceipt(target, { nowMs: timestamp + 1000 })).action, "wait");
    const resumed = await store.claimProviderReceipt(target, { nowMs: timestamp + 60001 }); assert.equal(resumed.action, "resume"); assert.deepEqual(resumed.receipt, receipt);
    assert.equal((await store.claim(target, { nowMs: timestamp + 60001 })).attemptCount, 1);
  });
  await verify("inline audio bytes and their actual provider model round-trip through the private blob column", async () => {
    const target = { ...identity(6), channel: "audio", provider: "maas-tts", providerModel: "qwen3-tts-flash" }, claim = await store.claim(target, { nowMs: timestamp });
    const inline = { ...receipt, model: target.providerModel, contentType: "audio/wav", kind: "base64", data: Buffer.from("synthetic-audio-no-provider").toString("base64") };
    assert.equal(await store.saveProviderReceipt(target, claim.leaseToken, inline), true); await block(target, claim.leaseToken);
    const resumed = await store.claimProviderReceipt(target, { nowMs: timestamp }); assert.equal(resumed.action, "resume"); assert.equal(resumed.receipt.data, inline.data); assert.equal(resumed.receipt.model, target.providerModel);
  });
} catch { process.exitCode = 1; }
finally { await pool.end(); report.finishedAt = new Date().toISOString(); report.passed = report.checks.filter(item => item.status === "passed").length; report.failed = report.checks.filter(item => item.status === "failed").length;
  await mkdir(path.dirname(reportPath), { recursive: true }); await writeFile(reportPath, JSON.stringify(report, null, 2), { flag: "wx" }); console.log(JSON.stringify({ passed: report.passed, failed: report.failed, actualAiCalls: 0, reportPath })); }
