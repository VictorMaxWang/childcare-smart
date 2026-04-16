import { NextResponse } from "next/server";
import type { ParentMessageReflexionRequest, ParentMessageReflexionResponse } from "@/lib/ai/types";
import { sanitizeParentMessageReflexionResponse } from "@/lib/agent/parent-message-reflexion";
import { forwardBrainRequest } from "@/lib/server/brain-client";
import { requireParentChildAccess } from "@/lib/server/parent-route-guard";

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
    if (!contentType.includes("application/json")) {
      return brainForward.response;
    }

    const responseBody = (await brainForward.response.json().catch(() => null)) as ParentMessageReflexionResponse | null;
    if (!responseBody) {
      return brainForward.response;
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
    {
      error: "当前先展示已有建议，补充说明会在服务恢复后继续更新。",
    },
    { status: 503 }
  );
}
