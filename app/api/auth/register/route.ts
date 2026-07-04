import { NextResponse } from "next/server";
import { registerNormalAccount } from "@/lib/auth/account-server";
import { setSessionCookie } from "@/lib/auth/session";
import { getRoleHomePath, type RegisterAccountInput, type SessionUser } from "@/lib/auth/accounts";
import { AUTH_SESSION_SECRET_CONFIG_ERROR_MESSAGE, MissingAuthSessionSecretError } from "@/lib/auth/session-config";
import { logSecurityEvent } from "@/lib/server/security-log";

export const runtime = "nodejs";

const PASSWORD_CONFIRM_MISMATCH_ERROR = "\u4e24\u6b21\u8f93\u5165\u7684\u5bc6\u7801\u4e0d\u4e00\u81f4\u3002";
const INVALID_REGISTER_REQUEST_ERROR = "\u6ce8\u518c\u8bf7\u6c42\u65e0\u6548\u3002";

export type RegisterRouteDependencies = {
  registerAccount: typeof registerNormalAccount;
  setSession: typeof setSessionCookie;
};

const defaultRegisterRouteDependencies: RegisterRouteDependencies = {
  registerAccount: registerNormalAccount,
  setSession: setSessionCookie,
};

function sanitizeRegisteredUser(user: SessionUser) {
  const safeUser = { ...user } as SessionUser & {
    password_hash?: unknown;
    passwordHash?: unknown;
  };
  delete safeUser.password_hash;
  delete safeUser.passwordHash;
  return safeUser;
}

export async function handleRegisterRequest(
  request: Request,
  dependencies: RegisterRouteDependencies = defaultRegisterRouteDependencies
) {
  try {
    const body = (await request.json()) as RegisterAccountInput & { confirmPassword?: string };
    const password = typeof body.password === "string" ? body.password : undefined;
    const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : undefined;

    if (!password || !confirmPassword || confirmPassword !== password) {
      return NextResponse.json({ ok: false, error: PASSWORD_CONFIRM_MISMATCH_ERROR }, { status: 400 });
    }

    const result = await dependencies.registerAccount(body);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }

    const user = sanitizeRegisteredUser(result.data);
    await dependencies.setSession(user.id, user.role);
    return NextResponse.json({ ok: true, user, redirectPath: getRoleHomePath(user.role) });
  } catch (error) {
    if (error instanceof MissingAuthSessionSecretError) {
      return NextResponse.json({ ok: false, error: AUTH_SESSION_SECRET_CONFIG_ERROR_MESSAGE }, { status: 503 });
    }

    logSecurityEvent("error", "auth.register.invalid_request", { error });
    return NextResponse.json({ ok: false, error: INVALID_REGISTER_REQUEST_ERROR }, { status: 400 });
  }
}

export async function POST(request: Request) {
  return handleRegisterRequest(request);
}
