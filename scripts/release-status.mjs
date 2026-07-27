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
  if (!fs.existsSync(abs)) return { exists: false, value: null };
  try {
    return { exists: true, value: JSON.parse(fs.readFileSync(abs, "utf8")) };
  } catch {
    return { exists: true, value: null };
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

function ageMinutes(report) {
  const ts = Date.parse(String(report?.generatedAt ?? ""));
  if (Number.isNaN(ts)) return null;
  const age = (Date.now() - ts) / (1000 * 60);
  return age >= 0 ? age : null;
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

const localReport = readJsonSafe(localReportPath);
const remoteReport = readJsonSafe(remoteReportPath);
const realSmokeReport = readJsonSafe(realSmokeReportPath);
const sqlCheck = readJsonSafe(sqlCheckPath);
const env = readEnv(envFilePath);
const reportSigningSecret =
  resolveReleaseReportSigningSecret(env.map);

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
const formalEnv = validateFormalRealSmokeEnv(env.map);
let localCommitSha = "";
try {
  localCommitSha = readLocalCommitSha(cwd);
  assertReleaseSourceClean(cwd);
} catch {
  localCommitSha = "";
}
const expectedCommitSha = String(
  env.map.RELEASE_EXPECTED_COMMIT_SHA ?? ""
).trim();
const expectedCommitMatchesLocal = commitMatches(
  expectedCommitSha,
  localCommitSha
);

const localAge = localReport.value ? ageMinutes(localReport.value) : null;
const remoteAge = remoteReport.value ? ageMinutes(remoteReport.value) : null;
const realSmokeAge = realSmokeReport.value ? ageMinutes(realSmokeReport.value) : null;
const sqlAge = sqlCheck.value ? ageMinutes(sqlCheck.value) : null;
const envBaseUrl = String(env.map.RELEASE_BASE_URL ?? "").trim().replace(/\/$/, "");
const reportBaseUrl = String(remoteReport.value?.remote?.baseUrl ?? "").trim().replace(/\/$/, "");
const remoteContextMatch =
  Boolean(envBaseUrl) && Boolean(reportBaseUrl) && envBaseUrl === reportBaseUrl;
const localCommitMatch = commitMatches(
  localReport.value?.localCommitSha,
  localCommitSha
) && commitMatches(localReport.value?.endCommitSha, localCommitSha);
const releaseRunId = normalizeReleaseRunId(
  localReport.value?.releaseRunId
);
const remoteDeploymentId = normalizeDeploymentId(
  remoteReport.value?.remote?.deploymentId
);
const remoteDeploymentUrl = normalizeDeploymentUrl(
  remoteReport.value?.remote?.deploymentUrl
);
const remoteCommitMatch =
  commitMatches(
    remoteReport.value?.remote?.expectedCommitSha,
    expectedCommitSha
  ) &&
  commitMatches(
    remoteReport.value?.remote?.localCommitSha,
    localCommitSha
  ) &&
  commitMatches(
    remoteReport.value?.remote?.deployedCommitSha,
    localCommitSha
  ) &&
  commitMatches(remoteReport.value?.local?.endCommitSha, localCommitSha);
const realSmokeCommitMatch =
  commitMatches(realSmokeReport.value?.expectedCommitSha, expectedCommitSha) &&
  commitMatches(realSmokeReport.value?.localCommitSha, localCommitSha) &&
  commitMatches(
    realSmokeReport.value?.targetCommitShaBefore,
    localCommitSha
  ) &&
  commitMatches(
    realSmokeReport.value?.targetCommitShaAfter,
    localCommitSha
  ) &&
  commitMatches(realSmokeReport.value?.endCommitSha, localCommitSha) &&
  realSmokeReport.value?.deploymentCommitVerified === true;
const realSmokeDeploymentMatch =
  normalizeDeploymentId(
    realSmokeReport.value?.targetDeploymentIdBefore
  ) === remoteDeploymentId &&
  normalizeDeploymentId(
    realSmokeReport.value?.targetDeploymentIdAfter
  ) === remoteDeploymentId &&
  normalizeDeploymentUrl(
    realSmokeReport.value?.targetDeploymentUrl
  ) === remoteDeploymentUrl;

const localReady =
  verifyReleaseReport(localReport.value, reportSigningSecret) &&
  localReport.value?.schemaVersion === 2 &&
  Boolean(releaseRunId) &&
  localReport.value?.summary?.passed === true &&
  localReport.value?.mode === "strict" &&
  localReport.value?.productionValidated === true &&
  localReport.value?.isolatedWorktree === true &&
  localReport.value?.sourceCleanAtStart === true &&
  localReport.value?.sourceCleanAtEnd === true &&
  localCommitMatch &&
  localAge !== null &&
  localAge <= maxAge;
const remoteReady =
  verifyReleaseReport(remoteReport.value, reportSigningSecret) &&
  remoteReport.value?.schemaVersion === 2 &&
  normalizeReleaseRunId(remoteReport.value?.releaseRunId) === releaseRunId &&
  remoteReport.value?.summary?.passed === true &&
  remoteReport.value?.local?.sourceCleanAtStart === true &&
  remoteReport.value?.local?.sourceCleanAtEnd === true &&
  remoteAge !== null &&
  remoteAge <= maxAge &&
  remoteContextMatch &&
  remoteCommitMatch &&
  Boolean(remoteDeploymentId) &&
  Boolean(remoteDeploymentUrl);
const realSmokeReady =
  verifyReleaseReport(realSmokeReport.value, reportSigningSecret) &&
  realSmokeReport.value?.schemaVersion === 2 &&
  normalizeReleaseRunId(realSmokeReport.value?.releaseRunId) === releaseRunId &&
  realSmokeReport.value?.summary?.passed === true &&
  realSmokeReport.value?.formalRelease === true &&
  realSmokeReport.value?.mode === "all" &&
  realSmokeReport.value?.liveAiRequired === true &&
  realSmokeReport.value?.targetMatchesRelease === true &&
  realSmokeReport.value?.productionValidated === true &&
  realSmokeReport.value?.sourceCleanAtStart === true &&
  realSmokeReport.value?.sourceCleanAtEnd === true &&
  realSmokeCommitMatch &&
  realSmokeDeploymentMatch &&
  realSmokeAge !== null &&
  realSmokeAge <= maxAge;
const sqlReady =
  verifyReleaseReport(sqlCheck.value, reportSigningSecret) &&
  sqlCheck.value?.schemaVersion === 2 &&
  normalizeReleaseRunId(sqlCheck.value?.releaseRunId) === releaseRunId &&
  parseBool(sqlCheck.value?.overallPassed) === true &&
  sqlCheck.value?.source === "npm run db:check" &&
  sqlCheck.value?.mode === "strict" &&
  commitMatches(sqlCheck.value?.localCommitSha, localCommitSha) &&
  sqlAge !== null &&
  sqlAge <= maxAge;
const envReady =
  env.exists &&
  missingEnv.length === 0 &&
  placeholderEnv.length === 0 &&
  formalEnv.ok &&
  expectedCommitMatchesLocal;

function mark(ok, label, detail) {
  console.log(`${ok ? "[OK]" : "[TODO]"} ${label}${detail ? ` - ${detail}` : ""}`);
}

console.log("Release status");
mark(
  localReady,
  "Strict local normal-session report",
  localReady
    ? `${Math.floor(localAge)}m old`
    : "Run: npm run release:gate:formal"
);
mark(
  envReady,
  "Formal release env file",
  missingEnv.length > 0
    ? `Missing: ${missingEnv.join(", ")}`
    : placeholderEnv.length > 0
      ? `Placeholder values: ${placeholderEnv.join(", ")}`
      : formalEnv.invalid.length > 0
        ? formalEnv.invalid.join(" ")
      : "complete"
);
mark(
  remoteReady,
  "Remote gate report",
  remoteReady
    ? `${Math.floor(remoteAge)}m old`
    : !remoteContextMatch
      ? `Context mismatch (env=${envBaseUrl || "(empty)"}, report=${reportBaseUrl || "(empty)"})`
      : "Run: npm run release:gate:formal"
);
mark(
  realSmokeReady,
  "Formal production three-role smoke",
  realSmokeReady
    ? `${Math.floor(realSmokeAge)}m old`
    : "Run: npm run release:gate:formal"
);
mark(
  sqlReady,
  "Strict SQL readiness evidence",
  sqlReady
    ? `${Math.floor(sqlAge)}m old`
    : "Run: npm run release:gate:formal"
);
console.log(`Freshness threshold: ${maxAge} minutes`);

if (!localReady || !envReady || !remoteReady || !realSmokeReady || !sqlReady) {
  let nextAction = "npm run release:gate:formal";
  let reason = "One or more formal release evidence records are incomplete.";

  if (!envReady) {
    nextAction = "npm run release:env:check:formal";
    reason = "Formal release env is incomplete, invalid, or contains placeholders.";
  } else if (!localReady) {
    nextAction = "npm run release:gate:formal";
    reason =
      "Strict local report is missing, stale, failed, or allowed real-account skips.";
  } else if (!remoteReady) {
    nextAction = "npm run release:gate:formal";
    reason = "Remote gate report is not ready for this env context.";
  } else if (!realSmokeReady) {
    nextAction = "npm run release:gate:formal";
    reason =
      "Formal production smoke is missing, stale, partial, skipped, or failed.";
  } else if (!sqlReady) {
    nextAction = "npm run release:gate:formal";
    reason =
      "SQL readiness evidence is missing, stale, failed, or not produced by db:check.";
  }

  console.log(`\nNext action: ${nextAction}`);
  console.log(`Reason: ${reason}`);
  process.exit(1);
}

console.log("\nAll formal release gates are backed by non-skipped evidence.");
