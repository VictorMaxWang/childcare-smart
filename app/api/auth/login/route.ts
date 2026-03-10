import { NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth/session";

const ALLOWED_USER_IDS = ["u-admin", "u-teacher", "u-parent"] as const;

type AllowedUserId = (typeof ALLOWED_USER_IDS)[number];

function resolvePassword(userId: AllowedUserId) {
  const specificKey = `AUTH_PASSWORD_${userId.replace(/-/g, "_").toUpperCase()}`;
  return process.env[specificKey] || process.env.AUTH_DEFAULT_PASSWORD || "123456";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { userId?: string; password?: string };
    const userId = body.userId as AllowedUserId;
    const password = body.password ?? "";

    if (!ALLOWED_USER_IDS.includes(userId)) {
      return NextResponse.json({ ok: false, error: "账号不存在" }, { status: 400 });
    }

    const expectedPassword = resolvePassword(userId);
    if (!password || password !== expectedPassword) {
      return NextResponse.json({ ok: false, error: "密码错误" }, { status: 401 });
    }

    await setSessionCookie(userId);
    return NextResponse.json({ ok: true, userId });
  } catch {
    return NextResponse.json({ ok: false, error: "登录请求无效" }, { status: 400 });
  }
}
