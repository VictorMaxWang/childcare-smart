#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  assertReleaseSourceClean,
  normalizeReleaseRunId,
  readLocalCommitSha,
} from "./release-commit-proof.mjs";
import { maybeSignReleaseReport } from "./release-report-proof.mjs";
import {
  resolveNpmCliPath,
  resolveTrustedNpmConfigArgs,
} from "./release-environment-proof.mjs";

const cwd = process.cwd();
const args = process.argv.slice(2);
const allowRealAccountSkip = args.includes("--allow-real-account-skip");
const requireRealAccounts = args.includes("--require-real-accounts");
const mode = allowRealAccountSkip ? "local-opt-out" : "strict";
const evidenceRoot = path.resolve(
  process.env.RELEASE_EVIDENCE_ROOT?.trim() || cwd
);
const reportArg = args.find((arg) => arg.startsWith("--report-path="));
const reportPath = reportArg
  ? reportArg.slice("--report-path=".length)
  : allowRealAccountSkip
    ? "artifacts/release-gate.local.json"
    : "artifacts/release-gate.strict.json";
const releaseCheckReportPath = path.join(
  evidenceRoot,
  "artifacts/release-check.local.json"
);
const browserPolicyReportPath = path.join(
  evidenceRoot,
  `artifacts/release-browser/policy-${mode}.json`
);
const browserPlaywrightReportPath = path.join(
  evidenceRoot,
  `artifacts/release-browser/playwright-${mode}.json`
);
const sqlCheckReportPath = path.join(
  evidenceRoot,
  "artifacts/release-sql-check.json"
);
const npmBin = process.execPath;
let npmCliPath = "";
const defaultStepTimeoutMs = 60 * 60 * 1_000;
const releaseRunId =
  normalizeReleaseRunId(process.env.RELEASE_RUN_ID) || randomUUID();

function resolvePath(filePath) {
  return path.isAbsolute(filePath)
    ? filePath
    : path.join(evidenceRoot, filePath);
}

function writeReport(report) {
  const absReport = resolvePath(reportPath);
  fs.mkdirSync(path.dirname(absReport), { recursive: true });
  const signedReport = maybeSignReleaseReport(report);
  fs.writeFileSync(
    absReport,
    `${JSON.stringify(signedReport, null, 2)}\n`,
    "utf8"
  );
  console.log(`[OK] Local release gate report written: ${absReport}`);
}

function runStep(step) {
  const startedAt = new Date().toISOString();
  const start = Date.now();
  console.log(`\n=== ${step.label} ===`);
  const result = spawnSync(step.command, step.args, {
    cwd,
    env: {
      ...process.env,
      ...step.env,
    },
    shell: step.shell ?? false,
    stdio: "inherit",
    timeout: step.timeoutMs ?? defaultStepTimeoutMs,
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

// 启动门禁时立即废弃旧报告，避免中途失败后被 readiness 误判为新结果。
fs.rmSync(resolvePath(reportPath), { force: true });
fs.rmSync(resolvePath(browserPolicyReportPath), { force: true });
fs.rmSync(resolvePath(browserPlaywrightReportPath), { force: true });
if (!allowRealAccountSkip) {
  fs.rmSync(resolvePath(sqlCheckReportPath), { force: true });
}
if (allowRealAccountSkip && requireRealAccounts) {
  console.error(
    "[FAIL] Choose either --allow-real-account-skip or --require-real-accounts, not both."
  );
  process.exit(1);
}
npmCliPath = resolveNpmCliPath();
const npmConfigArgs = resolveTrustedNpmConfigArgs(process.env, {
  required: process.env.RELEASE_ISOLATED_WORKTREE === "1",
});
const npmRunArgs = (scriptName) => [
  npmCliPath,
  ...npmConfigArgs,
  "run",
  scriptName,
];

const localCommitShaAtStart = readLocalCommitSha(cwd);
let sourceCleanAtStart = false;
let sourceCleanAtStartError = "";
try {
  assertReleaseSourceClean(cwd);
  sourceCleanAtStart = true;
} catch (error) {
  sourceCleanAtStartError =
    error instanceof Error ? error.message : "Release source is not clean.";
}

const steps = [
  { label: "npm run lint", command: npmBin, args: npmRunArgs("lint") },
  {
    label: "npm run typecheck",
    command: npmBin,
    args: npmRunArgs("typecheck"),
  },
  {
    label: "npm run test:node",
    command: npmBin,
    args: npmRunArgs("test:node"),
  },
  {
    label: "npm run test:python",
    command: npmBin,
    args: npmRunArgs("test:python"),
  },
  {
    label: "npm run test:release-scripts",
    command: npmBin,
    args: npmRunArgs("test:release-scripts"),
  },
  {
    label: "npm run db:check",
    command: npmBin,
    args: npmRunArgs("db:check"),
    skip: allowRealAccountSkip,
    skipReason:
      "Explicit local opt-out: real database readiness is not being claimed.",
  },
  {
    label: "npm run build",
    command: npmBin,
    args: npmRunArgs("build"),
    captureBuildId: true,
    timeoutMs: 20 * 60 * 1_000,
  },
  {
    label: allowRealAccountSkip
      ? "release browser tests (local opt-out, prebuilt)"
      : "release browser tests (strict, prebuilt)",
    command: process.execPath,
    args: [
      "scripts/run-release-browser-tests.mjs",
      allowRealAccountSkip
        ? "--allow-real-account-skip"
        : "--require-real-accounts",
      "--skip-build",
      `--policy-report-path=${browserPolicyReportPath}`,
      `--playwright-report-path=${browserPlaywrightReportPath}`,
    ],
    usesPrebuiltBuild: true,
    timeoutMs: 60 * 60 * 1_000,
  },
  {
    label: "node scripts/release-check.mjs",
    command: process.execPath,
    args: ["scripts/release-check.mjs", `--report-path=${releaseCheckReportPath}`],
  },
];

const report = {
  schemaVersion: 2,
  releaseRunId,
  generatedAt: new Date().toISOString(),
  runtime: { node: process.version, cwd },
  localCommitSha: localCommitShaAtStart,
  endCommitSha: "",
  sourceCleanAtStart,
  sourceCleanAtEnd: false,
  mode,
  explicitLocalOptOut: allowRealAccountSkip,
  realAccountsRequired: !allowRealAccountSkip,
  isolatedWorktree:
    process.env.RELEASE_ISOLATED_WORKTREE === "1",
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
if (!sourceCleanAtStart) {
  report.summary.blockers.push(sourceCleanAtStartError);
}

let shouldContinue = sourceCleanAtStart;
let capturedBuildId = "";
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
  if (step.usesPrebuiltBuild) {
    step.env = {
      ...step.env,
      RELEASE_BROWSER_EXPECTED_BUILD_ID: capturedBuildId,
    };
  }
  const result = runStep(step);
  if (step.captureBuildId && result.exitCode === 0) {
    try {
      capturedBuildId = fs
        .readFileSync(path.join(cwd, ".next", "BUILD_ID"), "utf8")
        .trim();
    } catch {
      capturedBuildId = "";
    }
    if (!capturedBuildId) {
      result.exitCode = 1;
      result.error =
        "Production build completed without a readable .next/BUILD_ID.";
    }
  }
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

try {
  report.endCommitSha = readLocalCommitSha(cwd);
  assertReleaseSourceClean(cwd);
  report.sourceCleanAtEnd = true;
} catch (error) {
  report.sourceCleanAtEnd = false;
  report.summary.blockers.push(
    error instanceof Error
      ? error.message
      : "Release source changed during the local gate."
  );
}
if (report.endCommitSha !== report.localCommitSha) {
  report.summary.blockers.push(
    "The checked-out Git commit changed while the local release gate was running."
  );
}

report.local.passed =
  report.steps.every((step) => step.skipped || step.exitCode === 0) &&
  report.sourceCleanAtStart &&
  report.sourceCleanAtEnd &&
  report.endCommitSha === report.localCommitSha &&
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
      maybeSignReleaseReport({
        schemaVersion: 2,
        releaseRunId,
        generatedAt: new Date().toISOString(),
        overallPassed: true,
        source: "npm run db:check",
        mode,
        localCommitSha: report.localCommitSha,
        step: {
          label: dbCheckStep.label,
          exitCode: dbCheckStep.exitCode,
          durationMs: dbCheckStep.durationMs,
        },
      }),
      null,
      2
    )}\n`,
    "utf8"
  );
}
if (!report.local.passed) {
  if (
    !report.summary.blockers.includes(
      "One or more local release gate steps failed."
    )
  ) {
    report.summary.blockers.push("One or more local release gate steps failed.");
  }
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

report.generatedAt = new Date().toISOString();
writeReport(report);
process.exit(report.summary.passed ? 0 : 1);
