import { NextResponse } from "next/server";
import { resolveAsrProvider } from "@/lib/ai/providers";
import { buildTeacherVoiceUnderstandFallback } from "@/lib/ai/teacher-voice-understand";
import {
  createBrainTransportHeaders,
  forwardBrainRequest,
  type BrainForwardResult,
} from "@/lib/server/brain-client";

function buildLocalFallbackHeaders(brainForward: BrainForwardResult) {
  return createBrainTransportHeaders({
    transport: "next-json-fallback",
    targetPath: brainForward.targetPath,
    upstreamHost: brainForward.upstreamHost,
    fallbackReason: brainForward.fallbackReason ?? "brain-proxy-unavailable",
  });
}

function toOptionalString(value: FormDataEntryValue | unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function toOptionalNumber(value: FormDataEntryValue | unknown) {
  if (typeof value !== "string") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function POST(request: Request) {
  const brainForward = await forwardBrainRequest(request, "/api/v1/agents/teacher/voice-understand");
  if (brainForward.response) return brainForward.response;

  const headers = buildLocalFallbackHeaders(brainForward);
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const asrProvider = resolveAsrProvider();

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const audio = formData.get("audio");
    const transcript = toOptionalString(formData.get("transcript"));
    const fallbackText = toOptionalString(formData.get("fallbackText"));

    if (!(audio instanceof File) && !transcript && !fallbackText) {
      return NextResponse.json(
        { error: "Missing transcript or audio input" },
        { status: 400, headers }
      );
    }

    const attachmentName =
      toOptionalString(formData.get("attachmentName")) ||
      (audio instanceof File ? audio.name : undefined) ||
      "teacher-voice-note.webm";
    const mimeType =
      toOptionalString(formData.get("mimeType")) ||
      (audio instanceof File ? audio.type : undefined) ||
      "audio/webm";
    const durationMs = toOptionalNumber(formData.get("durationMs"));
    const scene = toOptionalString(formData.get("scene")) || "teacher-global-fab";

    const asrResult = await asrProvider.transcribe({
      attachmentName,
      fallbackText,
      transcript,
      mimeType,
      durationMs,
      scene,
    });

    return NextResponse.json(
      buildTeacherVoiceUnderstandFallback({
        transcript: asrResult.output.transcript,
        childId: toOptionalString(formData.get("childId")),
        childName: toOptionalString(formData.get("childName")),
        attachmentName,
        mimeType,
        durationMs,
        scene,
        traceId: toOptionalString(formData.get("traceId")),
        inputMode: "multipart",
        asrProvider: asrResult.provider,
        asrMode: asrResult.mode,
        asrSource: asrResult.output.source,
        asrConfidence: asrResult.output.confidence,
        asrRaw: asrResult.output.raw,
        asrMeta: asrResult.output.meta,
        asrFallback: asrResult.output.fallback,
      }),
      { status: 200, headers }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be an object" }, { status: 400, headers });
  }

  const payload = body as Record<string, unknown>;
  const transcript = toOptionalString(payload.transcript);
  const fallbackText = toOptionalString(payload.fallbackText);
  if (!transcript && !fallbackText) {
    return NextResponse.json(
      { error: "Missing transcript or audio input" },
      { status: 400, headers }
    );
  }

  const asrResult = await asrProvider.transcribe({
    attachmentName: toOptionalString(payload.attachmentName),
    fallbackText,
    transcript,
    mimeType: toOptionalString(payload.mimeType),
    durationMs:
      typeof payload.durationMs === "number" && Number.isFinite(payload.durationMs)
        ? payload.durationMs
        : undefined,
    scene: toOptionalString(payload.scene) || "teacher-global-fab",
  });

  return NextResponse.json(
    buildTeacherVoiceUnderstandFallback({
      transcript: asrResult.output.transcript,
      childId: toOptionalString(payload.childId),
      childName: toOptionalString(payload.childName),
      attachmentName: toOptionalString(payload.attachmentName),
      mimeType: toOptionalString(payload.mimeType),
      durationMs:
        typeof payload.durationMs === "number" && Number.isFinite(payload.durationMs)
          ? payload.durationMs
          : undefined,
      scene: toOptionalString(payload.scene) || "teacher-global-fab",
      traceId: toOptionalString(payload.traceId),
      inputMode: "json",
      asrProvider: asrResult.provider,
      asrMode: asrResult.mode,
      asrSource: asrResult.output.source,
      asrConfidence: asrResult.output.confidence,
      asrRaw: asrResult.output.raw,
      asrMeta: asrResult.output.meta,
      asrFallback: asrResult.output.fallback,
    }),
    { status: 200, headers }
  );
}
