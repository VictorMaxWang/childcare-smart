#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const baseUrl = String(process.env.ONLINE_SMOKE_BASE_URL ?? "").trim();
const allowWrites = String(process.env.ONLINE_SMOKE_ALLOW_WRITES ?? "").trim().toLowerCase();
const truthy = new Set(["1", "true", "yes", "y", "on"]);

if (!baseUrl) {
  console.error("[FAIL] ONLINE_SMOKE_BASE_URL is required for online smoke.");
  process.exit(1);
}

if (!truthy.has(allowWrites)) {
  console.error("[FAIL] ONLINE_SMOKE_ALLOW_WRITES=1 is required because online smoke writes demo records/feedback.");
  process.exit(1);
}

const npxBin = "npx";
const result = spawnSync(
  npxBin,
  ["playwright", "test", "tests/online-smoke", "--config=playwright.online-smoke.config.ts"],
  {
    cwd: process.cwd(),
    env: process.env,
    shell: process.platform === "win32",
    stdio: "inherit",
    windowsHide: true,
  }
);

process.exit(typeof result.status === "number" ? result.status : 1);
