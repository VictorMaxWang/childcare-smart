import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  SMARTCHILDCARE_PROVIDER_TRACE_HEADER,
  buildAiProviderTrace,
  buildAiProviderTraceHeader,
  type AiProviderTrace,
} from "@/lib/ai/provider-trace";
import { DefaultAppDataRepository } from "@/lib/server/app-data-repository";
import { resolveRequestSession } from "@/lib/server/session";
import { requireChildAccess } from "@/lib/server/scope";
import {
  LIN_XIAOYU_CHILD_ID,
  LIN_XIAOYU_FIXED_STORYBOOK_ID,
  getLinXiaoyuFixedStorybookPage,
  resolveLinXiaoyuChildId,
} from "@/lib/storybooks/lin-xiaoyu-bravery";
import { classifyVivoTtsError, requestVivoTts, type VivoTtsErrorKind } from "@/lib/providers/vivo";

export const runtime = "nodejs";

type TtsPayload = {
  childId?: string;
  child?: string;
  page?: number | string;
  pageId?: string;
  text?: string;
};

const MAX_BODY_BYTES = 2048;
const MAX_TEXT_CHARS = 300;

function jsonError(
  errorKind: VivoTtsErrorKind,
  message: string,
  status = 503,
  providerTrace?: AiProviderTrace
) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      errorKind,
      source: providerTrace?.source ?? "fallback",
      provider: providerTrace?.provider ?? "vivo-story-tts",
      mode: providerTrace?.mode ?? "fallback",
      fallback: true,
      fallbackReason: providerTrace?.fallbackReason ?? errorKind,
      providerTrace,
    },
    {
      status,
      headers: {
        "cache-control": "no-store",
      },
    }
  );
}

function pageFromId(pageId?: string) {
  const match = /^page-(\d{2})$/u.exec(pageId ?? "");
  if (!match) return null;
  return Number(match[1]);
}

async function readPayload(request: Request) {
  const url = new URL(request.url);
  if (request.method === "GET") {
    return {
      payload: {
        childId: url.searchParams.get("childId") ?? url.searchParams.get("child") ?? undefined,
        page: url.searchParams.get("page") ?? undefined,
        pageId: url.searchParams.get("pageId") ?? undefined,
      },
    };
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return { error: jsonError("provider-unavailable", "TTS request body is too large.", 413) };
  }

  try {
    const payload = (await request.json()) as TtsPayload;
    return { payload };
  } catch {
    return { error: jsonError("provider-unavailable", "Invalid JSON body.", 400) };
  }
}

function resolvePayload(input: TtsPayload) {
  const childId = resolveLinXiaoyuChildId(input.childId ?? input.child ?? LIN_XIAOYU_CHILD_ID);
  const pageNumber = input.page ?? pageFromId(input.pageId);
  const page = getLinXiaoyuFixedStorybookPage(pageNumber);
  if (!page) {
    return { error: jsonError("provider-unavailable", "Unknown Lin Xiaoyu storybook page.", 400) };
  }
  const frontText = typeof input.text === "string" ? input.text.trim() : "";
  if (frontText.length > MAX_TEXT_CHARS) {
    return { error: jsonError("provider-unavailable", "TTS text exceeds the fixed storybook limit.", 400) };
  }
  return { childId, page };
}

async function readStaticAudio(page: { audioSrc: string }) {
  const publicRoot = path.join(process.cwd(), "public");
  const filePath = path.join(publicRoot, page.audioSrc.replace(/^\/+/u, ""));
  const resolvedPublicRoot = path.resolve(publicRoot);
  const resolvedFilePath = path.resolve(filePath);
  if (!resolvedFilePath.startsWith(resolvedPublicRoot)) return null;
  try {
    const audio = await fs.readFile(resolvedFilePath);
    const providerTrace = buildAiProviderTrace({
      provider: "storybook-static-audio",
      source: "static",
      mode: "mock",
      fallback: false,
      fallbackReason: null,
      realProvider: false,
      capability: "tts",
      model: "lin-xiaoyu-fixed-audio",
    });
    return new Response(new Uint8Array(audio), {
      status: 200,
      headers: {
        "content-type": "audio/mpeg",
        "content-length": String(audio.byteLength),
        "cache-control": "public, max-age=31536000, immutable",
        "x-smartchildcare-tts-source": "static",
        [SMARTCHILDCARE_PROVIDER_TRACE_HEADER]: buildAiProviderTraceHeader(providerTrace),
      },
    });
  } catch {
    return null;
  }
}

async function handleTts(request: Request) {
  const session = await resolveRequestSession(request);
  if (!session) {
    return jsonError("auth/signature", "Authentication required.", 401);
  }

  const repository = new DefaultAppDataRepository();
  const snapshot = await repository.load(session.user);
  const parsedPayload = await readPayload(request);
  if ("error" in parsedPayload) return parsedPayload.error;
  const payload = parsedPayload.payload;
  const resolved = resolvePayload(payload);
  if ("error" in resolved) return resolved.error;

  if (resolved.childId !== LIN_XIAOYU_CHILD_ID) {
    return jsonError("auth/signature", "Fixed storybook child scope is not allowed.", 403);
  }
  try {
    requireChildAccess(session.user, snapshot, resolved.childId);
  } catch {
    return jsonError("auth/signature", "Current account cannot access this child storybook.", 403);
  }

  const bypassStatic = new URL(request.url).searchParams.get("bypassStatic") === "1";
  if (!bypassStatic) {
    const staticAudio = await readStaticAudio(resolved.page);
    if (staticAudio) return staticAudio;
  }

  try {
    const result = await requestVivoTts({
      text: resolved.page.text,
      childId: resolved.childId,
      storyId: LIN_XIAOYU_FIXED_STORYBOOK_ID,
      page: resolved.page.page,
      voiceStyle: "gentle child storybook narration",
    });
    const providerTrace = buildAiProviderTrace({
      provider: result.providerName,
      source: "vivo-runtime",
      mode: result.state,
      fallback: result.fallback,
      fallbackReason: result.fallback ? "provider-unavailable" : null,
      realProvider: result.isRealProvider,
      capability: "tts",
      model: `${result.engineId}/${result.voiceName}`,
      requestId: result.requestId,
      providerStatus: result.status,
    });
    return new Response(new Uint8Array(result.audioBytes), {
      status: 200,
      headers: {
        "content-type": result.audioContentType,
        "content-length": String(result.audioBytes.byteLength),
        "cache-control": "no-store",
        "x-smartchildcare-tts-source": "vivo-runtime",
        [SMARTCHILDCARE_PROVIDER_TRACE_HEADER]: buildAiProviderTraceHeader(providerTrace),
      },
    });
  } catch (error) {
    const errorKind = classifyVivoTtsError(error);
    const status = errorKind === "missing-env" ? 503 : errorKind === "auth/signature" ? 502 : 503;
    const providerTrace = buildAiProviderTrace({
      provider: "vivo-story-tts",
      source: "fallback",
      mode: "fallback",
      fallback: true,
      fallbackReason: errorKind,
      realProvider: false,
      capability: "tts",
      model: "vivo-tts",
    });
    return jsonError(errorKind, "vivo TTS is unavailable for this page.", status, providerTrace);
  }
}

export function GET(request: Request) {
  return handleTts(request);
}

export function POST(request: Request) {
  return handleTts(request);
}
