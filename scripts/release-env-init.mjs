#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const target = path.join(cwd, ".env.release");
const source = path.join(cwd, ".env.release.example");

console.log("=== Release Env Init ===");

if (!fs.existsSync(source)) {
  console.error(`[FAIL] Missing source template: ${source}`);
  process.exit(1);
}

if (fs.existsSync(target)) {
  console.log(`[SKIP] Already exists: ${target}`);
  console.log("Edit .env.release and fill real values.");
  process.exit(0);
}

fs.copyFileSync(source, target);
console.log(`[OK] Created: ${target}`);
console.log("Next: edit .env.release and set RELEASE_BASE_URL, RELEASE_ADMIN_COOKIE, CRON_SECRET.");
