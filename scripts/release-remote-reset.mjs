#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const args = process.argv.slice(2);

function getArg(prefix, fallback = "") {
  const found = args.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : fallback;
}

function removeIfExists(targetPath) {
  const abs = path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath);
  if (!fs.existsSync(abs)) {
    console.log(`[SKIP] Not found: ${abs}`);
    return false;
  }
  fs.unlinkSync(abs);
  console.log(`[OK] Removed: ${abs}`);
  return true;
}

const remoteReportPath = getArg("--remote-report=", "artifacts/release-report.remote.json");

console.log("=== Remote Report Reset ===");
const removed = removeIfExists(remoteReportPath);

if (removed) {
  console.log("Remote report reset completed.");
} else {
  console.log("Nothing to reset.");
}
