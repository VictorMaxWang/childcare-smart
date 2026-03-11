import { NextResponse } from "next/server";
import { requestDashscopeWeeklyReport } from "@/lib/ai/dashscope";
import { buildFallbackWeeklyReport } from "@/lib/ai/fallback";
import { buildMockWeeklyReport } from "@/lib/ai/mock";
import type { WeeklyReportPayload, WeeklyReportResponse, WeeklyReportSnapshot } from "@/lib/ai/types";

function isValidSnapshot(snapshot: unknown): snapshot is WeeklyReportSnapshot {
  if (!snapshot || typeof snapshot !== "object") return false;
  const obj = snapshot as Record<string, unknown>;
  return Boolean(obj.institutionName && obj.periodLabel && obj.overview && obj.diet);
}

export async function POST(request: Request) {
  const configuredModel = process.env.AI_MODEL || "qwen-turbo";
  const forceMock = process.env.NEXT_PUBLIC_FORCE_MOCK_MODE === "true";
  let payload: WeeklyReportPayload | null = null;

  try {
    payload = (await request.json()) as WeeklyReportPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload || !isValidSnapshot(payload.snapshot)) {
    return NextResponse.json({ error: "Invalid snapshot payload" }, { status: 400 });
  }

  if (forceMock) {
    return NextResponse.json(
      {
        ...buildMockWeeklyReport(payload.snapshot),
        model: "mock-weekly-report",
      } satisfies WeeklyReportResponse,
      { status: 200 }
    );
  }

  const fallback = {
    ...buildFallbackWeeklyReport(payload.snapshot),
    model: "weekly-rule-fallback",
  } satisfies WeeklyReportResponse;

  if (request.headers.get("x-ai-force-fallback") === "1") {
    return NextResponse.json(fallback, { status: 200 });
  }

  const aiResult = await requestDashscopeWeeklyReport(payload.snapshot);
  if (!aiResult) {
    console.warn(`[AI] Falling back to weekly report rules using model ${configuredModel}.`);
    return NextResponse.json(fallback, { status: 200 });
  }

  return NextResponse.json(
    {
      ...aiResult,
      source: "ai",
      model: configuredModel,
    } satisfies WeeklyReportResponse,
    { status: 200 }
  );
}
