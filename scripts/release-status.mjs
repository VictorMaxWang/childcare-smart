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
  return { ok: true, minutes: (Date.now() - ts) / (1000 * 60) };
}

function getFailedChecks(reportData, section) {
  const checks = Array.isArray(reportData?.[section]?.checks) ? reportData[section].checks : [];
  return checks.filter((item) => item?.ok === false);
}

function readJsonSafe(relPath) {
  const absPath = path.isAbsolute(relPath) ? relPath : path.join(cwd, relPath);
  if (!fs.existsSync(absPath)) {
    return { exists: false, value: null, reason: "missing file" };
  }
  try {
    return { exists: true, value: JSON.parse(fs.readFileSync(absPath, "utf8")) };
  } catch (e) {
    return {
      exists: true,
      value: null,
      reason: e instanceof Error ? e.message : "invalid JSON",
    };
  }
}

function readEnvLikeFile(relPath) {
  const absPath = path.isAbsolute(relPath) ? relPath : path.join(cwd, relPath);
  if (!fs.existsSync(absPath)) return { exists: false, map: {} };
  const text = fs.readFileSync(absPath, "utf8");
  const lines = text.split(/\r?\n/);
  const map = {};

  for (const lineRaw of lines) {
    const line = lineRaw.trim();
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

  return { exists: true, map };
}

function isPlaceholderValue(value) {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return true;

  const patterns = ["your-domain", "example.com", "changeme", "replace-me", "<", ">", "todo"];
  return patterns.some((token) => v.includes(token));
}

function mark(ok, label, detail = "") {
  const icon = ok ? "[OK]" : "[TODO]";
  console.log(`${icon} ${label}${detail ? ` - ${detail}` : ""}`);
}

const localReportPath = getArg("--local-report=", "release-report.json");
const remoteReportPath = getArg("--remote-report=", "artifacts/release-report.remote.json");
const sqlCheckPath = getArg("--sql-check=", "artifacts/release-sql-check.json");
const envFilePath = getArg("--env-file=", ".env.release");
let sqlOverall = parseBool(getArg("--sql-overall-passed=", ""));
const maxReportAgeMinutes = parsePositiveNumber(getArg("--max-report-age-minutes=", ""), 180);

const localReport = readJsonSafe(localReportPath);
const remoteReport = readJsonSafe(remoteReportPath);
const sqlCheck = readJsonSafe(sqlCheckPath);
if (sqlOverall === null && sqlCheck.exists && sqlCheck.value) {
  sqlOverall = parseBool(sqlCheck.value.overallPassed);
}
const envFile = readEnvLikeFile(envFilePath);
const requiredEnvKeys = ["RELEASE_BASE_URL", "RELEASE_ADMIN_COOKIE", "CRON_SECRET"];

const missingEnvKeys = requiredEnvKeys.filter((k) => !(envFile.map[k] && String(envFile.map[k]).trim()));
const placeholderEnvKeys = requiredEnvKeys.filter((k) => isPlaceholderValue(envFile.map[k]));

const localPassed = Boolean(localReport.value?.summary?.passed);
const remotePassed = Boolean(remoteReport.value?.summary?.passed);
const envReady = envFile.exists && missingEnvKeys.length === 0 && placeholderEnvKeys.length === 0;
const sqlReady = sqlOverall === true;
const envBaseUrl = String(envFile.map.RELEASE_BASE_URL ?? "").trim().replace(/\/$/, "");
const reportBaseUrl = String(remoteReport.value?.remote?.baseUrl ?? "").trim().replace(/\/$/, "");
const remoteContextMatch = !envBaseUrl || !reportBaseUrl || envBaseUrl === reportBaseUrl;

const localAge = localReport.value ? getReportAgeMinutes(localReport.value) : { ok: false, reason: "report missing" };
const remoteAge = remoteReport.value
  ? getReportAgeMinutes(remoteReport.value)
  : { ok: false, reason: "report missing" };

const localFresh = localPassed && localAge.ok && localAge.minutes <= maxReportAgeMinutes;
const remoteFresh =
  remotePassed && remoteAge.ok && remoteAge.minutes <= maxReportAgeMinutes && remoteContextMatch;

console.log("Release status");
mark(
  localFresh,
  "Local gate report",
  localFresh
    ? `${localReportPath} (${Math.floor(localAge.minutes)}m old)`
    : localPassed
      ? `Stale or invalid timestamp. Re-run: npm run release:gate:local`
      : "Run: npm run release:gate:local"
);
mark(
  envReady,
  "Remote env file",
  envReady
    ? `${envFilePath} complete`
    : missingEnvKeys.length > 0
      ? `Missing: ${missingEnvKeys.join(", ")}`
      : `Placeholder values: ${placeholderEnvKeys.join(", ")}`
);
mark(
  remoteFresh,
  "Remote gate report",
  remoteFresh
    ? `${remoteReportPath} (${Math.floor(remoteAge.minutes)}m old)`
    : remotePassed && !remoteContextMatch
      ? `Report base URL mismatch. Env: ${envBaseUrl || "(empty)"}, Report: ${reportBaseUrl || "(empty)"}. Re-run: npm run release:go:remote`
      : remotePassed
      ? `Stale or invalid timestamp. Re-run: npm run release:go:remote`
      : "Run: npm run release:go:remote"
);
mark(sqlReady, "Supabase post-check overall_passed", sqlReady ? "true" : "Run SQL and then pass --sql-overall-passed=true");
mark(sqlReady, "SQL check snapshot", sqlCheck.exists ? sqlCheckPath : "Run: npm run release:sql:pass after SQL confirms overall_passed=true");
console.log(`Freshness threshold: ${maxReportAgeMinutes} minutes`);

if (remoteReport.value && !remotePassed && remoteContextMatch && envReady) {
  const failedRemote = getFailedChecks(remoteReport.value, "remote");
  if (failedRemote.length > 0) {
    console.log("Remote failures:");
    for (const item of failedRemote.slice(0, 5)) {
      const detail = item?.details?.diagnosis || item?.details?.reason || item?.details?.status || "unknown";
      console.log(`- ${item.name}: ${detail}`);
    }
  }
}

if (remoteReport.value && !envReady && !remotePassed) {
  console.log("Remote failures hidden until .env.release is complete.");
}

if (remoteReport.value && !remoteContextMatch) {
  console.log("Remote report context mismatch:");
  console.log(`- .env.release RELEASE_BASE_URL: ${envBaseUrl || "(empty)"}`);
  console.log(`- Report baseUrl: ${reportBaseUrl || "(empty)"}`);
}

const blockers = [];
if (!localFresh) blockers.push("Local gate not passed or stale");
if (!envReady) blockers.push("Remote env not complete");
if (!remoteFresh) blockers.push("Remote gate not passed or stale");
if (!sqlReady) blockers.push("SQL final check not confirmed");

if (blockers.length > 0) {
  console.log("\nNext action:");
  if (!localFresh) console.log("- npm run release:gate:local");
  if (!envReady)
    console.log("- Fill .env.release with real values (not placeholders) for RELEASE_BASE_URL, RELEASE_ADMIN_COOKIE, CRON_SECRET");
  if (!remoteFresh) console.log("- npm run release:go:remote");
  if (!sqlReady)
    console.log(
      "- Execute supabase/schema.sql and supabase/post-migration-check.sql, then run: npm run release:sql:pass"
    );
  process.exit(1);
}

console.log("\nAll release gates look ready.");
