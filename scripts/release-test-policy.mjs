import path from "node:path";

export const NORMAL_SESSION_CRITICAL_FILES = [
  "tests/product-completion/ai-routes-normal-session.spec.ts",
  "tests/product-completion/auth-login-normal-session.spec.ts",
];

export const PRODUCTION_REAL_CRITICAL_FILES = [
  "tests/production-real/three-role.spec.ts",
];

export const FORMAL_REAL_SMOKE_ENV_KEYS = [
  "RELEASE_BASE_URL",
  "REAL_SMOKE_BASE_URL",
  "REAL_SMOKE_ALLOW_WRITES",
  "REAL_SMOKE_MODE",
  "REAL_SMOKE_REQUIRE_LIVE_AI",
  "REAL_SMOKE_EXISTING_ADMIN_PHONE",
  "REAL_SMOKE_EXISTING_ADMIN_PASSWORD",
  "REAL_SMOKE_EXISTING_TEACHER_PHONE",
  "REAL_SMOKE_EXISTING_TEACHER_PASSWORD",
  "REAL_SMOKE_EXISTING_PARENT_PHONE",
  "REAL_SMOKE_EXISTING_PARENT_PASSWORD",
];

const TRUTHY = new Set(["1", "true", "yes", "y", "on"]);

export function isTruthy(value) {
  return TRUTHY.has(String(value ?? "").trim().toLowerCase());
}

function normalizeFile(file) {
  return path.posix
    .normalize(String(file ?? "").replaceAll("\\", "/"))
    .replace(/^\.\//u, "")
    .toLowerCase();
}

function classifyOutcome(test) {
  const outcome = String(test?.status ?? "").trim().toLowerCase();
  if (outcome === "expected" || outcome === "passed") return "passed";
  if (outcome === "skipped") return "skipped";
  if (outcome === "flaky") return "flaky";
  if (outcome) return "failed";

  const results = Array.isArray(test?.results) ? test.results : [];
  const lastStatus = String(results.at(-1)?.status ?? "").trim().toLowerCase();
  if (lastStatus === "passed") return "passed";
  if (lastStatus === "skipped") return "skipped";
  return "failed";
}

/**
 * 将 Playwright JSON reporter 的嵌套 suites/specs 展平成可审计测试清单。
 * 这里不依赖 stdout 文本，避免不同终端颜色和语言导致 skip 统计失真。
 */
export function collectPlaywrightTests(report) {
  const collected = [];

  function visitSuite(suite, inheritedFile = "") {
    const suiteFile = suite?.file || inheritedFile;
    for (const spec of Array.isArray(suite?.specs) ? suite.specs : []) {
      const specFile = spec?.file || suiteFile;
      for (const test of Array.isArray(spec?.tests) ? spec.tests : []) {
        collected.push({
          file: normalizeFile(specFile),
          title: String(spec?.title ?? ""),
          projectName: String(test?.projectName ?? ""),
          outcome: classifyOutcome(test),
        });
      }
    }
    for (const child of Array.isArray(suite?.suites) ? suite.suites : []) {
      visitSuite(child, suiteFile);
    }
  }

  for (const suite of Array.isArray(report?.suites) ? report.suites : []) {
    visitSuite(suite);
  }
  return collected;
}

export function summarizeCriticalPlaywrightCoverage(
  report,
  {
    criticalFiles,
    minimumTestsByFile = {},
  }
) {
  const tests = collectPlaywrightTests(report);
  const fileSummaries = criticalFiles.map((file) => {
    const normalized = normalizeFile(file);
    const matching = tests.filter(
      (test) =>
        test.file === normalized || test.file.endsWith(`/${normalized}`)
    );
    const minimum = Number(minimumTestsByFile[file] ?? 1);
    return {
      file,
      minimum,
      total: matching.length,
      passed: matching.filter((test) => test.outcome === "passed").length,
      skipped: matching.filter((test) => test.outcome === "skipped").length,
      flaky: matching.filter((test) => test.outcome === "flaky").length,
      failed: matching.filter((test) => test.outcome === "failed").length,
      tests: matching,
    };
  });

  return {
    fileSummaries,
    totals: fileSummaries.reduce(
      (totals, item) => ({
        total: totals.total + item.total,
        passed: totals.passed + item.passed,
        skipped: totals.skipped + item.skipped,
        flaky: totals.flaky + item.flaky,
        failed: totals.failed + item.failed,
      }),
      { total: 0, passed: 0, skipped: 0, flaky: 0, failed: 0 }
    ),
  };
}

/**
 * 正式门禁不接受关键测试静默跳过；本地 opt-out 只改变 skip 的处理，
 * 不会放宽缺失测试、失败或 flaky。
 */
export function evaluateCriticalPlaywrightCoverage(
  summary,
  { allowSkip = false, label = "critical real-account tests" } = {}
) {
  const blockers = [];
  const warnings = [];

  for (const item of summary.fileSummaries) {
    if (item.total < item.minimum) {
      blockers.push(
        `${item.file} discovered ${item.total} tests; expected at least ${item.minimum}.`
      );
    }
    if (item.failed > 0) {
      blockers.push(`${item.file} has ${item.failed} failed critical tests.`);
    }
    if (item.flaky > 0) {
      blockers.push(`${item.file} has ${item.flaky} flaky critical tests.`);
    }
    if (item.skipped > 0) {
      const message = `${item.file} skipped ${item.skipped} critical tests.`;
      if (allowSkip) warnings.push(message);
      else blockers.push(message);
    }
  }

  const passed = blockers.length === 0;
  const productionValidated =
    passed &&
    summary.totals.skipped === 0 &&
    summary.totals.flaky === 0 &&
    summary.totals.failed === 0 &&
    summary.fileSummaries.every((item) => item.total >= item.minimum);

  return {
    label,
    allowSkip,
    passed,
    productionValidated,
    outcome: !passed
      ? "failed"
      : productionValidated
        ? "production-validated"
        : "local-opt-out",
    blockers,
    warnings,
  };
}

function normalizeUrl(value) {
  try {
    const url = new URL(String(value ?? "").trim());
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.toString().replace(/\/$/u, "");
  } catch {
    return "";
  }
}

export function validateFormalRealSmokeEnv(env) {
  const missing = FORMAL_REAL_SMOKE_ENV_KEYS.filter(
    (key) => !String(env?.[key] ?? "").trim()
  );
  const invalid = [];

  if (!isTruthy(env?.REAL_SMOKE_ALLOW_WRITES)) {
    invalid.push("REAL_SMOKE_ALLOW_WRITES must be true for the formal gate.");
  }
  if (String(env?.REAL_SMOKE_MODE ?? "").trim().toLowerCase() !== "all") {
    invalid.push("REAL_SMOKE_MODE must be all for the formal gate.");
  }
  if (!isTruthy(env?.REAL_SMOKE_REQUIRE_LIVE_AI)) {
    invalid.push("REAL_SMOKE_REQUIRE_LIVE_AI must be true for the formal gate.");
  }

  const releaseUrl = normalizeUrl(env?.RELEASE_BASE_URL);
  const smokeUrl = normalizeUrl(env?.REAL_SMOKE_BASE_URL);
  if (!releaseUrl) invalid.push("RELEASE_BASE_URL must be a valid HTTP(S) URL.");
  if (!smokeUrl) invalid.push("REAL_SMOKE_BASE_URL must be a valid HTTP(S) URL.");
  if (releaseUrl && smokeUrl && releaseUrl !== smokeUrl) {
    invalid.push(
      "REAL_SMOKE_BASE_URL must match RELEASE_BASE_URL for the formal gate."
    );
  }

  return {
    ok: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
  };
}
