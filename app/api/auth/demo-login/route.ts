import { NextResponse } from "next/server";
import { getDemoAccountById } from "@/lib/auth/accounts";
import { setSessionCookie } from "@/lib/auth/session";
import { AUTH_SESSION_SECRET_CONFIG_ERROR_MESSAGE, MissingAuthSessionSecretError } from "@/lib/auth/session-config";

export const runtime = "nodejs";

const DEMO_ACCOUNT_NOT_FOUND_ERROR = "\u793a\u4f8b\u8d26\u53f7\u4e0d\u5b58\u5728\u3002";
const INVALID_DEMO_LOGIN_REQUEST_ERROR = "\u793a\u4f8b\u767b\u5f55\u8bf7\u6c42\u65e0\u6548\u3002";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { accountId?: string };
    const account = getDemoAccountById(body.accountId ?? "");

    if (!account) {
      return NextResponse.json({ ok: false, error: DEMO_ACCOUNT_NOT_FOUND_ERROR }, { status: 404 });
    }

    await setSessionCookie(account.id);
    return NextResponse.json({ ok: true, user: account });
  } catch (error) {
    if (error instanceof MissingAuthSessionSecretError) {
      return NextResponse.json({ ok: false, error: AUTH_SESSION_SECRET_CONFIG_ERROR_MESSAGE }, { status: 503 });
    }

    console.error("[AUTH] Invalid demo login request", error);
    return NextResponse.json({ ok: false, error: INVALID_DEMO_LOGIN_REQUEST_ERROR }, { status: 400 });
  }
}
