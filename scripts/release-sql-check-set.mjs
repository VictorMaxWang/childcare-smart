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

const overallRaw = getArg("--overall-passed=");
const overall = parseBool(overallRaw);
const outPath = getArg("--out=", "artifacts/release-sql-check.json");

if (overall === null) {
  console.error("[FAIL] Missing or invalid --overall-passed=<true|false>");
  process.exit(1);
}

const absPath = path.isAbsolute(outPath) ? outPath : path.join(cwd, outPath);
const dir = path.dirname(absPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const payload = {
  generatedAt: new Date().toISOString(),
  overallPassed: overall,
  source: "manual-supabase-sql-editor",
};

fs.writeFileSync(absPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`[OK] SQL check snapshot written: ${absPath}`);
console.log(`[OK] overallPassed=${overall}`);
