import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/account-server";

export async function GET() {
  const user = await getCurrentSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, user: null }, { status: 401 });
  }
  return NextResponse.json({ ok: true, user });
}
