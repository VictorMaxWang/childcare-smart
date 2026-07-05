import { NextResponse } from "next/server";
import {
  buildAiProviderUnavailableBody,
  executeSuggestion,
  getAiRuntimeOptions,
  isAiProviderUnavailableError,
  isValidSuggestionPayload,
} from "@/lib/ai/server";
import type { AiSuggestionPayload, AiSuggestionResponse } from "@/lib/ai/types";
import { buildConsultationInputFromSnapshot } from "@/lib/agent/consultation/input";
import { maybeRunHighRiskConsultation } from "@/lib/agent/consultation/coordinator";
import { forwardBrainRequest } from "@/lib/server/brain-client";
import { aiRouteLimitedResponse, authorizeAiRouteSession } from "@/lib/server/ai-route-guard";
import { ApiRouteError } from "@/lib/server/api-errors";
import {
  buildChildSuggestionSnapshotFromScope,
  buildParentSuggestionPayloadFromScope,
} from "@/lib/server/ai-scoped-payloads";
import {
  buildServiceScopeClaim,
  getSessionScope,
  requireScopedChild,
} from "@/lib/server/session-scope";
import { logSecurityEvent } from "@/lib/server/security-log";

export async function POST(request: Request) {
  const authResult = await authorizeAiRouteSession(request, {
    requiredRole: "parent",
    collectJsonClassNames: false,
  });
  if (authResult instanceof Response) return authResult;

  let payload: AiSuggestionPayload | null = null;

  try {
    payload = (await request.json()) as AiSuggestionPayload;
  } catch (error) {
    logSecurityEvent("error", "ai.suggestions.invalid_payload", { error });
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
  if (!childId) {
    return aiRouteLimitedResponse({
      reason: "scope_required",
      error: "Child scope is required for parent suggestions.",
      requiredRole: "parent",
    });
  }

  const sessionScope = await getSessionScope(authResult.session);
  try {
    requireScopedChild(sessionScope, childId);
  } catch (error) {
    if (error instanceof ApiRouteError && (error.code === "forbidden_scope" || error.code === "not_found")) {
      return aiRouteLimitedResponse({
        reason: "forbidden_child",
        error: "Current account cannot access this child suggestion scope.",
        requiredRole: "parent",
      });
    }
    throw error;
  }
  const trustedChildSnapshot = buildChildSuggestionSnapshotFromScope(sessionScope, childId);
  if (!trustedChildSnapshot) {
    return aiRouteLimitedResponse({
      reason: "forbidden_child",
      error: "Current account cannot access this child suggestion scope.",
      requiredRole: "parent",
    });
  }
  const trustedPayload = buildParentSuggestionPayloadFromScope(payload, trustedChildSnapshot);
  const brainRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(trustedPayload),
  });

  const brainForward = await forwardBrainRequest(brainRequest, "/api/v1/agents/parent/suggestions", {
    serviceScope: buildServiceScopeClaim(sessionScope),
  });
  if (brainForward.response?.ok || (brainForward.response && !isChildScoped)) {
    return brainForward.response;
  }

  let result: AiSuggestionResponse;
  try {
    result = await executeSuggestion(trustedPayload, getAiRuntimeOptions(request));
  } catch (error) {
    if (isAiProviderUnavailableError(error)) {
      return NextResponse.json(buildAiProviderUnavailableBody(error), { status: error.status });
    }
    throw error;
  }

  let consultation: Awaited<ReturnType<typeof maybeRunHighRiskConsultation>> | null = null;
  if (trustedChildSnapshot) {
    try {
      consultation = await maybeRunHighRiskConsultation(
        buildConsultationInputFromSnapshot({
          snapshot: trustedChildSnapshot,
          suggestion: result,
          source: "api",
        })
      );
    } catch (error) {
      logSecurityEvent("warn", "ai.suggestions.consultation_fallback", { error });
    }
  }

  if (consultation) {
    return NextResponse.json({ ...result, consultation }, { status: 200 });
  }

  return NextResponse.json(result, { status: 200 });
}
