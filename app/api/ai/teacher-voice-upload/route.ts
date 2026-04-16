import { NextResponse } from "next/server";
import { resolveAsrProvider } from "@/lib/ai/providers";
import { forwardBrainRequest } from "@/lib/server/brain-client";
import { buildMockVoiceUploadResponse } from "@/lib/mobile/voice-assistant-upload";

function toNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function POST(request: Request) {
  const brainForward = await forwardBrainRequest(request, "/api/v1/agents/teacher/voice-upload");
  if (brainForward.response) return brainForward.response;

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
      fallbackText,
    });

    return NextResponse.json(
      buildMockVoiceUploadResponse({
        attachmentName,
        fallbackText: asrResult.output.transcript,
        provider: asrResult.provider,
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
    return NextResponse.json(
      {
        status: "failed",
        attachmentName,
        draftContent: fallbackText || "",
        source: "mock",
        raw: {
          error: error instanceof Error ? error.message : "teacher_voice_upload_failed",
        },
      },
      { status: 500 }
    );
  }
}
