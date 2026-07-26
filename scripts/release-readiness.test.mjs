import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(scriptsDir);
const readinessScript = path.join(scriptsDir, "release-ready.mjs");

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createEvidence(overrides = {}) {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "childcare-release-ready-")
  );
  const generatedAt = new Date().toISOString();
  const baseUrl = "https://release.test";
  const paths = {
    env: path.join(tempDir, ".env.release"),
    local: path.join(tempDir, "local.json"),
    remote: path.join(tempDir, "remote.json"),
    real: path.join(tempDir, "real.json"),
    sql: path.join(tempDir, "sql.json"),
  };

  fs.writeFileSync(
    paths.env,
    [
      `RELEASE_BASE_URL=${baseUrl}`,
      "RELEASE_ADMIN_COOKIE=ccs_session=test-cookie",
      "RELEASE_EXPECTED_COMMIT_SHA=abc123",
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
  writeJson(paths.local, {
    generatedAt,
    mode: "strict",
    productionValidated: true,
    summary: { passed: true },
    ...overrides.local,
  });
  writeJson(paths.remote, {
    generatedAt,
    remote: { baseUrl },
    summary: { passed: true },
    ...overrides.remote,
  });
  writeJson(paths.real, {
    generatedAt,
    formalRelease: true,
    mode: "all",
    liveAiRequired: true,
    targetMatchesRelease: true,
    productionValidated: true,
    summary: { passed: true },
    ...overrides.real,
  });
  writeJson(paths.sql, {
    generatedAt,
    overallPassed: true,
    source: "npm run db:check",
    mode: "strict",
    ...overrides.sql,
  });

  return { tempDir, paths };
}

function runReadiness(paths) {
  return spawnSync(
    process.execPath,
    [
      readinessScript,
      `--env-file=${paths.env}`,
      `--local-report=${paths.local}`,
      `--remote-report=${paths.remote}`,
      `--real-smoke-report=${paths.real}`,
      `--sql-check=${paths.sql}`,
    ],
    {
      cwd: repoRoot,
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
