#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import {
  FORMAL_REAL_SMOKE_ENV_KEYS,
  validateFormalRealSmokeEnv,
} from "./release-test-policy.mjs";

const cwd = process.cwd();
const args = process.argv.slice(2);
const formal = args.includes("--formal");
const envArg = args.find((arg) => arg.startsWith("--env-file="));
const envPath = path.resolve(
  cwd,
  envArg ? envArg.slice("--env-file=".length) : ".env.release"
);
const remoteRequired = [
  "RELEASE_BASE_URL",
  "RELEASE_ADMIN_COOKIE",
  "RELEASE_EXPECTED_COMMIT_SHA",
  "CRON_SECRET",
  "BRAIN_API_BASE_URL",
];
const required = formal
  ? Array.from(
      new Set([
        ...remoteRequired,
        "DATABASE_URL",
        ...FORMAL_REAL_SMOKE_ENV_KEYS,
      ])
    )
  : remoteRequired;

function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
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
    out[key] = value;
  }
  return out;
}

function isPlaceholder(value) {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return true;
  const patterns = ["your-domain", "example.com", "changeme", "replace-me", "<", ">", "todo"];
  return patterns.some((p) => v.includes(p));
}

if (!fs.existsSync(envPath)) {
  console.error(`[FAIL] Missing file: ${envPath}`);
  console.error("Run npm run release:env:init first.");
  process.exit(1);
}

const env = parseEnv(fs.readFileSync(envPath, "utf8"));
const missing = required.filter((k) => !String(env[k] ?? "").trim());
const placeholder = required.filter((k) => isPlaceholder(env[k]));

if (missing.length > 0) {
  console.error("[FAIL] .env.release is incomplete.");
  for (const k of missing) console.error(` - missing: ${k}`);
  process.exit(1);
}

if (placeholder.length > 0) {
  console.error("[FAIL] .env.release contains placeholder values.");
  for (const k of placeholder) console.error(` - placeholder: ${k}`);
  process.exit(1);
}

if (formal) {
  const formalValidation = validateFormalRealSmokeEnv(env);
  if (!formalValidation.ok) {
    for (const issue of formalValidation.invalid) {
      console.error(`[FAIL] ${issue}`);
    }
    process.exit(1);
  }
}

console.log(
  formal
    ? "[OK] Formal release env has complete remote and real-smoke values."
    : "[OK] Remote release env has all required real values."
);
