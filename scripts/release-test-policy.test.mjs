import assert from "node:assert/strict";
import test from "node:test";

import {
  NORMAL_SESSION_CRITICAL_FILES,
  PRODUCTION_REAL_CRITICAL_FILES,
  evaluateCriticalPlaywrightCoverage,
  summarizeCriticalPlaywrightCoverage,
  validateFormalRealSmokeEnv,
} from "./release-test-policy.mjs";

function playwrightReport(outcomes = {}) {
  return {
    suites: NORMAL_SESSION_CRITICAL_FILES.map((file) => ({
      file,
      specs: [
        {
          file,
          title: `critical ${file}`,
          tests: [
            {
              projectName: "chromium",
              status: outcomes[file] ?? "expected",
              results: [],
            },
          ],
        },
      ],
    })),
  };
}

test("strict release policy rejects a skipped normal-session test", () => {
  const report = playwrightReport({
    [NORMAL_SESSION_CRITICAL_FILES[0]]: "skipped",
  });
  const summary = summarizeCriticalPlaywrightCoverage(report, {
    criticalFiles: NORMAL_SESSION_CRITICAL_FILES,
  });
  const verdict = evaluateCriticalPlaywrightCoverage(summary);

  assert.equal(verdict.passed, false);
  assert.equal(verdict.productionValidated, false);
  assert.match(verdict.blockers.join("\n"), /skipped 1 critical tests/u);
});

test("explicit local opt-out permits skip but never claims production validation", () => {
  const report = playwrightReport({
    [NORMAL_SESSION_CRITICAL_FILES[0]]: "skipped",
  });
  const summary = summarizeCriticalPlaywrightCoverage(report, {
    criticalFiles: NORMAL_SESSION_CRITICAL_FILES,
  });
  const verdict = evaluateCriticalPlaywrightCoverage(summary, {
    allowSkip: true,
  });

  assert.equal(verdict.passed, true);
  assert.equal(verdict.productionValidated, false);
  assert.equal(verdict.outcome, "local-opt-out");
  assert.equal(verdict.warnings.length, 1);
});

test("strict release policy accepts complete expected normal-session coverage", () => {
  const summary = summarizeCriticalPlaywrightCoverage(playwrightReport(), {
    criticalFiles: NORMAL_SESSION_CRITICAL_FILES,
  });
  const verdict = evaluateCriticalPlaywrightCoverage(summary);

  assert.equal(verdict.passed, true);
  assert.equal(verdict.productionValidated, true);
  assert.equal(verdict.outcome, "production-validated");
});

test("critical coverage accepts absolute Windows reporter paths", () => {
  const report = playwrightReport();
  for (const suite of report.suites) {
    suite.file = `D:\\repo\\${suite.file.replaceAll("/", "\\")}`;
    for (const spec of suite.specs) spec.file = suite.file;
  }
  const summary = summarizeCriticalPlaywrightCoverage(report, {
    criticalFiles: NORMAL_SESSION_CRITICAL_FILES,
  });
  const verdict = evaluateCriticalPlaywrightCoverage(summary);

  assert.equal(verdict.passed, true);
  assert.equal(verdict.productionValidated, true);
});

test("missing critical test file fails even with local opt-out", () => {
  const report = playwrightReport();
  report.suites.pop();
  const summary = summarizeCriticalPlaywrightCoverage(report, {
    criticalFiles: NORMAL_SESSION_CRITICAL_FILES,
  });
  const verdict = evaluateCriticalPlaywrightCoverage(summary, {
    allowSkip: true,
  });

  assert.equal(verdict.passed, false);
  assert.match(verdict.blockers.join("\n"), /expected at least 1/u);
});

test("local opt-out never masks flaky or failed critical tests", () => {
  const report = playwrightReport({
    [NORMAL_SESSION_CRITICAL_FILES[0]]: "flaky",
    [NORMAL_SESSION_CRITICAL_FILES[1]]: "unexpected",
  });
  const summary = summarizeCriticalPlaywrightCoverage(report, {
    criticalFiles: NORMAL_SESSION_CRITICAL_FILES,
  });
  const verdict = evaluateCriticalPlaywrightCoverage(summary, {
    allowSkip: true,
  });

  assert.equal(verdict.passed, false);
  assert.equal(verdict.productionValidated, false);
  assert.match(verdict.blockers.join("\n"), /flaky/u);
  assert.match(verdict.blockers.join("\n"), /failed/u);
});

test("formal production smoke rejects one skipped three-role journey", () => {
  const file = PRODUCTION_REAL_CRITICAL_FILES[0];
  const report = {
    suites: [
      {
        file,
        specs: [
          {
            file,
            title: "existing accounts",
            tests: [{ projectName: "chromium", status: "expected" }],
          },
          {
            file,
            title: "fresh accounts",
            tests: [{ projectName: "chromium", status: "skipped" }],
          },
        ],
      },
    ],
  };
  const summary = summarizeCriticalPlaywrightCoverage(report, {
    criticalFiles: PRODUCTION_REAL_CRITICAL_FILES,
    minimumTestsByFile: { [file]: 2 },
  });
  const verdict = evaluateCriticalPlaywrightCoverage(summary);

  assert.equal(summary.totals.total, 2);
  assert.equal(verdict.passed, false);
  assert.equal(verdict.productionValidated, false);
  assert.match(verdict.blockers.join("\n"), /skipped 1 critical tests/u);
});

test("formal real smoke env requires all mode, live AI, writes, and matching target", () => {
  const env = {
    RELEASE_BASE_URL: "https://staging.example.test",
    REAL_SMOKE_BASE_URL: "https://staging.example.test",
    REAL_SMOKE_ALLOW_WRITES: "1",
    REAL_SMOKE_MODE: "all",
    REAL_SMOKE_REQUIRE_LIVE_AI: "true",
    REAL_SMOKE_EXISTING_ADMIN_PHONE: "10000000000",
    REAL_SMOKE_EXISTING_ADMIN_PASSWORD: "secret-admin",
    REAL_SMOKE_EXISTING_TEACHER_PHONE: "10000000001",
    REAL_SMOKE_EXISTING_TEACHER_PASSWORD: "secret-teacher",
    REAL_SMOKE_EXISTING_PARENT_PHONE: "10000000002",
    REAL_SMOKE_EXISTING_PARENT_PASSWORD: "secret-parent",
  };

  assert.equal(validateFormalRealSmokeEnv(env).ok, true);
  assert.equal(
    validateFormalRealSmokeEnv({
      ...env,
      REAL_SMOKE_ALLOW_WRITES: "0",
    }).ok,
    false
  );
  assert.equal(
    validateFormalRealSmokeEnv({
      ...env,
      REAL_SMOKE_MODE: "existing",
    }).ok,
    false
  );
  assert.equal(
    validateFormalRealSmokeEnv({
      ...env,
      REAL_SMOKE_REQUIRE_LIVE_AI: "0",
    }).ok,
    false
  );
  assert.equal(
    validateFormalRealSmokeEnv({
      ...env,
      REAL_SMOKE_BASE_URL: "https://other.example.test",
    }).ok,
    false
  );
});
