import { NextResponse } from "next/server";
import { authenticateNormalAccount } from "@/lib/auth/account-server";
import { setSessionCookie } from "@/lib/auth/session";

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
    console.error("[AUTH] Invalid login request", error);
    return NextResponse.json({ ok: false, error: "登录请求无效" }, { status: 400 });
  }
}
