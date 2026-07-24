import {
  createBrainTransportHeaders,
  forwardBrainRequest,
} from "@/lib/server/brain-client";
import { aiRouteLimitedResponse, authorizeAiRouteSession } from "@/lib/server/ai-route-guard";
import { ApiRouteError, handleApiError } from "@/lib/server/api-errors";
import { buildServiceScopeClaim, getSessionScope, requireScopedChild } from "@/lib/server/session-scope";
import {
  readParentStoryBookMedia,
  type ParentStoryBookMediaAsset,
} from "@/lib/server/parent-storybook-media-store";

export const runtime = "nodejs";

function parseByteRange(value: string | null, totalBytes: number) {
  if (!value) return null;
  const matched = value.match(/^bytes=(\d*)-(\d*)$/u);
  if (!matched) return { unsatisfiable: true } as const;

  const rawStart = matched[1];
  const rawEnd = matched[2];
  if (!rawStart && !rawEnd) return { unsatisfiable: true } as const;

  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
      return { unsatisfiable: true } as const;
    }
    const start = Math.max(0, totalBytes - suffixLength);
    return { start, end: totalBytes - 1, unsatisfiable: false } as const;
  }

  const start = Number(rawStart);
  const requestedEnd = rawEnd ? Number(rawEnd) : totalBytes - 1;
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(requestedEnd) ||
    start < 0 ||
    requestedEnd < start ||
    start >= totalBytes
  ) {
    return { unsatisfiable: true } as const;
  }
  return {
    start,
    end: Math.min(requestedEnd, totalBytes - 1),
    unsatisfiable: false,
  } as const;
}

export function buildStorybookMediaResponse(
  request: Request,
  media: ParentStoryBookMediaAsset
) {
  const totalBytes = media.bytes.byteLength;
  const range = parseByteRange(request.headers.get("range"), totalBytes);
  const baseHeaders = {
    "content-type": media.contentType,
    "cache-control": "private, max-age=86400, immutable",
    "accept-ranges": "bytes",
    "x-smartchildcare-storage-mode": media.storageMode,
    ...(media.expiresAt
      ? { "x-smartchildcare-storage-expires-at": media.expiresAt }
      : {}),
  };

  if (range?.unsatisfiable) {
    return new Response(null, {
      status: 416,
      headers: {
        ...baseHeaders,
        "content-range": `bytes */${totalBytes}`,
      },
    });
  }

  if (range) {
    const bytes = media.bytes.subarray(range.start, range.end + 1);
    return new Response(new Uint8Array(bytes), {
      status: 206,
      headers: {
        ...baseHeaders,
        "content-length": String(bytes.byteLength),
        "content-range": `bytes ${range.start}-${range.end}/${totalBytes}`,
      },
    });
  }

  return new Response(new Uint8Array(media.bytes), {
    status: 200,
    headers: {
      ...baseHeaders,
      "content-length": String(totalBytes),
    },
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ mediaKey: string }> }
) {
  const authResult = await authorizeAiRouteSession(request, { requiredRole: "parent", allowUnscoped: true });
  if (authResult instanceof Response) return authResult;

  const { mediaKey } = await context.params;
  const sessionScope = await getSessionScope(authResult.session);
  let cachedMedia: ParentStoryBookMediaAsset | null;
  try {
    cachedMedia = await readParentStoryBookMedia({
      mediaKey,
      institutionId: authResult.session.user.institutionId,
      allowPersistent: authResult.session.user.accountKind === "normal",
    });
  } catch {
    return handleApiError(
      new ApiRouteError(
        "provider_unavailable",
        "Storybook media storage is temporarily unavailable.",
        503
      )
    );
  }

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

    return buildStorybookMediaResponse(request, cachedMedia);
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
