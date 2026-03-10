#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const args = process.argv.slice(2);

function getArg(prefix, fallback = "") {
  const found = args.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : fallback;
}

function parseBool(input) {
  const v = String(input ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(v)) return true;
  if (["0", "false", "no", "n", "off"].includes(v)) return false;
  return null;
}

function parsePositiveNumber(input, fallback) {
  const raw = String(input ?? "").trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function getReportAgeMinutes(reportData) {
  const generatedAtRaw = String(reportData?.generatedAt ?? "").trim();
  if (!generatedAtRaw) return { ok: false, reason: "missing generatedAt" };
  const ts = Date.parse(generatedAtRaw);
  if (Number.isNaN(ts)) return { ok: false, reason: "invalid generatedAt" };
  return { ok: true, minutes: (Date.now() - ts) / (1000 * 60), generatedAt: generatedAtRaw };
}

function getFailedChecks(reportData, section) {
  const checks = Array.isArray(reportData?.[section]?.checks) ? reportData[section].checks : [];
  return checks.filter((item) => item?.ok === false);
}

function formatCheckFailure(check) {
  const reason = check?.details?.diagnosis || check?.details?.reason || check?.details?.status || "unknown";
  return `${check?.name || "unknown-check"}: ${reason}`;
}

function readJsonSafe(targetPath) {
  const abs = path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath);
  if (!fs.existsSync(abs)) {
    return { ok: false, reason: `missing file: ${targetPath}` };
  }
  try {
    const raw = fs.readFileSync(abs, "utf8");
    return { ok: true, data: JSON.parse(raw), absPath: abs };
  } catch (e) {
    return {
      ok: false,
      reason: `invalid JSON at ${targetPath}: ${e instanceof Error ? e.message : "unknown error"}`,
    };
  }
}

function readEnvLikeFile(targetPath) {
  const abs = path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath);
  if (!fs.existsSync(abs)) {
    return { ok: false, reason: `missing file: ${targetPath}`, map: {} };
  }
  const map = {};
  const text = fs.readFileSync(abs, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (!key) continue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map[key] = value;
  }
  return { ok: true, map };
}

function isPlaceholderValue(value) {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return true;
  const patterns = ["your-domain", "example.com", "changeme", "replace-me", "<", ">", "todo"];
  return patterns.some((token) => v.includes(token));
}

const localReportPath = getArg("--local-report=", "release-report.json");
const remoteReportPath = getArg("--remote-report=", "artifacts/release-report.remote.json");
const sqlCheckPath = getArg("--sql-check=", "artifacts/release-sql-check.json");
const envFilePath = getArg("--env-file=", ".env.release");
const sqlOverallPassedRaw = getArg("--sql-overall-passed=");
let sqlOverallPassed = parseBool(sqlOverallPassedRaw);
const maxReportAgeMinutes = parsePositiveNumber(getArg("--max-report-age-minutes="), 180);

const blockers = [];
const warnings = [];
let localReady = false;
let remoteReady = false;
let sqlReady = false;
let envReady = false;

const sqlCheck = readJsonSafe(sqlCheckPath);
if (sqlOverallPassed === null && sqlCheck.ok) {
  sqlOverallPassed = parseBool(sqlCheck.data?.overallPassed);
}

const localReport = readJsonSafe(localReportPath);
if (!localReport.ok) {
  blockers.push(`Local report unavailable: ${localReport.reason}`);
} else if (!localReport.data?.summary?.passed) {
  blockers.push(`Local report failed: ${localReportPath}`);
  const failedLocal = getFailedChecks(localReport.data, "local");
  for (const check of failedLocal) {
    blockers.push(`  local -> ${formatCheckFailure(check)}`);
  }
} else {
  const age = getReportAgeMinutes(localReport.data);
  if (!age.ok) {
    blockers.push(`Local report timestamp invalid: ${localReportPath} (${age.reason})`);
  } else if (age.minutes > maxReportAgeMinutes) {
    blockers.push(
      `Local report is stale (${Math.floor(age.minutes)}m > ${maxReportAgeMinutes}m): ${localReportPath}. Re-run npm run release:gate:local.`
    );
  } else {
    localReady = true;
  }
}

const envFile = readEnvLikeFile(envFilePath);
const requiredEnvKeys = ["RELEASE_BASE_URL", "RELEASE_ADMIN_COOKIE", "CRON_SECRET"];
const missingEnvKeys = requiredEnvKeys.filter((k) => !String(envFile.map?.[k] ?? "").trim());
const placeholderEnvKeys = requiredEnvKeys.filter((k) => isPlaceholderValue(envFile.map?.[k]));

if (!envFile.ok) {
  blockers.push(`Env file unavailable: ${envFile.reason}`);
} else if (missingEnvKeys.length > 0) {
  blockers.push(`Env file missing required keys: ${missingEnvKeys.join(", ")}`);
} else if (placeholderEnvKeys.length > 0) {
  blockers.push(`Env file contains placeholder values: ${placeholderEnvKeys.join(", ")}`);
} else {
  envReady = true;
}

const remoteReport = readJsonSafe(remoteReportPath);
if (!envReady) {
  warnings.push("Remote report validation skipped until .env.release is complete.");
} else if (!remoteReport.ok) {
  blockers.push(`Remote report unavailable: ${remoteReport.reason}`);
} else if (!remoteReport.data?.summary?.passed) {
  blockers.push(`Remote report failed: ${remoteReportPath}`);
  const failedRemote = getFailedChecks(remoteReport.data, "remote");
  for (const check of failedRemote) {
    blockers.push(`  remote -> ${formatCheckFailure(check)}`);
  }
} else {
  const age = getReportAgeMinutes(remoteReport.data);
  if (!age.ok) {
    blockers.push(`Remote report timestamp invalid: ${remoteReportPath} (${age.reason})`);
  } else if (age.minutes > maxReportAgeMinutes) {
    blockers.push(
      `Remote report is stale (${Math.floor(age.minutes)}m > ${maxReportAgeMinutes}m): ${remoteReportPath}. Re-run npm run release:go:remote.`
    );
  } else {
    remoteReady = true;
  }
}

const envBaseUrl = String(envFile.map?.RELEASE_BASE_URL ?? "").trim().replace(/\/$/, "");
const reportBaseUrl = String(remoteReport.data?.remote?.baseUrl ?? "").trim().replace(/\/$/, "");
if (remoteReady && envBaseUrl && reportBaseUrl && envBaseUrl !== reportBaseUrl) {
  blockers.push(
    `Remote report context mismatch: env RELEASE_BASE_URL=${envBaseUrl}, report baseUrl=${reportBaseUrl}. Re-run npm run release:go:remote.`
  );
  remoteReady = false;
}

if (sqlOverallPassed === null) {
  blockers.push(
    "SQL final check not provided. Run npm run release:sql:pass after supabase/post-migration-check.sql shows overall_passed=true, or pass --sql-overall-passed=true."
  );
} else if (!sqlOverallPassed) {
  blockers.push("SQL final check reported overall_passed=false.");
} else {
  sqlReady = true;
}

console.log("Release readiness summary");
console.log(`- Local report:  ${localReportPath}`);
console.log(`- Remote report: ${remoteReportPath}`);
console.log(`- SQL overall:   ${sqlOverallPassed === null ? "(missing)" : String(sqlOverallPassed)}`);
console.log(`- SQL check:     ${sqlCheck.ok ? sqlCheckPath : `(missing) ${sqlCheckPath}`}`);
console.log(`- Env file:      ${envFilePath}${envFile.ok ? "" : " (missing)"}`);
console.log(`- Max age (min): ${maxReportAgeMinutes}`);

if (warnings.length > 0) {
  for (const w of warnings) {
    console.warn(`[WARN] ${w}`);
  }
}

if (blockers.length > 0) {
  let nextCommand = "npm run release:go:remote";
  let nextReason = "Complete remote gate checks.";
  if (!localReady) {
    nextCommand = "npm run release:gate:local";
    nextReason = "Local gate is not ready.";
  } else if (!envReady) {
    nextCommand = "npm run release:env:check";
    nextReason = "Fix .env.release with real values before remote gate.";
  } else if (!remoteReady) {
    nextCommand = "npm run release:go:remote";
    nextReason = "Remote gate report is missing/failed/stale.";
  } else if (!sqlReady) {
    nextCommand = "npm run release:sql:pass";
    nextReason = "SQL readiness snapshot is missing or false.";
  }
  console.error(`Next action: ${nextCommand}`);
  console.error(`Reason: ${nextReason}`);
  for (const b of blockers) {
    console.error(`[BLOCKER] ${b}`);
  }
  console.error("Release decision: BLOCKED");
  process.exit(1);
}

console.log("Release decision: GO");
