#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const nowIso = new Date().toISOString();
const requireRemote = process.argv.includes("--require-remote");
const reportPathArg = process.argv.find((arg) => arg.startsWith("--report-path="));
const reportPathFromArg = reportPathArg ? reportPathArg.slice("--report-path=".length).trim() : "";
const envFileArg = process.argv.find((arg) => arg.startsWith("--release-env-file="));
const envFilePathFromArg = envFileArg
  ? envFileArg.slice("--release-env-file=".length).trim()
  : "";

/** @type {{
 * generatedAt: string,
 * runtime: { node: string, cwd: string },
 * local: { passed: boolean, checks: Array<{name:string, ok:boolean, details?:unknown}> },
 * remote: { enabled: boolean, passed: boolean, baseUrl?: string, checks: Array<{name:string, ok:boolean, details?:unknown}> },
 * summary: { passed: boolean, blockers: string[], warnings: string[] }
 * }} */
const report = {
  generatedAt: nowIso,
  runtime: {
    node: process.version,
    cwd,
  },
  local: {
    passed: true,
    checks: [],
  },
  remote: {
    enabled: false,
    passed: true,
    baseUrl: "",
    checks: [],
  },
  summary: {
    passed: false,
    blockers: [],
    warnings: [],
  },
};

function ok(msg) {
  console.log(`[OK] ${msg}`);
}

function warn(msg) {
  console.warn(`[WARN] ${msg}`);
}

function fail(msg) {
  console.error(`[FAIL] ${msg}`);
}

function exists(relPath) {
  return fs.existsSync(path.join(cwd, relPath));
}

function readJson(relPath) {
  const fullPath = path.join(cwd, relPath);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function loadEnvFile(envFilePath) {
  const normalizedPath = String(envFilePath ?? "").trim();
  if (!normalizedPath) {
    return { loaded: false };
  }

  const absPath = path.isAbsolute(normalizedPath)
    ? normalizedPath
    : path.join(cwd, normalizedPath);

  if (!fs.existsSync(absPath)) {
    fail(`Env file not found: ${absPath}`);
    return { loaded: false, error: "missing" };
  }

  const text = fs.readFileSync(absPath, "utf8");
  const lines = text.split(/\r?\n/);
  let loadedCount = 0;

  for (const lineRaw of lines) {
    const line = lineRaw.trim();
    if (!line || line.startsWith("#")) continue;

    const idx = line.indexOf("=");
    if (idx <= 0) continue;

    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (!key) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
      loadedCount += 1;
    }
  }

  ok(`Loaded env vars from file: ${absPath} (${loadedCount} injected)`);
  return { loaded: true, count: loadedCount, path: absPath };
}

function readText(relPath) {
  const fullPath = path.join(cwd, relPath);
  return fs.readFileSync(fullPath, "utf8");
}

function pushLocalCheck(name, okStatus, details) {
  report.local.checks.push({ name, ok: okStatus, details });
  if (!okStatus) {
    report.local.passed = false;
  }
}

function pushRemoteCheck(name, okStatus, details) {
  report.remote.checks.push({ name, ok: okStatus, details });
  if (!okStatus) {
    report.remote.passed = false;
  }
}

function checkLocalFiles() {
  const required = [
    "supabase/schema.sql",
    "supabase/post-migration-check.sql",
    "docs/release-checklist.md",
    ".env.release.example",
    "scripts/release-env-check.mjs",
    "vercel.json",
    "app/api/public/health/route.ts",
    "app/api/admin/system-check/route.ts",
    "app/api/cron/dispatch-notifications/route.ts",
  ];

  let passed = true;
  for (const rel of required) {
    if (exists(rel)) {
      ok(`File exists: ${rel}`);
      pushLocalCheck(`file:${rel}`, true);
    } else {
      fail(`Missing file: ${rel}`);
      passed = false;
      pushLocalCheck(`file:${rel}`, false, { reason: "missing" });
    }
  }

  return passed;
}

function checkPackageScripts() {
  const pkg = readJson("package.json");
  const hasBuild = Boolean(pkg.scripts?.build);
  const hasReleaseCheck = Boolean(pkg.scripts?.["release:check"]);
  const hasReleaseEnvCheck = Boolean(pkg.scripts?.["release:env:check"]);
  const hasReleaseGoRemote = Boolean(pkg.scripts?.["release:go:remote"]);

  if (hasBuild) {
    ok("package.json includes build script");
    pushLocalCheck("package-script:build", true);
  } else {
    fail("package.json missing build script");
    pushLocalCheck("package-script:build", false, { reason: "missing" });
  }

  if (hasReleaseCheck) {
    ok("package.json includes release:check script");
    pushLocalCheck("package-script:release:check", true);
  } else {
    warn("package.json missing release:check script");
    pushLocalCheck("package-script:release:check", false, { reason: "missing" });
  }

  if (hasReleaseEnvCheck) {
    ok("package.json includes release:env:check script");
    pushLocalCheck("package-script:release:env:check", true);
  } else {
    fail("package.json missing release:env:check script");
    pushLocalCheck("package-script:release:env:check", false, { reason: "missing" });
  }

  if (hasReleaseGoRemote) {
    ok("package.json includes release:go:remote script");
    pushLocalCheck("package-script:release:go:remote", true);
  } else {
    fail("package.json missing release:go:remote script");
    pushLocalCheck("package-script:release:go:remote", false, { reason: "missing" });
  }

  return hasBuild && hasReleaseCheck && hasReleaseEnvCheck && hasReleaseGoRemote;
}

function checkVercelCron() {
  try {
    const cfg = readJson("vercel.json");
    const crons = Array.isArray(cfg.crons) ? cfg.crons : [];
    const found = crons.some((item) => item?.path === "/api/cron/dispatch-notifications");
    if (found) {
      ok("vercel.json cron path configured: /api/cron/dispatch-notifications");
      pushLocalCheck("vercel-cron:dispatch-notifications", true);
      return true;
    }
    fail("vercel.json missing cron for /api/cron/dispatch-notifications");
    pushLocalCheck("vercel-cron:dispatch-notifications", false, { reason: "path missing" });
    return false;
  } catch (e) {
    fail(`Failed to parse vercel.json: ${e instanceof Error ? e.message : "unknown error"}`);
    pushLocalCheck("vercel-cron:dispatch-notifications", false, {
      reason: e instanceof Error ? e.message : "parse error",
    });
    return false;
  }
}

function checkSqlGuardrails() {
  const schemaSql = readText("supabase/schema.sql");
  const postMigrationSql = readText("supabase/post-migration-check.sql");

  const schemaMarkers = [
    "create or replace function public.sync_parent_children_from_children()",
    "create trigger on_children_parent_user_sync",
    "idx_parent_children_one_primary_per_child",
    "insert into storage.buckets (id, name, public)",
    "create policy if not exists \"notification_events_select_by_role\"",
    "create policy if not exists \"parent_media_select_authorized\"",
  ];

  const checkMarkers = [
    "has_parent_media_private_bucket",
    "has_institution_reports_private_bucket",
    "has_notification_events_select_policy",
    "key_rls_all_enabled",
    "overall_passed",
  ];

  let passed = true;

  for (const marker of schemaMarkers) {
    const hasMarker = schemaSql.includes(marker);
    if (hasMarker) {
      ok(`schema.sql marker present: ${marker}`);
      pushLocalCheck(`sql-guardrail:schema:${marker}`, true);
    } else {
      fail(`schema.sql marker missing: ${marker}`);
      pushLocalCheck(`sql-guardrail:schema:${marker}`, false, { reason: "missing marker" });
      passed = false;
    }
  }

  for (const marker of checkMarkers) {
    const hasMarker = postMigrationSql.includes(marker);
    if (hasMarker) {
      ok(`post-migration-check.sql marker present: ${marker}`);
      pushLocalCheck(`sql-guardrail:post-check:${marker}`, true);
    } else {
      fail(`post-migration-check.sql marker missing: ${marker}`);
      pushLocalCheck(`sql-guardrail:post-check:${marker}`, false, { reason: "missing marker" });
      passed = false;
    }
  }

  return passed;
}

function diagnoseHttpStatus(status, endpoint) {
  const tips = {
    401: `Authentication failed for ${endpoint}. Check RELEASE_ADMIN_COOKIE is a fresh, valid session cookie.`,
    403: `Forbidden for ${endpoint}. Ensure the cookie belongs to an admin user with sufficient permissions.`,
    404: `Not found: ${endpoint}. Verify the deployment includes this route and RELEASE_BASE_URL is correct.`,
    500: `Server error at ${endpoint}. Check Vercel function logs for stack traces.`,
    502: `Bad gateway at ${endpoint}. The serverless function may have crashed or timed out.`,
    503: `Service unavailable at ${endpoint}. The deployment may still be building or the region is down.`,
    504: `Gateway timeout at ${endpoint}. The function exceeded its execution time limit.`,
  };
  return tips[status] || `Unexpected HTTP ${status} at ${endpoint}. Check Vercel deployment logs.`;
}

function diagnoseNetworkError(error, endpoint) {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) {
    return `DNS resolution failed for ${endpoint}. Check RELEASE_BASE_URL domain spelling.`;
  }
  if (msg.includes("ECONNREFUSED")) {
    return `Connection refused for ${endpoint}. Is the server running?`;
  }
  if (msg.includes("ETIMEDOUT") || msg.includes("timeout")) {
    return `Connection timed out for ${endpoint}. Check network and firewall.`;
  }
  if (msg.includes("CERT") || msg.includes("certificate") || msg.includes("SSL")) {
    return `TLS/certificate error for ${endpoint}. Check HTTPS configuration.`;
  }
  return `Network error for ${endpoint}: ${msg}`;
}

async function fetchJson(url, init) {
  const start = Date.now();
  const res = await fetch(url, init);
  const elapsed = Date.now() - start;
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return { res, body, elapsedMs: elapsed };
}

async function checkRemoteEndpoints() {
  const baseUrl = String(process.env.RELEASE_BASE_URL ?? "").trim().replace(/\/$/, "");
  const cookie = String(process.env.RELEASE_ADMIN_COOKIE ?? "").trim();
  const cronSecret = String(process.env.CRON_SECRET ?? "").trim();
  report.remote.baseUrl = baseUrl;

  if (requireRemote) {
    report.remote.enabled = true;
    let missingRequired = false;

    if (!baseUrl) {
      fail("RELEASE_BASE_URL not set but --require-remote is enabled.");
      pushRemoteCheck("remote-required-base-url", false, {
        reason: "RELEASE_BASE_URL missing",
      });
      missingRequired = true;
    }

    if (!cookie) {
      fail("RELEASE_ADMIN_COOKIE not set but --require-remote is enabled.");
      pushRemoteCheck("remote-required-admin-cookie", false, {
        reason: "RELEASE_ADMIN_COOKIE missing",
      });
      missingRequired = true;
    }

    if (!cronSecret) {
      fail("CRON_SECRET not set but --require-remote is enabled.");
      pushRemoteCheck("remote-required-cron-secret", false, {
        reason: "CRON_SECRET missing",
      });
      missingRequired = true;
    }

    if (missingRequired) {
      report.remote.passed = false;
      return false;
    }
  }

  if (!baseUrl) {
    warn("RELEASE_BASE_URL not set. Skipping remote endpoint checks.");
    report.remote.enabled = false;
    return true;
  }

  report.remote.enabled = true;

  let passed = true;

  const healthUrl = `${baseUrl}/api/public/health`;
  try {
    const health = await fetchJson(healthUrl, { method: "GET" });
    if (health.res.ok && health.body?.ok) {
      ok(`Remote health endpoint is healthy (${health.elapsedMs}ms)`);
      pushRemoteCheck("remote-health", true, { status: health.res.status, body: health.body, elapsedMs: health.elapsedMs });
    } else {
      const diag = diagnoseHttpStatus(health.res.status, healthUrl);
      fail(`Remote health endpoint failed: HTTP ${health.res.status}`);
      fail(`  Diagnosis: ${diag}`);
      passed = false;
      pushRemoteCheck("remote-health", false, { status: health.res.status, body: health.body, elapsedMs: health.elapsedMs, diagnosis: diag });
    }
  } catch (e) {
    const diag = diagnoseNetworkError(e, healthUrl);
    fail(`Remote health request failed: ${e instanceof Error ? e.message : "unknown error"}`);
    fail(`  Diagnosis: ${diag}`);
    passed = false;
    pushRemoteCheck("remote-health", false, { reason: e instanceof Error ? e.message : "request error", diagnosis: diag });
  }

  const sysCheckUrl = `${baseUrl}/api/admin/system-check`;
  if (cookie) {
    try {
      const check = await fetchJson(sysCheckUrl, {
        method: "GET",
        headers: { Cookie: cookie },
      });
      if (check.res.ok) {
        if (check.body?.releaseReady === true) {
          ok(`system-check reports releaseReady=true (${check.elapsedMs}ms)`);
          pushRemoteCheck("remote-system-check", true, { status: check.res.status, body: check.body, elapsedMs: check.elapsedMs });
        } else {
          const serverBlockers = JSON.stringify(check.body?.blockers ?? []);
          warn(`system-check releaseReady is not true: ${serverBlockers}`);
          fail(`  Diagnosis: The server reports blockers: ${serverBlockers}. Fix these in the Supabase/Vercel config before retrying.`);
          passed = false;
          pushRemoteCheck("remote-system-check", false, { status: check.res.status, body: check.body, elapsedMs: check.elapsedMs, diagnosis: `Server blockers: ${serverBlockers}` });
        }
      } else {
        const diag = diagnoseHttpStatus(check.res.status, sysCheckUrl);
        fail(`system-check failed: HTTP ${check.res.status}`);
        fail(`  Diagnosis: ${diag}`);
        passed = false;
        pushRemoteCheck("remote-system-check", false, { status: check.res.status, body: check.body, elapsedMs: check.elapsedMs, diagnosis: diag });
      }
    } catch (e) {
      const diag = diagnoseNetworkError(e, sysCheckUrl);
      fail(`system-check request failed: ${e instanceof Error ? e.message : "unknown error"}`);
      fail(`  Diagnosis: ${diag}`);
      passed = false;
      pushRemoteCheck("remote-system-check", false, { reason: e instanceof Error ? e.message : "request error", diagnosis: diag });
    }
  } else {
    warn("RELEASE_ADMIN_COOKIE not set. Skipping /api/admin/system-check check.");
    pushRemoteCheck("remote-system-check", true, { skipped: true, reason: "RELEASE_ADMIN_COOKIE not set" });
  }

  const cronUrl = `${baseUrl}/api/cron/dispatch-notifications?secret=${encodeURIComponent(cronSecret)}`;
  if (cronSecret) {
    try {
      const cron = await fetchJson(cronUrl, { method: "GET" });
      if (cron.res.ok && cron.body?.ok) {
        ok(`Cron dispatch endpoint is reachable and authorized (${cron.elapsedMs}ms)`);
        pushRemoteCheck("remote-cron-dispatch", true, { status: cron.res.status, body: cron.body, elapsedMs: cron.elapsedMs });
      } else {
        const diag = diagnoseHttpStatus(cron.res.status, `${baseUrl}/api/cron/dispatch-notifications`);
        fail(`Cron dispatch endpoint failed: HTTP ${cron.res.status}`);
        fail(`  Diagnosis: ${diag}`);
        passed = false;
        pushRemoteCheck("remote-cron-dispatch", false, { status: cron.res.status, body: cron.body, elapsedMs: cron.elapsedMs, diagnosis: diag });
      }
    } catch (e) {
      const diag = diagnoseNetworkError(e, `${baseUrl}/api/cron/dispatch-notifications`);
      fail(`Cron dispatch request failed: ${e instanceof Error ? e.message : "unknown error"}`);
      fail(`  Diagnosis: ${diag}`);
      passed = false;
      pushRemoteCheck("remote-cron-dispatch", false, { reason: e instanceof Error ? e.message : "request error", diagnosis: diag });
    }
  } else {
    warn("CRON_SECRET not set. Skipping /api/cron/dispatch-notifications check.");
    pushRemoteCheck("remote-cron-dispatch", true, { skipped: true, reason: "CRON_SECRET not set" });
  }

  return passed;
}

function writeReport() {
  const defaultReportPath = requireRemote
    ? "./artifacts/release-report.remote.json"
    : "./release-report.json";
  const reportPath = String(reportPathFromArg || process.env.RELEASE_REPORT_PATH || defaultReportPath).trim();
  const absPath = path.isAbsolute(reportPath) ? reportPath : path.join(cwd, reportPath);
  const dir = path.dirname(absPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(absPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  ok(`Release report written: ${absPath}`);
}

async function main() {
  console.log("=== Release Check ===");

  const envFileResult = loadEnvFile(envFilePathFromArg);
  if (envFilePathFromArg && !envFileResult.loaded) {
    pushLocalCheck("release-env-file", false, {
      path: envFilePathFromArg,
      reason: envFileResult.error ?? "invalid",
    });
    report.summary.passed = false;
    report.summary.blockers.push("Provided --release-env-file is missing or invalid.");
    writeReport();
    fail("Release checks failed.");
    process.exit(1);
  }
  if (envFileResult.loaded) {
    pushLocalCheck("release-env-file", true, {
      path: envFileResult.path,
      injected: envFileResult.count,
    });
  }

  const localPass = [checkLocalFiles(), checkPackageScripts(), checkVercelCron(), checkSqlGuardrails()].every(Boolean);
  const remotePass = await checkRemoteEndpoints();

  report.summary.passed = localPass && remotePass;

  if (!report.local.passed) {
    report.summary.blockers.push("One or more local file/script checks failed.");
  }

  if (report.remote.enabled && !report.remote.passed) {
    const failedRemote = report.remote.checks.filter((c) => !c.ok);
    const diagLines = failedRemote
      .map((c) => `  - ${c.name}: ${c.details?.diagnosis || c.details?.reason || "unknown"}`)
      .join("\n");
    report.summary.blockers.push(
      `Remote endpoint checks failed (${failedRemote.length} issue${failedRemote.length > 1 ? "s" : ""}):\n${diagLines}`
    );
  }

  if (!report.remote.enabled) {
    report.summary.warnings.push("Remote checks were skipped because RELEASE_BASE_URL is not set.");
  } else if (requireRemote) {
    report.summary.warnings.push("Remote checks were enforced with --require-remote.");
  }

  writeReport();

  if (localPass && remotePass) {
    ok("Release checks passed.");
    process.exit(0);
  }

  fail("Release checks failed.");
  process.exit(1);
}

main();
