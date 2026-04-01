import { NextResponse } from "next/server";
import { registerNormalAccount } from "@/lib/auth/account-server";
import { setSessionCookie } from "@/lib/auth/session";
import type { RegisterAccountInput } from "@/lib/auth/accounts";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RegisterAccountInput & { confirmPassword?: string };

    if ((body.confirmPassword ?? "") !== (body.password ?? "")) {
      return NextResponse.json({ ok: false, error: "两次输入的密码不一致。" }, { status: 400 });
    }

    const result = await registerNormalAccount(body);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }

    await setSessionCookie(result.data.id);
    return NextResponse.json({ ok: true, user: result.data });
  } catch (error) {
    console.error("[AUTH] Invalid register request", error);
    return NextResponse.json({ ok: false, error: "注册请求无效" }, { status: 400 });
  }
}
