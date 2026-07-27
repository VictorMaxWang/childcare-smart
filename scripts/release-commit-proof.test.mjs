import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  commitMatches,
  fetchDeploymentProof,
  isReleaseSourcePathIgnored,
  normalizeCommitSha,
  normalizeDeploymentId,
  normalizeDeploymentUrl,
  normalizeReleaseRunId,
  readLocalCommitSha,
} from "./release-commit-proof.mjs";
import {
  signReleaseReport,
  verifyReleaseReport,
} from "./release-report-proof.mjs";
import { createIsolatedReleaseWorktree } from "./release-isolated-worktree.mjs";
import {
  assertNoReleaseEnvironmentInjection,
  buildReleaseChildEnvironment,
  resolveNpmCliPath,
} from "./release-environment-proof.mjs";

function jsonResponseAt(url, payload, { redirected = false } = {}) {
  const response = Response.json(payload);
  Object.defineProperties(response, {
    redirected: { value: redirected },
    url: { value: String(url) },
  });
  return response;
}

test("release commit proof requires equal full SHAs", () => {
  const full = "abcdef1234567890abcdef1234567890abcdef12";
  const samePrefix = "abcdef1234567890abcdef1234567890abcdef99";

  assert.equal(normalizeCommitSha(full.toUpperCase()), full);
  assert.equal(commitMatches(full, full.toUpperCase()), true);
  assert.equal(commitMatches(full, "abcdef1"), false);
  assert.equal(commitMatches(full, samePrefix), false);
  assert.equal(commitMatches(full, ""), false);
  assert.equal(normalizeCommitSha("not-a-commit"), "");
});

test("release proof normalizes deployment and run identifiers", () => {
  assert.equal(normalizeDeploymentId("dpl_123.test"), "dpl_123.test");
  assert.equal(normalizeDeploymentId(""), "");
  assert.equal(
    normalizeDeploymentUrl("https://release-123.vercel.app/path"),
    "https://release-123.vercel.app"
  );
  assert.equal(normalizeDeploymentUrl("http://release.test"), "");
  assert.equal(
    normalizeReleaseRunId("019fa2ef-9d94-7e91-9406-1f6ce6e92df2"),
    "019fa2ef-9d94-7e91-9406-1f6ce6e92df2"
  );
  assert.equal(normalizeReleaseRunId("manual-run"), "");
});

test("release report proof detects any post-signing change", () => {
  const secret = "release-report-test-secret-at-least-32-characters";
  const signed = signReleaseReport(
    {
      schemaVersion: 2,
      summary: { passed: true },
      steps: [{ label: "test", exitCode: 0, error: undefined }],
    },
    secret
  );

  assert.equal(verifyReleaseReport(signed, secret), true);
  assert.equal(
    verifyReleaseReport(JSON.parse(JSON.stringify(signed)), secret),
    true
  );
  assert.equal(
    verifyReleaseReport(
      { ...signed, summary: { passed: false } },
      secret
    ),
    false
  );
  assert.equal(
    verifyReleaseReport(
      {
        ...signed,
        summary: {
          ...signed.summary,
          proof: { injectedAfterSigning: true },
        },
      },
      secret
    ),
    false
  );
});

test("release child environment removes host-only variables and rejects injection", () => {
  const childEnv = buildReleaseChildEnvironment(
    {
      Path: "C:\\Windows\\System32",
      TEMP: "C:\\Temp",
      UNRELATED_HOST_FLAG: "must-not-leak",
    },
    {
      DATABASE_URL: "mysql://release.test/db",
      AUTH_SESSION_SECRET:
        "release-environment-test-secret-at-least-32",
    }
  );

  assert.equal(childEnv.Path, "C:\\Windows\\System32");
  assert.equal(childEnv.DATABASE_URL, "mysql://release.test/db");
  assert.equal(childEnv.UNRELATED_HOST_FLAG, undefined);
  const npmResult = spawnSync(
    process.execPath,
    [resolveNpmCliPath(), "--version"],
    {
      env: childEnv,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    }
  );
  assert.equal(npmResult.status, 0, npmResult.stderr);
  assert.match(npmResult.stdout, /^\d+\.\d+\.\d+/u);
  assert.throws(
    () =>
      assertNoReleaseEnvironmentInjection({
        NODE_OPTIONS: "--require=C:\\outside.js",
      }),
    /NODE_OPTIONS/u
  );
  for (const key of [
    "NPM_CONFIG_USERCONFIG",
    "npm_config_script_shell",
    "GIT_CONFIG_COUNT",
  ]) {
    assert.throws(
      () => assertNoReleaseEnvironmentInjection({ [key]: "outside" }),
      new RegExp(key, "iu")
    );
  }
  assert.throws(
    () =>
      buildReleaseChildEnvironment(
        { Path: "C:\\Windows\\System32" },
        { PATH: "C:\\untrusted" }
      ),
    /must not override host execution variables/u
  );
});

test(
  "PowerShell release launcher rejects Node preload before starting Node",
  { skip: process.platform !== "win32" },
  (t) => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "childcare-release-preload-")
    );
    t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
    const preloadPath = path.join(tempDir, "preload.cjs");
    const markerPath = path.join(tempDir, "preload-ran.txt");
    fs.writeFileSync(
      preloadPath,
      [
        'const fs = require("node:fs");',
        'fs.writeFileSync(process.env.RELEASE_PRELOAD_MARKER, "ran", "utf8");',
        "",
      ].join("\n"),
      "utf8"
    );

    const result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.resolve("scripts/release-formal-gate.ps1"),
        "-EnvFile",
        path.join(tempDir, "missing.env"),
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_OPTIONS: `--require="${preloadPath}"`,
          RELEASE_PRELOAD_MARKER: markerPath,
        },
        encoding: "utf8",
        shell: false,
        windowsHide: true,
      }
    );

    assert.equal(result.status, 64, result.stderr);
    assert.match(result.stderr, /NODE_OPTIONS/u);
    assert.equal(fs.existsSync(markerPath), false);
  }
);

test("release source proof ignores only docs and generated artifacts", () => {
  assert.equal(isReleaseSourcePathIgnored("docs/current-status.md"), true);
  assert.equal(isReleaseSourcePathIgnored("artifacts/release.json"), true);
  assert.equal(isReleaseSourcePathIgnored("app/api/health/route.ts"), false);
  assert.equal(isReleaseSourcePathIgnored(".env.example"), false);
});

test("isolated release worktree contains only the selected commit", (t) => {
  const repoRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "childcare-isolated-release-fixture-")
  );
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  const runGit = (args) => {
    const result = spawnSync("git", args, {
      cwd: repoRoot,
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
    path.join(repoRoot, ".gitignore"),
    ".env.local\n",
    "utf8"
  );
  fs.writeFileSync(path.join(repoRoot, "source.txt"), "committed\n", "utf8");
  const maliciousHooksPath = path.join(repoRoot, "malicious-hooks");
  const hookMarkerPath = path.join(repoRoot, "post-checkout-ran.txt");
  fs.mkdirSync(maliciousHooksPath);
  fs.writeFileSync(
    path.join(maliciousHooksPath, "post-checkout"),
    [
      "#!/bin/sh",
      `printf 'ran\\n' > '${hookMarkerPath.replaceAll("\\", "/")}'`,
      "",
    ].join("\n"),
    "utf8"
  );
  runGit(["config", "core.hooksPath", maliciousHooksPath]);
  runGit(["add", ".gitignore", "source.txt"]);
  runGit(["commit", "-m", "test: isolated release source"]);
  const commitSha = runGit(["rev-parse", "HEAD"]);
  fs.writeFileSync(
    path.join(repoRoot, ".env.local"),
    "LOCAL_ONLY=true\n",
    "utf8"
  );

  const isolated = createIsolatedReleaseWorktree({
    repoRoot,
    commitSha,
  });
  t.after(() => isolated.cleanup());

  assert.equal(
    fs
      .readFileSync(path.join(isolated.worktreePath, "source.txt"), "utf8")
      .trim(),
    "committed"
  );
  assert.equal(
    fs.existsSync(path.join(isolated.worktreePath, ".env.local")),
    false
  );
  assert.equal(
    fs.existsSync(path.join(isolated.worktreePath, "node_modules")),
    false
  );
  assert.equal(fs.existsSync(hookMarkerPath), false);
  fs.writeFileSync(
    path.join(isolated.worktreePath, ".env.local"),
    "POST_CHECKOUT_POLLUTION=true\n",
    "utf8"
  );
  assert.throws(
    () => isolated.assertCheckoutClean(),
    /post-checkout pollution.*\.env\.local/iu
  );
  isolated.cleanup();
  assert.equal(fs.existsSync(isolated.worktreePath), false);
});

test("release commit proof resolves the current repository HEAD", () => {
  assert.match(readLocalCommitSha(), /^[a-f0-9]{40}$/u);
});

test("deployment proof reads commit and deployment id without caching", async () => {
  const originalFetch = globalThis.fetch;
  const commitSha = "1234567890abcdef1234567890abcdef12345678";
  const deploymentId = "dpl_release_123";
  const deploymentUrl = "https://release-123.vercel.app";
  let requestedUrl = "";
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "error");
    return jsonResponseAt(input, {
      deployment: { commitSha, deploymentId, deploymentUrl },
    });
  };

  try {
    assert.deepEqual(
      await fetchDeploymentProof("https://release.example.test"),
      { commitSha, deploymentId, deploymentUrl }
    );
    assert.equal(
      requestedUrl,
      "https://release.example.test/api/health"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("deployment proof rejects health payloads without deployment id", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) =>
    jsonResponseAt(input, {
      deployment: {
        commitSha: "1234567890abcdef1234567890abcdef12345678",
      },
    });

  try {
    await assert.rejects(
      fetchDeploymentProof("https://release.example.test"),
      /deploymentId/u
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("deployment proof rejects health payloads without deployment URL", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) =>
    jsonResponseAt(input, {
      deployment: {
        commitSha: "1234567890abcdef1234567890abcdef12345678",
        deploymentId: "dpl_release_123",
      },
    });

  try {
    await assert.rejects(
      fetchDeploymentProof("https://release.example.test"),
      /deploymentUrl/u
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("deployment proof rejects redirects away from the requested origin", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(init?.redirect, "error");
    return jsonResponseAt(
      "https://mutable-alias.example.test/api/health",
      {},
      { redirected: true }
    );
  };

  try {
    await assert.rejects(
      fetchDeploymentProof("https://release-123.vercel.app"),
      /must not follow redirects/u
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("deployment proof rejects an unexpected final URL", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    jsonResponseAt("https://release-123.vercel.app/other", {});

  try {
    await assert.rejects(
      fetchDeploymentProof("https://release-123.vercel.app"),
      /escaped the requested URL/u
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("release check deletes stale evidence before an early env failure", (t) => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "childcare-release-stale-proof-")
  );
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const reportPath = path.join(tempDir, "remote-report.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ summary: { passed: true } }),
    "utf8"
  );

  const result = spawnSync(
    process.execPath,
    [
      "scripts/release-check.mjs",
      "--require-remote",
      `--release-env-file=${path.join(tempDir, "missing.env")}`,
      `--report-path=${reportPath}`,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    }
  );

  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(reportPath), false);
});

test("local gate deletes stale evidence before conflicting-flag exit", (t) => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "childcare-local-gate-stale-proof-")
  );
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const reportPath = path.join(tempDir, "local-report.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ summary: { passed: true } }),
    "utf8"
  );

  const result = spawnSync(
    process.execPath,
    [
      path.resolve("scripts/release-local-gate.mjs"),
      "--allow-real-account-skip",
      "--require-real-accounts",
      `--report-path=${reportPath}`,
    ],
    {
      cwd: tempDir,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    }
  );

  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(reportPath), false);
});
