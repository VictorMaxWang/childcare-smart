#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

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
const reportArg = args.find((arg) => arg.startsWith("--report-path="));
const reportPath = reportArg
  ? reportArg.slice("--report-path=".length)
  : allowRealAccountSkip
    ? "artifacts/release-gate.local.json"
    : "artifacts/release-gate.strict.json";
const releaseCheckReportPath = "artifacts/release-check.local.json";
const browserPolicyReportPath = `artifacts/release-browser/policy-${mode}.json`;
const sqlCheckReportPath = "artifacts/release-sql-check.json";
const npmBin = "npm";

function resolvePath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
}

function writeReport(report) {
  const absReport = resolvePath(reportPath);
  fs.mkdirSync(path.dirname(absReport), { recursive: true });
  fs.writeFileSync(absReport, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`[OK] Local release gate report written: ${absReport}`);
}

function runStep(step) {
  const startedAt = new Date().toISOString();
  const start = Date.now();
  console.log(`\n=== ${step.label} ===`);
  const result = spawnSync(step.command, step.args, {
    cwd,
    env: process.env,
    shell: step.shell ?? false,
    stdio: "inherit",
    windowsHide: true,
  });
  return {
    label: step.label,
    command: [step.command, ...step.args].join(" "),
    startedAt,
    durationMs: Date.now() - start,
    exitCode: typeof result.status === "number" ? result.status : 1,
    signal: result.signal ?? null,
    error: result.error ? result.error.message : null,
  };
}

// 门禁启动时立即作废旧报告，防止中途失败后仍被 readiness 误当成最新结果。
fs.rmSync(resolvePath(reportPath), { force: true });
fs.rmSync(resolvePath(browserPolicyReportPath), { force: true });
if (!allowRealAccountSkip) {
  fs.rmSync(resolvePath(sqlCheckReportPath), { force: true });
}

const steps = [
  { label: "npm run lint", command: npmBin, args: ["run", "lint"], shell: process.platform === "win32" },
  { label: "npm run typecheck", command: npmBin, args: ["run", "typecheck"], shell: process.platform === "win32" },
  { label: "npm run test:node", command: npmBin, args: ["run", "test:node"], shell: process.platform === "win32" },
  { label: "npm run test:python", command: npmBin, args: ["run", "test:python"], shell: process.platform === "win32" },
  {
    label: "npm run test:release-scripts",
    command: npmBin,
    args: ["run", "test:release-scripts"],
    shell: process.platform === "win32",
  },
  {
    label: "npm run db:check",
    command: npmBin,
    args: ["run", "db:check"],
    shell: process.platform === "win32",
    skip: allowRealAccountSkip,
    skipReason:
      "Explicit local opt-out: real database readiness is not being claimed.",
  },
  { label: "npm run build", command: npmBin, args: ["run", "build"], shell: process.platform === "win32" },
  {
    label: allowRealAccountSkip
      ? "npm run test:browser:release:local"
      : "npm run test:browser:release",
    command: npmBin,
    args: [
      "run",
      allowRealAccountSkip
        ? "test:browser:release:local"
        : "test:browser:release",
    ],
    shell: process.platform === "win32",
  },
  {
    label: "node scripts/release-check.mjs",
    command: process.execPath,
    args: ["scripts/release-check.mjs", `--report-path=${releaseCheckReportPath}`],
  },
];

const report = {
  generatedAt: new Date().toISOString(),
  runtime: { node: process.version, cwd },
  mode,
  explicitLocalOptOut: allowRealAccountSkip,
  realAccountsRequired: !allowRealAccountSkip,
  productionValidated: false,
  summary: { passed: false, blockers: [], warnings: [] },
  local: { passed: false, checks: [] },
  releaseCheckReportPath,
  browserPolicyReportPath,
  sqlCheckReportPath,
  browserPolicy: null,
  steps: [],
};

if (allowRealAccountSkip) {
  report.summary.warnings.push(
    "Explicit local opt-out enabled: database readiness and normal-session production coverage may be skipped."
  );
}

let shouldContinue = true;
for (const step of steps) {
  if (step.skip || !shouldContinue) {
    report.steps.push({
      label: step.label,
      command: [step.command, ...step.args].join(" "),
      skipped: true,
      skipReason: step.skip
        ? step.skipReason
        : "A previous release gate step failed.",
      exitCode: null,
    });
    if (step.skip) {
      console.warn(`[LOCAL-ONLY] Skipping ${step.label}: ${step.skipReason}`);
    }
    continue;
  }
  const result = runStep(step);
  report.steps.push(result);
  report.local.checks.push({
    name: result.label,
    ok: result.exitCode === 0,
    details: {
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      signal: result.signal,
      error: result.error,
    },
  });
  if (result.exitCode !== 0) shouldContinue = false;
}

try {
  report.browserPolicy = JSON.parse(
    fs.readFileSync(resolvePath(browserPolicyReportPath), "utf8")
  );
} catch (error) {
  report.summary.blockers.push(
    `Browser policy report unavailable: ${
      error instanceof Error ? error.message : "invalid report"
    }`
  );
}

report.local.passed =
  report.steps.every((step) => step.skipped || step.exitCode === 0) &&
  report.summary.blockers.length === 0;
report.productionValidated =
  report.local.passed &&
  mode === "strict" &&
  report.browserPolicy?.productionValidated === true;
report.summary.passed = report.local.passed;

const dbCheckStep = report.steps.find(
  (step) => step.label === "npm run db:check"
);
if (!allowRealAccountSkip && dbCheckStep?.exitCode === 0) {
  fs.mkdirSync(path.dirname(resolvePath(sqlCheckReportPath)), {
    recursive: true,
  });
  fs.writeFileSync(
    resolvePath(sqlCheckReportPath),
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        overallPassed: true,
        source: "npm run db:check",
        mode,
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}
if (!report.local.passed) {
  report.summary.blockers.push("One or more local release gate steps failed.");
}
if (report.summary.passed && !report.productionValidated) {
  report.summary.warnings.push(
    "Local checks passed, but this report is not production validation."
  );
  console.warn(
    "[LOCAL-ONLY] Local release checks passed. Production account validation remains unverified."
  );
}
if (report.productionValidated) {
  console.log(
    "[OK] Strict local gate includes non-skipped normal-session coverage."
  );
}

writeReport(report);
process.exit(report.summary.passed ? 0 : 1);
