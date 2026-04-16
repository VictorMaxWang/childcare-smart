import { NextResponse } from "next/server";
import { registerNormalAccount } from "@/lib/auth/account-server";
import { setSessionCookie } from "@/lib/auth/session";
import type { RegisterAccountInput } from "@/lib/auth/accounts";
import { AUTH_SESSION_SECRET_CONFIG_ERROR_MESSAGE, MissingAuthSessionSecretError } from "@/lib/auth/session-config";

export const runtime = "nodejs";

const PASSWORD_CONFIRM_MISMATCH_ERROR = "\u4e24\u6b21\u8f93\u5165\u7684\u5bc6\u7801\u4e0d\u4e00\u81f4\u3002";
const INVALID_REGISTER_REQUEST_ERROR = "\u6ce8\u518c\u8bf7\u6c42\u65e0\u6548\u3002";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RegisterAccountInput & { confirmPassword?: string };

    if ((body.confirmPassword ?? "") !== (body.password ?? "")) {
      return NextResponse.json({ ok: false, error: PASSWORD_CONFIRM_MISMATCH_ERROR }, { status: 400 });
    }

    const result = await registerNormalAccount(body);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }

    await setSessionCookie(result.data.id);
    return NextResponse.json({ ok: true, user: result.data });
  } catch (error) {
    if (error instanceof MissingAuthSessionSecretError) {
      return NextResponse.json({ ok: false, error: AUTH_SESSION_SECRET_CONFIG_ERROR_MESSAGE }, { status: 503 });
    }

    console.error("[AUTH] Invalid register request", error);
    return NextResponse.json({ ok: false, error: INVALID_REGISTER_REQUEST_ERROR }, { status: 400 });
  }
}
