import type { SessionUser } from "@/lib/auth/accounts";
import { resolveAuthorizedChildIdSet, scopeSnapshotForSessionUser } from "@/lib/persistence/state-scope";
import type { AppStateSnapshot } from "@/lib/persistence/snapshot";
import type { DemoDataContext, MutationResult } from "./types";
import { readContextSnapshot, writeContextSnapshot } from "./persistence";

export type DemoDataOperation =
  | "child.write"
  | "attendance.write"
  | "message.write"
  | "message.read"
  | "dailyRecord.write"
  | "healthMaterial.write"
  | "consultation.write"
  | "reminder.write"
  | "nutritionMenu.read"
  | "storybook.write";

export type SnapshotMutation = (snapshot: AppStateSnapshot) => AppStateSnapshot;

export function getScopedSnapshot(context: DemoDataContext) {
  return scopeSnapshotForSessionUser(readContextSnapshot(context), context.user);
}

export function assertCanAccessChild(
  user: SessionUser,
  snapshot: AppStateSnapshot,
  childId: string | null | undefined
) {
  if (!childId) {
    return { ok: false as const, error: "missing_child_id" };
  }

  const allowedChildIds = resolveAuthorizedChildIdSet(user, snapshot.children);
  if (!allowedChildIds.has(childId)) {
    return { ok: false as const, error: "unauthorized_child_id" };
  }

  return { ok: true as const };
}

export function mutateAppSnapshot<T = AppStateSnapshot>(
  context: DemoDataContext,
  mutation: SnapshotMutation,
  options: {
    requiredChildId?: string;
    operation?: DemoDataOperation;
    data?: (snapshot: AppStateSnapshot) => T;
  } = {}
): MutationResult<T> {
  const snapshot = readContextSnapshot(context);
  const access = options.requiredChildId
    ? assertCanAccessChild(context.user, snapshot, options.requiredChildId)
    : { ok: true as const };

  if (!access.ok) {
    return {
      status: "failed",
      snapshot,
      persistedAt: context.now(),
      message: "Mutation rejected by D01 child scope guard.",
      error: access.error,
    };
  }

  const nextSnapshot = mutation(snapshot);
  const persisted = writeContextSnapshot(context, nextSnapshot);
  return {
    ...persisted,
    data: options.data?.(persisted.snapshot),
  };
}
