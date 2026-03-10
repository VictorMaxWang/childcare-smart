import { NextResponse } from "next/server";
import { getRuntimeMode } from "@/lib/runtime/mode";

export async function GET() {
  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    mode: getRuntimeMode(),
    service: "childcare-smart",
  });
}
