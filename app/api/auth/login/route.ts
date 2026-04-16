import { NextResponse } from "next/server";
import { authenticateNormalAccount } from "@/lib/auth/account-server";
import { setSessionCookie } from "@/lib/auth/session";
import { AUTH_SESSION_SECRET_CONFIG_ERROR_MESSAGE, MissingAuthSessionSecretError } from "@/lib/auth/session-config";

export const runtime = "nodejs";

const INVALID_LOGIN_REQUEST_ERROR = "\u767b\u5f55\u8bf7\u6c42\u65e0\u6548\u3002";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { username?: string; password?: string };
    const result = await authenticateNormalAccount(body.username ?? "", body.password ?? "");

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }

    await setSessionCookie(result.data.id);
    return NextResponse.json({ ok: true, user: result.data });
  } catch (error) {
    if (error instanceof MissingAuthSessionSecretError) {
      return NextResponse.json({ ok: false, error: AUTH_SESSION_SECRET_CONFIG_ERROR_MESSAGE }, { status: 503 });
    }

    console.error("[AUTH] Invalid login request", error);
    return NextResponse.json({ ok: false, error: INVALID_LOGIN_REQUEST_ERROR }, { status: 400 });
  }
}
