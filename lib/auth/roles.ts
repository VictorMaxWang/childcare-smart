export type AppRole = "家长" | "教师" | "机构管理员";

export function isRole(value: string): value is AppRole {
  return value === "家长" || value === "教师" || value === "机构管理员";
}

export function canManageChildren(role: AppRole) {
  return role === "教师" || role === "机构管理员";
}

export function canViewInstitutionBoard(role: AppRole) {
  return role === "机构管理员";
}
