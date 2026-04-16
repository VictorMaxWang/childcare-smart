import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
