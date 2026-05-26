import type { ParentStoryBookMediaStatusRequest, ParentStoryBookResponse } from "@/lib/ai/types";
import { authorizeAiRoute } from "@/lib/server/ai-route-guard";
import {
  createBrainTransportHeaders,
  forwardBrainRequest,
} from "@/lib/server/brain-client";
import { prepareParentStoryBookResponseForDelivery } from "@/lib/server/parent-storybook-cache";
import { requireDemoSession } from "@/lib/server/session";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
const ROLE_PARENT = "家长";

function resolveMediaStatusTimeoutMs() {
  const raw =
    process.env.PARENT_STORYBOOK_MEDIA_STATUS_TIMEOUT_MS ??
    process.env.PARENT_STORYBOOK_BACKEND_MEDIA_TIMEOUT_MS ??
    process.env.PARENT_STORYBOOK_BRAIN_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 1000 ? parsed : 60_000;
}

function isMediaStatusPayload(payload: unknown): payload is ParentStoryBookMediaStatusRequest {
  if (!payload || typeof payload !== "object") return false;
  const value = payload as Partial<ParentStoryBookMediaStatusRequest>;
  return (
    typeof value.childId === "string" &&
    value.childId.trim().length > 0 &&
    typeof value.storyId === "string" &&
    value.storyId.trim().length > 0 &&
    Boolean(value.story) &&
    typeof value.story === "object" &&
    value.story?.storyId === value.storyId &&
    value.story?.childId === value.childId &&
    Array.isArray(value.story?.scenes)
  );
}

function mergeHeaders(...groups: Array<HeadersInit | undefined>) {
  const headers = new Headers();

  for (const group of groups) {
    if (!group) continue;
    new Headers(group).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  headers.set("cache-control", "no-store");
  return headers;
}

async function parseRemoteStoryResponse(response: Response) {
  try {
    return (await response.json()) as ParentStoryBookResponse;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const authError = await authorizeAiRoute(request, {
    requiredRole: "parent",
    collectJsonClassNames: false,
  });
  if (authError) return authError;

  let payload: ParentStoryBookMediaStatusRequest;
  try {
    const parsed = (await request.clone().json()) as unknown;
    if (!isMediaStatusPayload(parsed)) {
      return NextResponse.json(
        { error: "Invalid parent storybook media status payload" },
        { status: 400, headers: { "cache-control": "no-store" } }
      );
    }
    payload = parsed;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: { "cache-control": "no-store" } }
    );
  }

  const sessionUser = (await requireDemoSession(request)).user;
  if (sessionUser.role !== ROLE_PARENT) {
    return NextResponse.json(
      { error: "Parent role required" },
      { status: 403, headers: { "cache-control": "no-store" } }
    );
  }
  if (!(sessionUser.childIds ?? []).includes(payload.childId)) {
    return NextResponse.json(
      { error: "Child is not authorized for current parent" },
      { status: 403, headers: { "cache-control": "no-store" } }
    );
  }

  const targetPath = "/api/v1/agents/parent/storybook/media-status";
  const brainForward = await forwardBrainRequest(request, targetPath, {
    timeoutMs: resolveMediaStatusTimeoutMs(),
  });
  if (!brainForward.response) {
    return NextResponse.json(
      {
        error: "Storybook media status unavailable",
        fallbackReason: brainForward.fallbackReason ?? "brain-proxy-unavailable",
      },
      {
        status: 503,
        headers: createBrainTransportHeaders({
          transport: "brain-proxy-error",
          targetPath,
          upstreamHost: brainForward.upstreamHost,
          fallbackReason: brainForward.fallbackReason ?? "brain-proxy-unavailable",
        }),
      }
    );
  }

  const remoteStory = await parseRemoteStoryResponse(brainForward.response.clone());
  if (!brainForward.response.ok || !remoteStory) {
    return NextResponse.json(
      {
        error: "Storybook media status failed",
        fallbackReason: !brainForward.response.ok ? "brain-proxy-non-ok" : "brain-proxy-invalid-json",
      },
      {
        status: brainForward.response.status >= 500 ? 503 : brainForward.response.status,
        headers: createBrainTransportHeaders({
          transport: "brain-proxy-error",
          targetPath,
          upstreamHost: brainForward.upstreamHost,
          fallbackReason: !brainForward.response.ok ? "brain-proxy-non-ok" : "brain-proxy-invalid-json",
        }),
      }
    );
  }

  const preparedStory = prepareParentStoryBookResponseForDelivery(remoteStory, {
    cacheState: "bypass",
  });

  return NextResponse.json(preparedStory, {
    status: 200,
    headers: mergeHeaders(
      brainForward.response.headers,
      createBrainTransportHeaders({
        transport: "remote-brain-proxy",
        targetPath,
        upstreamHost: brainForward.upstreamHost,
        fallbackReason: null,
      })
    ),
  });
}
