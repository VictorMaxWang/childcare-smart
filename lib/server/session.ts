import { getCurrentSessionUser } from "@/lib/auth/account-server";
import { getDemoAccountById, type SessionUser } from "@/lib/auth/accounts";
import { ApiRouteError } from "@/lib/server/api-errors";

export interface RequestSession {
  user: SessionUser;
  source: "cookie" | "demo-header";
}

export async function resolveRequestSession(request: Request): Promise<RequestSession | null> {
  const cookieUser = await getCurrentSessionUser();
  if (cookieUser) {
    return { user: cookieUser, source: "cookie" };
  }

  const headerAccountId = request.headers.get("x-demo-account-id")?.trim();
  if (headerAccountId) {
    const demoUser = getDemoAccountById(headerAccountId);
    if (demoUser) {
      return { user: demoUser, source: "demo-header" };
    }
  }

  return null;
}

export async function requireSession(request: Request) {
  const session = await resolveRequestSession(request);
  if (!session) {
    throw new ApiRouteError("unauthorized", "未登录或会话无效。");
  }
  return session;
}

export async function requireDemoSession(request: Request) {
  const session = await requireSession(request);
  if (session.user.accountKind !== "demo") {
    throw new ApiRouteError("forbidden_scope", "当前接口需要示例账号上下文。");
  }
  return session;
}
