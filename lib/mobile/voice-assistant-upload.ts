import { normalizeTeacherVoiceMimeType } from "@/lib/mobile/teacher-voice-audio";
import type { AiProviderTrace } from "@/lib/ai/provider-trace";

export type VoiceCaptureStatus =
  | "uploaded"
  | "local_fallback"
  | "mocked"
  | "processing"
  | "failed";

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
  fallback?: boolean;
  fallbackReason?: string | null;
  providerTrace?: AiProviderTrace;
  source: "upload-api" | "local-text-fallback" | "mock";
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

function buildFallbackTranscript(fallbackText?: string) {
  return fallbackText?.trim() ?? "";
}

export function buildMockVoiceUploadResponse(params: {
  attachmentName: string;
  fallbackText?: string;
  provider?: string;
  fallback?: boolean;
  fallbackReason?: string | null;
  providerTrace?: AiProviderTrace;
  raw?: Record<string, unknown>;
}): VoiceUploadResponse {
  const transcript = buildFallbackTranscript(params.fallbackText);

  return {
    status: "mocked",
    assetId:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? `voice-${crypto.randomUUID()}`
        : `voice-${Date.now()}`,
    attachmentName: params.attachmentName,
    transcript,
    draftContent: transcript,
    provider: params.provider ?? "text-input-asr-fallback",
    fallback: params.fallback ?? true,
    fallbackReason: params.fallbackReason ?? "mock-provider",
    providerTrace: params.providerTrace,
    source: "mock",
    nextAction: inferNextAction(transcript),
    raw: params.raw,
  };
}

export function buildVoiceUploadResponse(params: {
  attachmentName: string;
  transcript?: string;
  provider?: string;
  fallback?: boolean;
  fallbackReason?: string | null;
  providerTrace?: AiProviderTrace;
  source?: VoiceUploadResponse["source"];
  status?: VoiceCaptureStatus;
  raw?: Record<string, unknown>;
}): VoiceUploadResponse {
  const transcript = buildFallbackTranscript(params.transcript);

  return {
    status: params.status ?? "uploaded",
    assetId:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? `voice-${crypto.randomUUID()}`
        : `voice-${Date.now()}`,
    attachmentName: params.attachmentName,
    transcript,
    draftContent: transcript,
    provider: params.provider ?? "upload-api",
    fallback: params.fallback,
    fallbackReason: params.fallbackReason,
    providerTrace: params.providerTrace,
    source: params.source ?? "upload-api",
    nextAction: inferNextAction(transcript),
    raw: params.raw,
  };
}

function isVoiceUploadResponse(value: unknown): value is VoiceUploadResponse {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Record<string, unknown>;

  return (
    (candidate.status === "uploaded" ||
      candidate.status === "local_fallback" ||
      candidate.status === "mocked" ||
      candidate.status === "processing" ||
      candidate.status === "failed") &&
    typeof candidate.attachmentName === "string" &&
    typeof candidate.draftContent === "string" &&
    (candidate.source === "upload-api" ||
      candidate.source === "local-text-fallback" ||
      candidate.source === "mock")
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
  } catch (error) {
    if (request.fallbackText?.trim()) {
      return buildVoiceUploadResponse({
        attachmentName,
        transcript: request.fallbackText,
        provider: "text-input-asr-fallback",
        fallback: true,
        fallbackReason: "text-fallback",
        source: "local-text-fallback",
        status: "local_fallback",
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

    return {
      status: "failed",
      attachmentName,
      draftContent: "",
      provider: "provider-unavailable",
      fallback: true,
      fallbackReason: "provider-unavailable",
      source: "local-text-fallback",
      nextAction: "none",
      raw: {
        error: error instanceof Error ? error.message : "teacher voice upload failed",
        reason: "当前未接入真实 ASR provider，音频文件不会被伪造转写成功。",
        attachmentName,
        childId: request.childId,
        durationMs: request.durationMs,
        mimeType: normalizedMimeType,
        originalMimeType: request.mimeType,
        scene: request.scene,
        size: request.file.size,
      },
    };
  }
}
