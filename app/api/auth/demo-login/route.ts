import { NextResponse } from "next/server";
import { getDemoAccountById } from "@/lib/auth/accounts";
import { setSessionCookie } from "@/lib/auth/session";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { accountId?: string };
    const account = getDemoAccountById(body.accountId ?? "");

    if (!account) {
      return NextResponse.json({ ok: false, error: "示例账号不存在" }, { status: 404 });
    }

    await setSessionCookie(account.id);
    return NextResponse.json({ ok: true, user: account });
  } catch (error) {
    console.error("[AUTH] Invalid demo login request", error);
    return NextResponse.json({ ok: false, error: "示例登录请求无效" }, { status: 400 });
  }
}
