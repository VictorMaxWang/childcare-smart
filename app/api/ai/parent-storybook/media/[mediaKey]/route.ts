import { readCachedParentStoryBookMedia } from "@/lib/server/parent-storybook-cache";
import {
  createBrainTransportHeaders,
  forwardBrainRequest,
} from "@/lib/server/brain-client";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ mediaKey: string }> }
) {
  const { mediaKey } = await context.params;
  const cachedMedia = readCachedParentStoryBookMedia(mediaKey);

  if (cachedMedia) {
    const body = new Uint8Array(cachedMedia.bytes);
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": cachedMedia.contentType,
        "cache-control": "private, max-age=900, immutable",
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
