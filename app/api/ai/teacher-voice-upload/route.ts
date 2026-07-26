import { NextResponse } from "next/server";
import { resolveAsrProvider } from "@/lib/ai/providers";
import { buildAiProviderTrace } from "@/lib/ai/provider-trace";
import { authorizeAiRoute } from "@/lib/server/ai-route-guard";
import { apiError } from "@/lib/server/api-errors";
import { VivoProviderError } from "@/lib/providers/vivo";
import { buildVoiceUploadResponse } from "@/lib/mobile/voice-assistant-upload";
import {
  MULTIPART_FORM_DATA_OVERHEAD_BYTES,
  readRequestWithBodyLimit,
  UploadSecurityError,
  validateAudioUploadFile,
} from "@/lib/server/upload-security";
import {
  VOICE_AUDIO_MAX_BYTES,
  validateVoiceDuration,
  validateVoiceText,
} from "@/lib/voice/audio-constraints";

const VOICE_AUDIO_MAX_REQUEST_BYTES =
  VOICE_AUDIO_MAX_BYTES + MULTIPART_FORM_DATA_OVERHEAD_BYTES;

function toNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function POST(request: Request) {
  let boundedRequest: Request;
  try {
    // 鉴权守卫会检查 multipart child scope，必须先为原始正文建立硬上限。
    boundedRequest = await readRequestWithBodyLimit(
      request,
      VOICE_AUDIO_MAX_REQUEST_BYTES
    );
  } catch (error) {
    if (error instanceof UploadSecurityError) {
      return apiError("invalid_request", error.message, {
        status: error.status,
      });
    }
    throw error;
  }

  const authError = await authorizeAiRoute(boundedRequest, {
    requiredRole: "staff",
  });
  if (authError) return authError;

  let formData: FormData;
  try {
    formData = await boundedRequest.formData();
  } catch {
    return apiError(
      "invalid_request",
      "语音上传请求必须使用有效的 multipart/form-data。",
      { status: 400 }
    );
  }
  const audio = formData.get("audio");

  if (!(audio instanceof File)) {
    return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
  }

  let detectedAudioMimeType: string;
  try {
    detectedAudioMimeType = (
      await validateAudioUploadFile(audio, VOICE_AUDIO_MAX_BYTES)
    ).mimeType;
  } catch (error) {
    if (error instanceof UploadSecurityError) {
      return apiError("invalid_request", error.message, {
        status: error.status,
      });
    }
    throw error;
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
  const durationMs = toNumber(formData.get("durationMs"));
  const validationError =
    validateVoiceDuration(durationMs) ||
    validateVoiceText(fallbackText);
  if (validationError) {
    return NextResponse.json(
      { ok: false, code: "invalid_request", error: validationError },
      { status: 400 }
    );
  }
  const asrProvider = resolveAsrProvider();
  const providerStatus = asrProvider.getStatus();

  try {
    const asrResult = await asrProvider.transcribe({
      attachmentName,
      audioBytes: Buffer.from(await audio.arrayBuffer()),
      fallbackText,
      mimeType: detectedAudioMimeType,
      durationMs,
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
          durationMs,
          mimeType: detectedAudioMimeType,
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
