#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const envPath = path.join(cwd, ".env.release");

const requiredKeys = ["RELEASE_BASE_URL", "RELEASE_ADMIN_COOKIE", "CRON_SECRET"];

function isPlaceholderValue(value) {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return true;

  const patterns = [
    "your-domain",
    "example.com",
    "changeme",
    "replace-me",
    "<",
    ">",
    "todo",
  ];

  return patterns.some((token) => v.includes(token));
}

function parseEnvFile(fileText) {
  const out = {};
  for (const rawLine of fileText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;

    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (!key) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    out[key] = value;
  }
  return out;
}

if (!fs.existsSync(envPath)) {
  console.error(`[FAIL] Missing file: ${envPath}`);
  console.error("Create it from .env.release.example before running remote gate.");
  process.exit(1);
}

const env = parseEnvFile(fs.readFileSync(envPath, "utf8"));
const missing = requiredKeys.filter((key) => !String(env[key] ?? "").trim());
const placeholder = requiredKeys.filter((key) => isPlaceholderValue(env[key]));

if (missing.length > 0) {
  console.error("[FAIL] .env.release is incomplete.");
  for (const key of missing) {
    console.error(` - missing: ${key}`);
  }
  process.exit(1);
}

if (placeholder.length > 0) {
  console.error("[FAIL] .env.release contains placeholder values.");
  for (const key of placeholder) {
    console.error(` - placeholder: ${key}`);
  }
  process.exit(1);
}

console.log("[OK] .env.release has all required keys for remote gate.");
process.exit(0);
