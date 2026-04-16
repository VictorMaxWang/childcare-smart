import type { SessionUser } from "@/lib/auth/accounts";
import type { AppStateSnapshot } from "@/lib/persistence/snapshot";

type SnapshotChild = AppStateSnapshot["children"][number];
type SnapshotReminder = AppStateSnapshot["reminders"][number];

const ROLE_PARENT = "家长";
const ROLE_TEACHER = "教师";
const ROLE_ADMIN = "机构管理员";

function readParentChildIdSet(user: Pick<SessionUser, "childIds"> | null | undefined) {
  return new Set(((user?.childIds ?? [])).filter((childId): childId is string => typeof childId === "string" && childId.length > 0));
}

export function isParentSessionUser(user: Pick<SessionUser, "role"> | null | undefined) {
  return user?.role === ROLE_PARENT;
}

export function filterChildrenForSessionUser(
  children: SnapshotChild[],
  user: Pick<SessionUser, "role" | "id" | "institutionId" | "className" | "childIds">
) {
  if (user.role === ROLE_ADMIN) {
    return children.filter((child) => child.institutionId === user.institutionId);
  }

  if (user.role === ROLE_TEACHER) {
    return children.filter(
      (child) => child.institutionId === user.institutionId && child.className === user.className
    );
  }

  const explicitChildIds = readParentChildIdSet(user);
  if (explicitChildIds.size > 0) {
    return children.filter(
      (child) => child.institutionId === user.institutionId && explicitChildIds.has(child.id)
    );
  }

  return children.filter(
    (child) => child.institutionId === user.institutionId && child.parentUserId === user.id
  );
}

export function resolveAuthorizedChildIdSet(
  user: Pick<SessionUser, "role" | "id" | "institutionId" | "className" | "childIds">,
  children: SnapshotChild[]
) {
  if (!isParentSessionUser(user)) {
    return new Set(filterChildrenForSessionUser(children, user).map((child) => child.id));
  }

  const explicitChildIds = readParentChildIdSet(user);
  if (explicitChildIds.size > 0) {
    return explicitChildIds;
  }

  return new Set(
    filterChildrenForSessionUser(children, user).map((child) => child.id)
  );
}

function filterByChildId<T>(
  items: T[],
  authorizedChildIds: Set<string>,
  readChildId: (item: T) => string | null | undefined
) {
  return items.filter((item) => {
    const childId = readChildId(item);
    return Boolean(childId && authorizedChildIds.has(childId));
  });
}

function replaceScopedItems<T>(
  currentItems: T[],
  incomingItems: T[],
  authorizedChildIds: Set<string>,
  readChildId: (item: T) => string | null | undefined
) {
  const preservedItems = currentItems.filter((item) => {
    const childId = readChildId(item);
    return !childId || !authorizedChildIds.has(childId);
  });

  const scopedIncomingItems = filterByChildId(incomingItems, authorizedChildIds, readChildId);
  return [...preservedItems, ...scopedIncomingItems];
}

function readReminderChildId(reminder: SnapshotReminder) {
  if (reminder.childId) {
    return reminder.childId;
  }

  return reminder.targetRole === "parent" ? reminder.targetId : undefined;
}

export function scopeSnapshotForSessionUser(
  snapshot: AppStateSnapshot,
  user: Pick<SessionUser, "role" | "id" | "institutionId" | "className" | "childIds">
) {
  if (!isParentSessionUser(user)) {
    return snapshot;
  }

  const authorizedChildIds = resolveAuthorizedChildIdSet(user, snapshot.children);

  return {
    ...snapshot,
    children: filterChildrenForSessionUser(snapshot.children, user),
    attendance: filterByChildId(snapshot.attendance, authorizedChildIds, (item) => item.childId),
    meals: filterByChildId(snapshot.meals, authorizedChildIds, (item) => item.childId),
    growth: filterByChildId(snapshot.growth, authorizedChildIds, (item) => item.childId),
    feedback: filterByChildId(snapshot.feedback, authorizedChildIds, (item) => item.childId),
    health: filterByChildId(snapshot.health, authorizedChildIds, (item) => item.childId),
    taskCheckIns: filterByChildId(snapshot.taskCheckIns, authorizedChildIds, (item) => item.childId),
    interventionCards: filterByChildId(
      snapshot.interventionCards,
      authorizedChildIds,
      (item) => item.targetChildId
    ),
    consultations: filterByChildId(snapshot.consultations, authorizedChildIds, (item) => item.childId),
    mobileDrafts: filterByChildId(snapshot.mobileDrafts, authorizedChildIds, (item) => item.childId),
    reminders: filterByChildId(snapshot.reminders, authorizedChildIds, readReminderChildId),
    tasks: filterByChildId(snapshot.tasks, authorizedChildIds, (item) => item.childId),
  } satisfies AppStateSnapshot;
}

export function mergeScopedSnapshotForSessionUser(params: {
  currentSnapshot: AppStateSnapshot;
  incomingSnapshot: AppStateSnapshot;
  user: Pick<SessionUser, "role" | "id" | "institutionId" | "className" | "childIds">;
}) {
  const { currentSnapshot, incomingSnapshot, user } = params;
  if (!isParentSessionUser(user)) {
    return incomingSnapshot;
  }

  const authorizedChildIds = resolveAuthorizedChildIdSet(user, currentSnapshot.children);
  const scopedIncomingSnapshot = scopeSnapshotForSessionUser(incomingSnapshot, user);

  return {
    ...currentSnapshot,
    children: replaceScopedItems(
      currentSnapshot.children,
      scopedIncomingSnapshot.children,
      authorizedChildIds,
      (item) => item.id
    ),
    attendance: replaceScopedItems(
      currentSnapshot.attendance,
      scopedIncomingSnapshot.attendance,
      authorizedChildIds,
      (item) => item.childId
    ),
    meals: replaceScopedItems(
      currentSnapshot.meals,
      scopedIncomingSnapshot.meals,
      authorizedChildIds,
      (item) => item.childId
    ),
    growth: replaceScopedItems(
      currentSnapshot.growth,
      scopedIncomingSnapshot.growth,
      authorizedChildIds,
      (item) => item.childId
    ),
    feedback: replaceScopedItems(
      currentSnapshot.feedback,
      scopedIncomingSnapshot.feedback,
      authorizedChildIds,
      (item) => item.childId
    ),
    health: replaceScopedItems(
      currentSnapshot.health,
      scopedIncomingSnapshot.health,
      authorizedChildIds,
      (item) => item.childId
    ),
    taskCheckIns: replaceScopedItems(
      currentSnapshot.taskCheckIns,
      scopedIncomingSnapshot.taskCheckIns,
      authorizedChildIds,
      (item) => item.childId
    ),
    interventionCards: replaceScopedItems(
      currentSnapshot.interventionCards,
      scopedIncomingSnapshot.interventionCards,
      authorizedChildIds,
      (item) => item.targetChildId
    ),
    consultations: replaceScopedItems(
      currentSnapshot.consultations,
      scopedIncomingSnapshot.consultations,
      authorizedChildIds,
      (item) => item.childId
    ),
    mobileDrafts: replaceScopedItems(
      currentSnapshot.mobileDrafts,
      scopedIncomingSnapshot.mobileDrafts,
      authorizedChildIds,
      (item) => item.childId
    ),
    reminders: replaceScopedItems(
      currentSnapshot.reminders,
      scopedIncomingSnapshot.reminders,
      authorizedChildIds,
      readReminderChildId
    ),
    tasks: replaceScopedItems(
      currentSnapshot.tasks,
      scopedIncomingSnapshot.tasks,
      authorizedChildIds,
      (item) => item.childId
    ),
    updatedAt: scopedIncomingSnapshot.updatedAt,
  } satisfies AppStateSnapshot;
}

export function isAuthorizedParentChildId(
  user: Pick<SessionUser, "role" | "childIds"> | null | undefined,
  childId: string | null | undefined
) {
  if (!isParentSessionUser(user) || !childId) {
    return false;
  }

  const allowedChildIds = readParentChildIdSet(user);
  return allowedChildIds.size > 0 ? allowedChildIds.has(childId) : false;
}
