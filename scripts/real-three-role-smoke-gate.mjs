#!/usr/bin/env node
import { fork, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  PRODUCTION_REAL_CRITICAL_FILES,
  evaluateCriticalPlaywrightCoverage,
  isTruthy,
  summarizeCriticalPlaywrightCoverage,
  validateFormalRealSmokeEnv,
} from "./release-test-policy.mjs";
import {
  assertReleaseSourceClean,
  commitMatches,
  fetchDeploymentProof,
  normalizeCommitSha,
  normalizeReleaseRunId,
  readLocalCommitSha,
} from "./release-commit-proof.mjs";
import { maybeSignReleaseReport } from "./release-report-proof.mjs";
import { assertTrustedReleaseLauncher } from "./release-environment-proof.mjs";

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
const releaseRunId =
  normalizeReleaseRunId(process.env.RELEASE_RUN_ID) || randomUUID();

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.mkdirSync(path.dirname(playwrightReportPath), { recursive: true });
// 先废弃旧证据；即使预检失败或进程中断，聚合门禁也不能复用旧绿灯。
fs.rmSync(reportPath, { force: true });
fs.rmSync(playwrightReportPath, { force: true });

function writeVerdictReport(report) {
  const signedReport = maybeSignReleaseReport(report);
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify(signedReport, null, 2)}\n`,
    "utf8"
  );
}

function buildProxyChildEnvironment(pinnedOrigin) {
  const childEnv = {
    RELEASE_PINNED_ORIGIN: pinnedOrigin,
  };
  for (const key of [
    "Path",
    "PATH",
    "PATHEXT",
    "SystemDrive",
    "SystemRoot",
    "TEMP",
    "TMP",
    "windir",
  ]) {
    if (process.env[key] !== undefined) childEnv[key] = process.env[key];
  }
  return childEnv;
}

async function startPinnedOriginProxy(pinnedOrigin) {
  const child = fork(
    path.resolve(cwd, "scripts/release-origin-proxy.mjs"),
    [],
    {
      cwd,
      env: buildProxyChildEnvironment(pinnedOrigin),
      execArgv: [],
      stdio: ["ignore", "inherit", "inherit", "ipc"],
      windowsHide: true,
    }
  );
  const ready = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Pinned origin proxy startup timed out."));
    }, 10_000);
    const finish = (callback, value) => {
      clearTimeout(timeout);
      child.off("message", onMessage);
      child.off("error", onError);
      child.off("exit", onExit);
      callback(value);
    };
    const onMessage = (message) => {
      if (message?.type === "release-origin-proxy-ready") {
        finish(resolve, message);
      } else if (message?.type === "release-origin-proxy-error") {
        finish(
          reject,
          new Error(message.message || "Pinned origin proxy failed.")
        );
      }
    };
    const onError = (error) => finish(reject, error);
    const onExit = (code) =>
      finish(
        reject,
        new Error(`Pinned origin proxy exited before startup (code ${code}).`)
      );
    child.on("message", onMessage);
    child.once("error", onError);
    child.once("exit", onExit);
  }).catch((error) => {
    child.kill();
    throw error;
  });
  return { child, ...ready };
}

async function stopPinnedOriginProxy(handle) {
  if (!handle?.child || handle.child.exitCode !== null) return;
  const exited = new Promise((resolve) => handle.child.once("exit", resolve));
  handle.child.disconnect();
  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (handle.child.exitCode === null) handle.child.kill();
}

function createPinnedPlaywrightConfig(proxyServer) {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "childcare-pinned-playwright-")
  );
  const configPath = path.join(tempRoot, "playwright-pinned.config.mjs");
  const baseConfigUrl = pathToFileURL(
    path.resolve(cwd, "playwright.real-smoke.config.ts")
  ).href;
  const proxy = { server: proxyServer };
  const source = [
    `import baseConfig from ${JSON.stringify(baseConfigUrl)};`,
    `const proxy = ${JSON.stringify(proxy)};`,
    "export default {",
    "  ...baseConfig,",
    `  testDir: ${JSON.stringify(cwd)},`,
    `  outputDir: ${JSON.stringify(
      path.resolve(cwd, "artifacts/real-smoke/playwright-output")
    )},`,
    "  use: { ...baseConfig.use, proxy },",
    "  projects: (baseConfig.projects || []).map((project) => ({",
    "    ...project,",
    "    use: { ...project.use, proxy },",
    "  })),",
    "};",
    "",
  ].join("\n");
  fs.writeFileSync(configPath, source, "utf8");
  return {
    configPath,
    cleanup: () => fs.rmSync(tempRoot, { recursive: true, force: true }),
  };
}

if (formalRelease) {
  try {
    assertTrustedReleaseLauncher(process.env);
  } catch (error) {
    console.error(
      `[FAIL] ${
        error instanceof Error
          ? error.message
          : "Trusted PowerShell launcher proof is missing."
      }`
    );
    process.exit(1);
  }
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

const expectedCommitSha = normalizeCommitSha(
  process.env.RELEASE_EXPECTED_COMMIT_SHA
);
let localCommitSha = "";
let endCommitSha = "";
let targetCommitShaBefore = "";
let targetDeploymentIdBefore = "";
let targetDeploymentUrl = "";
let sourceCleanAtStart = false;
try {
  localCommitSha = readLocalCommitSha(cwd);
  if (formalRelease && !commitMatches(localCommitSha, expectedCommitSha)) {
    throw new Error(
      "RELEASE_EXPECTED_COMMIT_SHA does not match the current local HEAD."
    );
  }
  if (formalRelease) {
    assertReleaseSourceClean(cwd);
    sourceCleanAtStart = true;
    const deploymentProof = await fetchDeploymentProof(baseURL);
    targetCommitShaBefore = deploymentProof.commitSha;
    targetDeploymentIdBefore = deploymentProof.deploymentId;
    targetDeploymentUrl = deploymentProof.deploymentUrl;
    if (!commitMatches(targetCommitShaBefore, expectedCommitSha)) {
      throw new Error(
        "The production target does not match RELEASE_EXPECTED_COMMIT_SHA before smoke execution."
      );
    }
    const pinnedProof = await fetchDeploymentProof(targetDeploymentUrl);
    if (
      !commitMatches(pinnedProof.commitSha, targetCommitShaBefore) ||
      pinnedProof.deploymentId !== targetDeploymentIdBefore ||
      pinnedProof.deploymentUrl !== targetDeploymentUrl
    ) {
      throw new Error(
        "The deployment-specific URL does not resolve to the selected production deployment."
      );
    }
  }
} catch (error) {
  const reason =
    error instanceof Error ? error.message : "Deployment commit proof failed.";
  const failedReport = {
    schemaVersion: 2,
    releaseRunId,
    generatedAt: new Date().toISOString(),
    formalRelease,
    mode,
    expectedCommitSha,
    localCommitSha,
    endCommitSha,
    sourceCleanAtStart,
    sourceCleanAtEnd: false,
    targetCommitShaBefore,
    targetCommitShaAfter: "",
    targetDeploymentIdBefore,
    targetDeploymentIdAfter: "",
    targetDeploymentUrl,
    deploymentCommitVerified: false,
    networkOriginPinned: false,
    productionValidated: false,
    summary: { passed: false, outcome: "deployment-proof-failed" },
    blockers: [reason],
  };
  writeVerdictReport(failedReport);
  console.error(`[FAIL] ${reason}`);
  process.exit(1);
}

console.log(
  `[real-smoke] mode=${mode}; formalRelease=${formalRelease}; liveAI=${isTruthy(
    process.env.REAL_SMOKE_REQUIRE_LIVE_AI ?? "1"
  )}.`
);

let originProxy = null;
let pinnedPlaywrightConfig = null;
let networkOriginPinned = false;
let result;
try {
  if (formalRelease) {
    originProxy = await startPinnedOriginProxy(targetDeploymentUrl);
    pinnedPlaywrightConfig = createPinnedPlaywrightConfig(originProxy.server);
    networkOriginPinned = true;
  }
  const playwrightEnv = {
    ...process.env,
    REAL_SMOKE_BASE_URL: formalRelease ? targetDeploymentUrl : baseURL,
    PLAYWRIGHT_JSON_OUTPUT_FILE: playwrightReportPath,
  };
  for (const key of Object.keys(playwrightEnv)) {
    if (/^(?:ALL|HTTP|HTTPS|NO)_PROXY$/iu.test(key)) {
      delete playwrightEnv[key];
    }
  }
  if (formalRelease) {
    playwrightEnv.RELEASE_PINNED_ORIGIN = targetDeploymentUrl;
    playwrightEnv.RELEASE_REQUIRE_PINNED_ORIGIN_GUARD = "1";
  }
  const guardArgs = formalRelease
    ? [
        "--import",
        pathToFileURL(
          path.resolve(cwd, "scripts/release-origin-guard.mjs")
        ).href,
      ]
    : [];
  result = spawnSync(
    process.execPath,
    [
      ...guardArgs,
      "./node_modules/@playwright/test/cli.js",
      "test",
      "tests/production-real/three-role.spec.ts",
      `--config=${
        pinnedPlaywrightConfig?.configPath ??
        "playwright.real-smoke.config.ts"
      }`,
      "--project=chromium",
      "--reporter=line,json",
    ],
    {
      cwd,
      env: playwrightEnv,
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    }
  );
} catch (error) {
  result = {
    status: 1,
    signal: null,
    error:
      error instanceof Error
        ? error
        : new Error("Unable to establish the pinned smoke origin."),
  };
} finally {
  pinnedPlaywrightConfig?.cleanup();
  await stopPinnedOriginProxy(originProxy);
}

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
let targetCommitShaAfter = targetCommitShaBefore;
let targetDeploymentIdAfter = targetDeploymentIdBefore;
let sourceCleanAtEnd = !formalRelease;
let deploymentCommitVerified = !formalRelease;
let deploymentProofError = "";
if (formalRelease) {
  try {
    endCommitSha = readLocalCommitSha(cwd);
    assertReleaseSourceClean(cwd);
    sourceCleanAtEnd = true;
    const deploymentProof = await fetchDeploymentProof(
      formalRelease ? targetDeploymentUrl : baseURL
    );
    targetCommitShaAfter = deploymentProof.commitSha;
    targetDeploymentIdAfter = deploymentProof.deploymentId;
    deploymentCommitVerified =
      sourceCleanAtStart &&
      sourceCleanAtEnd &&
      commitMatches(localCommitSha, endCommitSha) &&
      commitMatches(localCommitSha, expectedCommitSha) &&
      commitMatches(targetCommitShaBefore, expectedCommitSha) &&
      commitMatches(targetCommitShaAfter, expectedCommitSha) &&
      targetDeploymentIdBefore === targetDeploymentIdAfter &&
      deploymentProof.deploymentUrl === targetDeploymentUrl;
    if (!deploymentCommitVerified) {
      deploymentProofError =
        "The production deployment changed or no longer matches the expected commit.";
    }
  } catch (error) {
    deploymentProofError =
      error instanceof Error
        ? error.message
        : "Unable to verify deployment commit after smoke execution.";
  }
}
if (deploymentProofError) {
  verdict.blockers.push(deploymentProofError);
  verdict.passed = false;
  verdict.productionValidated = false;
  verdict.outcome = "deployment-proof-failed";
}
const report = {
  schemaVersion: 2,
  releaseRunId,
  generatedAt: new Date().toISOString(),
  formalRelease,
  mode,
  expectedCommitSha,
  localCommitSha,
  endCommitSha,
  sourceCleanAtStart,
  sourceCleanAtEnd,
  targetCommitShaBefore,
  targetCommitShaAfter,
  targetDeploymentIdBefore,
  targetDeploymentIdAfter,
  targetDeploymentUrl,
  deploymentCommitVerified,
  networkOriginPinned,
  liveAiRequired: isTruthy(
    process.env.REAL_SMOKE_REQUIRE_LIVE_AI ?? "1"
  ),
  writesExplicitlyAllowed: allowWrites,
  targetMatchesRelease:
    !formalRelease ||
    (String(process.env.RELEASE_BASE_URL ?? "").replace(/\/$/u, "") ===
      baseURL.replace(/\/$/u, "") &&
      Boolean(targetDeploymentUrl)),
  playwrightExitCode,
  criticalCoverage,
  verdict,
  productionValidated:
    formalRelease &&
    mode === "all" &&
    playwrightExitCode === 0 &&
    deploymentCommitVerified &&
    networkOriginPinned &&
    verdict.productionValidated,
  summary: {
    passed: playwrightExitCode === 0 && verdict.passed,
    outcome:
      playwrightExitCode !== 0 ? "playwright-failed" : verdict.outcome,
  },
};
writeVerdictReport(report);

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
