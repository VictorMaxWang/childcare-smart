#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
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
const skipBuild = args.includes("--skip-build");
const configuredTimeoutMs = Number(process.env.RELEASE_BROWSER_TIMEOUT_MS);
const configuredBuildTimeoutMs = Number(
  process.env.RELEASE_BROWSER_BUILD_TIMEOUT_MS
);
const totalTimeoutMs =
  Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs >= 5 * 60 * 1_000
    ? Math.min(configuredTimeoutMs, 2 * 60 * 60 * 1_000)
    : 45 * 60 * 1_000;
const buildTimeoutMs =
  Number.isFinite(configuredBuildTimeoutMs) &&
  configuredBuildTimeoutMs >= 5 * 60 * 1_000
    ? Math.min(configuredBuildTimeoutMs, 30 * 60 * 1_000)
    : 15 * 60 * 1_000;

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
const buildIdPath = path.join(cwd, ".next", "BUILD_ID");

function readBuildId() {
  try {
    return fs.readFileSync(buildIdPath, "utf8").trim();
  } catch {
    return "";
  }
}

function failBeforeBrowser(input) {
  const report = {
    generatedAt: new Date().toISOString(),
    mode,
    explicitLocalOptOut: allowRealAccountSkip,
    realAccountsRequired: !allowRealAccountSkip,
    buildSkipped: input.buildSkipped,
    buildExitCode: input.buildExitCode,
    buildId: input.buildId || null,
    playwrightExitCode: null,
    timedOut: false,
    interrupted: false,
    durationMs: Date.now() - runStartedAt,
    criticalCoverage: null,
    verdict: {
      passed: false,
      productionValidated: false,
      outcome: input.outcome,
      blockers: [input.blocker],
      warnings: [],
    },
    productionValidated: false,
    summary: {
      passed: false,
      outcome: input.outcome,
    },
  };
  fs.writeFileSync(
    policyReportPath,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );
  console.error(`[FAIL] ${input.blocker}`);
  console.error(`[release-browser] Policy report: ${policyReportPath}`);
  process.exit(1);
}

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
// 每次运行先删除旧证据，避免构建或 Playwright 启动失败时误读上一次的绿灯报告。
fs.rmSync(playwrightReportPath, { force: true });
fs.rmSync(policyReportPath, { force: true });

const runStartedAt = Date.now();
console.log(
  `[release-browser] mode=${mode}; critical normal-session skip ${
    allowRealAccountSkip ? "explicitly allowed for local-only validation" : "is forbidden"
  }; build=${skipBuild ? "prebuilt" : "required"}; total timeout=${Math.round(totalTimeoutMs / 60_000)}m.`
);

let verifiedBuildId = "";
if (skipBuild) {
  const expectedBuildId = String(
    process.env.RELEASE_BROWSER_EXPECTED_BUILD_ID ?? ""
  ).trim();
  verifiedBuildId = readBuildId();
  if (
    !expectedBuildId ||
    !verifiedBuildId ||
    expectedBuildId !== verifiedBuildId
  ) {
    failBeforeBrowser({
      buildSkipped: true,
      buildExitCode: null,
      buildId: verifiedBuildId,
      outcome: "build-proof-failed",
      blocker:
        "Prebuilt browser validation requires a matching RELEASE_BROWSER_EXPECTED_BUILD_ID from the release gate.",
    });
  }
}

if (!skipBuild) {
  console.log(
    "[release-browser] building the production bundle before browser validation."
  );
  const npmExecPath = process.env.npm_execpath;
  const build = spawnSync(
    npmExecPath
      ? process.execPath
      : process.platform === "win32"
        ? "npm.cmd"
        : "npm",
    npmExecPath
      ? [npmExecPath, "run", "build"]
      : ["run", "build"],
    {
      cwd,
      env: process.env,
      shell: false,
      stdio: "inherit",
      timeout: buildTimeoutMs,
      windowsHide: true,
    }
  );
  const buildExitCode =
    typeof build.status === "number" ? build.status : 1;
  if (buildExitCode !== 0) {
    const buildError =
      build.error instanceof Error
        ? build.error.message
        : "production build failed";
    failBeforeBrowser({
      buildSkipped: false,
      buildExitCode,
      buildId: "",
      outcome: "build-failed",
      blocker: `Production build failed: ${buildError}`,
    });
  }
  verifiedBuildId = readBuildId();
  if (!verifiedBuildId) {
    failBeforeBrowser({
      buildSkipped: false,
      buildExitCode: 0,
      buildId: "",
      outcome: "build-proof-failed",
      blocker:
        "Production build completed without a readable .next/BUILD_ID.",
    });
  }
}

const child = spawn(
  process.execPath,
  [
    "./node_modules/@playwright/test/cli.js",
    "test",
    ...targets,
    "--config=playwright.release.config.ts",
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

function terminateChildTree() {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawnSync(
      "taskkill",
      ["/PID", String(child.pid), "/T", "/F"],
      {
        shell: false,
        stdio: "ignore",
        windowsHide: true,
      }
    );
    return;
  }
  child.kill("SIGTERM");
}

const browserStartedAt = Date.now();
let timedOut = false;
let interrupted = false;
let timeoutHandle;
let forceFinishHandle;
const handleInterrupt = () => {
  if (interrupted) return;
  interrupted = true;
  console.error(
    "[FAIL] Release browser tests were interrupted; stopping only this test process tree."
  );
  terminateChildTree();
};
process.once("SIGINT", handleInterrupt);
process.once("SIGTERM", handleInterrupt);
const heartbeat = setInterval(() => {
  const elapsedMinutes = Math.max(
    1,
    Math.floor((Date.now() - browserStartedAt) / 60_000)
  );
  console.log(`[release-browser] still running; elapsed=${elapsedMinutes}m`);
}, 60_000);

const result = await new Promise((resolve) => {
  let settled = false;
  const finish = (value) => {
    if (settled) return;
    settled = true;
    resolve(value);
  };
  child.once("error", (error) => {
    finish({ status: null, signal: null, error });
  });
  child.once("exit", (status, signal) => {
    finish({ status, signal, error: null });
  });
  timeoutHandle = setTimeout(() => {
    timedOut = true;
    console.error(
      `[FAIL] Release browser tests exceeded ${Math.round(
        totalTimeoutMs / 60_000
      )} minutes; stopping only this test process tree.`
    );
    terminateChildTree();
    forceFinishHandle = setTimeout(() => {
      finish({ status: 1, signal: "timeout", error: null });
    }, 5_000);
  }, totalTimeoutMs);
});

clearInterval(heartbeat);
if (timeoutHandle) clearTimeout(timeoutHandle);
if (forceFinishHandle) clearTimeout(forceFinishHandle);
process.removeListener("SIGINT", handleInterrupt);
process.removeListener("SIGTERM", handleInterrupt);

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
  buildSkipped: skipBuild,
  buildExitCode: 0,
  buildId: verifiedBuildId,
  playwrightExitCode,
  timedOut,
  interrupted,
  durationMs: Date.now() - browserStartedAt,
  criticalCoverage,
  verdict,
  productionValidated:
    playwrightExitCode === 0 &&
    !timedOut &&
    !interrupted &&
    verdict.productionValidated,
  summary: {
    passed:
      playwrightExitCode === 0 &&
      !timedOut &&
      !interrupted &&
      verdict.passed,
    outcome:
      timedOut
        ? "timed-out"
        : interrupted
          ? "interrupted"
          : playwrightExitCode !== 0
            ? "playwright-failed"
            : verdict.outcome,
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

process.exitCode = report.summary.passed ? 0 : 1;
