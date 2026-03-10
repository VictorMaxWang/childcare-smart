#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const arg = process.argv.find((a) => a.startsWith("--overall-passed="));
const raw = arg ? arg.slice("--overall-passed=".length).trim().toLowerCase() : "";
const value = raw === "true" || raw === "1" ? true : raw === "false" || raw === "0" ? false : null;

if (value === null) {
  console.error("[FAIL] Use --overall-passed=true|false");
  process.exit(1);
}

const out = path.join(cwd, "artifacts", "release-sql-check.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(
  out,
  `${JSON.stringify({ generatedAt: new Date().toISOString(), overallPassed: value }, null, 2)}\n`,
  "utf8"
);
console.log(`[OK] SQL snapshot written: ${out}`);
