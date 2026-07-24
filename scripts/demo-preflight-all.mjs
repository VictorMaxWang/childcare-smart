#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const args = process.argv.slice(2);
const remoteMode = args.includes("--remote");
const reportPathArg = args.find((arg) => arg.startsWith("--report-path="));
const reportPath = reportPathArg
  ? reportPathArg.slice("--report-path=".length)
  : "artifacts/demo-preflight-all/report.json";
const npmBin = "npm";

const releaseEnvKeys = [
  "RELEASE_BASE_URL",
  "RELEASE_ADMIN_COOKIE",
  "CRON_SECRET",
  "BRAIN_API_BASE_URL",
  "AUTH_SESSION_SECRET",
  "DATABASE_URL",
  "DATABASE_SSL",
  "VIVO_APP_ID",
  "VIVO_APP_KEY",
  "VIVO_BASE_URL",
  "VIVO_LLM_MODEL",
  "VIVO_OCR_PATH",
  "VIVO_ASR_PACKAGE",
  "VIVO_ASR_CLIENT_VERSION",
  "VIVO_ASR_USER_ID",
  "VIVO_ASR_ENGINE_ID",
  "DASHSCOPE_API_KEY",
  "BAILIAN_MODEL",
  "BAILIAN_ENDPOINT",
  "BAILIAN_TIMEOUT_MS",
];

const localAiEnvKeys = [
  "VIVO_APP_ID",
  "VIVO_APP_KEY",
  "VIVO_BASE_URL",
  "VIVO_LLM_MODEL",
  "VIVO_OCR_PATH",
  "VIVO_ASR_PACKAGE",
  "VIVO_ASR_CLIENT_VERSION",
  "VIVO_ASR_USER_ID",
  "VIVO_ASR_ENGINE_ID",
  "DASHSCOPE_API_KEY",
  "BAILIAN_MODEL",
  "BAILIAN_ENDPOINT",
  "BAILIAN_TIMEOUT_MS",
];

function resolvePath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
}

function parseEnvFile(filePath) {
  const abs = resolvePath(filePath);
  if (!fs.existsSync(abs)) return { exists: false, map: {} };
  const map = {};
  for (const raw of fs.readFileSync(abs, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map[key] = value;
  }
  return { exists: true, map };
}

function envSummary(filePath, keys) {
  const parsed = parseEnvFile(filePath);
  const rows = keys.map((key) => ({
    key,
    status: String(parsed.map[key] ?? "").trim() ? "SET" : "MISSING",
  }));
  return { filePath, exists: parsed.exists, keys: rows };
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

function writeReport(report) {
  const absReport = resolvePath(reportPath);
  fs.mkdirSync(path.dirname(absReport), { recursive: true });
  fs.writeFileSync(absReport, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`\n[OK] Demo preflight report written: ${absReport}`);
}

const steps = [
  "typecheck",
  "lint",
  "build",
  "product:ai",
  "demo:preflight",
  "release:check",
].map((script) => ({
  label: `npm run ${script}`,
  command: npmBin,
  args: ["run", script],
  shell: process.platform === "win32",
}));

if (remoteMode) {
  for (const script of ["release:env:check", "release:gate:remote:env"]) {
    steps.push({ label: `npm run ${script}`, command: npmBin, args: ["run", script], shell: process.platform === "win32" });
  }
}

const env = [
  envSummary(".env.release", releaseEnvKeys),
  envSummary(".env.local", localAiEnvKeys),
];

for (const fileEnv of env) {
  console.log(`\nEnv file: ${fileEnv.filePath} (${fileEnv.exists ? "exists" : "missing"})`);
  for (const row of fileEnv.keys) {
    console.log(`[ENV] ${row.key}=${row.status}`);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  mode: remoteMode ? "remote" : "local",
  runtime: { node: process.version, cwd },
  env,
  steps: steps.map((step) => ({
    label: step.label,
    command: [step.command, ...step.args].join(" "),
    exitCode: null,
    skipped: true,
  })),
  summary: { passed: false, failedSteps: [] },
};

for (let index = 0; index < steps.length; index += 1) {
  const result = runStep(steps[index]);
  report.steps[index] = { ...result, skipped: false };
}

report.summary.failedSteps = report.steps
  .filter((step) => step.exitCode !== 0)
  .map((step) => step.label);
report.summary.passed = report.summary.failedSteps.length === 0;

writeReport(report);
process.exit(report.summary.passed ? 0 : 1);
