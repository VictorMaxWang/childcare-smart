#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const target = path.join(cwd, "artifacts", "release-report.remote.json");

console.log("=== Remote Report Reset ===");
if (fs.existsSync(target)) {
  fs.unlinkSync(target);
  console.log(`[OK] Removed: ${target}`);
} else {
  console.log(`[SKIP] Not found: ${target}`);
}
