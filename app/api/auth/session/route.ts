import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, userId: null }, { status: 401 });
  }
  return NextResponse.json({ ok: true, userId });
}
