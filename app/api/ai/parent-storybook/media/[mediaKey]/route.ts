import { readCachedParentStoryBookMedia } from "@/lib/server/parent-storybook-cache";
import {
  createBrainTransportHeaders,
  forwardBrainRequest,
} from "@/lib/server/brain-client";
import { aiRouteLimitedResponse, authorizeAiRouteSession } from "@/lib/server/ai-route-guard";
import { DefaultAppDataRepository } from "@/lib/server/app-data-repository";
import { ApiRouteError, handleApiError } from "@/lib/server/api-errors";
import { requireChildAccess } from "@/lib/server/scope";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ mediaKey: string }> }
) {
  const authResult = await authorizeAiRouteSession(request, { requiredRole: "parent", allowUnscoped: true });
  if (authResult instanceof Response) return authResult;

  const { mediaKey } = await context.params;
  const cachedMedia = readCachedParentStoryBookMedia(mediaKey);

  if (cachedMedia) {
    if (!cachedMedia.ownerChildId) {
      return aiRouteLimitedResponse({
        reason: "scope_required",
        error: "Storybook media is missing an authorized child scope.",
        requiredRole: "parent",
      });
    }

    try {
      const snapshot = await new DefaultAppDataRepository().load(authResult.session.user);
      requireChildAccess(authResult.session.user, snapshot, cachedMedia.ownerChildId);
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
  const brainForward = await forwardBrainRequest(request, targetPath);
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
