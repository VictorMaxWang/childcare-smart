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
  return (Date.now() - ts) / (1000 * 60) <= maxAgeMinutes;
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

const blockers = [];
let next = "npm run release:gate:formal";

function block(message, action = "npm run release:gate:formal") {
  blockers.push(message);
  if (blockers.length === 1) next = action;
}

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

const local = readJsonSafe(localReportPath);
const localReady =
  local.ok &&
  local.data?.summary?.passed === true &&
  local.data?.mode === "strict" &&
  local.data?.productionValidated === true &&
  reportFresh(local.data, maxAge);
if (!localReady) {
  block(
    "Strict local gate report is missing, failed, stale, or lacks executed normal-session evidence.",
    "npm run release:gate:strict"
  );
}

const remote = readJsonSafe(remoteReportPath);
const envBaseUrl = String(env.map.RELEASE_BASE_URL ?? "").trim().replace(/\/$/u, "");
const remoteBaseUrl = String(remote.data?.remote?.baseUrl ?? "").trim().replace(/\/$/u, "");
const remoteContextMatches =
  Boolean(envBaseUrl) && Boolean(remoteBaseUrl) && envBaseUrl === remoteBaseUrl;
const remoteReady =
  remote.ok &&
  remote.data?.summary?.passed === true &&
  reportFresh(remote.data, maxAge) &&
  remoteContextMatches;
if (!remoteReady) {
  block(
    "Remote deployment report is missing, failed, stale, or targets a different RELEASE_BASE_URL.",
    "npm run release:go:remote"
  );
}

const realSmoke = readJsonSafe(realSmokeReportPath);
const realSmokeReady =
  realSmoke.ok &&
  realSmoke.data?.summary?.passed === true &&
  realSmoke.data?.formalRelease === true &&
  realSmoke.data?.mode === "all" &&
  realSmoke.data?.liveAiRequired === true &&
  realSmoke.data?.targetMatchesRelease === true &&
  realSmoke.data?.productionValidated === true &&
  reportFresh(realSmoke.data, maxAge);
if (!realSmokeReady) {
  block(
    "Formal production smoke report is missing, failed, stale, skipped, partial, or targets the wrong deployment.",
    "npm run release:gate:real"
  );
}

const sql = readJsonSafe(sqlCheckPath);
const sqlReady =
  sql.ok &&
  parseBool(sql.data?.overallPassed) === true &&
  sql.data?.source === "npm run db:check" &&
  sql.data?.mode === "strict" &&
  reportFresh(sql.data, maxAge);
if (!sqlReady) {
  block(
    "SQL evidence is missing, failed, stale, or was not generated by the strict db:check step.",
    "npm run release:gate:strict"
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
