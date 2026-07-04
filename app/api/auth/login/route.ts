import { NextResponse } from "next/server";
import { authenticateLoginAccountWithDependencies } from "@/lib/auth/account-server";
import { setSessionCookie } from "@/lib/auth/session";
import { MissingAuthSessionSecretError } from "@/lib/auth/session-config";
import type { LoginAccountInput } from "@/lib/auth/accounts";
import { logSecurityEvent } from "@/lib/server/security-log";

export const runtime = "nodejs";

const INVALID_LOGIN_REQUEST_ERROR = "\u767b\u5f55\u8bf7\u6c42\u65e0\u6548\u3002";
const LOGIN_SERVICE_UNAVAILABLE_ERROR = "\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528";

export type LoginRouteDependencies = {
  authenticate: typeof authenticateLoginAccountWithDependencies;
  setSession: typeof setSessionCookie;
};

const defaultLoginRouteDependencies: LoginRouteDependencies = {
  authenticate: authenticateLoginAccountWithDependencies,
  setSession: setSessionCookie,
};

export async function handleLoginRequest(
  request: Request,
  dependencies: LoginRouteDependencies = defaultLoginRouteDependencies
) {
  try {
    const body = (await request.json()) as LoginAccountInput;
    const result = await dependencies.authenticate(body);

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }

    await dependencies.setSession(result.data.id, result.data.role);
    return NextResponse.json({ ok: true, user: result.data });
  } catch (error) {
    if (error instanceof MissingAuthSessionSecretError) {
      return NextResponse.json({ ok: false, error: LOGIN_SERVICE_UNAVAILABLE_ERROR }, { status: 503 });
    }

    logSecurityEvent("error", "auth.login.invalid_request", { error });
    return NextResponse.json({ ok: false, error: INVALID_LOGIN_REQUEST_ERROR }, { status: 400 });
  }
}

export async function POST(request: Request) {
  return handleLoginRequest(request);
}
