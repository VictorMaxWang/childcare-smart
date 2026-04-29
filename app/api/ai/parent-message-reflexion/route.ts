import { NextResponse } from "next/server";
import type { ParentMessageReflexionRequest, ParentMessageReflexionResponse } from "@/lib/ai/types";
import { sanitizeParentMessageReflexionResponse } from "@/lib/agent/parent-message-reflexion";
import { forwardBrainRequest } from "@/lib/server/brain-client";
import { requireParentChildAccess } from "@/lib/server/parent-route-guard";

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildParentMessageFallbackResponse(
  body: ParentMessageReflexionRequest | null,
  fallbackReason = "brain-proxy-unavailable"
): ParentMessageReflexionResponse {
  const visibleChild = body?.visibleChildren?.[0];
  const childName = readString(visibleChild?.name) || "孩子";
  const issueSummary = readString(body?.issueSummary);
  const teacherNote = readString(body?.teacherNote);
  const tonightActions =
    body?.tonightHomeActions?.map((item) => item.trim()).filter(Boolean).slice(0, 4) ?? [];
  const primaryAction =
    tonightActions[0] ||
    "今晚先完成当前建议里的一个小动作，并记录孩子的反应。";
  const summary =
    issueSummary ||
    teacherNote ||
    `已先基于${childName}当前建议生成可执行的家庭沟通摘要。`;
  const evaluationMeta = {
    score: 0,
    canSend: false,
    problems: [fallbackReason],
    revisionSuggestions: [],
    iterationScores: [],
    approvedIteration: null,
    stopReason: "generator_fallback" as const,
    fallback: true,
    provider: "next-json-fallback",
    model: "parent-message-rule-fallback",
    memoryContextUsed: false,
    decision: "block" as const,
  };

  return {
    finalOutput: {
      title: `${childName}今晚家庭配合建议`,
      summary,
      tonightActions: tonightActions.length > 0 ? tonightActions : [primaryAction],
      wordingForParent: `${primaryAction} 做完后，把孩子当时的反应和是否更顺利补充给老师。`,
      whyThisMatters: "这条反馈会帮助老师明天继续观察同一个目标，避免家园两边看到的情况断开。",
      estimatedTime: "约 10-15 分钟",
      followUpWindow: "明早入园后继续观察情绪、配合度和任务完成后的变化。",
      evaluationMeta,
    },
    evaluationMeta,
    revisionCount: 0,
    source: "fallback",
    model: "parent-message-rule-fallback",
    fallback: true,
    continuityNotes: ["服务暂时不可用，已先展示本地可用建议。"],
    memoryMeta: null,
    debugIterations: null,
  };
}

export async function POST(request: Request) {
  const body = (await request.clone().json().catch(() => null)) as ParentMessageReflexionRequest | null;
  const access = await requireParentChildAccess(body?.targetChildId ?? body?.childId);
  if (access.response) {
    return access.response;
  }

  const brainForward = await forwardBrainRequest(
    request,
    "/api/v1/agents/parent/message-reflexion"
  );
  if (brainForward.response) {
    const contentType = brainForward.response.headers.get("content-type") ?? "";
    if (!brainForward.response.ok || !contentType.includes("application/json")) {
      return NextResponse.json(
        sanitizeParentMessageReflexionResponse(
          buildParentMessageFallbackResponse(
            body,
            !brainForward.response.ok ? "brain-proxy-non-ok" : "brain-proxy-invalid-json"
          )
        ),
        { status: 200 }
      );
    }

    const responseBody = (await brainForward.response.json().catch(() => null)) as ParentMessageReflexionResponse | null;
    if (!responseBody) {
      return NextResponse.json(
        sanitizeParentMessageReflexionResponse(
          buildParentMessageFallbackResponse(body, "brain-proxy-invalid-json")
        ),
        { status: 200 }
      );
    }

    return NextResponse.json(
      sanitizeParentMessageReflexionResponse(responseBody),
      {
        status: brainForward.response.status,
        headers: brainForward.response.headers,
      }
    );
  }

  return NextResponse.json(
    sanitizeParentMessageReflexionResponse(buildParentMessageFallbackResponse(body)),
    { status: 200 }
  );
}
