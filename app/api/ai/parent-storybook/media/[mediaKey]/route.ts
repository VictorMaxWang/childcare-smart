import { readCachedParentStoryBookMedia } from "@/lib/server/parent-storybook-cache";
import {
  createBrainTransportHeaders,
  forwardBrainRequest,
} from "@/lib/server/brain-client";
import { aiRouteLimitedResponse, authorizeAiRouteSession } from "@/lib/server/ai-route-guard";
import { ApiRouteError, handleApiError } from "@/lib/server/api-errors";
import { buildServiceScopeClaim, getSessionScope, requireScopedChild } from "@/lib/server/session-scope";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ mediaKey: string }> }
) {
  const authResult = await authorizeAiRouteSession(request, { requiredRole: "parent", allowUnscoped: true });
  if (authResult instanceof Response) return authResult;

  const { mediaKey } = await context.params;
  const cachedMedia = readCachedParentStoryBookMedia(mediaKey);
  const sessionScope = await getSessionScope(authResult.session);

  if (cachedMedia) {
    if (!cachedMedia.ownerChildId) {
      return aiRouteLimitedResponse({
        reason: "scope_required",
        error: "Storybook media is missing an authorized child scope.",
        requiredRole: "parent",
      });
    }

    try {
      requireScopedChild(sessionScope, cachedMedia.ownerChildId);
    } catch (error) {
      if (error instanceof ApiRouteError && (error.code === "forbidden_scope" || error.code === "not_found")) {
        return aiRouteLimitedResponse({
          reason: "forbidden_child",
          error: "当前账号无权访问该绘本媒体。",
          requiredRole: "parent",
        });
      }
      return handleApiError(error);
    }

    const body = new Uint8Array(cachedMedia.bytes);
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": cachedMedia.contentType,
        "cache-control": "private, max-age=900, immutable",
        "x-smartchildcare-storage-mode": "cached_media",
        "x-smartchildcare-storage-expires-at": cachedMedia.expiresAt,
        ...(cachedMedia.contentType.startsWith("audio/")
          ? { "accept-ranges": "bytes" }
          : {}),
      },
    });
  }

  const targetPath = `/api/v1/agents/parent/storybook/media/${encodeURIComponent(mediaKey)}`;
  if (authResult.session.user.accountKind !== "demo") {
    return new Response("storybook media unavailable", {
      status: 404,
      headers: createBrainTransportHeaders({
        transport: "next-json-fallback",
        targetPath,
        fallbackReason: "storybook-media-owner-scope-required",
      }),
    });
  }

  const brainForward = await forwardBrainRequest(request, targetPath, {
    serviceScope: buildServiceScopeClaim(sessionScope),
  });
  if (brainForward.response) return brainForward.response;

  return new Response("storybook media unavailable", {
    status: 404,
    headers: createBrainTransportHeaders({
      transport: "next-json-fallback",
      targetPath,
      upstreamHost: brainForward.upstreamHost,
      fallbackReason: brainForward.fallbackReason ?? "brain-proxy-unavailable",
    }),
  });
}
