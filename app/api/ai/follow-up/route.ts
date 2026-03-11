import { NextResponse } from "next/server";
import { requestDashscopeFollowUp } from "@/lib/ai/dashscope";
import { buildFallbackFollowUp } from "@/lib/ai/fallback";
import { buildMockAiFollowUp } from "@/lib/ai/mock";
import type { AiFollowUpPayload, AiFollowUpResponse, ChildSuggestionSnapshot } from "@/lib/ai/types";

function isValidSnapshot(snapshot: unknown): snapshot is ChildSuggestionSnapshot {
  if (!snapshot || typeof snapshot !== "object") return false;
  const obj = snapshot as Record<string, unknown>;
  if (!obj.child || typeof obj.child !== "object") return false;
  if (!obj.summary || typeof obj.summary !== "object") return false;
  if (!Array.isArray(obj.ruleFallback)) return false;
  return true;
}

function isValidPayload(payload: unknown): payload is AiFollowUpPayload {
  if (!payload || typeof payload !== "object") return false;
  const obj = payload as Record<string, unknown>;
  const history = obj.history;
  const historyValid =
    history === undefined ||
    (Array.isArray(history) &&
      history.every(
        (item) =>
          item &&
          typeof item === "object" &&
          ((item as Record<string, unknown>).role === "user" || (item as Record<string, unknown>).role === "assistant") &&
          typeof (item as Record<string, unknown>).content === "string"
      ));

  return (
    isValidSnapshot(obj.snapshot) &&
    typeof obj.suggestionTitle === "string" &&
    obj.suggestionTitle.trim().length > 0 &&
    typeof obj.question === "string" &&
    obj.question.trim().length > 0 &&
    historyValid
  );
}

export async function POST(request: Request) {
  const configuredModel = process.env.AI_MODEL || "qwen-turbo";
  const forceMock = process.env.NEXT_PUBLIC_FORCE_MOCK_MODE === "true";
  let payload: AiFollowUpPayload | null = null;

  try {
    payload = (await request.json()) as AiFollowUpPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidPayload(payload)) {
    return NextResponse.json({ error: "Invalid follow-up payload" }, { status: 400 });
  }

  if (forceMock) {
    return NextResponse.json(
      {
        ...buildMockAiFollowUp(payload),
        model: "mock-follow-up",
      } satisfies AiFollowUpResponse,
      { status: 200 }
    );
  }

  const fallback = {
    ...buildFallbackFollowUp(payload),
    model: "follow-up-rule-fallback",
  } satisfies AiFollowUpResponse;

  if (request.headers.get("x-ai-force-fallback") === "1") {
    return NextResponse.json(fallback, { status: 200 });
  }

  const aiResult = await requestDashscopeFollowUp(payload);
  if (!aiResult) {
    console.warn(`[AI] Falling back to follow-up for child ${payload.snapshot.child.id} using model ${configuredModel}.`);
    return NextResponse.json(fallback, { status: 200 });
  }

  return NextResponse.json(
    {
      ...aiResult,
      source: "ai",
      model: configuredModel,
    } satisfies AiFollowUpResponse,
    { status: 200 }
  );
}