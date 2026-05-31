#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const args = process.argv.slice(2);
const reportArg = args.find((arg) => arg.startsWith("--report-path="));
const reportPath = reportArg ? reportArg.slice("--report-path=".length) : "artifacts/release-gate.local.json";
const releaseCheckReportPath = "artifacts/release-check.local.json";
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

const steps = [
  { label: "npm run lint", command: npmBin, args: ["run", "lint"], shell: process.platform === "win32" },
  { label: "npm run build", command: npmBin, args: ["run", "build"], shell: process.platform === "win32" },
  {
    label: "node scripts/release-check.mjs",
    command: process.execPath,
    args: ["scripts/release-check.mjs", `--report-path=${releaseCheckReportPath}`],
  },
];

const report = {
  generatedAt: new Date().toISOString(),
  runtime: { node: process.version, cwd },
  summary: { passed: false, blockers: [], warnings: [] },
  local: { passed: false, checks: [] },
  releaseCheckReportPath,
  steps: [],
};

let shouldContinue = true;
for (const step of steps) {
  if (!shouldContinue) {
    report.steps.push({
      label: step.label,
      command: [step.command, ...step.args].join(" "),
      skipped: true,
      exitCode: null,
    });
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

report.local.passed = report.steps.every((step) => step.exitCode === 0);
report.summary.passed = report.local.passed;
if (!report.local.passed) {
  report.summary.blockers.push("One or more local release gate steps failed.");
}

writeReport(report);
process.exit(report.summary.passed ? 0 : 1);
