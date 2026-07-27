import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { signReleaseReport } from "./release-report-proof.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(scriptsDir);
const readinessScript = path.join(scriptsDir, "release-ready.mjs");
const releaseBrowserRunner = path.join(
  scriptsDir,
  "run-release-browser-tests.mjs"
);
function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createEvidence(overrides = {}) {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "childcare-release-ready-")
  );
  const runGit = (args) => {
    const result = spawnSync("git", args, {
      cwd: tempDir,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  runGit(["init"]);
  runGit(["config", "user.name", "Release Fixture"]);
  runGit(["config", "user.email", "release-fixture@example.test"]);
  fs.writeFileSync(
    path.join(tempDir, ".gitignore"),
    "evidence/\n",
    "utf8"
  );
  fs.writeFileSync(path.join(tempDir, "fixture.txt"), "release fixture\n", "utf8");
  runGit(["add", ".gitignore", "fixture.txt"]);
  runGit(["commit", "-m", "test: initialize release fixture"]);
  const localCommitSha = runGit(["rev-parse", "HEAD"]);
  const releaseRunId = randomUUID();
  const signingSecret =
    "release-readiness-fixture-signing-secret-32-chars";
  const generatedAt = new Date().toISOString();
  const baseUrl = "https://release.test";
  const evidenceDir = path.join(tempDir, "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });
  const paths = {
    env: path.join(evidenceDir, ".env.release"),
    local: path.join(evidenceDir, "local.json"),
    remote: path.join(evidenceDir, "remote.json"),
    real: path.join(evidenceDir, "real.json"),
    sql: path.join(evidenceDir, "sql.json"),
  };

  fs.writeFileSync(
    paths.env,
    [
      `RELEASE_BASE_URL=${baseUrl}`,
      `AUTH_SESSION_SECRET=${signingSecret}`,
      "RELEASE_ADMIN_COOKIE=ccs_session=test-cookie",
      `RELEASE_EXPECTED_COMMIT_SHA=${localCommitSha}`,
      "CRON_SECRET=test-cron-secret",
      "BRAIN_API_BASE_URL=https://brain.test",
      "DATABASE_URL=mysql://release:secret@db.test:3306/childcare",
      `REAL_SMOKE_BASE_URL=${baseUrl}`,
      "REAL_SMOKE_ALLOW_WRITES=1",
      "REAL_SMOKE_MODE=all",
      "REAL_SMOKE_REQUIRE_LIVE_AI=1",
      "REAL_SMOKE_EXISTING_ADMIN_PHONE=10000000000",
      "REAL_SMOKE_EXISTING_ADMIN_PASSWORD=admin-password",
      "REAL_SMOKE_EXISTING_TEACHER_PHONE=10000000001",
      "REAL_SMOKE_EXISTING_TEACHER_PASSWORD=teacher-password",
      "REAL_SMOKE_EXISTING_PARENT_PHONE=10000000002",
      "REAL_SMOKE_EXISTING_PARENT_PASSWORD=parent-password",
      "",
    ].join("\n"),
    "utf8"
  );
  writeJson(paths.local, signReleaseReport({
    schemaVersion: 2,
    releaseRunId,
    generatedAt,
    localCommitSha,
    endCommitSha: localCommitSha,
    sourceCleanAtStart: true,
    sourceCleanAtEnd: true,
    mode: "strict",
    isolatedWorktree: true,
    productionValidated: true,
    browserPolicy: { productionValidated: true },
    steps: [
      "npm run lint",
      "npm run typecheck",
      "npm run test:node",
      "npm run test:python",
      "npm run test:release-scripts",
      "npm run db:check",
      "npm run build",
      "release browser tests (strict, prebuilt)",
      "node scripts/release-check.mjs",
    ].map((label) => ({
      label,
      skipped: false,
      exitCode: 0,
    })),
    summary: { passed: true },
    ...overrides.local,
  }, signingSecret));
  writeJson(paths.remote, signReleaseReport({
    schemaVersion: 2,
    releaseRunId,
    generatedAt,
    local: {
      endCommitSha: localCommitSha,
      sourceCleanAtStart: true,
      sourceCleanAtEnd: true,
    },
    remote: {
      baseUrl,
      expectedCommitSha: localCommitSha,
      localCommitSha,
      deployedCommitSha: localCommitSha,
      deploymentId: "dpl_release_fixture",
      deploymentUrl: "https://release-fixture.vercel.app",
      enabled: true,
      checks: [
        "remote:expected-commit-matches-local-head",
        `remote:${baseUrl}/`,
        `remote:${baseUrl}/api/health`,
        "remote:protected-session",
        "remote:protected-state",
        "remote:protected-provider-status",
        "remote:https://brain.test/api/v1/health",
      ].map((name) => ({ name, ok: true })),
    },
    summary: { passed: true },
    ...overrides.remote,
  }, signingSecret));
  writeJson(paths.real, signReleaseReport({
    schemaVersion: 2,
    releaseRunId,
    generatedAt,
    expectedCommitSha: localCommitSha,
    localCommitSha,
    endCommitSha: localCommitSha,
    sourceCleanAtStart: true,
    sourceCleanAtEnd: true,
    targetCommitShaBefore: localCommitSha,
    targetCommitShaAfter: localCommitSha,
    targetDeploymentIdBefore: "dpl_release_fixture",
    targetDeploymentIdAfter: "dpl_release_fixture",
    targetDeploymentUrl: "https://release-fixture.vercel.app",
    deploymentCommitVerified: true,
    networkOriginPinned: true,
    formalRelease: true,
    mode: "all",
    liveAiRequired: true,
    targetMatchesRelease: true,
    productionValidated: true,
    playwrightExitCode: 0,
    criticalCoverage: {
      totals: {
        total: 2,
        passed: 2,
        skipped: 0,
        flaky: 0,
        failed: 0,
      },
    },
    verdict: {
      passed: true,
      productionValidated: true,
    },
    summary: { passed: true },
    ...overrides.real,
  }, signingSecret));
  writeJson(paths.sql, signReleaseReport({
    schemaVersion: 2,
    releaseRunId,
    generatedAt,
    overallPassed: true,
    source: "npm run db:check",
    mode: "strict",
    localCommitSha,
    step: {
      label: "npm run db:check",
      exitCode: 0,
      durationMs: 1,
    },
    ...overrides.sql,
  }, signingSecret));

  return {
    tempDir,
    paths,
    localCommitSha,
    releaseRunId,
    signingSecret,
  };
}

function runReadiness(paths, extraArgs = []) {
  return spawnSync(
    process.execPath,
    [
      readinessScript,
      `--env-file=${paths.env}`,
      `--local-report=${paths.local}`,
      `--remote-report=${paths.remote}`,
      `--real-smoke-report=${paths.real}`,
      `--sql-check=${paths.sql}`,
      ...extraArgs,
    ],
    {
      cwd: path.dirname(path.dirname(paths.env)),
      encoding: "utf8",
      windowsHide: true,
    }
  );
}

test("release readiness accepts only a complete formal evidence set", (t) => {
  const evidence = createEvidence();
  t.after(() => fs.rmSync(evidence.tempDir, { recursive: true, force: true }));

  const result = runReadiness(evidence.paths);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Release decision: GO/u);
});

test("release readiness rejects a passing local opt-out report", (t) => {
  const evidence = createEvidence({
    local: {
      mode: "local-opt-out",
      productionValidated: false,
      summary: { passed: true },
    },
  });
  t.after(() => fs.rmSync(evidence.tempDir, { recursive: true, force: true }));

  const result = runReadiness(evidence.paths);

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /lacks executed normal-session evidence/u
  );
});

test("release readiness rejects a passing but partial real smoke report", (t) => {
  const evidence = createEvidence({
    real: {
      formalRelease: false,
      mode: "existing",
      productionValidated: false,
      summary: { passed: true },
    },
  });
  t.after(() => fs.rmSync(evidence.tempDir, { recursive: true, force: true }));

  const result = runReadiness(evidence.paths);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Formal production smoke report/u);
});

test("release readiness rejects manually asserted SQL evidence", (t) => {
  const evidence = createEvidence({
    sql: {
      source: "manual",
      mode: "manual",
    },
  });
  t.after(() => fs.rmSync(evidence.tempDir, { recursive: true, force: true }));

  const result = runReadiness(evidence.paths);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /strict db:check step/u);
});

test("release readiness rejects evidence from a different deployment commit", (t) => {
  const evidence = createEvidence();
  t.after(() => fs.rmSync(evidence.tempDir, { recursive: true, force: true }));
  const remote = JSON.parse(fs.readFileSync(evidence.paths.remote, "utf8"));
  remote.remote.deployedCommitSha =
    "deadbeef00000000000000000000000000000000";
  writeJson(
    evidence.paths.remote,
    signReleaseReport(remote, evidence.signingSecret)
  );

  const result = runReadiness(evidence.paths);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Remote deployment report/u);
});

test("release readiness rejects formal smoke from a different commit", (t) => {
  const evidence = createEvidence();
  t.after(() => fs.rmSync(evidence.tempDir, { recursive: true, force: true }));
  const real = JSON.parse(fs.readFileSync(evidence.paths.real, "utf8"));
  real.targetCommitShaAfter =
    "deadbeef00000000000000000000000000000000";
  writeJson(
    evidence.paths.real,
    signReleaseReport(real, evidence.signingSecret)
  );

  const result = runReadiness(evidence.paths);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Formal production smoke report/u);
});

test("release readiness rejects evidence assembled from different runs", (t) => {
  const evidence = createEvidence();
  t.after(() => fs.rmSync(evidence.tempDir, { recursive: true, force: true }));
  const remote = JSON.parse(fs.readFileSync(evidence.paths.remote, "utf8"));
  remote.releaseRunId = randomUUID();
  writeJson(
    evidence.paths.remote,
    signReleaseReport(remote, evidence.signingSecret)
  );

  const result = runReadiness(evidence.paths);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Remote deployment report/u);
});

test("release readiness rejects a report changed after signing", (t) => {
  const evidence = createEvidence();
  t.after(() => fs.rmSync(evidence.tempDir, { recursive: true, force: true }));
  const remote = JSON.parse(fs.readFileSync(evidence.paths.remote, "utf8"));
  remote.remote.deploymentId = "dpl_tampered_after_signing";
  writeJson(evidence.paths.remote, remote);

  const result = runReadiness(evidence.paths);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Remote deployment report/u);
});

test("release readiness rejects smoke from another deployment id", (t) => {
  const evidence = createEvidence();
  t.after(() => fs.rmSync(evidence.tempDir, { recursive: true, force: true }));
  const real = JSON.parse(fs.readFileSync(evidence.paths.real, "utf8"));
  real.targetDeploymentIdAfter = "dpl_other_fixture";
  writeJson(
    evidence.paths.real,
    signReleaseReport(real, evidence.signingSecret)
  );

  const result = runReadiness(evidence.paths);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Formal production smoke report/u);
});

test("release readiness rejects evidence dated in the future", (t) => {
  const evidence = createEvidence();
  t.after(() => fs.rmSync(evidence.tempDir, { recursive: true, force: true }));
  const local = JSON.parse(fs.readFileSync(evidence.paths.local, "utf8"));
  local.generatedAt = new Date(Date.now() + 30_000).toISOString();
  writeJson(
    evidence.paths.local,
    signReleaseReport(local, evidence.signingSecret)
  );

  const result = runReadiness(evidence.paths);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Strict local gate report/u);
});

test("release readiness cannot disable freshness with Infinity", (t) => {
  const evidence = createEvidence();
  t.after(() => fs.rmSync(evidence.tempDir, { recursive: true, force: true }));
  const local = JSON.parse(fs.readFileSync(evidence.paths.local, "utf8"));
  local.generatedAt = new Date(Date.now() - 365 * 24 * 60 * 60_000).toISOString();
  writeJson(
    evidence.paths.local,
    signReleaseReport(local, evidence.signingSecret)
  );

  const result = runReadiness(evidence.paths, [
    "--max-report-age-minutes=Infinity",
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Strict local gate report/u);
});

test("release readiness rejects a source tree changed after evidence", (t) => {
  const evidence = createEvidence();
  t.after(() => fs.rmSync(evidence.tempDir, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(evidence.tempDir, "uncommitted-runtime.ts"),
    "export const changed = true;\n",
    "utf8"
  );

  const result = runReadiness(evidence.paths);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unable to prove clean release source/u);
});

test("release browser runner rejects an unproven prebuilt bundle", (t) => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "childcare-release-browser-proof-")
  );
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const policyPath = path.join(tempDir, "policy.json");
  const playwrightPath = path.join(tempDir, "playwright.json");

  const result = spawnSync(
    process.execPath,
    [
      releaseBrowserRunner,
      "--allow-real-account-skip",
      "--skip-build",
      `--policy-report-path=${policyPath}`,
      `--playwright-report-path=${playwrightPath}`,
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        RELEASE_BROWSER_EXPECTED_BUILD_ID:
          "definitely-not-the-current-build-id",
      },
      encoding: "utf8",
      windowsHide: true,
    }
  );

  assert.notEqual(result.status, 0);
  const report = JSON.parse(fs.readFileSync(policyPath, "utf8"));
  assert.equal(report.summary.passed, false);
  assert.equal(report.summary.outcome, "build-proof-failed");
  assert.equal(report.playwrightExitCode, null);
});
