import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/account-server";
import { AUTH_SESSION_SECRET_CONFIG_ERROR_MESSAGE, MissingAuthSessionSecretError } from "@/lib/auth/session-config";
import {
  DATABASE_URL_CONFIG_ERROR_MESSAGE,
  DatabaseConfigError,
  dbQuery,
  decodeDatabaseJson,
} from "@/lib/db/server";
import {
  isAppStateSnapshot,
  normalizeAppStateSnapshot,
  type AppStateSnapshot,
} from "@/lib/persistence/snapshot";
import { scopeSnapshotForSessionUser } from "@/lib/persistence/state-scope";
import { toCoreSnapshot } from "@/lib/server/app-data-model";
import { DefaultAppDataRepository } from "@/lib/server/app-data-repository";
import { logSecurityEvent } from "@/lib/server/security-log";

export const runtime = "nodejs";

const UNAUTHORIZED_ERROR = "\u672a\u767b\u5f55\u3002";
const INVALID_REMOTE_SNAPSHOT_ERROR = "\u8fdc\u7aef\u5feb\u7167\u7ed3\u6784\u65e0\u6548\u3002";
const LOAD_SNAPSHOT_FAILED_ERROR = "\u8fdc\u7aef\u72b6\u6001\u8bfb\u53d6\u5931\u8d25\u3002";
const SNAPSHOT_WRITE_DISABLED_ERROR =
  "整包状态写入已停用，请通过幼儿、记录、消息、会诊等资源接口保存。";

export async function GET() {
  try {
    const user = await getCurrentSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: UNAUTHORIZED_ERROR }, { status: 401 });
    }

    if (user.accountKind === "demo") {
      const snapshot = await new DefaultAppDataRepository().load(user);
      return NextResponse.json({
        ok: true,
        snapshot: scopeSnapshotForSessionUser(toCoreSnapshot(snapshot), user),
        isDemo: true,
      });
    }

    const { rows } = await dbQuery<{ snapshot: unknown }>(
      `
        select snapshot
        from app_state_snapshots
        where institution_id = ?
        limit 1
      `,
      [user.institutionId]
    );

    const rawSnapshot = rows[0]?.snapshot;
    if (rawSnapshot == null) {
      return NextResponse.json({ ok: true, snapshot: null });
    }

    const snapshot = normalizeAppStateSnapshot(decodeDatabaseJson<AppStateSnapshot>(rawSnapshot));
    if (!snapshot || !isAppStateSnapshot(snapshot)) {
      return NextResponse.json({ ok: false, error: INVALID_REMOTE_SNAPSHOT_ERROR }, { status: 500 });
    }

    const scopedSnapshot = scopeSnapshotForSessionUser(snapshot, user);
    return NextResponse.json({ ok: true, snapshot: scopedSnapshot });
  } catch (error) {
    if (error instanceof MissingAuthSessionSecretError) {
      return NextResponse.json({ ok: false, error: AUTH_SESSION_SECRET_CONFIG_ERROR_MESSAGE }, { status: 503 });
    }

    if (error instanceof DatabaseConfigError) {
      return NextResponse.json({ ok: false, error: DATABASE_URL_CONFIG_ERROR_MESSAGE }, { status: 503 });
    }

    logSecurityEvent("error", "state.load_failed", { error });
    return NextResponse.json({ ok: false, error: LOAD_SNAPSHOT_FAILED_ERROR }, { status: 500 });
  }
}

export interface StatePutDependencies {
  resolveUser: typeof getCurrentSessionUser;
}

const defaultStatePutDependencies: StatePutDependencies = {
  resolveUser: getCurrentSessionUser,
};

export async function handleStatePut(
  _request: Request,
  dependencies: StatePutDependencies = defaultStatePutDependencies
) {
  try {
    const user = await dependencies.resolveUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: UNAUTHORIZED_ERROR }, { status: 401 });
    }

    // 真实业务写入必须走资源 API，统一执行角色校验、审计和事务。
    logSecurityEvent("warn", "state.legacy_write_rejected", {
      userId: user.id,
      institutionId: user.institutionId,
      role: user.role,
      accountKind: user.accountKind,
    });
    return NextResponse.json(
      {
        ok: false,
        code: "snapshot_write_disabled",
        error: SNAPSHOT_WRITE_DISABLED_ERROR,
      },
      {
        status: 405,
        headers: { Allow: "GET" },
      }
    );
  } catch (error) {
    if (error instanceof MissingAuthSessionSecretError) {
      return NextResponse.json({ ok: false, error: AUTH_SESSION_SECRET_CONFIG_ERROR_MESSAGE }, { status: 503 });
    }

    logSecurityEvent("error", "state.legacy_write_guard_failed", { error });
    return NextResponse.json({ ok: false, error: SNAPSHOT_WRITE_DISABLED_ERROR }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  return handleStatePut(request);
}
