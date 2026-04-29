import { NextResponse } from "next/server";
import { executeSuggestion, getAiRuntimeOptions, isValidSuggestionPayload } from "@/lib/ai/server";
import { buildFallbackSuggestion } from "@/lib/ai/fallback";
import type { AiSuggestionPayload, AiSuggestionResponse } from "@/lib/ai/types";
import { buildConsultationInputFromSnapshot } from "@/lib/agent/consultation/input";
import { maybeRunHighRiskConsultation } from "@/lib/agent/consultation/coordinator";
import { forwardBrainRequest } from "@/lib/server/brain-client";
import { requireParentChildAccess } from "@/lib/server/parent-route-guard";

export async function POST(request: Request) {
  let payload: AiSuggestionPayload | null = null;
  const brainRequest = request.clone();

  try {
    payload = (await request.json()) as AiSuggestionPayload;
  } catch (error) {
    console.error("[AI] Invalid suggestion payload", error);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidSuggestionPayload(payload)) {
    return NextResponse.json({ error: "Invalid snapshot payload" }, { status: 400 });
  }

  const childSnapshot =
    payload.scope !== "institution" && "child" in payload.snapshot
      ? payload.snapshot
      : null;
  const isChildScoped = childSnapshot !== null;
  const childId = childSnapshot?.child.id ?? null;
  const access = await requireParentChildAccess(childId);
  if (access.response) {
    return access.response;
  }

  const brainForward = await forwardBrainRequest(brainRequest, "/api/v1/agents/parent/suggestions");
  if (brainForward.response?.ok || (brainForward.response && !isChildScoped)) {
    return brainForward.response;
  }

  let result: AiSuggestionResponse;
  try {
    result = await executeSuggestion(payload, getAiRuntimeOptions(request));
  } catch (error) {
    if (!childSnapshot) {
      throw error;
    }
    console.warn("[AI] Parent suggestion fallback after route failure", error);
    result = buildFallbackSuggestion(childSnapshot);
  }

  let consultation: Awaited<ReturnType<typeof maybeRunHighRiskConsultation>> | null = null;
  if (childSnapshot) {
    try {
      consultation = await maybeRunHighRiskConsultation(
        buildConsultationInputFromSnapshot({
          snapshot: childSnapshot,
          suggestion: result,
          source: "api",
        })
      );
    } catch (error) {
      console.warn("[AI] Parent suggestion consultation fallback", error);
    }
  }

  if (consultation) {
    return NextResponse.json({ ...result, consultation }, { status: 200 });
  }

  return NextResponse.json(result, { status: 200 });
}
