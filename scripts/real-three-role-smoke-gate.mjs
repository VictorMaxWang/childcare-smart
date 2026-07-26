#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const truthy = new Set(["1", "true", "yes", "y", "on"]);
const allowWrites = truthy.has(
  String(process.env.REAL_SMOKE_ALLOW_WRITES ?? "").trim().toLowerCase()
);
const baseURL = String(process.env.REAL_SMOKE_BASE_URL ?? "").trim();
const mode = String(process.env.REAL_SMOKE_MODE ?? "all")
  .trim()
  .toLowerCase();

if (!allowWrites) {
  console.error(
    "[FAIL] REAL_SMOKE_ALLOW_WRITES=1 is required because this smoke test creates scoped production records."
  );
  process.exit(1);
}
if (!baseURL) {
  console.error("[FAIL] REAL_SMOKE_BASE_URL is required.");
  process.exit(1);
}
if (!new Set(["all", "existing", "fresh"]).has(mode)) {
  console.error("[FAIL] REAL_SMOKE_MODE must be all, existing, or fresh.");
  process.exit(1);
}

if (mode === "all" || mode === "existing") {
  const requiredExisting = [
    "REAL_SMOKE_EXISTING_ADMIN_PHONE",
    "REAL_SMOKE_EXISTING_ADMIN_PASSWORD",
    "REAL_SMOKE_EXISTING_TEACHER_PHONE",
    "REAL_SMOKE_EXISTING_TEACHER_PASSWORD",
    "REAL_SMOKE_EXISTING_PARENT_PHONE",
    "REAL_SMOKE_EXISTING_PARENT_PASSWORD",
  ];
  const missing = requiredExisting.filter(
    (key) => !String(process.env[key] ?? "").trim()
  );
  if (missing.length > 0) {
    console.error(
      `[FAIL] Existing-account smoke is missing ${missing.join(", ")}.`
    );
    process.exit(1);
  }
}

const result = spawnSync(
  process.execPath,
  [
    "./node_modules/@playwright/test/cli.js",
    "test",
    "tests/production-real/three-role.spec.ts",
    "--config=playwright.real-smoke.config.ts",
    "--project=chromium",
    "--reporter=line",
  ],
  {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  }
);

if (result.error) {
  console.error(`[FAIL] Unable to start real smoke: ${result.error.message}`);
}
process.exit(typeof result.status === "number" ? result.status : 1);
