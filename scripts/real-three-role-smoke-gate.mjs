#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  PRODUCTION_REAL_CRITICAL_FILES,
  evaluateCriticalPlaywrightCoverage,
  isTruthy,
  summarizeCriticalPlaywrightCoverage,
  validateFormalRealSmokeEnv,
} from "./release-test-policy.mjs";

const cwd = process.cwd();
const args = process.argv.slice(2);
const formalRelease = args.includes("--formal-release");
const reportArg = args.find((arg) => arg.startsWith("--report-path="));
const reportPath = path.resolve(
  cwd,
  reportArg
    ? reportArg.slice("--report-path=".length)
    : formalRelease
      ? "artifacts/real-smoke/formal-report.json"
      : "artifacts/real-smoke/last-report.json"
);
const playwrightReportPath = path.resolve(
  cwd,
  formalRelease
    ? "artifacts/real-smoke/playwright-formal.json"
    : "artifacts/real-smoke/playwright-last.json"
);
const allowWrites = isTruthy(process.env.REAL_SMOKE_ALLOW_WRITES);
const baseURL = String(process.env.REAL_SMOKE_BASE_URL ?? "").trim();
const mode = String(process.env.REAL_SMOKE_MODE ?? "all")
  .trim()
  .toLowerCase();

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.mkdirSync(path.dirname(playwrightReportPath), { recursive: true });
// 先废弃旧证据；即使预检失败或进程中断，聚合门禁也不能复用旧绿灯。
fs.rmSync(reportPath, { force: true });
fs.rmSync(playwrightReportPath, { force: true });

if (formalRelease) {
  const formalEnv = validateFormalRealSmokeEnv(process.env);
  if (!formalEnv.ok) {
    for (const key of formalEnv.missing) {
      console.error(`[FAIL] Formal real smoke is missing ${key}.`);
    }
    for (const issue of formalEnv.invalid) {
      console.error(`[FAIL] ${issue}`);
    }
    process.exit(1);
  }
}

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

console.log(
  `[real-smoke] mode=${mode}; formalRelease=${formalRelease}; liveAI=${isTruthy(
    process.env.REAL_SMOKE_REQUIRE_LIVE_AI ?? "1"
  )}.`
);

const result = spawnSync(
  process.execPath,
  [
    "./node_modules/@playwright/test/cli.js",
    "test",
    "tests/production-real/three-role.spec.ts",
    "--config=playwright.real-smoke.config.ts",
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
  console.error(`[FAIL] Unable to start real smoke: ${result.error.message}`);
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
    criticalFiles: PRODUCTION_REAL_CRITICAL_FILES,
    minimumTestsByFile: {
      [PRODUCTION_REAL_CRITICAL_FILES[0]]: 2,
    },
  });
  verdict = evaluateCriticalPlaywrightCoverage(criticalCoverage, {
    allowSkip: !formalRelease,
    label: "production three-role smoke",
  });
} catch (error) {
  verdict.blockers = [
    `Unable to inspect real smoke JSON report: ${
      error instanceof Error ? error.message : "unknown error"
    }`,
  ];
}

const playwrightExitCode =
  typeof result.status === "number" ? result.status : 1;
const report = {
  generatedAt: new Date().toISOString(),
  formalRelease,
  mode,
  liveAiRequired: isTruthy(
    process.env.REAL_SMOKE_REQUIRE_LIVE_AI ?? "1"
  ),
  writesExplicitlyAllowed: allowWrites,
  targetMatchesRelease:
    !formalRelease ||
    String(process.env.RELEASE_BASE_URL ?? "").replace(/\/$/u, "") ===
      baseURL.replace(/\/$/u, ""),
  playwrightExitCode,
  criticalCoverage,
  verdict,
  productionValidated:
    formalRelease &&
    mode === "all" &&
    playwrightExitCode === 0 &&
    verdict.productionValidated,
  summary: {
    passed: playwrightExitCode === 0 && verdict.passed,
    outcome:
      playwrightExitCode !== 0 ? "playwright-failed" : verdict.outcome,
  },
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (criticalCoverage) {
  console.log(
    `[real-smoke] critical=${criticalCoverage.totals.total} passed=${criticalCoverage.totals.passed} skipped=${criticalCoverage.totals.skipped} flaky=${criticalCoverage.totals.flaky} failed=${criticalCoverage.totals.failed}`
  );
}
for (const warning of verdict.warnings) {
  console.warn(`[PARTIAL] ${warning}`);
}
for (const blocker of verdict.blockers) {
  console.error(`[FAIL] ${blocker}`);
}
if (report.summary.passed && !report.productionValidated) {
  console.warn(
    "[PARTIAL] Requested real smoke subset passed, but formal production validation is NOT complete."
  );
}
if (report.productionValidated) {
  console.log(
    "[OK] Formal existing-account and fresh-account production smoke both ran without skip."
  );
}
console.log(`[real-smoke] Verdict report: ${reportPath}`);

process.exit(report.summary.passed ? 0 : 1);
