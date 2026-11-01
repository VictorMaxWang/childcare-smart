import type { AccountRole } from "./accounts";
import { resolveAuthorizedRedirectPath } from "./route-access";

/**
 * fetch登录/注册/退出改变Cookie后，必须开始新的document导航。
 * router.replace只切换RSC树，会保留上一身份预取到的拒绝重定向；仅router.refresh也不能原子清除已预取的子路径。
 * 目标继续执行原角色/同源校验，不能借恢复逻辑绕过任何权限。
 */
export function navigateAfterSessionChange(
  role: AccountRole | null,
  nextPath?: string | null,
  replaceDocument: (target: string) => void = target => window.location.replace(target),
) {
  const target = role === null ? "/login" : resolveAuthorizedRedirectPath(role, nextPath);
  replaceDocument(target);
  return target;
}
