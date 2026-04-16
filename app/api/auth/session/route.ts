import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/account-server";
import { AUTH_SESSION_SECRET_CONFIG_ERROR_MESSAGE, MissingAuthSessionSecretError } from "@/lib/auth/session-config";
import { DATABASE_URL_CONFIG_ERROR_MESSAGE, DatabaseConfigError } from "@/lib/db/server";

export const runtime = "nodejs";

const SESSION_LOAD_FAILED_ERROR = "\u52a0\u8f7d\u4f1a\u8bdd\u5931\u8d25\u3002";

export async function GET() {
  try {
    const user = await getCurrentSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, user: null }, { status: 401 });
    }
    return NextResponse.json({ ok: true, user });
  } catch (error) {
    if (error instanceof MissingAuthSessionSecretError) {
      return NextResponse.json({ ok: false, user: null, error: AUTH_SESSION_SECRET_CONFIG_ERROR_MESSAGE }, { status: 503 });
    }

    if (error instanceof DatabaseConfigError) {
      return NextResponse.json({ ok: false, user: null, error: DATABASE_URL_CONFIG_ERROR_MESSAGE }, { status: 503 });
    }

    console.error("[AUTH] Failed to load session", error);
    return NextResponse.json({ ok: false, user: null, error: SESSION_LOAD_FAILED_ERROR }, { status: 500 });
  }
}
