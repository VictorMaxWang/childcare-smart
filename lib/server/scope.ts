import type { SessionUser } from "@/lib/auth/accounts";
import type { ApiExtendedSnapshot, ApiTeacher } from "@/lib/api/types";
import type { AppStateSnapshot } from "@/lib/persistence/snapshot";
import { ApiRouteError } from "@/lib/server/api-errors";

type SnapshotChild = AppStateSnapshot["children"][number];

const ROLE_ADMIN = "机构管理员";
const ROLE_TEACHER = "教师";
const ROLE_PARENT = "家长";

function readParentChildIds(session: Pick<SessionUser, "childIds">) {
  return new Set((session.childIds ?? []).filter((childId) => typeof childId === "string" && childId.length > 0));
}

export function findChild(snapshot: Pick<ApiExtendedSnapshot, "children">, childId: string) {
  return snapshot.children.find((child) => child.id === childId) ?? null;
}

export function canAccessChild(
  session: Pick<SessionUser, "role" | "id" | "institutionId" | "className" | "childIds">,
  child: SnapshotChild | null | undefined
) {
  if (!child || child.institutionId !== session.institutionId) return false;
  if (session.role === ROLE_ADMIN) return true;
  if (session.role === ROLE_TEACHER) return child.className === session.className;

  if (session.role === ROLE_PARENT) {
    const explicitChildIds = readParentChildIds(session);
    return explicitChildIds.size > 0 ? explicitChildIds.has(child.id) : child.parentUserId === session.id;
  }

  return false;
}

export function requireChildAccess(session: SessionUser, snapshot: Pick<ApiExtendedSnapshot, "children">, childId: string) {
  const child = findChild(snapshot, childId);
  if (!child) {
    throw new ApiRouteError("not_found", "未找到儿童档案。");
  }
  if (!canAccessChild(session, child)) {
    throw new ApiRouteError("forbidden_scope", "当前账号无权访问该儿童数据。");
  }
  return child;
}

export function canAccessClass(session: SessionUser, snapshot: Pick<ApiExtendedSnapshot, "children">, className: string) {
  if (!className) return false;
  if (session.role === ROLE_ADMIN) {
    return snapshot.children.some((child) => child.institutionId === session.institutionId && child.className === className);
  }
  if (session.role === ROLE_TEACHER) {
    return session.className === className;
  }
  return false;
}

export function requireClassAccess(session: SessionUser, snapshot: Pick<ApiExtendedSnapshot, "children">, className: string) {
  if (!canAccessClass(session, snapshot, className)) {
    throw new ApiRouteError("forbidden_scope", "当前账号无权访问该班级数据。");
  }
}

export function canAccessTeacher(session: SessionUser, teacher: ApiTeacher | null | undefined) {
  if (!teacher || teacher.institutionId !== session.institutionId) return false;
  if (session.role === ROLE_ADMIN) return true;
  if (session.role === ROLE_TEACHER) return teacher.userId === session.id || teacher.teacherId === session.id;
  return false;
}

export function requireTeacherAccess(session: SessionUser, teacher: ApiTeacher | null | undefined) {
  if (!teacher) {
    throw new ApiRouteError("not_found", "未找到教师档案。");
  }
  if (!canAccessTeacher(session, teacher)) {
    throw new ApiRouteError("forbidden_scope", "当前账号无权访问该教师数据。");
  }
  return teacher;
}

export function canManageDirectorResource(session: Pick<SessionUser, "role">) {
  return session.role === ROLE_ADMIN;
}

export function requireDirector(session: Pick<SessionUser, "role">) {
  if (!canManageDirectorResource(session)) {
    throw new ApiRouteError("forbidden_scope", "当前操作仅机构管理员可执行。");
  }
}

export function canModifyRecord(
  session: SessionUser,
  snapshot: Pick<ApiExtendedSnapshot, "children">,
  record: { childId?: string } | null | undefined
) {
  if (!record?.childId) return false;
  const child = findChild(snapshot, record.childId);
  if (!canAccessChild(session, child)) return false;
  return session.role === ROLE_ADMIN || session.role === ROLE_TEACHER;
}

export function requireRecordModifyAccess(
  session: SessionUser,
  snapshot: Pick<ApiExtendedSnapshot, "children">,
  record: { childId?: string } | null | undefined
) {
  if (!record) {
    throw new ApiRouteError("not_found", "未找到记录。");
  }
  if (!canModifyRecord(session, snapshot, record)) {
    throw new ApiRouteError("forbidden_scope", "当前账号无权修改该记录。");
  }
}

export function canViewFeedback(
  session: SessionUser,
  snapshot: Pick<ApiExtendedSnapshot, "children">,
  feedback: { childId?: string } | null | undefined
) {
  if (!feedback?.childId) return false;
  return canAccessChild(session, findChild(snapshot, feedback.childId));
}

export function requireFeedbackViewAccess(
  session: SessionUser,
  snapshot: Pick<ApiExtendedSnapshot, "children">,
  feedback: { childId?: string } | null | undefined
) {
  if (!feedback) {
    throw new ApiRouteError("not_found", "未找到反馈。");
  }
  if (!canViewFeedback(session, snapshot, feedback)) {
    throw new ApiRouteError("forbidden_scope", "当前账号无权访问该反馈。");
  }
}

export function canReplyConversation(
  session: SessionUser,
  snapshot: Pick<ApiExtendedSnapshot, "children">,
  conversation: { childId?: string } | null | undefined
) {
  if (!conversation?.childId) return false;
  return canAccessChild(session, findChild(snapshot, conversation.childId));
}

export function requireConversationReplyAccess(
  session: SessionUser,
  snapshot: Pick<ApiExtendedSnapshot, "children">,
  conversation: { childId?: string } | null | undefined
) {
  if (!conversation) {
    throw new ApiRouteError("not_found", "未找到会话。");
  }
  if (!canReplyConversation(session, snapshot, conversation)) {
    throw new ApiRouteError("forbidden_scope", "当前账号无权回复该会话。");
  }
}
