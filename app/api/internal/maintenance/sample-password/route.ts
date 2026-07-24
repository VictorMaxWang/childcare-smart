import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { withDbTransaction, type DatabaseConnection } from "@/lib/db/server";
import { logSecurityEvent } from "@/lib/server/security-log";

export const runtime = "nodejs";

type SampleAccountLabel = "admin" | "teacher" | "parent";

const SAMPLE_ACCOUNTS: Record<
  SampleAccountLabel,
  { phone: string; role: "机构管理员" | "教师" | "家长" }
> = {
  admin: { phone: "10000000000", role: "机构管理员" },
  teacher: { phone: "10000000001", role: "教师" },
  parent: { phone: "10000000002", role: "家长" },
};

interface SampleAccountRow {
  id: string;
  username_normalized: string;
  phone_normalized: string | null;
  role: string;
  password_hash: string;
  is_demo: number | boolean;
}

interface RepairResult {
  account: SampleAccountLabel;
  changed: boolean;
}

export interface SamplePasswordMaintenanceDependencies {
  getToken: () => string;
  repair: (account: SampleAccountLabel, password: string) => Promise<RepairResult>;
}

const NO_STORE_HEADERS = { "cache-control": "no-store" };

function phoneCandidates(phone: string) {
  return [phone, `+86${phone}`];
}

function tokenMatches(actual: string, expected: string) {
  if (!actual || !expected) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function isSampleAccountLabel(value: unknown): value is SampleAccountLabel {
  return value === "admin" || value === "teacher" || value === "parent";
}

async function loadSampleAccountForUpdate(
  connection: DatabaseConnection,
  account: SampleAccountLabel
) {
  const config = SAMPLE_ACCOUNTS[account];
  const candidates = phoneCandidates(config.phone);
  const [rows] = await connection.execute(
    `
      select id, username_normalized, phone_normalized, role, password_hash, is_demo
      from app_users
      where username_normalized in (?, ?)
         or phone_normalized in (?, ?)
      for update
    `,
    [...candidates, ...candidates]
  );
  const matches = (Array.isArray(rows) ? (rows as SampleAccountRow[]) : []).filter(
    (row) =>
      candidates.includes(row.username_normalized) ||
      (row.phone_normalized !== null && candidates.includes(row.phone_normalized))
  );

  if (matches.length !== 1) {
    throw new Error(`Expected one ${account} sample account`);
  }
  const row = matches[0];
  if (row.role !== config.role || Boolean(row.is_demo)) {
    throw new Error(`${account} sample account identity check failed`);
  }
  return row;
}

async function repairSampleAccountPassword(
  account: SampleAccountLabel,
  password: string
): Promise<RepairResult> {
  return withDbTransaction(async (connection) => {
    const row = await loadSampleAccountForUpdate(connection, account);
    if (await verifyPassword(password, row.password_hash)) {
      return { account, changed: false };
    }

    const passwordHash = await hashPassword(password);
    const [result] = await connection.execute(
      `
        update app_users
        set password_hash = ?
        where id = ?
          and role = ?
          and is_demo = 0
      `,
      [passwordHash, row.id, SAMPLE_ACCOUNTS[account].role]
    );
    const affectedRows =
      result && typeof result === "object" && "affectedRows" in result
        ? Number(result.affectedRows)
        : 0;
    if (affectedRows !== 1) {
      throw new Error("Password repair did not update exactly one account");
    }

    const [verificationRows] = await connection.execute(
      "select password_hash from app_users where id = ?",
      [row.id]
    );
    const verificationHash =
      Array.isArray(verificationRows) &&
      verificationRows[0] &&
      typeof verificationRows[0] === "object" &&
      "password_hash" in verificationRows[0]
        ? String(verificationRows[0].password_hash)
        : "";
    if (!(await verifyPassword(password, verificationHash))) {
      throw new Error("Password repair verification failed");
    }

    return { account, changed: true };
  });
}

const defaultDependencies: SamplePasswordMaintenanceDependencies = {
  getToken: () => process.env.ACCOUNT_MAINTENANCE_TOKEN?.trim() ?? "",
  repair: repairSampleAccountPassword,
};

export async function handleSamplePasswordMaintenance(
  request: Request,
  dependencies: SamplePasswordMaintenanceDependencies = defaultDependencies
) {
  const expectedToken = dependencies.getToken();
  if (!expectedToken) {
    return NextResponse.json({ ok: false }, { status: 404, headers: NO_STORE_HEADERS });
  }

  const actualToken = request.headers.get("x-account-maintenance-token")?.trim() ?? "";
  if (!tokenMatches(actualToken, expectedToken)) {
    return NextResponse.json({ ok: false }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const body = (await request.json().catch(() => null)) as
    | { account?: unknown; password?: unknown }
    | null;
  if (
    !body ||
    !isSampleAccountLabel(body.account) ||
    typeof body.password !== "string" ||
    body.password.length < 6 ||
    body.password.length > 128
  ) {
    return NextResponse.json(
      { ok: false, error: "Invalid maintenance request" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const result = await dependencies.repair(body.account, body.password);
    logSecurityEvent("warn", "auth.sample_password_repaired", {
      account: result.account,
      changed: result.changed,
    });
    return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    logSecurityEvent("error", "auth.sample_password_repair_failed", { error });
    return NextResponse.json(
      { ok: false, error: "Maintenance failed" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export function POST(request: Request) {
  return handleSamplePasswordMaintenance(request);
}
