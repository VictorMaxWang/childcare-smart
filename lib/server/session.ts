import { getCurrentSessionUser } from "@/lib/auth/account-server";
import { getDemoAccountById, type SessionUser } from "@/lib/auth/accounts";
import { ApiRouteError } from "@/lib/server/api-errors";

export interface RequestSession {
  user: SessionUser;
  source: "cookie" | "demo-header";
}

export const DEMO_HEADER_DISABLED_IN_PRODUCTION_ERROR = "demo header disabled in production";

export function isDemoHeaderSessionAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.ONLINE_SMOKE_ALLOW_DEMO_HEADER === "1";
}

export async function resolveRequestSession(request: Request): Promise<RequestSession | null> {
  const headerAccountId = request.headers.get("x-demo-account-id")?.trim();
  if (headerAccountId) {
    if (!isDemoHeaderSessionAllowed()) {
      throw new ApiRouteError("unauthorized", DEMO_HEADER_DISABLED_IN_PRODUCTION_ERROR);
    }

    const demoUser = getDemoAccountById(headerAccountId);
    if (demoUser) {
      return { user: demoUser, source: "demo-header" };
    }
  }

  const cookieUser = await getCurrentSessionUser();
  if (cookieUser) {
    return { user: cookieUser, source: "cookie" };
  }

  return null;
}

export async function requireSession(request: Request) {
  const session = await resolveRequestSession(request);
  if (!session) {
    throw new ApiRouteError("unauthorized", "unauthorized or invalid session.");
  }
  return session;
}

export async function requireDemoSession(request: Request) {
  const session = await requireSession(request);
  if (session.user.accountKind !== "demo") {
    throw new ApiRouteError("forbidden_scope", "demo session required.");
  }
  return session;
}