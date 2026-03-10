#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const source = path.join(cwd, ".env.release.example");
const target = path.join(cwd, ".env.release");

console.log("=== Release Env Init ===");

if (!fs.existsSync(source)) {
  console.error(`[FAIL] Missing template: ${source}`);
  process.exit(1);
}

if (fs.existsSync(target)) {
  console.log(`[SKIP] Already exists: ${target}`);
  process.exit(0);
}

fs.copyFileSync(source, target);
console.log(`[OK] Created: ${target}`);
