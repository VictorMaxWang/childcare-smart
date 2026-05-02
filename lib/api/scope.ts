import type { SessionUser } from "@/lib/auth/accounts";

export function isDirector(user: Pick<SessionUser, "role"> | null | undefined) {
  return user?.role === "机构管理员";
}

export function isTeacher(user: Pick<SessionUser, "role"> | null | undefined) {
  return user?.role === "教师";
}

export function isParent(user: Pick<SessionUser, "role"> | null | undefined) {
  return user?.role === "家长";
}
