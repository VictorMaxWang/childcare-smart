import { readCachedParentStoryBookMedia } from "@/lib/server/parent-storybook-cache";
import {
  createBrainTransportHeaders,
  forwardBrainRequest,
} from "@/lib/server/brain-client";
import { authorizeAiRoute } from "@/lib/server/ai-route-guard";
import { resolveRequestSession } from "@/lib/server/session";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ mediaKey: string }> }
) {
  const authError = await authorizeAiRoute(request, { requiredRole: "parent", allowUnscoped: true });
  if (authError) return authError;

  const { mediaKey } = await context.params;
  const cachedMedia = readCachedParentStoryBookMedia(mediaKey);

  if (cachedMedia) {
    const session = await resolveRequestSession(request);
    if (
      !session ||
      !cachedMedia.ownerChildId ||
      !(session.user.childIds ?? []).includes(cachedMedia.ownerChildId)
    ) {
      return new Response("storybook media forbidden", { status: 403 });
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
