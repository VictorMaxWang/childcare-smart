import { NextResponse } from "next/server";
import { resolveAsrProvider } from "@/lib/ai/providers";
import { buildAiProviderTrace } from "@/lib/ai/provider-trace";
import { authorizeAiRoute } from "@/lib/server/ai-route-guard";
import { apiError } from "@/lib/server/api-errors";
import { VivoProviderError } from "@/lib/providers/vivo";
import { buildVoiceUploadResponse } from "@/lib/mobile/voice-assistant-upload";

function toNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function POST(request: Request) {
  const authError = await authorizeAiRoute(request, { requiredRole: "staff" });
  if (authError) return authError;

  const formData = await request.formData();
  const audio = formData.get("audio");

  if (!(audio instanceof File)) {
    return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
  }

  const attachmentName =
    (typeof formData.get("attachmentName") === "string"
      ? String(formData.get("attachmentName")).trim()
      : "") ||
    audio.name ||
    "teacher-voice-note.webm";
  const fallbackText =
    typeof formData.get("fallbackText") === "string"
      ? String(formData.get("fallbackText")).trim()
      : undefined;
  const asrProvider = resolveAsrProvider();
  const providerStatus = asrProvider.getStatus();

  try {
    const asrResult = await asrProvider.transcribe({
      attachmentName,
      audioBytes: Buffer.from(await audio.arrayBuffer()),
      fallbackText,
      mimeType:
        (typeof formData.get("mimeType") === "string"
          ? String(formData.get("mimeType"))
          : undefined) || audio.type || "audio/webm",
      durationMs: toNumber(formData.get("durationMs")),
      scene:
        typeof formData.get("scene") === "string"
          ? String(formData.get("scene"))
          : "teacher-global-fab",
    });

    if (asrResult.source === "provider_unavailable" && !asrResult.output.transcript.trim()) {
      const providerTrace = buildAiProviderTrace({
        provider: asrResult.provider,
        source: asrResult.source,
        mode: "fallback",
        fallback: true,
        fallbackReason: "provider-unavailable",
        realProvider: false,
        capability: "asr",
        providerStatus: asrResult.output.providerStatus,
        extra: {
          workflow: "teacher-voice-upload",
        },
      });
      return NextResponse.json(
        {
          ok: false,
          code: "provider_unavailable",
          error:
            "ASR provider is unavailable; use browser speech recognition or text fallback.",
          source: asrResult.source,
          provider: asrResult.provider,
          mode: providerTrace.mode,
          fallback: providerTrace.fallback,
          fallbackReason: providerTrace.fallbackReason,
          providerTrace,
          status: asrResult.output.providerStatus,
          warnings: asrResult.output.warnings,
        },
        { status: 503 }
      );
    }

    const fallbackReason = asrResult.output.fallback
      ? asrResult.output.source === "provided_transcript"
        ? "provided-transcript"
        : asrResult.output.source === "text_fallback"
          ? "text-fallback"
          : "provider-unavailable"
      : null;
    const providerTrace = buildAiProviderTrace({
      provider: asrResult.provider,
      source: asrResult.source,
      mode: asrResult.mode,
      fallback: asrResult.output.fallback,
      fallbackReason,
      realProvider: asrResult.mode === "live" && !asrResult.output.fallback,
      capability: "asr",
      model: asrResult.provider,
      providerStatus: asrResult.output.providerStatus,
      extra: {
        workflow: "teacher-voice-upload",
      },
    });

    return NextResponse.json(
      buildVoiceUploadResponse({
        attachmentName,
        transcript: asrResult.output.transcript,
        provider: asrResult.provider,
        fallback: asrResult.output.fallback,
        fallbackReason,
        providerTrace,
        source: "upload-api",
        status: "uploaded",
        raw: {
          childId:
            typeof formData.get("childId") === "string"
              ? String(formData.get("childId"))
              : undefined,
          durationMs: toNumber(formData.get("durationMs")),
          mimeType:
            (typeof formData.get("mimeType") === "string"
              ? String(formData.get("mimeType"))
              : undefined) || audio.type || "audio/webm",
          scene:
            typeof formData.get("scene") === "string"
              ? String(formData.get("scene"))
              : "teacher-global-fab",
          size: audio.size,
          targetRole:
            typeof formData.get("targetRole") === "string"
              ? String(formData.get("targetRole"))
              : "teacher",
          providerMode: asrResult.mode,
        },
      }),
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof VivoProviderError) {
      const providerTrace = buildAiProviderTrace({
        provider: providerStatus.providerName,
        source: "provider_unavailable",
        mode: "fallback",
        fallback: true,
        fallbackReason: "provider-unavailable",
        realProvider: false,
        capability: "asr",
        providerStatus,
        extra: {
          workflow: "teacher-voice-upload",
        },
      });
      return NextResponse.json(
        {
          ok: false,
          code: "provider_unavailable",
          error: error.message,
          source: providerTrace.source,
          provider: providerTrace.provider,
          mode: providerTrace.mode,
          fallback: providerTrace.fallback,
          fallbackReason: providerTrace.fallbackReason,
          providerTrace,
          status: providerStatus,
          warnings: providerStatus.warnings ?? [],
        },
        { status: 503 }
      );
    }
    return apiError(
      "server_error",
      error instanceof Error ? error.message : "teacher_voice_upload_failed",
      { status: 500 }
    );
  }
}
