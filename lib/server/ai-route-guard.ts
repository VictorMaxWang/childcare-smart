import "server-only";

import type { SessionUser } from "@/lib/auth/accounts";
import { ApiRouteError, handleApiError } from "@/lib/server/api-errors";
import { DefaultAppDataRepository } from "@/lib/server/app-data-repository";
import { requireDemoSession } from "@/lib/server/session";
import { requireChildAccess, requireClassAccess, requireDirector } from "@/lib/server/scope";

type AiRouteRole = "admin" | "staff" | "teacher" | "parent";

export interface AiRouteGuardOptions {
  requiredRole?: AiRouteRole;
  allowUnscoped?: boolean;
  collectJsonClassNames?: boolean;
}

interface ScopeHints {
  childIds: Set<string>;
  classNames: Set<string>;
  requiresDirector: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function addString(target: Set<string>, value: unknown) {
  if (typeof value === "string" && value.trim()) target.add(value.trim());
}

function collectJsonScope(value: unknown, hints: ScopeHints, depth = 0, options: AiRouteGuardOptions = {}) {
  if (depth > 5) return;
  if (!isRecord(value)) return;

  addString(hints.childIds, value.childId);
  addString(hints.childIds, value.targetChildId);
  if (options.collectJsonClassNames !== false) {
    addString(hints.classNames, value.className);
    addString(hints.classNames, value.targetClassName);
  }

  if (value.scope === "institution" || value.scopeType === "institution") {
    hints.requiresDirector = true;
  }

  if (value.scope === "child") addString(hints.childIds, value.scopeId);
  if (value.scopeType === "child") addString(hints.childIds, value.scopeId);
  if (options.collectJsonClassNames !== false) {
    if (value.scope === "class") addString(hints.classNames, value.scopeId);
    if (value.scopeType === "class") addString(hints.classNames, value.scopeId);
  }

  for (const key of ["input", "payload", "snapshot", "child", "source", "voiceInput", "imageInput", "context"]) {
    collectJsonScope(value[key], hints, depth + 1, options);
  }

  const files = value.files;
  if (Array.isArray(files)) {
    for (const file of files) collectJsonScope(file, hints, depth + 1, options);
  }
}

function enforceRole(session: SessionUser, role?: AiRouteRole) {
  if (!role) return;
  if (role === "admin") {
    requireDirector(session);
    return;
  }
  if (role === "staff" && (session.role === "机构管理员" || session.role === "教师")) return;
  if (role === "teacher" && session.role === "教师") return;
  if (role === "parent" && session.role === "家长") return;

  throw new ApiRouteError("forbidden_scope", "当前账号角色无权访问该 AI 能力。");
}

async function readScopeHints(request: Request, options: AiRouteGuardOptions = {}) {
  const hints: ScopeHints = {
    childIds: new Set<string>(),
    classNames: new Set<string>(),
    requiresDirector: false,
  };

  const url = new URL(request.url);
  addString(hints.childIds, url.searchParams.get("childId"));
  addString(hints.childIds, url.searchParams.get("targetChildId"));
  addString(hints.classNames, url.searchParams.get("className"));
  addString(hints.classNames, url.searchParams.get("targetClassName"));
  if (url.searchParams.get("scope") === "institution" || url.searchParams.get("scopeType") === "institution") {
    hints.requiresDirector = true;
  }
  if (url.searchParams.get("scope") === "child" || url.searchParams.get("scopeType") === "child") {
    addString(hints.childIds, url.searchParams.get("scopeId"));
  }
  if (url.searchParams.get("scope") === "class" || url.searchParams.get("scopeType") === "class") {
    addString(hints.classNames, url.searchParams.get("scopeId"));
  }

  if (request.method === "GET" || request.method === "HEAD") return hints;

  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      collectJsonScope(await request.clone().json(), hints, 0, options);
    } else if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.clone().formData();
      addString(hints.childIds, formData.get("childId"));
      addString(hints.childIds, formData.get("targetChildId"));
      addString(hints.classNames, formData.get("className"));
      addString(hints.classNames, formData.get("targetClassName"));
    }
  } catch {
    // The route itself owns detailed body validation. Guard parsing only extracts optional scope hints.
  }

  return hints;
}

export async function authorizeAiRoute(request: Request, options: AiRouteGuardOptions = {}) {
  try {
    const session = await requireDemoSession(request);
    enforceRole(session.user, options.requiredRole);

    const hints = await readScopeHints(request, options);
    if (hints.requiresDirector) requireDirector(session.user);

    if (hints.childIds.size > 0 || hints.classNames.size > 0) {
      const snapshot = await new DefaultAppDataRepository().load(session.user);
      for (const childId of hints.childIds) requireChildAccess(session.user, snapshot, childId);
      for (const className of hints.classNames) requireClassAccess(session.user, snapshot, className);
    } else if (!options.allowUnscoped && options.requiredRole === "admin") {
      requireDirector(session.user);
    }

    return null;
  } catch (error) {
    return handleApiError(error);
  }
}
