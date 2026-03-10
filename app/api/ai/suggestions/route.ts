import { NextResponse } from "next/server";
import { buildFallbackSuggestion } from "@/lib/ai/fallback";
import { requestDashscopeSuggestion } from "@/lib/ai/dashscope";
import type {
  AiSuggestionPayload,
  AiSuggestionResponse,
  ChildSuggestionSnapshot,
  RuleFallbackItem,
} from "@/lib/ai/types";

function isValidSnapshot(snapshot: unknown): snapshot is ChildSuggestionSnapshot {
  if (!snapshot || typeof snapshot !== "object") return false;
  const obj = snapshot as Record<string, unknown>;
  if (!obj.child || typeof obj.child !== "object") return false;
  if (!obj.summary || typeof obj.summary !== "object") return false;
  if (!Array.isArray(obj.ruleFallback)) return false;
  return true;
}

export async function POST(request: Request) {
  const configuredModel = process.env.AI_MODEL || "qwen-turbo";
  let payload: AiSuggestionPayload | null = null;

  try {
    payload = (await request.json()) as AiSuggestionPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload || !isValidSnapshot(payload.snapshot)) {
    return NextResponse.json({ error: "Invalid snapshot payload" }, { status: 400 });
  }

  const fallbackItems = payload.snapshot.ruleFallback as RuleFallbackItem[];
  const fallback = {
    ...buildFallbackSuggestion(fallbackItems),
    model: "rule-fallback",
  } satisfies AiSuggestionResponse;

  // Test-only switch for smoke checks without affecting normal UI flow.
  if (request.headers.get("x-ai-force-fallback") === "1") {
    return NextResponse.json(fallback, { status: 200 });
  }

  const aiResult = await requestDashscopeSuggestion(payload.snapshot);
  if (!aiResult) {
    console.warn(`[AI] Falling back to rules for child ${payload.snapshot.child.id} using model ${configuredModel}.`);
    return NextResponse.json(fallback, { status: 200 });
  }

  return NextResponse.json(
    {
      ...aiResult,
      source: "ai",
      model: configuredModel,
    } satisfies AiSuggestionResponse,
    { status: 200 }
  );
}
