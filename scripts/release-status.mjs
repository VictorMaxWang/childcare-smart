#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

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
  return (Date.now() - ts) / (1000 * 60);
}

const localReportPath = getArg("--local-report=", "release-report.json");
const remoteReportPath = getArg("--remote-report=", "artifacts/release-report.remote.json");
const sqlCheckPath = getArg("--sql-check=", "artifacts/release-sql-check.json");
const envFilePath = getArg("--env-file=", ".env.release");
const maxAge = Number(getArg("--max-report-age-minutes=", "180")) || 180;

const localReport = readJsonSafe(localReportPath);
const remoteReport = readJsonSafe(remoteReportPath);
const sqlCheck = readJsonSafe(sqlCheckPath);
const env = readEnv(envFilePath);

const missingEnv = ["RELEASE_BASE_URL", "RELEASE_ADMIN_COOKIE", "CRON_SECRET", "BRAIN_API_BASE_URL"].filter(
  (k) => !String(env.map[k] ?? "").trim()
);
const placeholderEnv = ["RELEASE_BASE_URL", "RELEASE_ADMIN_COOKIE", "CRON_SECRET", "BRAIN_API_BASE_URL"].filter((k) =>
  isPlaceholderValue(env.map[k])
);

const localAge = localReport.value ? ageMinutes(localReport.value) : null;
const remoteAge = remoteReport.value ? ageMinutes(remoteReport.value) : null;
const envBaseUrl = String(env.map.RELEASE_BASE_URL ?? "").trim().replace(/\/$/, "");
const reportBaseUrl = String(remoteReport.value?.remote?.baseUrl ?? "").trim().replace(/\/$/, "");
const remoteContextMatch = !envBaseUrl || !reportBaseUrl || envBaseUrl === reportBaseUrl;

const localReady =
  Boolean(localReport.value?.summary?.passed) && localAge !== null && localAge <= maxAge;
const remoteReady =
  Boolean(remoteReport.value?.summary?.passed) && remoteAge !== null && remoteAge <= maxAge && remoteContextMatch;
const sqlReady = parseBool(sqlCheck.value?.overallPassed) === true;

function mark(ok, label, detail) {
  console.log(`${ok ? "[OK]" : "[TODO]"} ${label}${detail ? ` - ${detail}` : ""}`);
}

console.log("Release status");
mark(localReady, "Local gate report", localReady ? `${Math.floor(localAge)}m old` : "Run: npm run release:gate:local");
mark(
  missingEnv.length === 0 && placeholderEnv.length === 0,
  "Remote env file",
  missingEnv.length > 0
    ? `Missing: ${missingEnv.join(", ")}`
    : placeholderEnv.length > 0
      ? `Placeholder values: ${placeholderEnv.join(", ")}`
      : "complete"
);
mark(
  remoteReady,
  "Remote gate report",
  remoteReady
    ? `${Math.floor(remoteAge)}m old`
    : !remoteContextMatch
      ? `Context mismatch (env=${envBaseUrl || "(empty)"}, report=${reportBaseUrl || "(empty)"})`
      : "Run: npm run release:go:remote"
);
mark(sqlReady, "SQL check snapshot", sqlReady ? sqlCheckPath : "Run: npm run release:sql:pass");
console.log(`Freshness threshold: ${maxAge} minutes`);

if (!localReady || missingEnv.length > 0 || placeholderEnv.length > 0 || !remoteReady || !sqlReady) {
  let nextAction = "npm run release:go:remote";
  let reason = "Remote gate report is missing, stale, failed, or context-mismatched.";

  if (!localReady) {
    nextAction = "npm run release:gate:local";
    reason = "Local gate report is missing, failed, or stale.";
  } else if (missingEnv.length > 0 || placeholderEnv.length > 0) {
    nextAction = "npm run release:env:check";
    reason = "Release env file is incomplete or still has placeholder values.";
  } else if (!remoteReady) {
    nextAction = "npm run release:go:remote";
    reason = "Remote gate report is not ready for this env context.";
  } else if (!sqlReady) {
    nextAction = "npm run release:sql:pass";
    reason = "SQL readiness snapshot is missing or false.";
  }

  console.log(`\nNext action: ${nextAction}`);
  console.log(`Reason: ${reason}`);
  process.exit(1);
}

console.log("\nAll release gates look ready.");
