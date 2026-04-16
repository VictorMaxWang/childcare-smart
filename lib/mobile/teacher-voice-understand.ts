import type { TeacherVoiceUnderstandResponse } from "@/lib/ai/teacher-voice-understand";
import type { VoiceUploadResponse } from "@/lib/mobile/voice-assistant-upload";
import {
  normalizeTeacherVoiceMimeType,
  type TeacherVoiceScene,
} from "@/lib/mobile/teacher-voice-audio";

export interface TeacherVoiceRecordingMeta {
  fileName: string;
  mimeType: string;
  durationMs: number;
  size: number;
  scene: TeacherVoiceScene;
}

export interface TeacherVoiceUnderstandFromUploadInput {
  childId?: string;
  childName?: string;
  transcript: string;
  attachmentName?: string;
  mimeType?: string;
  durationMs?: number;
  scene: TeacherVoiceScene;
  traceId?: string;
}

export interface TeacherVoiceGlueResult {
  upload: VoiceUploadResponse;
  understanding: TeacherVoiceUnderstandResponse | null;
  understandingError: string | null;
  uiHintNextAction: VoiceUploadResponse["nextAction"];
  recordingMeta: TeacherVoiceRecordingMeta;
}

function isTeacherVoiceUnderstandResponse(
  value: unknown
): value is TeacherVoiceUnderstandResponse {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.generated_at === "string" &&
    typeof candidate.transcript === "object" &&
    candidate.transcript !== null &&
    typeof candidate.router_result === "object" &&
    candidate.router_result !== null &&
    Array.isArray(candidate.draft_items) &&
    Array.isArray(candidate.warnings) &&
    typeof candidate.trace === "object" &&
    candidate.trace !== null &&
    typeof candidate.meta === "object" &&
    candidate.meta !== null
  );
}

export async function understandTeacherVoiceFromUpload(
  input: TeacherVoiceUnderstandFromUploadInput
) {
  const response = await fetch("/api/ai/teacher-voice-understand", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      childId: input.childId,
      childName: input.childName,
      transcript: input.transcript,
      attachmentName: input.attachmentName,
      mimeType: normalizeTeacherVoiceMimeType({
        mimeType: input.mimeType,
        attachmentName: input.attachmentName,
      }),
      durationMs: input.durationMs,
      scene: input.scene,
      traceId: input.traceId,
    }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `teacher voice understand failed with ${response.status}`);
  }

  const responseJson = (await response.json()) as unknown;
  if (!isTeacherVoiceUnderstandResponse(responseJson)) {
    throw new Error("teacher voice understand returned an invalid response");
  }

  return responseJson;
}
