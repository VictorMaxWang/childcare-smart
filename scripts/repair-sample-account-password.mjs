#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import { promisify } from "node:util";
import { createPool } from "mysql2/promise";

loadLocalEnvFile(".env.local");

const scryptAsync = promisify(crypto.scrypt);
const APPLY = process.argv.includes("--apply");
const HELP = process.argv.includes("--help");
const accountLabel = readArg("account");
const ACCOUNT_CONFIG = {
  admin: {
    phoneEnv: "SAMPLE_ADMIN_PHONE",
    passwordEnv: "SAMPLE_ADMIN_PASSWORD",
    defaultPhone: "10000000000",
    expectedRole: "\u673a\u6784\u7ba1\u7406\u5458",
  },
  teacher: {
    phoneEnv: "SAMPLE_TEACHER_PHONE",
    passwordEnv: "SAMPLE_TEACHER_PASSWORD",
    defaultPhone: "10000000001",
    expectedRole: "\u6559\u5e08",
  },
  parent: {
    phoneEnv: "SAMPLE_PARENT_PHONE",
    passwordEnv: "SAMPLE_PARENT_PASSWORD",
    defaultPhone: "10000000002",
    expectedRole: "\u5bb6\u957f",
  },
};

function loadLocalEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const match = normalized.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = parseEnvValue(match[2]);
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
      return quote === `"`
        ? value.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t")
        : value;
    }
  }

  const commentIndex = value.search(/\s#/);
  return commentIndex >= 0 ? value.slice(0, commentIndex).trim() : value;
}

function readArg(name) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length).trim() ?? "";
}

function truthy(value) {
  return ["1", "true", "yes", "y", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function fail(message) {
  throw new Error(message);
}

function normalizePhone(input) {
  const compact = input.trim().replace(/[\s-]+/g, "");
  const nationalNumber =
    compact.startsWith("+86")
      ? compact.slice(3)
      : compact.startsWith("86") && compact.length === 13
        ? compact.slice(2)
        : compact;
  if (!/^1\d{10}$/.test(nationalNumber)) fail("Sample account phone is invalid");
  return `+86${nationalNumber}`;
}

function phoneCandidates(phone) {
  return [...new Set([phone.trim(), normalizePhone(phone)])];
}

function maskPhone(phone) {
  const text = String(phone ?? "");
  return text.length <= 4 ? "****" : `${text.slice(0, 3)}****${text.slice(-4)}`;
}

function placeholders(values) {
  return values.map(() => "?").join(", ");
}

function parseDatabaseConfig() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) fail("DATABASE_URL missing");

  const url = new URL(connectionString);
  if (url.protocol !== "mysql:" && url.protocol !== "mysqls:") {
    fail("DATABASE_URL must use mysql:// or mysqls://");
  }
  const database = url.pathname.replace(/^\/+/, "");
  if (!database) fail("DATABASE_URL missing database name");

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username || ""),
    password: decodeURIComponent(url.password || ""),
    database,
    waitForConnections: true,
    connectionLimit: 1,
    maxIdle: 1,
    idleTimeout: 10_000,
    connectTimeout: 5_000,
    ssl:
      truthy(process.env.DATABASE_SSL) || url.protocol === "mysqls:"
        ? { rejectUnauthorized: false }
        : undefined,
  };
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, 64);
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(password, encoded) {
  const [prefix, salt, expectedHash] = String(encoded ?? "").split(":");
  if (prefix !== "scrypt" || !salt || !expectedHash) return false;

  const actual = await scryptAsync(password, salt, 64);
  const expected = Buffer.from(expectedHash, "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
}

async function loadAccount(executor, phone, expectedRole) {
  const candidates = phoneCandidates(phone);
  const [rows] = await executor.execute(
    `
      select id, username_normalized, phone_normalized, role, password_hash, is_demo
      from app_users
      where username_normalized in (${placeholders(candidates)})
         or phone_normalized in (${placeholders(candidates)})
    `,
    [...candidates, ...candidates]
  );
  const matches = rows.filter(
    (row) =>
      candidates.includes(row.username_normalized) ||
      candidates.includes(row.phone_normalized)
  );
  if (matches.length !== 1) fail(`Expected exactly one sample account, found ${matches.length}`);

  const account = matches[0];
  if (account.role !== expectedRole) fail("Sample account role mismatch");
  if (truthy(account.is_demo)) fail("Sample account must be a normal account");
  return account;
}

async function main() {
  if (HELP) {
    console.log(
      "Usage: npm run account:repair-sample-password -- --account=<admin|teacher|parent> [--apply]"
    );
    console.log("Set the matching SAMPLE_<ROLE>_PASSWORD environment variable before running.");
    return;
  }

  const config = ACCOUNT_CONFIG[accountLabel];
  if (!config) fail("Pass --account=admin, --account=teacher, or --account=parent");

  const phone = process.env[config.phoneEnv]?.trim() || config.defaultPhone;
  const desiredPassword = process.env[config.passwordEnv]?.trim();
  if (!desiredPassword) fail(`${config.passwordEnv} missing`);
  if (desiredPassword.length < 6) fail("Sample account password is too short");

  console.log(`Mode: ${APPLY ? "apply" : "dry-run"}`);
  console.log(`Account: ${accountLabel} ${maskPhone(phone)}`);

  const pool = createPool(parseDatabaseConfig());
  try {
    const account = await loadAccount(pool, phone, config.expectedRole);
    if (await verifyPassword(desiredPassword, account.password_hash)) {
      console.log("PASS password already matches");
      return;
    }

    if (!APPLY) {
      console.log("PASS password mismatch confirmed; rerun with --apply to repair");
      return;
    }

    // 只更新已核验角色的单个正常账号，避免维护命令扩大写入范围。
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const passwordHash = await hashPassword(desiredPassword);
      const [result] = await connection.execute(
        `
          update app_users
          set password_hash = ?
          where id = ?
            and role = ?
            and is_demo = 0
        `,
        [passwordHash, account.id, config.expectedRole]
      );
      if (result.affectedRows !== 1) fail("Password repair did not update exactly one account");
      await connection.commit();
    } catch (error) {
      await connection.rollback().catch(() => {});
      throw error;
    } finally {
      connection.release();
    }

    const repaired = await loadAccount(pool, phone, config.expectedRole);
    if (!(await verifyPassword(desiredPassword, repaired.password_hash))) {
      fail("Password repair verification failed");
    }
    console.log("PASS password repaired and verified");
  } finally {
    await pool.end().catch(() => {});
  }
}

try {
  await main();
} catch (error) {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
