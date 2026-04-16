import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/account-server";
import { AUTH_SESSION_SECRET_CONFIG_ERROR_MESSAGE, MissingAuthSessionSecretError } from "@/lib/auth/session-config";
import {
  DATABASE_URL_CONFIG_ERROR_MESSAGE,
  DatabaseConfigError,
  dbQuery,
  decodeDatabaseJson,
  encodeDatabaseJson,
} from "@/lib/db/server";
import {
  isAppStateSnapshot,
  normalizeAppStateSnapshot,
  type AppStateSnapshot,
} from "@/lib/persistence/snapshot";
import {
  mergeScopedSnapshotForSessionUser,
  scopeSnapshotForSessionUser,
} from "@/lib/persistence/state-scope";

export const runtime = "nodejs";

const UNAUTHORIZED_ERROR = "\u672a\u767b\u5f55\u3002";
const DEMO_SNAPSHOT_FORBIDDEN_ERROR = "\u793a\u4f8b\u8d26\u53f7\u4e0d\u652f\u6301\u5199\u5165\u8fdc\u7aef\u5feb\u7167\u3002";
const INVALID_SNAPSHOT_FORMAT_ERROR = "\u5feb\u7167\u683c\u5f0f\u9519\u8bef\u3002";
const INVALID_REMOTE_SNAPSHOT_ERROR = "\u8fdc\u7aef\u5feb\u7167\u7ed3\u6784\u65e0\u6548\u3002";
const LOAD_SNAPSHOT_FAILED_ERROR = "\u8fdc\u7aef\u72b6\u6001\u8bfb\u53d6\u5931\u8d25\u3002";
const SAVE_SNAPSHOT_FAILED_ERROR = "\u8fdc\u7aef\u72b6\u6001\u4fdd\u5b58\u5931\u8d25\u3002";

export async function GET() {
  try {
    const user = await getCurrentSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: UNAUTHORIZED_ERROR }, { status: 401 });
    }

    if (user.accountKind === "demo") {
      return NextResponse.json({ ok: true, snapshot: null, isDemo: true });
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

    console.error("[STATE] Failed to load snapshot", error);
    return NextResponse.json({ ok: false, error: LOAD_SNAPSHOT_FAILED_ERROR }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getCurrentSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: UNAUTHORIZED_ERROR }, { status: 401 });
    }

    if (user.accountKind === "demo") {
      return NextResponse.json({ ok: false, error: DEMO_SNAPSHOT_FORBIDDEN_ERROR }, { status: 403 });
    }

    let body: { snapshot?: AppStateSnapshot };
    try {
      body = (await request.json()) as { snapshot?: AppStateSnapshot };
    } catch {
      return NextResponse.json({ ok: false, error: INVALID_SNAPSHOT_FORMAT_ERROR }, { status: 400 });
    }

    const normalizedSnapshot = normalizeAppStateSnapshot(body?.snapshot);
    if (!normalizedSnapshot || !isAppStateSnapshot(normalizedSnapshot)) {
      return NextResponse.json({ ok: false, error: INVALID_SNAPSHOT_FORMAT_ERROR }, { status: 400 });
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

    const currentSnapshot =
      normalizeAppStateSnapshot(decodeDatabaseJson<AppStateSnapshot>(rows[0]?.snapshot)) ??
      normalizeAppStateSnapshot(rows[0]?.snapshot) ??
      normalizedSnapshot;
    const snapshotToSave = mergeScopedSnapshotForSessionUser({
      currentSnapshot,
      incomingSnapshot: normalizedSnapshot,
      user,
    });
    const encodedSnapshot = encodeDatabaseJson(snapshotToSave);

    await dbQuery(
      `
        insert into app_state_snapshots (institution_id, snapshot, updated_by)
        values (?, ?, ?)
        on duplicate key update
          snapshot = ?,
          updated_by = ?
      `,
      [user.institutionId, encodedSnapshot, user.id, encodedSnapshot, user.id]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof MissingAuthSessionSecretError) {
      return NextResponse.json({ ok: false, error: AUTH_SESSION_SECRET_CONFIG_ERROR_MESSAGE }, { status: 503 });
    }

    if (error instanceof DatabaseConfigError) {
      return NextResponse.json({ ok: false, error: DATABASE_URL_CONFIG_ERROR_MESSAGE }, { status: 503 });
    }

    console.error("[STATE] Failed to save snapshot", error);
    return NextResponse.json({ ok: false, error: SAVE_SNAPSHOT_FAILED_ERROR }, { status: 500 });
  }
}
