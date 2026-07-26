#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import {
  FORMAL_REAL_SMOKE_ENV_KEYS,
  validateFormalRealSmokeEnv,
} from "./release-test-policy.mjs";

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

const localReportPath = getArg("--local-report=", "artifacts/release-gate.strict.json");
const remoteReportPath = getArg("--remote-report=", "artifacts/release-report.remote.json");
const realSmokeReportPath = getArg(
  "--real-smoke-report=",
  "artifacts/real-smoke/formal-report.json"
);
const sqlCheckPath = getArg("--sql-check=", "artifacts/release-sql-check.json");
const envFilePath = getArg("--env-file=", ".env.release");
const maxAge = Number(getArg("--max-report-age-minutes=", "180")) || 180;

const localReport = readJsonSafe(localReportPath);
const remoteReport = readJsonSafe(remoteReportPath);
const realSmokeReport = readJsonSafe(realSmokeReportPath);
const sqlCheck = readJsonSafe(sqlCheckPath);
const env = readEnv(envFilePath);

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

const localAge = localReport.value ? ageMinutes(localReport.value) : null;
const remoteAge = remoteReport.value ? ageMinutes(remoteReport.value) : null;
const realSmokeAge = realSmokeReport.value ? ageMinutes(realSmokeReport.value) : null;
const sqlAge = sqlCheck.value ? ageMinutes(sqlCheck.value) : null;
const envBaseUrl = String(env.map.RELEASE_BASE_URL ?? "").trim().replace(/\/$/, "");
const reportBaseUrl = String(remoteReport.value?.remote?.baseUrl ?? "").trim().replace(/\/$/, "");
const remoteContextMatch =
  Boolean(envBaseUrl) && Boolean(reportBaseUrl) && envBaseUrl === reportBaseUrl;

const localReady =
  localReport.value?.summary?.passed === true &&
  localReport.value?.mode === "strict" &&
  localReport.value?.productionValidated === true &&
  localAge !== null &&
  localAge <= maxAge;
const remoteReady =
  Boolean(remoteReport.value?.summary?.passed) && remoteAge !== null && remoteAge <= maxAge && remoteContextMatch;
const realSmokeReady =
  realSmokeReport.value?.summary?.passed === true &&
  realSmokeReport.value?.formalRelease === true &&
  realSmokeReport.value?.mode === "all" &&
  realSmokeReport.value?.liveAiRequired === true &&
  realSmokeReport.value?.targetMatchesRelease === true &&
  realSmokeReport.value?.productionValidated === true &&
  realSmokeAge !== null &&
  realSmokeAge <= maxAge;
const sqlReady =
  parseBool(sqlCheck.value?.overallPassed) === true &&
  sqlCheck.value?.source === "npm run db:check" &&
  sqlCheck.value?.mode === "strict" &&
  sqlAge !== null &&
  sqlAge <= maxAge;
const envReady =
  env.exists &&
  missingEnv.length === 0 &&
  placeholderEnv.length === 0 &&
  formalEnv.ok;

function mark(ok, label, detail) {
  console.log(`${ok ? "[OK]" : "[TODO]"} ${label}${detail ? ` - ${detail}` : ""}`);
}

console.log("Release status");
mark(
  localReady,
  "Strict local normal-session report",
  localReady
    ? `${Math.floor(localAge)}m old`
    : "Run: npm run release:gate:strict"
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
      : "Run: npm run release:go:remote"
);
mark(
  realSmokeReady,
  "Formal production three-role smoke",
  realSmokeReady
    ? `${Math.floor(realSmokeAge)}m old`
    : "Run: npm run release:gate:real"
);
mark(
  sqlReady,
  "Strict SQL readiness evidence",
  sqlReady
    ? `${Math.floor(sqlAge)}m old`
    : "Run: npm run release:gate:strict"
);
console.log(`Freshness threshold: ${maxAge} minutes`);

if (!localReady || !envReady || !remoteReady || !realSmokeReady || !sqlReady) {
  let nextAction = "npm run release:gate:formal";
  let reason = "One or more formal release evidence records are incomplete.";

  if (!envReady) {
    nextAction = "npm run release:env:check:formal";
    reason = "Formal release env is incomplete, invalid, or contains placeholders.";
  } else if (!localReady) {
    nextAction = "npm run release:gate:strict";
    reason =
      "Strict local report is missing, stale, failed, or allowed real-account skips.";
  } else if (!remoteReady) {
    nextAction = "npm run release:go:remote";
    reason = "Remote gate report is not ready for this env context.";
  } else if (!realSmokeReady) {
    nextAction = "npm run release:gate:real";
    reason =
      "Formal production smoke is missing, stale, partial, skipped, or failed.";
  } else if (!sqlReady) {
    nextAction = "npm run release:gate:strict";
    reason =
      "SQL readiness evidence is missing, stale, failed, or not produced by db:check.";
  }

  console.log(`\nNext action: ${nextAction}`);
  console.log(`Reason: ${reason}`);
  process.exit(1);
}

console.log("\nAll formal release gates are backed by non-skipped evidence.");
