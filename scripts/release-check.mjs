#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const args = process.argv.slice(2);
const requireRemote = args.includes("--require-remote");
const reportArg = args.find((a) => a.startsWith("--report-path="));
const envFileArg = args.find((a) => a.startsWith("--release-env-file="));

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(cwd, relPath), "utf8"));
}

function exists(relPath) {
  return fs.existsSync(path.join(cwd, relPath));
}

function parseEnvText(text) {
  const map = {};
  for (const raw of text.split(/\r?\n/)) {
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
  return map;
}

function loadEnvFile(filePath) {
  const rel = String(filePath ?? "").trim();
  if (!rel) return;
  const abs = path.isAbsolute(rel) ? rel : path.join(cwd, rel);
  if (!fs.existsSync(abs)) throw new Error(`Missing env file: ${abs}`);
  const text = fs.readFileSync(abs, "utf8");
  for (const raw of text.split(/\r?\n/)) {
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
    if (!(key in process.env)) process.env[key] = value;
  }
}

function diagnoseHttp(status, endpoint) {
  if (status === 401) return `Unauthorized at ${endpoint}. Check credentials.`;
  if (status === 403) return `Forbidden at ${endpoint}. Check permissions.`;
  if (status === 404) return `Not found at ${endpoint}. Check deployment routes.`;
  if (status >= 500) return `Server error at ${endpoint}. Check deployment logs.`;
  return `Unexpected HTTP ${status} at ${endpoint}.`;
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function validateBrainHealthPayload(payload) {
  const issues = [];
  const providers = payload?.providers;
  if (payload?.status !== "ok") issues.push("status != ok");
  if (payload?.provider_assertion_scope !== "configuration_only") {
    issues.push("provider_assertion_scope != configuration_only");
  }
  if (!payload?.brain_provider) issues.push("brain_provider missing");
  if (!payload?.llm_provider_selected) issues.push("llm_provider_selected missing");
  if (payload?.environment === "development") issues.push("environment == development");
  if (!providers || typeof providers !== "object" || !("llm" in providers)) {
    issues.push("providers.llm missing");
  } else if (providers.llm === "mock") {
    issues.push("providers.llm == mock");
  }
  return issues;
}

async function fetchCheck(url) {
  const start = Date.now();
  const res = await fetch(url, { method: "GET" });
  const elapsedMs = Date.now() - start;
  const text = await res.text();
  return { res, elapsedMs, text, preview: text.slice(0, 200) };
}

const report = {
  generatedAt: new Date().toISOString(),
  runtime: { node: process.version, cwd },
  local: { passed: true, checks: [] },
  remote: { enabled: false, passed: true, baseUrl: "", brainBaseUrl: "", checks: [] },
  summary: { passed: false, blockers: [], warnings: [] },
};

function pushLocal(name, ok, details) {
  report.local.checks.push({ name, ok, details });
  if (!ok) report.local.passed = false;
}

function pushRemote(name, ok, details) {
  report.remote.checks.push({ name, ok, details });
  if (!ok) report.remote.passed = false;
}

async function main() {
  console.log("=== Release Check ===");

  try {
    loadEnvFile(envFileArg ? envFileArg.slice("--release-env-file=".length) : "");
  } catch (e) {
    console.error(`[FAIL] ${e instanceof Error ? e.message : "env load failed"}`);
    process.exit(1);
  }

  const localRequired = [
    "package.json",
    "app/layout.tsx",
    "app/page.tsx",
    ".env.release.example",
    "scripts/release-check.mjs",
    "scripts/release-status.mjs",
    "scripts/release-ready.mjs",
    "scripts/release-env-init.mjs",
    "scripts/release-env-check.mjs",
    "scripts/release-remote-reset.mjs",
    "scripts/release-sql-check-set.mjs",
  ];

  for (const rel of localRequired) {
    const ok = exists(rel);
    pushLocal(`file:${rel}`, ok, ok ? undefined : { reason: "missing" });
    console.log(ok ? `[OK] File exists: ${rel}` : `[FAIL] Missing file: ${rel}`);
  }

  const pkg = readJson("package.json");
  const requiredScripts = [
    "lint",
    "build",
    "release:check",
    "release:report",
    "release:report:local",
    "release:check:remote",
    "release:report:remote",
    "release:gate:local",
    "release:gate:remote",
    "release:gate:remote:env",
    "release:env:init",
    "release:env:check",
    "release:remote:reset",
    "release:go:remote",
    "release:go:all",
    "release:sql:pass",
    "release:sql:fail",
    "release:status",
    "release:ready",
  ];
  for (const s of requiredScripts) {
    const ok = Boolean(pkg.scripts?.[s]);
    pushLocal(`script:${s}`, ok, ok ? undefined : { reason: "missing" });
    console.log(ok ? `[OK] package.json includes ${s}` : `[FAIL] package.json missing ${s}`);
  }

  try {
    const envExampleText = fs.readFileSync(path.join(cwd, ".env.release.example"), "utf8");
    const envMap = parseEnvText(envExampleText);
    const requiredEnvKeys = [
      "RELEASE_BASE_URL",
      "RELEASE_ADMIN_COOKIE",
      "CRON_SECRET",
      "BRAIN_API_BASE_URL",
      "DATABASE_URL",
      "DATABASE_SSL",
      "AUTH_SESSION_SECRET",
      "DASHSCOPE_API_KEY",
    ];
    for (const key of requiredEnvKeys) {
      const ok = Object.prototype.hasOwnProperty.call(envMap, key);
      pushLocal(`env-example:${key}`, ok, ok ? undefined : { reason: "missing key" });
      console.log(ok ? `[OK] .env.release.example includes ${key}` : `[FAIL] .env.release.example missing ${key}`);
    }
  } catch (e) {
    pushLocal("env-example:read", false, { reason: e instanceof Error ? e.message : "read failed" });
    console.error(`[FAIL] Unable to read .env.release.example: ${e instanceof Error ? e.message : "read failed"}`);
  }

  const baseUrl = String(process.env.RELEASE_BASE_URL ?? "").trim().replace(/\/$/, "");
  const brainBaseUrl = String(process.env.BRAIN_API_BASE_URL ?? "").trim().replace(/\/$/, "");
  const cookie = String(process.env.RELEASE_ADMIN_COOKIE ?? "").trim();
  const cronSecret = String(process.env.CRON_SECRET ?? "").trim();
  report.remote.baseUrl = baseUrl;
  report.remote.brainBaseUrl = brainBaseUrl;

  if (!baseUrl) {
    if (requireRemote) {
      pushRemote("remote-required-base-url", false, { reason: "RELEASE_BASE_URL missing" });
      pushRemote("remote-required-brain-base-url", Boolean(brainBaseUrl), {
        reason: brainBaseUrl ? undefined : "BRAIN_API_BASE_URL missing",
      });
      pushRemote("remote-required-admin-cookie", Boolean(cookie), { reason: cookie ? undefined : "RELEASE_ADMIN_COOKIE missing" });
      pushRemote("remote-required-cron-secret", Boolean(cronSecret), { reason: cronSecret ? undefined : "CRON_SECRET missing" });
      console.error("[FAIL] Remote mode requires RELEASE_BASE_URL / BRAIN_API_BASE_URL / RELEASE_ADMIN_COOKIE / CRON_SECRET");
    } else {
      report.remote.enabled = false;
      report.summary.warnings.push("Remote checks skipped because RELEASE_BASE_URL is not set.");
      console.warn("[WARN] RELEASE_BASE_URL not set. Skipping remote checks.");
    }
  } else {
    report.remote.enabled = true;
    const endpoints = [`${baseUrl}/`, `${baseUrl}/health`];
    for (const endpoint of endpoints) {
      try {
        const r = await fetchCheck(endpoint);
        if (r.res.ok) {
          pushRemote(`remote:${endpoint}`, true, { status: r.res.status, elapsedMs: r.elapsedMs });
          console.log(`[OK] ${endpoint} reachable (${r.elapsedMs}ms)`);
        } else {
          const diagnosis = diagnoseHttp(r.res.status, endpoint);
          pushRemote(`remote:${endpoint}`, false, { status: r.res.status, diagnosis, preview: r.preview });
          console.error(`[FAIL] ${endpoint} HTTP ${r.res.status}`);
        }
      } catch (e) {
        pushRemote(`remote:${endpoint}`, false, { reason: e instanceof Error ? e.message : "request failed" });
        console.error(`[FAIL] ${endpoint} request failed`);
      }
    }

    if (!brainBaseUrl) {
      pushRemote("remote:brain-health", false, { reason: "BRAIN_API_BASE_URL missing" });
      console.error("[FAIL] BRAIN_API_BASE_URL missing. Cannot verify remote brain health.");
    } else {
      const brainHealthEndpoint = `${brainBaseUrl}/api/v1/health`;
      try {
        const r = await fetchCheck(brainHealthEndpoint);
        if (!r.res.ok) {
          const diagnosis = diagnoseHttp(r.res.status, brainHealthEndpoint);
          pushRemote(`remote:${brainHealthEndpoint}`, false, {
            status: r.res.status,
            diagnosis,
            preview: r.preview,
          });
          console.error(`[FAIL] ${brainHealthEndpoint} HTTP ${r.res.status}`);
        } else {
          const payload = parseJsonSafe(r.text);
          const issues = validateBrainHealthPayload(payload);
          if (issues.length > 0) {
            pushRemote(`remote:${brainHealthEndpoint}`, false, {
              status: r.res.status,
              elapsedMs: r.elapsedMs,
              issues,
              preview: r.preview,
            });
            console.error(`[FAIL] ${brainHealthEndpoint} returned stale or incomplete health schema`);
          } else {
            pushRemote(`remote:${brainHealthEndpoint}`, true, {
              status: r.res.status,
              elapsedMs: r.elapsedMs,
              environment: payload.environment,
              brainProvider: payload.brain_provider,
              llmMode: payload.providers?.llm,
            });
            console.log(`[OK] ${brainHealthEndpoint} reachable with current health schema (${r.elapsedMs}ms)`);
          }
        }
      } catch (e) {
        pushRemote(`remote:${brainHealthEndpoint}`, false, {
          reason: e instanceof Error ? e.message : "request failed",
        });
        console.error(`[FAIL] ${brainHealthEndpoint} request failed`);
      }
    }
  }

  report.summary.passed = report.local.passed && report.remote.passed;
  if (!report.local.passed) report.summary.blockers.push("One or more local checks failed.");
  if (report.remote.enabled && !report.remote.passed) {
    report.summary.blockers.push("One or more remote checks failed.");
  }

  const defaultReportPath = requireRemote ? "artifacts/release-report.remote.json" : "release-report.json";
  const reportPath = reportArg ? reportArg.slice("--report-path=".length) : defaultReportPath;
  const absReport = path.isAbsolute(reportPath) ? reportPath : path.join(cwd, reportPath);
  fs.mkdirSync(path.dirname(absReport), { recursive: true });
  fs.writeFileSync(absReport, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`[OK] Release report written: ${absReport}`);

  if (report.summary.passed) {
    console.log("[OK] Release checks passed.");
    process.exit(0);
  }

  console.error("[FAIL] Release checks failed.");
  process.exit(1);
}

main();
