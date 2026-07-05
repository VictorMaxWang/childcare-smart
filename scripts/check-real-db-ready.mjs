#!/usr/bin/env node
import fs from "node:fs";
import { createPool } from "mysql2/promise";

loadLocalEnvFile(".env.local");

const REQUIRED_TABLES = ["app_users", "app_state_snapshots", "consent_records"];
const REQUIRED_COLUMNS = [
  ["app_users", "id"],
  ["app_users", "username_normalized"],
  ["app_users", "phone_normalized"],
  ["app_users", "phone_verified"],
  ["app_users", "created_via"],
  ["app_users", "display_name"],
  ["app_users", "password_hash"],
  ["app_users", "role"],
  ["app_users", "institution_id"],
  ["app_users", "child_ids"],
  ["app_users", "is_demo"],
  ["app_users", "created_at"],
  ["app_users", "updated_at"],
  ["app_state_snapshots", "institution_id"],
  ["app_state_snapshots", "snapshot"],
  ["app_state_snapshots", "updated_by"],
  ["app_state_snapshots", "updated_at"],
  ["consent_records", "id"],
  ["consent_records", "institution_id"],
  ["consent_records", "user_id"],
  ["consent_records", "child_id"],
  ["consent_records", "consent_type"],
  ["consent_records", "policy_version"],
  ["consent_records", "agreed_at"],
  ["consent_records", "ip"],
  ["consent_records", "user_agent"],
  ["consent_records", "created_at"],
];

const REQUIRED_INDEXES = [
  {
    table: "app_users",
    column: "phone_normalized",
    unique: true,
    label: "unique index on app_users.phone_normalized",
  },
];

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

function resultLine(status, message) {
  console.log(`${status} ${message}`);
}

function failLine(message) {
  resultLine("FAIL", message);
}

function passLine(message) {
  resultLine("PASS", message);
}

function parseDatabaseConfig() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    return { ok: false, message: "DATABASE_URL missing" };
  }

  let url;
  try {
    url = new URL(connectionString);
  } catch {
    return { ok: false, message: "DATABASE_URL is not a valid URL" };
  }

  if (url.protocol !== "mysql:" && url.protocol !== "mysqls:") {
    return { ok: false, message: "DATABASE_URL must use mysql:// or mysqls://" };
  }

  const database = url.pathname.replace(/^\/+/, "");
  if (!database) {
    return { ok: false, message: "DATABASE_URL missing database name" };
  }

  const useSsl = truthy(process.env.DATABASE_SSL) || url.protocol === "mysqls:";
  return {
    ok: true,
    config: {
      host: url.hostname,
      port: url.port ? Number(url.port) : 3306,
      user: decodeURIComponent(url.username || ""),
      password: decodeURIComponent(url.password || ""),
      database,
      waitForConnections: true,
      connectionLimit: 2,
      maxIdle: 2,
      idleTimeout: 10000,
      connectTimeout: 5000,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    },
    summary: {
      database,
      ssl: useSsl ? "enabled" : "disabled",
    },
  };
}

async function tableExists(connection, database, table) {
  const [rows] = await connection.execute(
    `
      select table_name
      from information_schema.tables
      where table_schema = ?
        and table_name = ?
      limit 1
    `,
    [database, table]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function columnExists(connection, database, table, column) {
  const [rows] = await connection.execute(
    `
      select column_name
      from information_schema.columns
      where table_schema = ?
        and table_name = ?
        and column_name = ?
      limit 1
    `,
    [database, table, column]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function indexExists(connection, database, index) {
  const [rows] = await connection.execute(
    `
      select index_name, non_unique
      from information_schema.statistics
      where table_schema = ?
        and table_name = ?
        and column_name = ?
    `,
    [database, index.table, index.column]
  );

  if (!Array.isArray(rows)) return false;
  if (index.unique) {
    return rows.some((row) => Number(row.non_unique) === 0);
  }
  return rows.length > 0;
}

async function main() {
  const parsed = parseDatabaseConfig();
  const databaseUrlState = process.env.DATABASE_URL?.trim() ? "set" : "missing";
  const databaseSslState = process.env.DATABASE_SSL?.trim() ? "set" : "missing";
  console.log(`DATABASE_URL ${databaseUrlState}`);
  console.log(`DATABASE_SSL ${databaseSslState}`);

  if (!parsed.ok) {
    failLine(parsed.message);
    process.exitCode = 1;
    return;
  }

  console.log("Database target: set");
  console.log(`SSL mode: ${parsed.summary.ssl}`);

  const pool = createPool(parsed.config);
  const issues = [];
  try {
    await pool.execute("select 1 as ok");
    passLine("database connection");

    for (const table of REQUIRED_TABLES) {
      if (await tableExists(pool, parsed.config.database, table)) {
        passLine(`table ${table}`);
      } else {
        issues.push(`missing table ${table}`);
        failLine(`table ${table}`);
      }
    }

    for (const [table, column] of REQUIRED_COLUMNS) {
      if (await columnExists(pool, parsed.config.database, table, column)) {
        passLine(`column ${table}.${column}`);
      } else {
        issues.push(`missing column ${table}.${column}`);
        failLine(`column ${table}.${column}`);
      }
    }

    for (const index of REQUIRED_INDEXES) {
      if (await indexExists(pool, parsed.config.database, index)) {
        passLine(index.label);
      } else {
        issues.push(`missing ${index.label}`);
        failLine(index.label);
      }
    }
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : error?.name;
    failLine(`database check failed: ${code || "UNKNOWN_ERROR"}`);
    process.exitCode = 1;
    return;
  } finally {
    await pool.end().catch(() => {});
  }

  if (issues.length > 0) {
    console.log("Missing details:");
    for (const issue of issues) {
      console.log(`- ${issue}`);
    }
    process.exitCode = 1;
    return;
  }

  passLine("real DB registration prerequisites ready");
}

await main();
