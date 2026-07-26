#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const targets = [
  "tests/feature-completion",
  "tests/product-completion/ai-routes-normal-session.spec.ts",
  "tests/product-completion/auth-login-normal-session.spec.ts",
  "tests/product-completion/full-user-journey.spec.ts",
  "tests/product-completion/teacher-draft-persistence.spec.ts",
  "tests/product-completion/e06-voice-assistant.spec.ts",
  "tests/product-completion/e07-director-voice-skills.spec.ts",
  "tests/product-completion/e08-teacher-voice-assistant.spec.ts",
  "tests/product-completion/e09-parent-voice-assistant.spec.ts",
  "tests/frontend-replica/director-replica.spec.ts",
  "tests/frontend-replica/teacher-replica.spec.ts",
  "tests/frontend-replica/parent-replica.spec.ts",
  "tests/frontend-replica/global-utility-center.spec.ts",
  "tests/frontend-replica/interaction-states.spec.ts",
  "tests/frontend-replica/responsive-states.spec.ts",
];

const result = spawnSync(
  process.execPath,
  [
    "./node_modules/@playwright/test/cli.js",
    "test",
    ...targets,
    "--config=playwright.product.config.ts",
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
  console.error(
    `[FAIL] Unable to start release browser tests: ${result.error.message}`
  );
}
process.exit(typeof result.status === "number" ? result.status : 1);
