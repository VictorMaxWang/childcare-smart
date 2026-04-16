#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const envPath = path.join(cwd, ".env.release");
const required = ["RELEASE_BASE_URL", "RELEASE_ADMIN_COOKIE", "CRON_SECRET", "BRAIN_API_BASE_URL"];

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

console.log("[OK] .env.release has all required real values.");
