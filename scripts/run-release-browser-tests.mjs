#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  NORMAL_SESSION_CRITICAL_FILES,
  evaluateCriticalPlaywrightCoverage,
  summarizeCriticalPlaywrightCoverage,
} from "./release-test-policy.mjs";

const cwd = process.cwd();
const args = process.argv.slice(2);
const allowRealAccountSkip = args.includes("--allow-real-account-skip");
const requireRealAccounts = args.includes("--require-real-accounts");

if (allowRealAccountSkip && requireRealAccounts) {
  console.error(
    "[FAIL] Choose either --allow-real-account-skip or --require-real-accounts, not both."
  );
  process.exit(1);
}

const mode = allowRealAccountSkip ? "local-opt-out" : "strict";
const playwrightReportArg = args.find((arg) =>
  arg.startsWith("--playwright-report-path=")
);
const policyReportArg = args.find((arg) =>
  arg.startsWith("--policy-report-path=")
);
const playwrightReportPath = path.resolve(
  cwd,
  playwrightReportArg
    ? playwrightReportArg.slice("--playwright-report-path=".length)
    : `artifacts/release-browser/playwright-${mode}.json`
);
const policyReportPath = path.resolve(
  cwd,
  policyReportArg
    ? policyReportArg.slice("--policy-report-path=".length)
    : `artifacts/release-browser/policy-${mode}.json`
);

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

fs.mkdirSync(path.dirname(playwrightReportPath), { recursive: true });
fs.mkdirSync(path.dirname(policyReportPath), { recursive: true });
// 删除旧 JSON，避免 Playwright 启动失败时误读上一次的绿色报告。
fs.rmSync(playwrightReportPath, { force: true });
fs.rmSync(policyReportPath, { force: true });

console.log(
  `[release-browser] mode=${mode}; critical normal-session skip ${
    allowRealAccountSkip ? "explicitly allowed for local-only validation" : "is forbidden"
  }.`
);

const result = spawnSync(
  process.execPath,
  [
    "./node_modules/@playwright/test/cli.js",
    "test",
    ...targets,
    "--config=playwright.product.config.ts",
    "--project=chromium",
    "--reporter=line,json",
  ],
  {
    cwd,
    env: {
      ...process.env,
      PLAYWRIGHT_JSON_OUTPUT_FILE: playwrightReportPath,
    },
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

let criticalCoverage = null;
let verdict = {
  passed: false,
  productionValidated: false,
  outcome: "failed",
  blockers: ["Playwright JSON report was not produced."],
  warnings: [],
};

try {
  const playwrightReport = JSON.parse(
    fs.readFileSync(playwrightReportPath, "utf8")
  );
  criticalCoverage = summarizeCriticalPlaywrightCoverage(playwrightReport, {
    criticalFiles: NORMAL_SESSION_CRITICAL_FILES,
  });
  verdict = evaluateCriticalPlaywrightCoverage(criticalCoverage, {
    allowSkip: allowRealAccountSkip,
    label: "normal-session release coverage",
  });
} catch (error) {
  verdict.blockers = [
    `Unable to inspect Playwright JSON report: ${
      error instanceof Error ? error.message : "unknown error"
    }`,
  ];
}

const playwrightExitCode =
  typeof result.status === "number" ? result.status : 1;
const report = {
  generatedAt: new Date().toISOString(),
  mode,
  explicitLocalOptOut: allowRealAccountSkip,
  realAccountsRequired: !allowRealAccountSkip,
  playwrightExitCode,
  criticalCoverage,
  verdict,
  productionValidated:
    playwrightExitCode === 0 && verdict.productionValidated,
  summary: {
    passed: playwrightExitCode === 0 && verdict.passed,
    outcome:
      playwrightExitCode !== 0 ? "playwright-failed" : verdict.outcome,
  },
};
fs.writeFileSync(
  policyReportPath,
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8"
);

if (criticalCoverage) {
  console.log(
    `[release-browser] critical=${criticalCoverage.totals.total} passed=${criticalCoverage.totals.passed} skipped=${criticalCoverage.totals.skipped} flaky=${criticalCoverage.totals.flaky} failed=${criticalCoverage.totals.failed}`
  );
}
for (const warning of verdict.warnings) {
  console.warn(`[LOCAL-ONLY] ${warning}`);
}
for (const blocker of verdict.blockers) {
  console.error(`[FAIL] ${blocker}`);
}

if (report.summary.passed && !report.productionValidated) {
  console.warn(
    "[LOCAL-ONLY] Browser regression passed with explicit real-account opt-out. Production account coverage is NOT validated."
  );
}
if (report.productionValidated) {
  console.log(
    "[OK] Critical normal-session tests ran without skip and passed."
  );
}
console.log(`[release-browser] Policy report: ${policyReportPath}`);

process.exit(report.summary.passed ? 0 : 1);
