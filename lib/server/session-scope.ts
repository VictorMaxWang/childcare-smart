import "server-only";

import type { SessionUser } from "@/lib/auth/accounts";
import type { ApiExtendedSnapshot } from "@/lib/api/types";
import type { AppStateSnapshot } from "@/lib/persistence/snapshot";
import { scopeSnapshotForSessionUser } from "@/lib/persistence/state-scope";
import { DefaultAppDataRepository, type AppDataRepository } from "@/lib/server/app-data-repository";
import { requireChildAccess } from "@/lib/server/scope";
import type { RequestSession } from "@/lib/server/session";

export interface SessionScope {
  session: RequestSession | null;
  user: SessionUser;
  snapshot: ApiExtendedSnapshot;
  scopedSnapshot: AppStateSnapshot;
  visibleChildren: AppStateSnapshot["children"];
  authorizedChildIds: Set<string>;
  institutionId: string;
}

function readUser(session: RequestSession | SessionUser) {
  return "user" in session ? session.user : session;
}

export async function getSessionScope(
  session: RequestSession | SessionUser,
  repository: AppDataRepository = new DefaultAppDataRepository()
): Promise<SessionScope> {
  const user = readUser(session);
  const snapshot = await repository.load(user);
  const scopedSnapshot = scopeSnapshotForSessionUser(snapshot, user);
  const visibleChildren = scopedSnapshot.children;
  const authorizedChildIds = new Set(visibleChildren.map((child) => child.id));

  return {
    session: "user" in session ? session : null,
    user,
    snapshot,
    scopedSnapshot,
    visibleChildren,
    authorizedChildIds,
    institutionId: user.institutionId,
  };
}

export function requireScopedChild(scope: SessionScope, childId: string) {
  // Parent/teacher/admin child access is derived from the session-scoped snapshot, not from client payload.
  return requireChildAccess(scope.user, scope.scopedSnapshot, childId);
}

export function buildServiceScopeClaim(scope: SessionScope) {
  return {
    institutionId: scope.institutionId,
    role: scope.user.role,
    accountKind: scope.user.accountKind,
    childIds: Array.from(scope.authorizedChildIds),
    // TODO(T8B-classId): migrate teacher scoping to stable classId once class ids exist in real snapshots.
    className: scope.user.className,
  };
}
