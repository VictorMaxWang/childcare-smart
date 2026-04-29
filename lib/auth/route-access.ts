import { getRoleHomePath, type AccountRole } from "@/lib/auth/accounts";

export const ACCESS_DENIED_QUERY_PARAM = "accessDenied";

const ROLE_PARENT = "家长" as AccountRole;
const ROLE_TEACHER = "教师" as AccountRole;
const ROLE_ADMIN = "机构管理员" as AccountRole;

const LOGIN_PATHS = new Set(["/login", "/auth/login"]);
const SHARED_PROTECTED_PATHS = new Set(["/children", "/health", "/growth", "/diet"]);

const KNOWN_ROLE_PREFIXES = ["/admin", "/teacher", "/parent"] as const;
const KNOWN_SHARED_PATHS = ["/", ...SHARED_PROTECTED_PATHS] as const;

function pathMatchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function stripPath(value: string) {
  const withoutHash = value.split("#")[0] ?? value;
  const withoutQuery = withoutHash.split("?")[0] ?? withoutHash;
  return withoutQuery || "/";
}

export function isAccountRole(value: unknown): value is AccountRole {
  return value === ROLE_PARENT || value === ROLE_TEACHER || value === ROLE_ADMIN;
}

export function getRequiredRoleForPath(pathname: string): AccountRole | null {
  const path = stripPath(pathname);

  if (path === "/") {
    return ROLE_ADMIN;
  }

  if (pathMatchesPrefix(path, "/admin")) {
    return ROLE_ADMIN;
  }

  if (pathMatchesPrefix(path, "/teacher")) {
    return ROLE_TEACHER;
  }

  if (pathMatchesPrefix(path, "/parent")) {
    return ROLE_PARENT;
  }

  return null;
}

export function canRoleAccessPath(role: AccountRole, pathname: string) {
  const requiredRole = getRequiredRoleForPath(pathname);
  return !requiredRole || requiredRole === role;
}

export function isKnownAppPath(pathname: string) {
  const path = stripPath(pathname);

  if (LOGIN_PATHS.has(path)) {
    return true;
  }

  if (KNOWN_SHARED_PATHS.some((knownPath) => path === knownPath)) {
    return true;
  }

  return KNOWN_ROLE_PREFIXES.some((prefix) => pathMatchesPrefix(path, prefix));
}

export function isLoginPath(pathname: string) {
  return LOGIN_PATHS.has(stripPath(pathname));
}

export function sanitizeNextPath(value: string | null | undefined) {
  const rawValue = value?.trim();

  if (!rawValue || rawValue.includes("\\") || /[\u0000-\u001f\u007f]/.test(rawValue)) {
    return null;
  }

  if (!rawValue.startsWith("/") || rawValue.startsWith("//")) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(rawValue, "https://childcare-smart.local");
  } catch {
    return null;
  }

  if (url.origin !== "https://childcare-smart.local") {
    return null;
  }

  const pathname = url.pathname || "/";
  if (
    isLoginPath(pathname) ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    !isKnownAppPath(pathname)
  ) {
    return null;
  }

  return `${pathname}${url.search}${url.hash}`;
}

export function appendAccessDeniedParam(path: string) {
  const url = new URL(path, "https://childcare-smart.local");
  url.searchParams.set(ACCESS_DENIED_QUERY_PARAM, "1");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function resolveAuthorizedRedirectPath(role: AccountRole, nextPath: string | null | undefined) {
  const sanitizedPath = sanitizeNextPath(nextPath);

  if (!sanitizedPath) {
    return getRoleHomePath(role);
  }

  if (canRoleAccessPath(role, sanitizedPath)) {
    return sanitizedPath;
  }

  return appendAccessDeniedParam(getRoleHomePath(role));
}

export function resolveUnauthorizedRedirectPath(role: AccountRole) {
  return appendAccessDeniedParam(getRoleHomePath(role));
}
