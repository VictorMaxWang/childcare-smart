#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const roots = ["app", "components", "lib"];

function collectTestFiles(directory, results) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectTestFiles(absolutePath, results);
      continue;
    }
    if (/\.test\.tsx?$/u.test(entry.name)) {
      results.push(path.relative(cwd, absolutePath));
    }
  }
}

const testFiles = [];
for (const root of roots) {
  collectTestFiles(path.join(cwd, root), testFiles);
}
testFiles.sort((left, right) => left.localeCompare(right));

if (testFiles.length === 0) {
  console.error("[FAIL] No Node test files were discovered.");
  process.exit(1);
}

console.log(`[test:node] Running ${testFiles.length} test files.`);
const result = spawnSync(
  process.execPath,
  [
    "--import",
    "./scripts/register-test-path-loader.mjs",
    "--test",
    ...testFiles,
  ],
  {
    cwd,
    env: process.env,
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  }
);

if (result.error) {
  console.error(`[FAIL] Unable to start Node tests: ${result.error.message}`);
}
process.exit(typeof result.status === "number" ? result.status : 1);
