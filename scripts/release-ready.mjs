#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import {
  FORMAL_REAL_SMOKE_ENV_KEYS,
  validateFormalRealSmokeEnv,
} from "./release-test-policy.mjs";
import {
  assertReleaseSourceClean,
  commitMatches,
  normalizeDeploymentId,
  normalizeDeploymentUrl,
  normalizeReleaseRunId,
  readLocalCommitSha,
} from "./release-commit-proof.mjs";
import {
  resolveReleaseReportSigningSecret,
  verifyReleaseReport,
} from "./release-report-proof.mjs";

const cwd = process.cwd();
const args = process.argv.slice(2);

function getArg(prefix, fallback = "") {
  const found = args.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : fallback;
}

function parseBool(input) {
  const v = String(input ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(v)) return true;
  if (["0", "false", "no", "n", "off"].includes(v)) return false;
  return null;
}

function readJsonSafe(relPath) {
  const abs = path.isAbsolute(relPath) ? relPath : path.join(cwd, relPath);
  if (!fs.existsSync(abs)) return { ok: false, reason: `missing file: ${relPath}` };
  try {
    return { ok: true, data: JSON.parse(fs.readFileSync(abs, "utf8")) };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "invalid JSON" };
  }
}

function readEnv(relPath) {
  const abs = path.isAbsolute(relPath) ? relPath : path.join(cwd, relPath);
  if (!fs.existsSync(abs)) return { exists: false, map: {} };
  const map = {};
  for (const raw of fs.readFileSync(abs, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map[key] = value;
  }
  return { exists: true, map };
}

function isPlaceholderValue(value) {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return true;
  const patterns = ["your-domain", "example.com", "changeme", "replace-me", "<", ">", "todo"];
  return patterns.some((p) => v.includes(p));
}

function reportFresh(report, maxAgeMinutes) {
  const ts = Date.parse(String(report?.generatedAt ?? ""));
  if (Number.isNaN(ts)) return false;
  const ageMs = Date.now() - ts;
  return ageMs >= 0 && ageMs / (1000 * 60) <= maxAgeMinutes;
}

const REQUIRED_LOCAL_STEPS = [
  "npm run lint",
  "npm run typecheck",
  "npm run test:node",
  "npm run test:python",
  "npm run test:release-scripts",
  "npm run db:check",
  "npm run build",
  "node scripts/release-check.mjs",
];

function hasCompleteLocalEvidence(report) {
  if (!Array.isArray(report?.steps)) return false;
  const completed = report.steps.filter(
    (step) => step?.skipped !== true && step?.exitCode === 0
  );
  return (
    report.steps.every(
      (step) => step?.skipped !== true && step?.exitCode === 0
    ) &&
    REQUIRED_LOCAL_STEPS.every((label) =>
      completed.some((step) => step?.label === label)
    ) &&
    completed.some((step) =>
      String(step?.label ?? "").startsWith("release browser tests")
    ) &&
    report?.browserPolicy?.productionValidated === true
  );
}

function hasCompleteRemoteEvidence(report) {
  const checks = report?.remote?.checks;
  if (!Array.isArray(checks) || checks.length < 7) return false;
  const names = checks.map((check) => String(check?.name ?? ""));
  return (
    report?.remote?.enabled === true &&
    checks.every((check) => check?.ok === true) &&
    names.includes("remote:expected-commit-matches-local-head") &&
    names.some((name) => name.endsWith("/api/health")) &&
    names.includes("remote:protected-session") &&
    names.includes("remote:protected-state") &&
    names.includes("remote:protected-provider-status") &&
    names.some((name) => name.includes("/api/v1/health"))
  );
}

function hasCompleteRealSmokeEvidence(report) {
  const totals = report?.criticalCoverage?.totals;
  return (
    report?.playwrightExitCode === 0 &&
    report?.verdict?.passed === true &&
    report?.verdict?.productionValidated === true &&
    Number(totals?.total) >= 2 &&
    totals?.passed === totals?.total &&
    totals?.skipped === 0 &&
    totals?.flaky === 0 &&
    totals?.failed === 0
  );
}

const localReportPath = getArg("--local-report=", "artifacts/release-gate.strict.json");
const remoteReportPath = getArg("--remote-report=", "artifacts/release-report.remote.json");
const realSmokeReportPath = getArg(
  "--real-smoke-report=",
  "artifacts/real-smoke/formal-report.json"
);
const sqlCheckPath = getArg("--sql-check=", "artifacts/release-sql-check.json");
const envFilePath = getArg("--env-file=", ".env.release");
const requestedMaxAge = Number(
  getArg("--max-report-age-minutes=", "180")
);
const maxAge =
  Number.isFinite(requestedMaxAge) &&
  requestedMaxAge > 0 &&
  requestedMaxAge <= 1_440
    ? requestedMaxAge
    : 180;

const blockers = [];
let next = "npm run release:gate:formal";
let localCommitSha = "";
try {
  localCommitSha = readLocalCommitSha(cwd);
  assertReleaseSourceClean(cwd);
} catch (error) {
  block(
    `Unable to prove clean release source: ${
      error instanceof Error ? error.message : "unknown error"
    }.`
  );
}

function block(message, action = "npm run release:gate:formal") {
  blockers.push(message);
  if (blockers.length === 1) next = action;
}

const env = readEnv(envFilePath);
const reportSigningSecret =
  resolveReleaseReportSigningSecret(env.map);
const expectedCommitSha = String(
  env.map.RELEASE_EXPECTED_COMMIT_SHA ?? ""
).trim();
const requiredEnv = Array.from(
  new Set([
    "RELEASE_BASE_URL",
    "RELEASE_ADMIN_COOKIE",
    "RELEASE_EXPECTED_COMMIT_SHA",
    "CRON_SECRET",
    "BRAIN_API_BASE_URL",
    "DATABASE_URL",
    ...FORMAL_REAL_SMOKE_ENV_KEYS,
  ])
);
const missingEnv = requiredEnv.filter((k) => !String(env.map[k] ?? "").trim());
const placeholderEnv = requiredEnv.filter((k) => isPlaceholderValue(env.map[k]));

if (!env.exists) {
  block(".env.release is missing.", "npm run release:env:init");
} else if (missingEnv.length > 0) {
  block(
    `.env.release missing formal release keys: ${missingEnv.join(", ")}.`,
    "npm run release:env:check:formal"
  );
} else if (placeholderEnv.length > 0) {
  block(
    `.env.release contains placeholder values: ${placeholderEnv.join(", ")}.`,
    "npm run release:env:check:formal"
  );
} else {
  const formalEnv = validateFormalRealSmokeEnv(env.map);
  if (!formalEnv.ok) {
    block(
      `Formal real-smoke env is invalid: ${formalEnv.invalid.join(" ")}`,
      "npm run release:env:check:formal"
    );
  }
}
if (
  localCommitSha &&
  expectedCommitSha &&
  !commitMatches(localCommitSha, expectedCommitSha)
) {
  block(
    ".env.release RELEASE_EXPECTED_COMMIT_SHA does not match the current local HEAD.",
    "Update RELEASE_EXPECTED_COMMIT_SHA after deploying the current commit."
  );
}

const local = readJsonSafe(localReportPath);
const localCommitMatches =
  Boolean(localCommitSha) &&
  commitMatches(local.data?.localCommitSha, localCommitSha) &&
  commitMatches(local.data?.endCommitSha, localCommitSha);
const releaseRunId = normalizeReleaseRunId(local.data?.releaseRunId);
const localReady =
  local.ok &&
  verifyReleaseReport(local.data, reportSigningSecret) &&
  local.data?.schemaVersion === 2 &&
  Boolean(releaseRunId) &&
  local.data?.summary?.passed === true &&
  local.data?.mode === "strict" &&
  local.data?.productionValidated === true &&
  local.data?.isolatedWorktree === true &&
  local.data?.sourceCleanAtStart === true &&
  local.data?.sourceCleanAtEnd === true &&
  hasCompleteLocalEvidence(local.data) &&
  reportFresh(local.data, maxAge) &&
  localCommitMatches;
if (!localReady) {
  block(
    "Strict local gate report is missing, failed, stale, or lacks executed normal-session evidence.",
    "npm run release:gate:formal"
  );
}

const remote = readJsonSafe(remoteReportPath);
const envBaseUrl = String(env.map.RELEASE_BASE_URL ?? "").trim().replace(/\/$/u, "");
const remoteBaseUrl = String(remote.data?.remote?.baseUrl ?? "").trim().replace(/\/$/u, "");
const remoteContextMatches =
  Boolean(envBaseUrl) && Boolean(remoteBaseUrl) && envBaseUrl === remoteBaseUrl;
const remoteCommitMatches =
  Boolean(localCommitSha) &&
  commitMatches(remote.data?.remote?.expectedCommitSha, expectedCommitSha) &&
  commitMatches(remote.data?.remote?.localCommitSha, localCommitSha) &&
  commitMatches(remote.data?.remote?.deployedCommitSha, localCommitSha) &&
  commitMatches(remote.data?.local?.endCommitSha, localCommitSha);
const remoteDeploymentId = normalizeDeploymentId(
  remote.data?.remote?.deploymentId
);
const remoteDeploymentUrl = normalizeDeploymentUrl(
  remote.data?.remote?.deploymentUrl
);
const remoteReady =
  remote.ok &&
  verifyReleaseReport(remote.data, reportSigningSecret) &&
  remote.data?.schemaVersion === 2 &&
  normalizeReleaseRunId(remote.data?.releaseRunId) === releaseRunId &&
  remote.data?.summary?.passed === true &&
  remote.data?.local?.sourceCleanAtStart === true &&
  remote.data?.local?.sourceCleanAtEnd === true &&
  hasCompleteRemoteEvidence(remote.data) &&
  reportFresh(remote.data, maxAge) &&
  remoteContextMatches &&
  remoteCommitMatches &&
  Boolean(remoteDeploymentId) &&
  Boolean(remoteDeploymentUrl);
if (!remoteReady) {
  block(
    "Remote deployment report is missing, failed, stale, or targets a different RELEASE_BASE_URL.",
    "npm run release:gate:formal"
  );
}

const realSmoke = readJsonSafe(realSmokeReportPath);
const realSmokeCommitMatches =
  Boolean(localCommitSha) &&
  commitMatches(realSmoke.data?.expectedCommitSha, expectedCommitSha) &&
  commitMatches(realSmoke.data?.localCommitSha, localCommitSha) &&
  commitMatches(realSmoke.data?.targetCommitShaBefore, localCommitSha) &&
  commitMatches(realSmoke.data?.targetCommitShaAfter, localCommitSha) &&
  commitMatches(realSmoke.data?.endCommitSha, localCommitSha) &&
  realSmoke.data?.deploymentCommitVerified === true;
const realSmokeDeploymentMatches =
  normalizeDeploymentId(realSmoke.data?.targetDeploymentIdBefore) ===
    remoteDeploymentId &&
  normalizeDeploymentId(realSmoke.data?.targetDeploymentIdAfter) ===
    remoteDeploymentId &&
  normalizeDeploymentUrl(realSmoke.data?.targetDeploymentUrl) ===
    remoteDeploymentUrl;
const realSmokeReady =
  realSmoke.ok &&
  verifyReleaseReport(realSmoke.data, reportSigningSecret) &&
  realSmoke.data?.schemaVersion === 2 &&
  normalizeReleaseRunId(realSmoke.data?.releaseRunId) === releaseRunId &&
  realSmoke.data?.summary?.passed === true &&
  realSmoke.data?.formalRelease === true &&
  realSmoke.data?.mode === "all" &&
  realSmoke.data?.liveAiRequired === true &&
  realSmoke.data?.networkOriginPinned === true &&
  realSmoke.data?.targetMatchesRelease === true &&
  realSmoke.data?.productionValidated === true &&
  realSmoke.data?.sourceCleanAtStart === true &&
  realSmoke.data?.sourceCleanAtEnd === true &&
  hasCompleteRealSmokeEvidence(realSmoke.data) &&
  reportFresh(realSmoke.data, maxAge) &&
  realSmokeCommitMatches &&
  realSmokeDeploymentMatches;
if (!realSmokeReady) {
  block(
    "Formal production smoke report is missing, failed, stale, skipped, partial, or targets the wrong deployment.",
    "npm run release:gate:formal"
  );
}

const sql = readJsonSafe(sqlCheckPath);
const sqlReady =
  sql.ok &&
  verifyReleaseReport(sql.data, reportSigningSecret) &&
  sql.data?.schemaVersion === 2 &&
  normalizeReleaseRunId(sql.data?.releaseRunId) === releaseRunId &&
  parseBool(sql.data?.overallPassed) === true &&
  sql.data?.source === "npm run db:check" &&
  sql.data?.mode === "strict" &&
  sql.data?.step?.label === "npm run db:check" &&
  sql.data?.step?.exitCode === 0 &&
  commitMatches(sql.data?.localCommitSha, localCommitSha) &&
  reportFresh(sql.data, maxAge);
if (!sqlReady) {
  block(
    "SQL evidence is missing, failed, stale, or was not generated by the strict db:check step.",
    "npm run release:gate:formal"
  );
}

console.log("Release readiness summary");
console.log(`- Strict local report: ${localReportPath}`);
console.log(`- Remote report:       ${remoteReportPath}`);
console.log(`- Real smoke report:   ${realSmokeReportPath}`);
console.log(`- SQL check:           ${sqlCheckPath}`);
console.log(`- Env file:            ${envFilePath}`);
console.log(`- Max age (min):       ${maxAge}`);

if (blockers.length > 0) {
  console.error(`Next action: ${next}`);
  for (const b of blockers) console.error(`[BLOCKER] ${b}`);
  console.error("Release decision: BLOCKED");
  process.exit(1);
}

console.log("Release decision: GO (strict normal-session + formal production smoke)");
