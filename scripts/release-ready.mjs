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

const localReportPath = getArg("--local-report=", "release-report.json");
const remoteReportPath = getArg("--remote-report=", "artifacts/release-report.remote.json");
const sqlCheckPath = getArg("--sql-check=", "artifacts/release-sql-check.json");
const envFilePath = getArg("--env-file=", ".env.release");
const maxAge = Number(getArg("--max-report-age-minutes=", "180")) || 180;

const blockers = [];
let next = "npm run release:go:remote";

const env = readEnv(envFilePath);
const requiredEnv = ["RELEASE_BASE_URL", "RELEASE_ADMIN_COOKIE", "CRON_SECRET", "BRAIN_API_BASE_URL"];
const missingEnv = requiredEnv.filter((k) => !String(env.map[k] ?? "").trim());
const placeholderEnv = requiredEnv.filter((k) => isPlaceholderValue(env.map[k]));

if (!env.exists) {
  blockers.push(".env.release is missing.");
  next = "npm run release:env:init";
} else if (missingEnv.length > 0) {
  blockers.push(`.env.release missing required keys: ${missingEnv.join(", ")}.`);
  next = "npm run release:env:check";
} else if (placeholderEnv.length > 0) {
  blockers.push(`.env.release contains placeholder values: ${placeholderEnv.join(", ")}.`);
  next = "npm run release:env:check";
}

const local = readJsonSafe(localReportPath);
if (!local.ok || !local.data?.summary?.passed || !reportFresh(local.data, maxAge)) {
  blockers.push("Local gate report missing/failed/stale.");
  next = "npm run release:gate:local";
}

const remote = readJsonSafe(remoteReportPath);
if (
  (missingEnv.length === 0 && placeholderEnv.length === 0) &&
  (!remote.ok || !remote.data?.summary?.passed || !reportFresh(remote.data, maxAge))
) {
  blockers.push("Remote gate report missing/failed/stale.");
  if (next === "npm run release:go:remote") next = "npm run release:go:remote";
}

const sql = readJsonSafe(sqlCheckPath);
if (!sql.ok || parseBool(sql.data?.overallPassed) !== true) {
  blockers.push("SQL snapshot missing or not passed.");
  if (next === "npm run release:go:remote") next = "npm run release:sql:pass";
}

console.log("Release readiness summary");
console.log(`- Local report:  ${localReportPath}`);
console.log(`- Remote report: ${remoteReportPath}`);
console.log(`- SQL check:     ${sqlCheckPath}`);
console.log(`- Env file:      ${envFilePath}`);
console.log(`- Max age (min): ${maxAge}`);

if (blockers.length > 0) {
  console.error(`Next action: ${next}`);
  for (const b of blockers) console.error(`[BLOCKER] ${b}`);
  console.error("Release decision: BLOCKED");
  process.exit(1);
}

console.log("Release decision: GO");
