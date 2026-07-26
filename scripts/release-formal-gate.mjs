#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

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
const localReportPath = "artifacts/release-gate.strict.json";
const remoteReportPath = "artifacts/release-report.remote.json";
const realSmokeReportPath = "artifacts/real-smoke/formal-report.json";
const sqlCheckReportPath = "artifacts/release-sql-check.json";

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
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
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

if (!fs.existsSync(envPath)) {
  const report = {
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

const releaseEnv = {
  ...process.env,
  ...parseEnvFile(envPath),
};

const steps = [
  {
    label: "formal release env",
    args: [
      "scripts/release-env-check.mjs",
      "--formal",
      `--env-file=${envPath}`,
    ],
  },
  {
    label: "strict local and normal-session gate",
    args: [
      "scripts/release-local-gate.mjs",
      "--require-real-accounts",
      `--report-path=${localReportPath}`,
    ],
  },
  {
    label: "remote deployment gate",
    args: [
      "scripts/release-check.mjs",
      "--require-remote",
      `--release-env-file=${envPath}`,
      `--report-path=${remoteReportPath}`,
    ],
  },
  {
    label: "formal production three-role smoke",
    args: [
      "scripts/real-three-role-smoke-gate.mjs",
      "--formal-release",
      `--report-path=${realSmokeReportPath}`,
    ],
  },
  {
    label: "aggregate release readiness",
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
  generatedAt: new Date().toISOString(),
  mode: "formal",
  envFile: envPath,
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
      command: [process.execPath, ...step.args].join(" "),
      skipped: true,
      skipReason: "A previous formal release step failed.",
      exitCode: null,
    });
    continue;
  }

  console.log(`\n=== ${step.label} ===`);
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const result = spawnSync(process.execPath, step.args, {
    cwd,
    env: releaseEnv,
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  });
  const exitCode = typeof result.status === "number" ? result.status : 1;
  report.steps.push({
    label: step.label,
    command: [process.execPath, ...step.args].join(" "),
    startedAt,
    durationMs: Date.now() - started,
    exitCode,
    signal: result.signal ?? null,
    error: result.error ? result.error.message : null,
  });
  if (exitCode !== 0) continueRunning = false;
}

const localReport = readJsonSafe(localReportPath);
const remoteReport = readJsonSafe(remoteReportPath);
const realSmokeReport = readJsonSafe(realSmokeReportPath);
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
      localReport?.summary?.passed === true &&
      localReport?.productionValidated === true &&
      localReport?.mode === "strict",
    message:
      "Strict local report does not prove non-skipped normal-session coverage.",
  },
  {
    ok: remoteReport?.summary?.passed === true,
    message: "Remote deployment report is missing or failed.",
  },
  {
    ok:
      realSmokeReport?.summary?.passed === true &&
      realSmokeReport?.productionValidated === true &&
      realSmokeReport?.formalRelease === true &&
      realSmokeReport?.mode === "all",
    message:
      "Formal existing-account and fresh-account production smoke is incomplete.",
  },
];

for (const check of evidenceChecks) {
  if (!check.ok) report.summary.blockers.push(check.message);
}

report.productionValidated =
  report.steps.every((step) => step.exitCode === 0) &&
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

writeReport(report);
process.exit(report.summary.passed ? 0 : 1);
