#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { createPool } from "mysql2/promise";

loadLocalEnvFile(".env.local");

const REQUIRED_ENV = [
  "DATABASE_URL",
  "DATABASE_SSL",
  "AUTH_SESSION_SECRET",
  "AUTH_REGISTER_ENABLED",
  "BRAIN_API_BASE_URL",
  "BRAIN_INTERNAL_SHARED_SECRET",
];
const COOKIE_NAME = "ccs_session";
const KEEP_DATA = truthy(process.env.AUTH_SMOKE_KEEP_DATA);
const EXPLICIT_BASE_URL = process.env.AUTH_SMOKE_BASE_URL?.trim().replace(/\/$/, "");
const REQUIRED_DATABASE_OBJECTS = [
  {
    sql: "supabase/sql/app_users.sql",
    table: "app_users",
    columns: [
      "id",
      "username_normalized",
      "display_name",
      "password_hash",
      "role",
      "avatar",
      "institution_id",
      "class_name",
      "child_ids",
      "is_demo",
      "created_at",
      "updated_at",
    ],
  },
  {
    sql: "supabase/sql/app_state_snapshots.sql",
    table: "app_state_snapshots",
    columns: ["institution_id", "snapshot", "updated_by", "updated_at"],
  },
  {
    sql: "supabase/sql/20260704_add_phone_normalized_to_app_users.sql",
    table: "app_users",
    columns: ["phone_normalized", "phone_verified", "created_via"],
    indexes: [{ table: "app_users", column: "phone_normalized", unique: true }],
  },
  {
    sql: "supabase/sql/20260704_create_consent_records.sql",
    table: "consent_records",
    columns: [
      "id",
      "institution_id",
      "user_id",
      "child_id",
      "consent_type",
      "policy_version",
      "agreed_at",
      "ip",
      "user_agent",
    ],
  },
];
const ROLE_CASES = [
  { inputRole: "admin", expectedRole: "机构管理员", path: "/admin", label: "admin" },
  { inputRole: "teacher", expectedRole: "教师", path: "/teacher", label: "teacher" },
  { inputRole: "parent", expectedRole: "家长", path: "/parent", label: "parent" },
];

let pool;
let serverProcess;
let serverLogs = "";
const createdAccounts = [];
const createdUserIds = new Set();
const createdInstitutionIds = new Set();
const createdPhoneNumbers = new Set();

function loadLocalEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const normalizedLine = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const match = normalizedLine.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;

    process.env[key] = parseEnvValue(rawValue);
  }
}

function parseEnvValue(rawValue) {
  let value = rawValue.trim();
  if (!value) return "";

  const quote = value[0];
  if (quote === `"` || quote === "'") {
    const closingQuoteIndex = value.indexOf(quote, 1);
    if (closingQuoteIndex > 0) {
      value = value.slice(1, closingQuoteIndex);
      return quote === `"` ? value.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t") : value;
    }
  }

  const commentIndex = value.search(/\s#/);
  return commentIndex >= 0 ? value.slice(0, commentIndex).trim() : value;
}

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

function validateRequiredEnv() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
  const errors = [];

  if (missing.length > 0) {
    errors.push(`Missing required environment variable(s): ${missing.join(", ")}.`);
  }

  const registerEnabled = process.env.AUTH_REGISTER_ENABLED?.trim().toLowerCase();
  if (!missing.includes("AUTH_REGISTER_ENABLED") && registerEnabled !== "true") {
    errors.push("AUTH_REGISTER_ENABLED must be set to true for real DB auth smoke.");
  }

  const databaseSsl = process.env.DATABASE_SSL?.trim().toLowerCase();
  const allowedSslValues = new Set(["1", "0", "true", "false", "yes", "no", "y", "n", "on", "off"]);
  if (!missing.includes("DATABASE_SSL") && databaseSsl && !allowedSslValues.has(databaseSsl)) {
    errors.push("DATABASE_SSL must be one of true/false, 1/0, yes/no, y/n, or on/off.");
  }

  if (errors.length > 0) {
    fail(`${errors.join("\n")} Real DB auth smoke was not run.`);
  }
}

async function loadTableColumns(connection, databaseName, tableName) {
  const [tableRows] = await connection.execute(
    `
      select table_name as tableName
      from information_schema.tables
      where table_schema = ?
        and table_name = ?
      limit 1
    `,
    [databaseName, tableName]
  );
  if (!Array.isArray(tableRows) || tableRows.length === 0) return null;

  const [columnRows] = await connection.execute(
    `
      select column_name as columnName
      from information_schema.columns
      where table_schema = ?
        and table_name = ?
    `,
    [databaseName, tableName]
  );

  return new Set((Array.isArray(columnRows) ? columnRows : []).map((row) => row.columnName));
}

async function hasUniqueIndexOnColumn(connection, databaseName, tableName, columnName) {
  const [rows] = await connection.execute(
    `
      select index_name as indexName, non_unique as nonUnique
      from information_schema.statistics
      where table_schema = ?
        and table_name = ?
        and column_name = ?
    `,
    [databaseName, tableName, columnName]
  );

  return (Array.isArray(rows) ? rows : []).some((row) => Number(row.nonUnique) === 0);
}

function formatSchemaFailure(issues) {
  const sqlFiles = [...new Set(issues.map((issue) => issue.sql))];
  return [
    "Database schema preflight failed before any smoke writes.",
    "Apply the following SQL manually, then rerun npm run auth:smoke:",
    ...sqlFiles.map((sql) => `- ${sql}`),
    "Missing details:",
    ...issues.map((issue) => `- ${issue.detail}`),
  ].join("\n");
}

async function requireDatabaseSchema() {
  const connection = await db();
  const databaseName = parseDatabaseUrl().database;
  const issues = [];
  const columnCache = new Map();

  for (const object of REQUIRED_DATABASE_OBJECTS) {
    if (!columnCache.has(object.table)) {
      columnCache.set(object.table, await loadTableColumns(connection, databaseName, object.table));
    }

    const columns = columnCache.get(object.table);
    if (!columns) {
      issues.push({ sql: object.sql, detail: `missing table ${object.table}` });
      continue;
    }

    for (const column of object.columns) {
      if (!columns.has(column)) {
        issues.push({ sql: object.sql, detail: `missing column ${object.table}.${column}` });
      }
    }

    for (const index of object.indexes ?? []) {
      const hasIndex = await hasUniqueIndexOnColumn(connection, databaseName, index.table, index.column);
      if (index.unique && !hasIndex) {
        issues.push({ sql: object.sql, detail: `missing unique index on ${index.table}.${index.column}` });
      }
    }
  }

  if (issues.length > 0) {
    fail(formatSchemaFailure(issues));
  }

  log("Database schema preflight passed for app_users, app_state_snapshots, and consent_records");
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

function recordCreatedAccount(label, row, phoneNormalized) {
  createdUserIds.add(row.id);
  createdInstitutionIds.add(row.institution_id);
  createdPhoneNumbers.add(phoneNormalized);

  if (!createdAccounts.some((account) => account.userId === row.id)) {
    createdAccounts.push({
      label,
      userId: row.id,
      phoneNormalized,
      role: row.role,
      institutionId: row.institution_id,
    });
  }
}

async function verifyDatabaseRecord(user, phoneNormalized, expectedRole, label) {
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
  recordCreatedAccount(label, row, phoneNormalized);
  assert(row.username_normalized === phoneNormalized, "username_normalized should match normalized phone");
  assert(row.phone_normalized === phoneNormalized, "phone_normalized should match normalized phone");
  assert(row.role === expectedRole, "role should match registered role");
  assert(row.institution_id, "institution_id should be present");
  assert(row.is_demo === 0 || row.is_demo === false, "registered user must have is_demo=false");

  const childIds = decodeJson(row.child_ids) ?? [];
  assert(Array.isArray(childIds), "child_ids should be a JSON array");

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
  createdUserIds.add(body.user.id);
  createdPhoneNumbers.add(phoneNormalized);
  assert(body.user?.role === roleCase.expectedRole, `${roleCase.label}: unexpected role`);
  assert(body.redirectPath === roleCase.path, `${roleCase.label}: unexpected redirectPath`);
  assert(!("password_hash" in body.user) && !("passwordHash" in body.user), `${roleCase.label}: password hash leaked`);

  const registrationCookie = sessionCookie(response);
  const { row, childIds } = await verifyDatabaseRecord(body.user, phoneNormalized, roleCase.expectedRole, roleCase.label);

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

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function placeholders(values) {
  return values.map(() => "?").join(", ");
}

function buildWhereInConditions(conditions) {
  const clauses = [];
  const values = [];

  for (const condition of conditions) {
    const uniqueConditionValues = uniqueValues(condition.values);
    if (uniqueConditionValues.length === 0) continue;
    clauses.push(`${condition.column} in (${placeholders(uniqueConditionValues)})`);
    values.push(...uniqueConditionValues);
  }

  return { clause: clauses.join(" or "), values };
}

async function deleteWhereIn(connection, tableName, conditions) {
  const { clause, values } = buildWhereInConditions(conditions);
  if (!clause) return;
  await connection.execute(`delete from ${tableName} where ${clause}`, values);
}

async function countWhereIn(connection, tableName, conditions) {
  const { clause, values } = buildWhereInConditions(conditions);
  if (!clause) return 0;
  const [rows] = await connection.execute(`select count(*) as count from ${tableName} where ${clause}`, values);
  const firstRow = Array.isArray(rows) ? rows[0] : null;
  return Number(firstRow?.count ?? 0);
}

function formatCreatedAccounts() {
  if (createdAccounts.length === 0) return "none";
  return createdAccounts
    .map(
      (account) =>
        `${account.label}: ${account.phoneNormalized} role=${account.role} userId=${account.userId} institutionId=${account.institutionId}`
    )
    .join("; ");
}

async function cleanup() {
  const userIds = uniqueValues([...createdUserIds]);
  const institutionIds = uniqueValues([...createdInstitutionIds]);
  const phoneNumbers = uniqueValues([...createdPhoneNumbers]);

  if (!userIds.length && !institutionIds.length && !phoneNumbers.length) {
    log("No smoke data was created; cleanup skipped");
    return;
  }

  if (KEEP_DATA) {
    log(`AUTH_SMOKE_KEEP_DATA is enabled; created smoke data was left in the database: ${formatCreatedAccounts()}`);
    return;
  }

  const connection = await db();

  await deleteWhereIn(connection, "consent_records", [
    { column: "user_id", values: userIds },
    { column: "institution_id", values: institutionIds },
  ]);
  await deleteWhereIn(connection, "app_state_snapshots", [
    { column: "institution_id", values: institutionIds },
    { column: "updated_by", values: userIds },
  ]);
  await deleteWhereIn(connection, "app_users", [
    { column: "id", values: userIds },
    { column: "phone_normalized", values: phoneNumbers },
  ]);

  const remainingConsentRecords = await countWhereIn(connection, "consent_records", [
    { column: "user_id", values: userIds },
    { column: "institution_id", values: institutionIds },
  ]);
  const remainingSnapshots = await countWhereIn(connection, "app_state_snapshots", [
    { column: "institution_id", values: institutionIds },
    { column: "updated_by", values: userIds },
  ]);
  const remainingUsers = await countWhereIn(connection, "app_users", [
    { column: "id", values: userIds },
    { column: "phone_normalized", values: phoneNumbers },
  ]);

  assert(remainingConsentRecords === 0, `cleanup left ${remainingConsentRecords} consent record(s)`);
  assert(remainingSnapshots === 0, `cleanup left ${remainingSnapshots} snapshot(s)`);
  assert(remainingUsers === 0, `cleanup left ${remainingUsers} app user(s)`);

  log(`Created smoke accounts: ${formatCreatedAccounts()}`);
  log(
    `Cleaned up ${userIds.length} smoke user(s), ${institutionIds.length} snapshot scope(s), and verified 0 consent record(s) remain`
  );
}

async function main() {
  validateRequiredEnv();
  await requireDatabaseSchema();

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
