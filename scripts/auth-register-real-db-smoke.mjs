#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { createPool } from "mysql2/promise";

const REQUIRED_ENV = ["DATABASE_URL", "AUTH_SESSION_SECRET"];
const COOKIE_NAME = "ccs_session";
const KEEP_DATA = truthy(process.env.AUTH_SMOKE_KEEP_DATA);
const EXPLICIT_BASE_URL = process.env.AUTH_SMOKE_BASE_URL?.trim().replace(/\/$/, "");
const ROLE_CASES = [
  { inputRole: "admin", expectedRole: "机构管理员", path: "/admin", label: "admin" },
  { inputRole: "teacher", expectedRole: "教师", path: "/teacher", label: "teacher" },
  { inputRole: "parent", expectedRole: "家长", path: "/parent", label: "parent" },
];

let pool;
let serverProcess;
let serverLogs = "";
const createdUsers = [];
const createdInstitutions = [];

function truthy(value) {
  return ["1", "true", "yes", "y", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function fail(message) {
  throw new Error(message);
}

function log(message) {
  console.log(`[auth:smoke] ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function normalizePhone(input) {
  const compact = input.trim().replace(/[\s-]+/g, "");
  const nationalNumber =
    compact.startsWith("+86")
      ? compact.slice(3)
      : compact.startsWith("86") && compact.length === 13
        ? compact.slice(2)
        : compact;

  if (!/^1\d{10}$/.test(nationalNumber)) {
    throw new Error("invalid mainland phone");
  }

  return `+86${nationalNumber}`;
}

function uniquePhone(seed) {
  const digits = `${Date.now()}${process.pid}${seed}${Math.random().toString().slice(2)}`.replace(/\D/g, "");
  return `199${digits.slice(-8).padStart(8, "0")}`;
}

function parseDatabaseUrl() {
  const url = new URL(process.env.DATABASE_URL);
  const useSsl =
    url.protocol === "mysqls:" ||
    ["1", "true", "yes", "y", "on"].includes(String(process.env.DATABASE_SSL ?? "").trim().toLowerCase());

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username || ""),
    password: decodeURIComponent(url.password || ""),
    database: url.pathname.replace(/^\/+/, ""),
    waitForConnections: true,
    connectionLimit: 2,
    maxIdle: 2,
    idleTimeout: 10000,
    connectTimeout: 5000,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  };
}

async function db() {
  if (!pool) {
    pool = createPool(parseDatabaseUrl());
  }
  return pool;
}

function decodeJson(value) {
  if (value == null) return null;
  if (Buffer.isBuffer(value)) return decodeJson(value.toString("utf8"));
  if (typeof value === "string") return JSON.parse(value);
  if (typeof value === "object") return value;
  return null;
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => (port ? resolve(port) : reject(new Error("No free port found"))));
    });
  });
}

async function isReachable(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/login`, { method: "GET", signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function startServerIfNeeded() {
  if (EXPLICIT_BASE_URL) {
    assert(await isReachable(EXPLICIT_BASE_URL), `AUTH_SMOKE_BASE_URL is set but /login is not reachable: ${EXPLICIT_BASE_URL}`);
    log(`Using existing service at ${EXPLICIT_BASE_URL}`);
    return EXPLICIT_BASE_URL;
  }

  assert(fs.existsSync(".next/BUILD_ID"), "Missing .next/BUILD_ID. Run npm run build before npm run auth:smoke.");
  const port = process.env.AUTH_SMOKE_PORT?.trim() || String(await findFreePort());
  const baseUrl = `http://127.0.0.1:${port}`;
  const nextBin = "./node_modules/next/dist/bin/next";

  serverProcess = spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", port], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AUTH_REGISTER_ENABLED: process.env.AUTH_REGISTER_ENABLED || "true",
      NEXT_TELEMETRY_DISABLED: "1",
      PORT: port,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  serverProcess.stdout.on("data", (chunk) => {
    serverLogs += chunk.toString();
  });
  serverProcess.stderr.on("data", (chunk) => {
    serverLogs += chunk.toString();
  });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await isReachable(baseUrl)) {
      log(`Started local Next service at ${baseUrl}`);
      return baseUrl;
    }
    if (serverProcess.exitCode != null) break;
    await sleep(1000);
  }

  fail(`Failed to start local Next service. Recent output:\n${serverLogs.slice(-4000)}`);
}

async function stopServer() {
  if (!serverProcess || serverProcess.killed) return;
  serverProcess.kill();
  await sleep(500);
}

function setCookieHeader(response) {
  const getSetCookie = response.headers.getSetCookie?.bind(response.headers);
  const values = typeof getSetCookie === "function" ? getSetCookie() : [response.headers.get("set-cookie")].filter(Boolean);
  return values.find((value) => value.includes(`${COOKIE_NAME}=`)) ?? "";
}

function sessionCookie(response) {
  const raw = setCookieHeader(response);
  const match = raw.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  assert(match?.[1], "Expected ccs_session Set-Cookie header");
  return `${COOKIE_NAME}=${match[1]}`;
}

async function requestJson(baseUrl, path, data, cookie) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(data),
    redirect: "manual",
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function expectRegisterFailure(baseUrl, label, data, expectedStatus) {
  const { response, body } = await requestJson(baseUrl, "/api/auth/register", data);
  assert(response.status === expectedStatus, `${label}: expected ${expectedStatus}, got ${response.status}`);
  assert(body?.ok === false, `${label}: expected { ok: false }`);
  log(`Passed negative case: ${label}`);
}

async function verifyDatabaseRecord(user, phoneNormalized, expectedRole) {
  const connection = await db();
  let rows;
  try {
    [rows] = await connection.execute(
      `
        select id, username_normalized, phone_normalized, role, institution_id, child_ids, is_demo
        from app_users
        where id = ?
        limit 1
      `,
      [user.id]
    );
  } catch (error) {
    if (error?.code === "ER_BAD_FIELD_ERROR" || error?.errno === 1054) {
      fail("Database is missing app_users.phone_normalized. Run supabase/sql/20260704_add_phone_normalized_to_app_users.sql before auth smoke.");
    }
    throw error;
  }

  const row = rows[0];
  assert(row, "Registered user was not found in app_users");
  assert(row.username_normalized === phoneNormalized, "username_normalized should match normalized phone");
  assert(row.phone_normalized === phoneNormalized, "phone_normalized should match normalized phone");
  assert(row.role === expectedRole, "role should match registered role");
  assert(row.institution_id, "institution_id should be present");
  assert(row.is_demo === 0 || row.is_demo === false, "registered user must have is_demo=false");

  const childIds = decodeJson(row.child_ids) ?? [];
  assert(Array.isArray(childIds), "child_ids should be a JSON array");

  createdUsers.push(row.id);
  createdInstitutions.push(row.institution_id);

  const [snapshotRows] = await connection.execute(
    `
      select snapshot
      from app_state_snapshots
      where institution_id = ?
      limit 1
    `,
    [row.institution_id]
  );
  const snapshot = decodeJson(snapshotRows[0]?.snapshot);
  assert(snapshot, "app_state_snapshots row should exist for registered institution");
  assert(Array.isArray(snapshot.children), "initial snapshot should contain a children array");
  assert(snapshot.children.length === 0, "initial registration snapshot should not create children");
  assert(snapshot.meta?.workspace?.institutionId === row.institution_id, "snapshot workspace should match institution_id");
  assert(snapshot.meta?.workspace?.ownerUserId === row.id, "snapshot workspace should match owner user");
  assert(snapshot.meta?.workspace?.isDemo === false, "snapshot workspace must not be demo");

  return { row, childIds };
}

async function registerRole(baseUrl, roleCase, index) {
  const phone = uniquePhone(index);
  const phoneNormalized = normalizePhone(phone);
  const password = `AuthSmoke${index}Pass`;
  const { response, body } = await requestJson(baseUrl, "/api/auth/register", {
    phone,
    username: phone,
    password,
    confirmPassword: password,
    role: roleCase.inputRole,
    displayName: `T9 Smoke ${roleCase.label}`,
  });

  assert(response.status === 200, `${roleCase.label}: register expected 200, got ${response.status}`);
  assert(body?.ok === true, `${roleCase.label}: register expected ok=true`);
  assert(body.user?.id, `${roleCase.label}: register response missing user id`);
  assert(body.user?.role === roleCase.expectedRole, `${roleCase.label}: unexpected role`);
  assert(body.redirectPath === roleCase.path, `${roleCase.label}: unexpected redirectPath`);
  assert(!("password_hash" in body.user) && !("passwordHash" in body.user), `${roleCase.label}: password hash leaked`);

  const registrationCookie = sessionCookie(response);
  const { row, childIds } = await verifyDatabaseRecord(body.user, phoneNormalized, roleCase.expectedRole);

  if (roleCase.label === "parent") {
    assert(Array.isArray(body.user.childIds) && body.user.childIds.length === 0, "parent registration should return empty childIds");
    assert(childIds.length === 0, "parent app_users.child_ids should stay empty before onboarding");
  }

  const loginResult = await requestJson(baseUrl, "/api/auth/login", { phone, password });
  assert(loginResult.response.status === 200, `${roleCase.label}: login expected 200, got ${loginResult.response.status}`);
  assert(loginResult.body?.ok === true, `${roleCase.label}: login expected ok=true`);
  assert(loginResult.body.user?.id === body.user.id, `${roleCase.label}: login returned different user`);
  const loginCookie = sessionCookie(loginResult.response);

  await expectProtectedPage(baseUrl, roleCase.path, loginCookie, `${roleCase.label} protected route`);

  if (roleCase.label === "parent") {
    await expectParentOnboarding(baseUrl, loginCookie);
  }

  log(`Registered, logged in, and verified ${roleCase.label} real account (${row.role})`);
  return { phoneNormalized, registrationCookie, loginCookie };
}

async function expectProtectedPage(baseUrl, path, cookie, label) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { cookie },
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  assert(response.status === 200, `${label}: expected 200, got ${response.status}`);
}

async function expectParentOnboarding(baseUrl, cookie) {
  const parentResponse = await fetch(`${baseUrl}/parent`, {
    headers: { cookie },
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  assert(parentResponse.status === 200, `parent page expected 200, got ${parentResponse.status}`);
  const parentHtml = await parentResponse.text();
  if (parentHtml.includes("创建孩子成长档案") || parentHtml.includes("/parent/onboarding/child")) {
    log("Parent empty-child page exposes onboarding entry");
    return;
  }

  const onboardingResponse = await fetch(`${baseUrl}/parent/onboarding/child`, {
    headers: { cookie },
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  assert(onboardingResponse.status === 200, `parent onboarding expected 200, got ${onboardingResponse.status}`);
  log("Parent empty-child account can enter onboarding route");
}

async function cleanup() {
  if (KEEP_DATA || (!createdUsers.length && !createdInstitutions.length)) return;
  const connection = await db();
  const uniqueInstitutions = [...new Set(createdInstitutions)];
  const uniqueUsers = [...new Set(createdUsers)];

  if (uniqueInstitutions.length) {
    await connection.execute(
      `delete from app_state_snapshots where institution_id in (${uniqueInstitutions.map(() => "?").join(", ")})`,
      uniqueInstitutions
    );
  }

  if (uniqueUsers.length) {
    await connection.execute(
      `delete from app_users where id in (${uniqueUsers.map(() => "?").join(", ")})`,
      uniqueUsers
    );
  }

  log(`Cleaned up ${uniqueUsers.length} smoke user(s) and ${uniqueInstitutions.length} snapshot(s)`);
}

async function main() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
  assert(
    missing.length === 0,
    `Missing required environment variable(s): ${missing.join(", ")}. Real DB auth smoke was not run.`
  );

  const baseUrl = await startServerIfNeeded();
  await expectRegisterFailure(baseUrl, "invalid phone", {
    phone: "123",
    password: "secret123",
    confirmPassword: "secret123",
    role: "parent",
  }, 400);
  await expectRegisterFailure(baseUrl, "password confirmation mismatch", {
    phone: uniquePhone("mismatch"),
    password: "secret123",
    confirmPassword: "different123",
    role: "parent",
  }, 400);
  await expectRegisterFailure(baseUrl, "short password", {
    phone: uniquePhone("short"),
    password: "12345",
    confirmPassword: "12345",
    role: "parent",
  }, 400);

  for (let index = 0; index < ROLE_CASES.length; index += 1) {
    await registerRole(baseUrl, ROLE_CASES[index], index + 1);
  }

  log("Real DB registration smoke passed");
}

try {
  await main();
} catch (error) {
  console.error(`[auth:smoke] FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  try {
    await cleanup();
  } catch (error) {
    console.error(`[auth:smoke] cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
  if (pool) {
    await pool.end().catch(() => {});
  }
  await stopServer();
}
