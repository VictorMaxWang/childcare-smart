import { normalizeTeacherVoiceMimeType } from "@/lib/mobile/teacher-voice-audio";

export type VoiceCaptureStatus = "uploaded" | "mocked" | "processing" | "failed";

export interface VoiceUploadRequest {
  file: File;
  targetRole: "teacher";
  childId?: string;
  scene: "teacher-global-fab";
  durationMs: number;
  mimeType: string;
  fallbackText?: string;
}

export interface VoiceUploadResponse {
  status: VoiceCaptureStatus;
  assetId?: string;
  attachmentName: string;
  transcript?: string;
  draftContent: string;
  provider?: string;
  source: "upload-api" | "mock";
  nextAction?: "none" | "teacher-agent" | "high-risk-consultation";
  raw?: Record<string, unknown>;
}

function inferNextAction(transcript: string) {
  const normalized = transcript.trim();

  if (!normalized) return "none";
  if (/(高风险|异常|复查|会诊|发热|持续观察)/.test(normalized)) {
    return "high-risk-consultation";
  }
  if (/(沟通|家长|记录|跟进|观察|今天)/.test(normalized)) {
    return "teacher-agent";
  }
  return "none";
}

function buildFallbackTranscript(attachmentName: string, fallbackText?: string) {
  const normalizedFallbackText = fallbackText?.trim();
  if (normalizedFallbackText) {
    return normalizedFallbackText;
  }

  return `${attachmentName} 转写结果：孩子今天晨检后情绪偏低，建议老师记录为重点观察并同步家长。`;
}

export function buildMockVoiceUploadResponse(params: {
  attachmentName: string;
  fallbackText?: string;
  provider?: string;
  raw?: Record<string, unknown>;
}): VoiceUploadResponse {
  const transcript = buildFallbackTranscript(params.attachmentName, params.fallbackText);

  return {
    status: "mocked",
    assetId:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? `voice-${crypto.randomUUID()}`
        : `voice-${Date.now()}`,
    attachmentName: params.attachmentName,
    transcript,
    draftContent: transcript,
    provider: params.provider ?? "mock-asr",
    source: "mock",
    nextAction: inferNextAction(transcript),
    raw: params.raw,
  };
}

function isVoiceUploadResponse(value: unknown): value is VoiceUploadResponse {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Record<string, unknown>;

  return (
    (candidate.status === "uploaded" ||
      candidate.status === "mocked" ||
      candidate.status === "processing" ||
      candidate.status === "failed") &&
    typeof candidate.attachmentName === "string" &&
    typeof candidate.draftContent === "string" &&
    (candidate.source === "upload-api" || candidate.source === "mock")
  );
}

export async function uploadTeacherVoiceCapture(
  request: VoiceUploadRequest
): Promise<VoiceUploadResponse> {
  const attachmentName = request.file.name || "teacher-voice-note.webm";
  const normalizedMimeType = normalizeTeacherVoiceMimeType({
    mimeType: request.mimeType,
    attachmentName,
  });
  const formData = new FormData();
  formData.set("audio", request.file);
  formData.set("attachmentName", attachmentName);
  formData.set("targetRole", request.targetRole);
  formData.set("scene", request.scene);
  formData.set("durationMs", String(request.durationMs));
  formData.set("mimeType", normalizedMimeType);

  if (request.childId) {
    formData.set("childId", request.childId);
  }

  if (request.fallbackText?.trim()) {
    formData.set("fallbackText", request.fallbackText.trim());
  }

  try {
    const response = await fetch("/api/ai/teacher-voice-upload", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`teacher voice upload failed with ${response.status}`);
    }

    const responseJson = (await response.json()) as unknown;
    if (!isVoiceUploadResponse(responseJson)) {
      throw new Error("teacher voice upload returned an invalid response");
    }

    return responseJson;
  } catch {
    return buildMockVoiceUploadResponse({
      attachmentName,
      fallbackText: request.fallbackText,
      provider: "mock-asr-client-fallback",
      raw: {
        attachmentName,
        childId: request.childId,
        durationMs: request.durationMs,
        mimeType: normalizedMimeType,
        originalMimeType: request.mimeType,
        scene: request.scene,
        size: request.file.size,
      },
    });
  }
}
