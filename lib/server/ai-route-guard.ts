import "server-only";

import { NextResponse } from "next/server";
import type { SessionUser } from "@/lib/auth/accounts";
import { buildApiFailure } from "@/lib/api/errors";
import type { ApiErrorCode, ApiLimitedReason } from "@/lib/api/types";
import { ApiRouteError, handleApiError } from "@/lib/server/api-errors";
import { DefaultAppDataRepository, type AppDataRepository } from "@/lib/server/app-data-repository";
import { requireSession, type RequestSession } from "@/lib/server/session";
import { requireChildAccess, requireClassAccess } from "@/lib/server/scope";

export type AiRouteRole = "admin" | "staff" | "teacher" | "parent";

export interface AiRouteGuardOptions {
  requiredRole?: AiRouteRole;
  allowUnscoped?: boolean;
  collectJsonClassNames?: boolean;
  normalAccountAccess?: "enabled" | "demo-only";
  normalAccountLimitedReason?: ApiLimitedReason;
  requireScopedNormalSession?: boolean;
  ignoredChildIds?: readonly string[];
  repository?: AppDataRepository;
  session?: RequestSession | null;
}

export interface AuthorizedAiRoute {
  session: RequestSession;
}

interface ScopeHints {
  childIds: Set<string>;
  classNames: Set<string>;
  requiresDirector: boolean;
}

const ROLE_ADMIN = "机构管理员";
const ROLE_TEACHER = "教师";
const ROLE_PARENT = "家长";

const DEFAULT_LIMITED_ERROR = "当前账号暂时无法使用该 AI 能力。";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function addString(target: Set<string>, value: unknown) {
  if (typeof value === "string" && value.trim()) target.add(value.trim());
}

function addChildId(hints: ScopeHints, value: unknown, options: AiRouteGuardOptions) {
  if (typeof value !== "string") return;
  const childId = value.trim();
  if (!childId || options.ignoredChildIds?.includes(childId)) return;
  hints.childIds.add(childId);
}

function addRecordScope(record: unknown, hints: ScopeHints, options: AiRouteGuardOptions) {
  if (!isRecord(record)) return;
  addChildId(hints, record.id, options);
  if (options.collectJsonClassNames !== false) addString(hints.classNames, record.className);
}

function collectArrayScope(value: unknown, hints: ScopeHints, depth: number, options: AiRouteGuardOptions) {
  if (!Array.isArray(value)) return;
  for (const item of value) collectJsonScope(item, hints, depth + 1, options);
}

function collectJsonScope(value: unknown, hints: ScopeHints, depth = 0, options: AiRouteGuardOptions = {}) {
  if (depth > 7) return;
  if (Array.isArray(value)) {
    collectArrayScope(value, hints, depth, options);
    return;
  }
  if (!isRecord(value)) return;

  addChildId(hints, value.childId, options);
  addChildId(hints, value.targetChildId, options);
  addChildId(hints, value.scopeChildId, options);
  if (options.collectJsonClassNames !== false) {
    addString(hints.classNames, value.className);
    addString(hints.classNames, value.targetClassName);
  }

  addRecordScope(value.child, hints, options);
  addRecordScope(value.childProfile, hints, options);
  addRecordScope(value.currentChild, hints, options);
  addRecordScope(value.targetChild, hints, options);

  if (isRecord(value.currentUser) && options.collectJsonClassNames !== false) {
    addString(hints.classNames, value.currentUser.className);
  }

  if (value.scope === "institution" || value.scopeType === "institution") {
    hints.requiresDirector = true;
  }

  if (value.scope === "child" || value.scopeType === "child") addChildId(hints, value.scopeId, options);
  if (value.scope === "class" || value.scopeType === "class") addString(hints.classNames, value.scopeId);

  for (const key of [
    "input",
    "payload",
    "snapshot",
    "appSnapshot",
    "child",
    "childProfile",
    "source",
    "voiceInput",
    "imageInput",
    "context",
    "currentUser",
  ]) {
    collectJsonScope(value[key], hints, depth + 1, options);
  }

  for (const key of ["files", "children", "visibleChildren", "presentChildren", "targetChildren"]) {
    collectArrayScope(value[key], hints, depth + 1, options);
  }
}

function roleMatches(session: SessionUser, role?: AiRouteRole) {
  if (!role) return true;
  if (role === "admin") return session.role === ROLE_ADMIN;
  if (role === "staff") return session.role === ROLE_ADMIN || session.role === ROLE_TEACHER;
  if (role === "teacher") return session.role === ROLE_TEACHER;
  if (role === "parent") return session.role === ROLE_PARENT;
  return false;
}

function hasScopeHints(hints: ScopeHints) {
  return hints.requiresDirector || hints.childIds.size > 0 || hints.classNames.size > 0;
}

function statusForCode(code: ApiErrorCode) {
  if (code === "unauthorized") return 401;
  if (code === "limited") return 423;
  return 403;
}

function defaultCodeForLimitedReason(reason: ApiLimitedReason): Extract<ApiErrorCode, "unauthorized" | "forbidden_scope" | "limited"> {
  if (reason === "login_required") return "unauthorized";
  if (reason === "normal_session_not_enabled" || reason === "demo_seed_only" || reason === "scope_required") {
    return "limited";
  }
  return "forbidden_scope";
}

export function aiRouteLimitedResponse(
  params: {
    reason: ApiLimitedReason;
    error?: string;
    code?: Extract<ApiErrorCode, "unauthorized" | "forbidden_scope" | "limited">;
    requiredRole?: AiRouteRole | null;
    demoAvailable?: boolean;
    status?: number;
  },
  init?: ResponseInit
) {
  const code = params.code ?? defaultCodeForLimitedReason(params.reason);
  return NextResponse.json(
    {
      ...buildApiFailure(code, params.error ?? DEFAULT_LIMITED_ERROR),
      limited: true,
      reason: params.reason,
      requiredRole: params.requiredRole ?? null,
      demoAvailable: params.demoAvailable ?? true,
    },
    {
      status: params.status ?? statusForCode(code),
      headers: init?.headers,
    }
  );
}

async function resolveGuardSession(request: Request, options: AiRouteGuardOptions) {
  if (Object.prototype.hasOwnProperty.call(options, "session")) return options.session ?? null;
  return requireSession(request);
}

async function readScopeHints(request: Request, options: AiRouteGuardOptions = {}) {
  const hints: ScopeHints = {
    childIds: new Set<string>(),
    classNames: new Set<string>(),
    requiresDirector: false,
  };

  const url = new URL(request.url);
  addChildId(hints, url.searchParams.get("childId"), options);
  addChildId(hints, url.searchParams.get("targetChildId"), options);
  addString(hints.classNames, url.searchParams.get("className"));
  addString(hints.classNames, url.searchParams.get("targetClassName"));
  if (url.searchParams.get("scope") === "institution" || url.searchParams.get("scopeType") === "institution") {
    hints.requiresDirector = true;
  }
  if (url.searchParams.get("scope") === "child" || url.searchParams.get("scopeType") === "child") {
    addChildId(hints, url.searchParams.get("scopeId"), options);
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
      addChildId(hints, formData.get("childId"), options);
      addChildId(hints, formData.get("targetChildId"), options);
      addString(hints.classNames, formData.get("className"));
      addString(hints.classNames, formData.get("targetClassName"));
      if (formData.get("scope") === "institution" || formData.get("scopeType") === "institution") {
        hints.requiresDirector = true;
      }
      if (formData.get("scope") === "child" || formData.get("scopeType") === "child") {
        addChildId(hints, formData.get("scopeId"), options);
      }
      if (formData.get("scope") === "class" || formData.get("scopeType") === "class") {
        addString(hints.classNames, formData.get("scopeId"));
      }
    }
  } catch {
    // The route itself owns detailed body validation. Guard parsing only extracts optional scope hints.
  }

  return hints;
}

export async function authorizeAiRouteSession(
  request: Request,
  options: AiRouteGuardOptions = {}
): Promise<Response | AuthorizedAiRoute> {
  try {
    const session = await resolveGuardSession(request, options);
    if (!session) {
      return aiRouteLimitedResponse({
        reason: "login_required",
        error: "unauthorized or invalid session.",
        code: "unauthorized",
        requiredRole: options.requiredRole ?? null,
      });
    }

    if (!roleMatches(session.user, options.requiredRole)) {
      return aiRouteLimitedResponse({
        reason: "role_mismatch",
        error: "当前账号角色无权访问该 AI 能力。",
        requiredRole: options.requiredRole ?? null,
      });
    }

    const hints = await readScopeHints(request, options);

    if (
      session.user.accountKind !== "demo" &&
      options.normalAccountAccess === "demo-only"
    ) {
      return aiRouteLimitedResponse({
        reason: options.normalAccountLimitedReason ?? "normal_session_not_enabled",
        error: "该 AI 能力暂未开放普通账号，请使用已开放的角色化 AI 入口。",
        requiredRole: options.requiredRole ?? null,
      });
    }

    if (
      session.user.accountKind !== "demo" &&
      options.requireScopedNormalSession &&
      !hasScopeHints(hints)
    ) {
      return aiRouteLimitedResponse({
        reason: "scope_required",
        error: "普通账号访问该 AI 能力必须提供 child、class 或 institution scope。",
        requiredRole: options.requiredRole ?? null,
      });
    }

    if (hints.requiresDirector && session.user.role !== ROLE_ADMIN) {
      return aiRouteLimitedResponse({
        reason: "role_mismatch",
        error: "机构级 AI 能力仅机构管理员可访问。",
        requiredRole: "admin",
      });
    }

    if (hints.childIds.size > 0 || hints.classNames.size > 0) {
      const repository = options.repository ?? new DefaultAppDataRepository();
      const snapshot = await repository.load(session.user);

      for (const childId of hints.childIds) {
        try {
          requireChildAccess(session.user, snapshot, childId);
        } catch (error) {
          if (error instanceof ApiRouteError && (error.code === "forbidden_scope" || error.code === "not_found")) {
            return aiRouteLimitedResponse({
              reason: "forbidden_child",
              error: "当前账号无权访问该儿童数据。",
              requiredRole: options.requiredRole ?? null,
            });
          }
          throw error;
        }
      }

      for (const className of hints.classNames) {
        try {
          requireClassAccess(session.user, snapshot, className);
        } catch (error) {
          if (error instanceof ApiRouteError && error.code === "forbidden_scope") {
            return aiRouteLimitedResponse({
              reason: "forbidden_class",
              error: "当前账号无权访问该班级数据。",
              requiredRole: options.requiredRole ?? null,
            });
          }
          throw error;
        }
      }
    }

    return { session };
  } catch (error) {
    if (error instanceof ApiRouteError && error.code === "unauthorized") {
      return aiRouteLimitedResponse({
        reason: "login_required",
        error: error.message,
        code: "unauthorized",
        requiredRole: options.requiredRole ?? null,
      });
    }
    return handleApiError(error);
  }
}

export async function authorizeAiRoute(request: Request, options: AiRouteGuardOptions = {}) {
  const result = await authorizeAiRouteSession(request, options);
  return result instanceof Response ? result : null;
}
