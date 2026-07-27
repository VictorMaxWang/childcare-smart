#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  assertReleaseSourceClean,
  commitMatches,
  readLocalCommitSha,
} from "./release-commit-proof.mjs";
import {
  maybeSignReleaseReport,
  resolveReleaseReportSigningSecret,
  verifyReleaseReport,
} from "./release-report-proof.mjs";
import { createIsolatedReleaseWorktree } from "./release-isolated-worktree.mjs";
import {
  assertTrustedReleaseLauncher,
  buildReleaseChildEnvironment,
  resolveNpmCliPath,
  resolveTrustedNpmConfigArgs,
} from "./release-environment-proof.mjs";

const cwd = process.cwd();
const args = process.argv.slice(2);
const envArg = args.find((arg) => arg.startsWith("--env-file="));
const reportArg = args.find((arg) => arg.startsWith("--report-path="));
const envPath = path.resolve(
  cwd,
  envArg ? envArg.slice("--env-file=".length) : ".env.release"
);
const reportPath = path.resolve(
  cwd,
  reportArg
    ? reportArg.slice("--report-path=".length)
    : "artifacts/release-gate.formal.json"
);
const localReportPath = path.resolve(
  cwd,
  "artifacts/release-gate.strict.json"
);
const remoteReportPath = path.resolve(
  cwd,
  "artifacts/release-report.remote.json"
);
const realSmokeReportPath = path.resolve(
  cwd,
  "artifacts/real-smoke/formal-report.json"
);
const sqlCheckReportPath = path.resolve(
  cwd,
  "artifacts/release-sql-check.json"
);
const releaseRunId = randomUUID();
let reportSigningEnv = process.env;

function parseEnvFile(filePath) {
  const values = {};
  for (const raw of fs.readFileSync(filePath, "utf8").split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function readJsonSafe(relativePath) {
  try {
    return JSON.parse(
      fs.readFileSync(path.resolve(cwd, relativePath), "utf8")
    );
  } catch {
    return null;
  }
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const signedReport = maybeSignReleaseReport(report, reportSigningEnv);
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify(signedReport, null, 2)}\n`,
    "utf8"
  );
  console.log(`[formal-release] Report: ${reportPath}`);
}

// 正式门禁每次都从空证据集开始，避免失败重跑继承上一次的绿色报告。
for (const stalePath of [
  reportPath,
  path.resolve(cwd, localReportPath),
  path.resolve(cwd, remoteReportPath),
  path.resolve(cwd, realSmokeReportPath),
  path.resolve(cwd, sqlCheckReportPath),
]) {
  fs.rmSync(stalePath, { force: true });
}

try {
  assertTrustedReleaseLauncher(process.env);
} catch (error) {
  const reason =
    error instanceof Error
      ? error.message
      : "The trusted PowerShell release launcher was not used.";
  console.error(`[FAIL] ${reason}`);
  writeReport({
    schemaVersion: 2,
    releaseRunId,
    generatedAt: new Date().toISOString(),
    mode: "formal",
    trustedPowerShellLauncher: false,
    productionValidated: false,
    summary: { passed: false, blockers: [reason] },
    steps: [],
  });
  process.exit(1);
}

if (!fs.existsSync(envPath)) {
  const report = {
    schemaVersion: 2,
    releaseRunId,
    generatedAt: new Date().toISOString(),
    mode: "formal",
    productionValidated: false,
    summary: {
      passed: false,
      blockers: [`Missing formal release env file: ${envPath}`],
    },
    steps: [],
  };
  console.error(`[FAIL] Missing formal release env file: ${envPath}`);
  writeReport(report);
  process.exit(1);
}

let releaseEnv;
let npmConfigArgs;
try {
  releaseEnv = buildReleaseChildEnvironment(
    process.env,
    parseEnvFile(envPath),
    { RELEASE_RUN_ID: releaseRunId }
  );
  npmConfigArgs = resolveTrustedNpmConfigArgs(releaseEnv, {
    required: true,
  });
} catch (error) {
  const reason =
    error instanceof Error
      ? error.message
      : "Formal release environment is unsafe.";
  const failedReport = {
    schemaVersion: 2,
    releaseRunId,
    generatedAt: new Date().toISOString(),
    mode: "formal",
    productionValidated: false,
    summary: { passed: false, blockers: [reason] },
    steps: [],
  };
  console.error(`[FAIL] ${reason}`);
  writeReport(failedReport);
  process.exit(1);
}
reportSigningEnv = releaseEnv;
const reportSigningSecret =
  resolveReleaseReportSigningSecret(releaseEnv);
const localCommitSha = readLocalCommitSha(cwd);
let sourceCleanAtStart = false;
try {
  assertReleaseSourceClean(cwd);
  sourceCleanAtStart = true;
} catch (error) {
  const reason =
    error instanceof Error ? error.message : "Release source is not clean.";
  const report = {
    schemaVersion: 2,
    releaseRunId,
    generatedAt: new Date().toISOString(),
    mode: "formal",
    localCommitSha,
    sourceCleanAtStart,
    sourceCleanAtEnd: false,
    productionValidated: false,
    summary: { passed: false, blockers: [reason] },
    steps: [],
  };
  console.error(`[FAIL] ${reason}`);
  writeReport(report);
  process.exit(1);
}
const expectedCommitSha = String(
  releaseEnv.RELEASE_EXPECTED_COMMIT_SHA ?? ""
).trim();
if (!commitMatches(localCommitSha, expectedCommitSha)) {
  const report = {
    schemaVersion: 2,
    releaseRunId,
    generatedAt: new Date().toISOString(),
    mode: "formal",
    localCommitSha,
    sourceCleanAtStart,
    sourceCleanAtEnd: false,
    expectedCommitSha,
    productionValidated: false,
    summary: {
      passed: false,
      blockers: [
        "RELEASE_EXPECTED_COMMIT_SHA does not match the current local HEAD.",
      ],
    },
    steps: [],
  };
  console.error(
    "[FAIL] RELEASE_EXPECTED_COMMIT_SHA does not match the current local HEAD."
  );
  writeReport(report);
  process.exit(1);
}

let isolatedWorktree;
try {
  isolatedWorktree = createIsolatedReleaseWorktree({
    repoRoot: cwd,
    commitSha: localCommitSha,
    hostEnv: releaseEnv,
  });
} catch (error) {
  const reason =
    error instanceof Error
      ? error.message
      : "Unable to create the isolated release worktree.";
  const failedReport = {
    schemaVersion: 2,
    releaseRunId,
    generatedAt: new Date().toISOString(),
    mode: "formal",
    localCommitSha,
    expectedCommitSha,
    sourceCleanAtStart,
    sourceCleanAtEnd: false,
    productionValidated: false,
    summary: { passed: false, blockers: [reason] },
    steps: [],
  };
  console.error(`[FAIL] ${reason}`);
  writeReport(failedReport);
  process.exit(1);
}
const executionCwd = isolatedWorktree.worktreePath;
process.once("exit", () => isolatedWorktree.cleanup());
releaseEnv.RELEASE_EVIDENCE_ROOT = cwd;
releaseEnv.RELEASE_ISOLATED_WORKTREE = "1";
const npmCliPath = resolveNpmCliPath();

const steps = [
  {
    label: "isolated dependency install",
    command: process.execPath,
    args: [
      npmCliPath,
      ...npmConfigArgs,
      "ci",
      "--prefer-offline",
      "--no-audit",
      "--fund=false",
    ],
    timeoutMs: 20 * 60 * 1_000,
  },
  {
    label: "formal release env",
    command: process.execPath,
    args: [
      "scripts/release-env-check.mjs",
      "--formal",
      `--env-file=${envPath}`,
    ],
  },
  {
    label: "strict local and normal-session gate",
    command: process.execPath,
    args: [
      "scripts/release-local-gate.mjs",
      "--require-real-accounts",
      `--report-path=${localReportPath}`,
    ],
  },
  {
    label: "remote deployment gate",
    command: process.execPath,
    args: [
      "scripts/release-check.mjs",
      "--require-remote",
      `--release-env-file=${envPath}`,
      `--report-path=${remoteReportPath}`,
    ],
  },
  {
    label: "formal production three-role smoke",
    command: process.execPath,
    args: [
      "scripts/real-three-role-smoke-gate.mjs",
      "--formal-release",
      `--report-path=${realSmokeReportPath}`,
    ],
  },
  {
    label: "aggregate release readiness",
    command: process.execPath,
    args: [
      "scripts/release-ready.mjs",
      `--local-report=${localReportPath}`,
      `--remote-report=${remoteReportPath}`,
      `--real-smoke-report=${realSmokeReportPath}`,
      `--env-file=${envPath}`,
    ],
  },
];

const report = {
  schemaVersion: 2,
  releaseRunId,
  generatedAt: new Date().toISOString(),
  mode: "formal",
  trustedPowerShellLauncher: true,
  envFile: envPath,
  localCommitSha,
  endCommitSha: "",
  sourceCleanAtStart,
  sourceCleanAtEnd: false,
  isolatedWorktree: {
    used: true,
    commitSha: isolatedWorktree.commitSha,
  },
  expectedCommitSha,
  productionValidated: false,
  summary: { passed: false, blockers: [], warnings: [] },
  evidence: {
    localReportPath,
    remoteReportPath,
    realSmokeReportPath,
    sqlCheckReportPath,
  },
  steps: [],
};

let continueRunning = true;
for (const step of steps) {
  if (!continueRunning) {
    report.steps.push({
      label: step.label,
      command: [step.command, ...step.args].join(" "),
      skipped: true,
      skipReason: "A previous formal release step failed.",
      exitCode: null,
    });
    continue;
  }

  console.log(`\n=== ${step.label} ===`);
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const result = spawnSync(step.command, step.args, {
    cwd: executionCwd,
    env: releaseEnv,
    shell: false,
    stdio: "inherit",
    timeout: step.timeoutMs,
    windowsHide: true,
  });
  const exitCode = typeof result.status === "number" ? result.status : 1;
  report.steps.push({
    label: step.label,
    command: [step.command, ...step.args].join(" "),
    startedAt,
    durationMs: Date.now() - started,
    exitCode,
    signal: result.signal ?? null,
    error: result.error ? result.error.message : null,
  });
  if (exitCode !== 0) continueRunning = false;
}

try {
  report.endCommitSha = readLocalCommitSha(cwd);
  assertReleaseSourceClean(cwd);
  const isolatedEndCommitSha = readLocalCommitSha(executionCwd);
  assertReleaseSourceClean(executionCwd);
  report.isolatedWorktree.endCommitSha = isolatedEndCommitSha;
  report.isolatedWorktree.sourceCleanAtEnd = true;
  if (isolatedEndCommitSha !== report.localCommitSha) {
    throw new Error(
      "The isolated release worktree changed while the formal gate was running."
    );
  }
  report.sourceCleanAtEnd = true;
} catch (error) {
  report.sourceCleanAtEnd = false;
  report.isolatedWorktree.sourceCleanAtEnd = false;
  report.summary.blockers.push(
    error instanceof Error
      ? error.message
      : "Release source changed during the formal gate."
  );
}
if (report.endCommitSha !== report.localCommitSha) {
  report.summary.blockers.push(
    "The checked-out Git commit changed while the formal gate was running."
  );
}

const localReport = readJsonSafe(localReportPath);
const remoteReport = readJsonSafe(remoteReportPath);
const realSmokeReport = readJsonSafe(realSmokeReportPath);
const sqlCheckReport = readJsonSafe(sqlCheckReportPath);
for (const step of report.steps) {
  if (step.skipped) {
    report.summary.blockers.push(
      `${step.label} was not run because an earlier formal step failed.`
    );
  } else if (step.exitCode !== 0) {
    report.summary.blockers.push(
      `${step.label} exited with code ${step.exitCode}.`
    );
  }
}
const evidenceChecks = [
  {
    ok:
      verifyReleaseReport(localReport, reportSigningSecret) &&
      localReport?.schemaVersion === 2 &&
      localReport?.releaseRunId === releaseRunId &&
      localReport?.summary?.passed === true &&
      localReport?.productionValidated === true &&
      localReport?.mode === "strict" &&
      localReport?.isolatedWorktree === true &&
      localReport?.sourceCleanAtStart === true &&
      localReport?.sourceCleanAtEnd === true &&
      commitMatches(localReport?.endCommitSha, localCommitSha) &&
      commitMatches(localReport?.localCommitSha, localCommitSha),
    message:
      "Strict local report does not prove non-skipped normal-session coverage.",
  },
  {
    ok:
      verifyReleaseReport(remoteReport, reportSigningSecret) &&
      remoteReport?.schemaVersion === 2 &&
      remoteReport?.releaseRunId === releaseRunId &&
      remoteReport?.summary?.passed === true &&
      remoteReport?.local?.sourceCleanAtStart === true &&
      remoteReport?.local?.sourceCleanAtEnd === true &&
      commitMatches(remoteReport?.local?.endCommitSha, localCommitSha) &&
      commitMatches(
        remoteReport?.remote?.expectedCommitSha,
        expectedCommitSha
      ) &&
      commitMatches(remoteReport?.remote?.localCommitSha, localCommitSha) &&
      commitMatches(
        remoteReport?.remote?.deployedCommitSha,
        localCommitSha
      ) &&
      Boolean(remoteReport?.remote?.deploymentId) &&
      Boolean(remoteReport?.remote?.deploymentUrl),
    message: "Remote deployment report is missing or failed.",
  },
  {
    ok:
      verifyReleaseReport(realSmokeReport, reportSigningSecret) &&
      realSmokeReport?.schemaVersion === 2 &&
      realSmokeReport?.releaseRunId === releaseRunId &&
      realSmokeReport?.summary?.passed === true &&
      realSmokeReport?.productionValidated === true &&
      realSmokeReport?.formalRelease === true &&
      realSmokeReport?.mode === "all" &&
      realSmokeReport?.deploymentCommitVerified === true &&
      realSmokeReport?.networkOriginPinned === true &&
      realSmokeReport?.sourceCleanAtStart === true &&
      realSmokeReport?.sourceCleanAtEnd === true &&
      commitMatches(realSmokeReport?.endCommitSha, localCommitSha) &&
      commitMatches(realSmokeReport?.expectedCommitSha, expectedCommitSha) &&
      commitMatches(realSmokeReport?.localCommitSha, localCommitSha) &&
      commitMatches(
        realSmokeReport?.targetCommitShaBefore,
        localCommitSha
      ) &&
      commitMatches(
        realSmokeReport?.targetCommitShaAfter,
        localCommitSha
      ) &&
      realSmokeReport?.targetDeploymentIdBefore ===
        remoteReport?.remote?.deploymentId &&
      realSmokeReport?.targetDeploymentIdAfter ===
        remoteReport?.remote?.deploymentId &&
      realSmokeReport?.targetDeploymentUrl ===
        remoteReport?.remote?.deploymentUrl,
    message:
      "Formal existing-account and fresh-account production smoke is incomplete.",
  },
  {
    ok:
      verifyReleaseReport(sqlCheckReport, reportSigningSecret) &&
      sqlCheckReport?.schemaVersion === 2 &&
      sqlCheckReport?.releaseRunId === releaseRunId &&
      sqlCheckReport?.overallPassed === true &&
      sqlCheckReport?.source === "npm run db:check" &&
      sqlCheckReport?.mode === "strict" &&
      commitMatches(sqlCheckReport?.localCommitSha, localCommitSha),
    message: "Strict SQL evidence is missing or belongs to another run.",
  },
];

for (const check of evidenceChecks) {
  if (!check.ok) report.summary.blockers.push(check.message);
}

report.productionValidated =
  report.steps.every((step) => step.exitCode === 0) &&
  report.sourceCleanAtStart &&
  report.sourceCleanAtEnd &&
  report.endCommitSha === report.localCommitSha &&
  report.isolatedWorktree.sourceCleanAtEnd === true &&
  report.isolatedWorktree.endCommitSha === report.localCommitSha &&
  evidenceChecks.every((check) => check.ok);
report.summary.passed = report.productionValidated;

if (report.productionValidated) {
  console.log(
    "[OK] Formal release gate passed with strict normal-session and production three-role evidence."
  );
} else {
  for (const blocker of report.summary.blockers) {
    console.error(`[FAIL] ${blocker}`);
  }
  console.error(
    "[FAIL] Formal release gate is blocked. No production-ready claim is permitted."
  );
}

isolatedWorktree.cleanup();
report.isolatedWorktree.cleaned = true;
report.generatedAt = new Date().toISOString();
writeReport(report);
process.exit(report.summary.passed ? 0 : 1);
