import type { WeeklyReportPayload, WeeklyReportRole } from "@/lib/ai/types";

export interface WeeklyReportScopeInput {
  role: WeeklyReportRole;
  institutionId?: string | null;
  className?: string | null;
  childId?: string | null;
}

export type WeeklyReportScope = Required<
  Pick<WeeklyReportPayload, "scopeType" | "scopeId">
>;

function cleanScopeId(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * 为普通账号周报补齐最小授权范围。教师缺少班级投影时仅回退到其可见幼儿，
 * 避免为了兼容存量账号而放宽服务端的 scope 校验。
 */
export function resolveWeeklyReportScope(
  input: WeeklyReportScopeInput
): WeeklyReportScope | null {
  const institutionId = cleanScopeId(input.institutionId);
  const className = cleanScopeId(input.className);
  const childId = cleanScopeId(input.childId);

  if (input.role === "admin") {
    return institutionId
      ? { scopeType: "institution", scopeId: institutionId }
      : null;
  }

  if (input.role === "teacher" && className) {
    return { scopeType: "class", scopeId: className };
  }

  return childId ? { scopeType: "child", scopeId: childId } : null;
}
