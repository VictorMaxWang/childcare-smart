import type { SessionUser } from "@/lib/auth/accounts";
import type { AppStateSnapshot } from "@/lib/persistence/snapshot";

type SnapshotChild = AppStateSnapshot["children"][number];
type SnapshotConversation = AppStateSnapshot["conversations"][number];
type SnapshotReminder = AppStateSnapshot["reminders"][number];
type SnapshotNutritionMenu = AppStateSnapshot["nutritionMenus"][number];
type SnapshotRole = "parent" | "teacher" | "admin";

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
  user: Pick<SessionUser, "role" | "id" | "institutionId" | "classId" | "className" | "childIds">
) {
  if (user.role === ROLE_ADMIN) {
    return children.filter((child) => child.institutionId === user.institutionId);
  }

  if (user.role === ROLE_TEACHER) {
    return children.filter(
      (child) =>
        child.institutionId === user.institutionId &&
        (user.classId && child.classId
          ? child.classId === user.classId
          : child.className === user.className)
    );
  }

  const explicitChildIds = readParentChildIdSet(user);
  return children.filter(
    (child) =>
      child.institutionId === user.institutionId &&
      (explicitChildIds.has(child.id) || child.parentUserId === user.id)
  );
}

export function resolveAuthorizedChildIdSet(
  user: Pick<SessionUser, "role" | "id" | "institutionId" | "classId" | "className" | "childIds">,
  children: SnapshotChild[]
) {
  if (!isParentSessionUser(user)) {
    return new Set(filterChildrenForSessionUser(children, user).map((child) => child.id));
  }

  const explicitChildIds = readParentChildIdSet(user);
  if (explicitChildIds.size > 0) {
    const authorizedChildIds = new Set(explicitChildIds);
    for (const child of children) {
      if (child.institutionId === user.institutionId && child.parentUserId === user.id) {
        authorizedChildIds.add(child.id);
      }
    }
    return authorizedChildIds;
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

function mergeItemsByKey<T>(
  currentItems: T[],
  incomingItems: T[],
  readKey: (item: T) => string | null | undefined
) {
  const merged = new Map<string, T>();
  const withoutKey: T[] = [];

  const add = (item: T) => {
    const key = readKey(item);
    if (!key) {
      withoutKey.push(item);
      return;
    }
    merged.set(key, item);
  };

  currentItems.forEach(add);
  incomingItems.forEach(add);

  return [...merged.values(), ...withoutKey];
}

function readReminderChildId(reminder: SnapshotReminder) {
  if (reminder.childId) {
    return reminder.childId;
  }

  return reminder.targetRole === "parent" ? reminder.targetId : undefined;
}

function resolveAuthorizedClassNameSet(children: SnapshotChild[], authorizedChildIds: Set<string>) {
  const classKeys = new Set<string>();
  for (const child of children) {
    if (!authorizedChildIds.has(child.id)) continue;
    if (child.className) classKeys.add(child.className);
    const classId = (child as { classId?: string }).classId;
    if (classId) classKeys.add(classId);
  }
  return classKeys;
}

function filterMenusForScope(
  items: SnapshotNutritionMenu[],
  authorizedClassNames: Set<string>
) {
  return items.filter((item) => authorizedClassNames.has(item.classId));
}

function toSnapshotRole(user: Pick<SessionUser, "role">): SnapshotRole {
  if (user.role === ROLE_PARENT) return "parent";
  if (user.role === ROLE_TEACHER) return "teacher";
  return "admin";
}

function isRoleVisibleReminder(reminder: SnapshotReminder, role: SnapshotRole) {
  return reminder.targetRole === role || reminder.assigneeRole === role;
}

function isRoleVisibleConversation(
  conversation: SnapshotConversation,
  role: SnapshotRole
) {
  return conversation.participantRoles.includes(role);
}

export function scopeSnapshotForSessionUser(
  snapshot: AppStateSnapshot,
  user: Pick<SessionUser, "role" | "id" | "institutionId" | "classId" | "className" | "childIds">
) {
  const authorizedChildIds = resolveAuthorizedChildIdSet(user, snapshot.children);
  const authorizedClassNames = resolveAuthorizedClassNameSet(snapshot.children, authorizedChildIds);
  const snapshotRole = toSnapshotRole(user);
  const isAdmin = user.role === ROLE_ADMIN;
  const childScopedTasks = filterByChildId(
    snapshot.tasks,
    authorizedChildIds,
    (item) => item.childId
  );
  const tasks = isAdmin
    ? childScopedTasks
    : childScopedTasks.filter((item) => item.ownerRole === snapshotRole);
  const visibleTaskRefs = new Set(
    tasks.flatMap((task) =>
      [
        task.taskId,
        task.sourceId,
        task.legacyRefs?.legacyWeeklyTaskId,
        task.legacyRefs?.interventionCardId,
      ].filter((value): value is string => Boolean(value))
    )
  );
  const childScopedTaskCheckIns = filterByChildId(
    snapshot.taskCheckIns,
    authorizedChildIds,
    (item) => item.childId
  );
  const taskCheckIns = isAdmin
    ? childScopedTaskCheckIns
    : childScopedTaskCheckIns.filter((item) => visibleTaskRefs.has(item.taskId));
  const childScopedMobileDrafts = filterByChildId(
    snapshot.mobileDrafts,
    authorizedChildIds,
    (item) => item.childId
  );
  const mobileDrafts = isAdmin
    ? childScopedMobileDrafts
    : childScopedMobileDrafts.filter((item) => item.targetRole === snapshotRole);
  const childScopedReminders = filterByChildId(
    snapshot.reminders,
    authorizedChildIds,
    readReminderChildId
  );
  const reminders = isAdmin
    ? childScopedReminders
    : childScopedReminders.filter((item) =>
        isRoleVisibleReminder(item, snapshotRole)
      );
  const childScopedConversations = filterByChildId(
    snapshot.conversations,
    authorizedChildIds,
    (item) => item.childId
  );
  const conversations = isAdmin
    ? childScopedConversations
    : childScopedConversations.filter((item) =>
        isRoleVisibleConversation(item, snapshotRole)
      );
  const visibleConversationIds = new Set(
    conversations.map((item) => item.conversationId)
  );
  const childScopedMessages = filterByChildId(
    snapshot.messages,
    authorizedChildIds,
    (item) => item.childId
  );
  const messages = isAdmin
    ? childScopedMessages
    : childScopedMessages.filter((item) =>
        visibleConversationIds.has(item.conversationId)
      );

  return {
    ...snapshot,
    children: filterChildrenForSessionUser(snapshot.children, user),
    attendance: filterByChildId(snapshot.attendance, authorizedChildIds, (item) => item.childId),
    meals: filterByChildId(snapshot.meals, authorizedChildIds, (item) => item.childId),
    growth: filterByChildId(snapshot.growth, authorizedChildIds, (item) => item.childId),
    feedback: filterByChildId(snapshot.feedback, authorizedChildIds, (item) => item.childId),
    health: filterByChildId(snapshot.health, authorizedChildIds, (item) => item.childId),
    taskCheckIns,
    interventionCards: filterByChildId(
      snapshot.interventionCards,
      authorizedChildIds,
      (item) => item.targetChildId
    ),
    consultations: filterByChildId(snapshot.consultations, authorizedChildIds, (item) => item.childId),
    mobileDrafts,
    reminders,
    tasks,
    messages,
    conversations,
    healthMaterials: filterByChildId(snapshot.healthMaterials, authorizedChildIds, (item) => item.childId),
    nutritionMenus: filterMenusForScope(snapshot.nutritionMenus, authorizedClassNames),
    storybooks: filterByChildId(snapshot.storybooks, authorizedChildIds, (item) => item.childId),
  } satisfies AppStateSnapshot;
}

export function mergeScopedSnapshotForSessionUser(params: {
  currentSnapshot: AppStateSnapshot;
  incomingSnapshot: AppStateSnapshot;
  user: Pick<SessionUser, "role" | "id" | "institutionId" | "classId" | "className" | "childIds">;
}) {
  const { currentSnapshot, incomingSnapshot, user } = params;
  // 旧版浏览器缓存可能已含其他角色队列；合并前再次投影，避免升级后继续保留越权数据。
  const scopedCurrentSnapshot = scopeSnapshotForSessionUser(currentSnapshot, user);
  const scopedIncomingSnapshot = scopeSnapshotForSessionUser(incomingSnapshot, user);

  if (user.role === ROLE_ADMIN) {
    return {
      ...scopedCurrentSnapshot,
      children: mergeItemsByKey(scopedCurrentSnapshot.children, scopedIncomingSnapshot.children, (item) => item.id),
      attendance: mergeItemsByKey(scopedCurrentSnapshot.attendance, scopedIncomingSnapshot.attendance, (item) => item.id),
      meals: mergeItemsByKey(scopedCurrentSnapshot.meals, scopedIncomingSnapshot.meals, (item) => item.id),
      growth: mergeItemsByKey(scopedCurrentSnapshot.growth, scopedIncomingSnapshot.growth, (item) => item.id),
      feedback: mergeItemsByKey(scopedCurrentSnapshot.feedback, scopedIncomingSnapshot.feedback, (item) => item.id),
      health: mergeItemsByKey(scopedCurrentSnapshot.health, scopedIncomingSnapshot.health, (item) => item.id),
      taskCheckIns: mergeItemsByKey(scopedCurrentSnapshot.taskCheckIns, scopedIncomingSnapshot.taskCheckIns, (item) => item.id),
      interventionCards: mergeItemsByKey(
        scopedCurrentSnapshot.interventionCards,
        scopedIncomingSnapshot.interventionCards,
        (item) => item.id
      ),
      consultations: mergeItemsByKey(
        scopedCurrentSnapshot.consultations,
        scopedIncomingSnapshot.consultations,
        (item) => item.consultationId
      ),
      mobileDrafts: mergeItemsByKey(
        scopedCurrentSnapshot.mobileDrafts,
        scopedIncomingSnapshot.mobileDrafts,
        (item) => item.draftId
      ),
      reminders: mergeItemsByKey(
        scopedCurrentSnapshot.reminders,
        scopedIncomingSnapshot.reminders,
        (item) => item.reminderId
      ),
      tasks: mergeItemsByKey(scopedCurrentSnapshot.tasks, scopedIncomingSnapshot.tasks, (item) => item.taskId),
      messages: mergeItemsByKey(scopedCurrentSnapshot.messages, scopedIncomingSnapshot.messages, (item) => item.messageId),
      conversations: mergeItemsByKey(
        scopedCurrentSnapshot.conversations,
        scopedIncomingSnapshot.conversations,
        (item) => item.conversationId
      ),
      healthMaterials: mergeItemsByKey(
        scopedCurrentSnapshot.healthMaterials,
        scopedIncomingSnapshot.healthMaterials,
        (item) => item.materialId
      ),
      nutritionMenus: mergeItemsByKey(
        scopedCurrentSnapshot.nutritionMenus,
        scopedIncomingSnapshot.nutritionMenus,
        (item) => item.menuId
      ),
      storybooks: mergeItemsByKey(
        scopedCurrentSnapshot.storybooks,
        scopedIncomingSnapshot.storybooks,
        (item) => item.storybookId
      ),
      updatedAt: scopedIncomingSnapshot.updatedAt,
    } satisfies AppStateSnapshot;
  }

  // 浏览器缓存可能因容量不足只保留部分 bucket；缺失项不能被解释为删除远端数据。
  // 正常账号的显式删除使用归档接口，因此这里仅在授权范围内按稳定主键 upsert。
  return {
    ...scopedCurrentSnapshot,
    children: mergeItemsByKey(
      scopedCurrentSnapshot.children,
      scopedIncomingSnapshot.children,
      (item) => item.id
    ),
    attendance: mergeItemsByKey(
      scopedCurrentSnapshot.attendance,
      scopedIncomingSnapshot.attendance,
      (item) => item.id
    ),
    meals: mergeItemsByKey(
      scopedCurrentSnapshot.meals,
      scopedIncomingSnapshot.meals,
      (item) => item.id
    ),
    growth: mergeItemsByKey(
      scopedCurrentSnapshot.growth,
      scopedIncomingSnapshot.growth,
      (item) => item.id
    ),
    feedback: mergeItemsByKey(
      scopedCurrentSnapshot.feedback,
      scopedIncomingSnapshot.feedback,
      (item) => item.id
    ),
    health: mergeItemsByKey(
      scopedCurrentSnapshot.health,
      scopedIncomingSnapshot.health,
      (item) => item.id
    ),
    taskCheckIns: mergeItemsByKey(
      scopedCurrentSnapshot.taskCheckIns,
      scopedIncomingSnapshot.taskCheckIns,
      (item) => item.id
    ),
    interventionCards: mergeItemsByKey(
      scopedCurrentSnapshot.interventionCards,
      scopedIncomingSnapshot.interventionCards,
      (item) => item.id
    ),
    consultations: mergeItemsByKey(
      scopedCurrentSnapshot.consultations,
      scopedIncomingSnapshot.consultations,
      (item) => item.consultationId
    ),
    mobileDrafts: mergeItemsByKey(
      scopedCurrentSnapshot.mobileDrafts,
      scopedIncomingSnapshot.mobileDrafts,
      (item) => item.draftId
    ),
    reminders: mergeItemsByKey(
      scopedCurrentSnapshot.reminders,
      scopedIncomingSnapshot.reminders,
      (item) => item.reminderId
    ),
    tasks: mergeItemsByKey(
      scopedCurrentSnapshot.tasks,
      scopedIncomingSnapshot.tasks,
      (item) => item.taskId
    ),
    messages: mergeItemsByKey(
      scopedCurrentSnapshot.messages,
      scopedIncomingSnapshot.messages,
      (item) => item.messageId
    ),
    conversations: mergeItemsByKey(
      scopedCurrentSnapshot.conversations,
      scopedIncomingSnapshot.conversations,
      (item) => item.conversationId
    ),
    healthMaterials: mergeItemsByKey(
      scopedCurrentSnapshot.healthMaterials,
      scopedIncomingSnapshot.healthMaterials,
      (item) => item.materialId
    ),
    nutritionMenus: mergeItemsByKey(
      scopedCurrentSnapshot.nutritionMenus,
      scopedIncomingSnapshot.nutritionMenus,
      (item) => item.menuId
    ),
    storybooks: mergeItemsByKey(
      scopedCurrentSnapshot.storybooks,
      scopedIncomingSnapshot.storybooks,
      (item) => item.storybookId
    ),
    updatedAt: scopedIncomingSnapshot.updatedAt,
  } satisfies AppStateSnapshot;
}

export function mergeScopedSnapshotIntoInstitutionSnapshot(params: {
  currentSnapshot: AppStateSnapshot;
  incomingSnapshot: AppStateSnapshot;
  user: Pick<SessionUser, "role" | "id" | "institutionId" | "classId" | "className" | "childIds">;
}) {
  const { currentSnapshot, incomingSnapshot, user } = params;
  const scopedMergedSnapshot = mergeScopedSnapshotForSessionUser({
    currentSnapshot,
    incomingSnapshot,
    user,
  });

  // 演示账号共用机构级缓存。这里只把当前角色授权范围内的增量写回完整快照，
  // 避免教师或家长登录后把其他班级、其他角色的数据从共享缓存中裁掉。
  return {
    ...currentSnapshot,
    children: mergeItemsByKey(currentSnapshot.children, scopedMergedSnapshot.children, (item) => item.id),
    attendance: mergeItemsByKey(currentSnapshot.attendance, scopedMergedSnapshot.attendance, (item) => item.id),
    meals: mergeItemsByKey(currentSnapshot.meals, scopedMergedSnapshot.meals, (item) => item.id),
    growth: mergeItemsByKey(currentSnapshot.growth, scopedMergedSnapshot.growth, (item) => item.id),
    feedback: mergeItemsByKey(currentSnapshot.feedback, scopedMergedSnapshot.feedback, (item) => item.id),
    health: mergeItemsByKey(currentSnapshot.health, scopedMergedSnapshot.health, (item) => item.id),
    taskCheckIns: mergeItemsByKey(
      currentSnapshot.taskCheckIns,
      scopedMergedSnapshot.taskCheckIns,
      (item) => item.id
    ),
    interventionCards: mergeItemsByKey(
      currentSnapshot.interventionCards,
      scopedMergedSnapshot.interventionCards,
      (item) => item.id
    ),
    consultations: mergeItemsByKey(
      currentSnapshot.consultations,
      scopedMergedSnapshot.consultations,
      (item) => item.consultationId
    ),
    mobileDrafts: mergeItemsByKey(
      currentSnapshot.mobileDrafts,
      scopedMergedSnapshot.mobileDrafts,
      (item) => item.draftId
    ),
    reminders: mergeItemsByKey(
      currentSnapshot.reminders,
      scopedMergedSnapshot.reminders,
      (item) => item.reminderId
    ),
    tasks: mergeItemsByKey(currentSnapshot.tasks, scopedMergedSnapshot.tasks, (item) => item.taskId),
    messages: mergeItemsByKey(
      currentSnapshot.messages,
      scopedMergedSnapshot.messages,
      (item) => item.messageId
    ),
    conversations: mergeItemsByKey(
      currentSnapshot.conversations,
      scopedMergedSnapshot.conversations,
      (item) => item.conversationId
    ),
    healthMaterials: mergeItemsByKey(
      currentSnapshot.healthMaterials,
      scopedMergedSnapshot.healthMaterials,
      (item) => item.materialId
    ),
    nutritionMenus: mergeItemsByKey(
      currentSnapshot.nutritionMenus,
      scopedMergedSnapshot.nutritionMenus,
      (item) => item.menuId
    ),
    storybooks: mergeItemsByKey(
      currentSnapshot.storybooks,
      scopedMergedSnapshot.storybooks,
      (item) => item.storybookId
    ),
    updatedAt: incomingSnapshot.updatedAt,
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
