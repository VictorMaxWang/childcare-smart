import { NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth/session";

const ALLOWED_USER_IDS = ["u-admin", "u-teacher", "u-teacher2", "u-parent"] as const;

type AllowedUserId = (typeof ALLOWED_USER_IDS)[number];

function resolvePassword(userId: AllowedUserId) {
  const specificKey = `AUTH_PASSWORD_${userId.replace(/-/g, "_").toUpperCase()}`;
  const specificPassword = process.env[specificKey]?.trim();
  if (specificPassword) return specificPassword;

  const defaultPassword = process.env.AUTH_DEFAULT_PASSWORD?.trim();
  if (defaultPassword) return defaultPassword;

  if (process.env.NODE_ENV !== "production") {
    return "123456";
  }

  throw new Error(`Missing password configuration for ${userId}`);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { userId?: string; password?: string };
    const userId = body.userId;
    const password = body.password ?? "";

    if (!userId || !ALLOWED_USER_IDS.includes(userId as AllowedUserId)) {
      return NextResponse.json({ ok: false, error: "账号不存在" }, { status: 400 });
    }

    const expectedPassword = resolvePassword(userId as AllowedUserId);
    if (!password || password !== expectedPassword) {
      return NextResponse.json({ ok: false, error: "密码错误" }, { status: 401 });
    }

    await setSessionCookie(userId);
    return NextResponse.json({ ok: true, userId });
  } catch (error) {
    console.error("[AUTH] Invalid login request", error);
    return NextResponse.json({ ok: false, error: "登录请求无效" }, { status: 400 });
  }
}
