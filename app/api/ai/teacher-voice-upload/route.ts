import { NextResponse } from "next/server";
import { resolveAsrProvider } from "@/lib/ai/providers";
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

  try {
    const asrResult = await resolveAsrProvider().transcribe({
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
      return apiError(
        "provider_unavailable",
        "当前未接入真实 ASR provider，音频文件不会被伪造转写成功；请使用浏览器语音识别或文本输入 fallback。",
        { status: 503 }
      );
    }

    return NextResponse.json(
      buildVoiceUploadResponse({
        attachmentName,
        transcript: asrResult.output.transcript,
        provider: asrResult.provider,
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
      return apiError("provider_unavailable", error.message, { status: 503 });
    }
    return apiError(
      "server_error",
      error instanceof Error ? error.message : "teacher_voice_upload_failed",
      { status: 500 }
    );
  }
}
