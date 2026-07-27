import { resolveAsrProvider } from "@/lib/ai/providers/asr-provider";
import { buildAiProviderTrace } from "@/lib/ai/provider-trace";
import { VivoProviderError } from "@/lib/providers/vivo/vivo-errors";
import { apiOk, ApiRouteError, withApiErrors } from "@/lib/server/api-errors";
import { authorizeAiRouteSession } from "@/lib/server/ai-route-guard";
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
import type { VoiceAsrResponse } from "@/lib/voice-assistant/types";

export const runtime = "nodejs";

const VOICE_AUDIO_MAX_REQUEST_BYTES =
  VOICE_AUDIO_MAX_BYTES + MULTIPART_FORM_DATA_OVERHEAD_BYTES;
const ASR_REQUEST_DEADLINE_MS = 45_000;

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: FormDataEntryValue | null) {
  const parsed = Number(readString(value));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function rethrowUploadSecurityError(error: unknown): never {
  if (error instanceof UploadSecurityError) {
    throw new ApiRouteError(
      "invalid_request",
      error.message,
      error.status
    );
  }
  throw error;
}

export function POST(request: Request) {
  return withApiErrors(async () => {
    let boundedRequest: Request;
    try {
      // 鉴权会读取表单中的 childId；先限制原始流，避免鉴权阶段解析超大正文。
      boundedRequest = await readRequestWithBodyLimit(
        request,
        VOICE_AUDIO_MAX_REQUEST_BYTES
      );
    } catch (error) {
      rethrowUploadSecurityError(error);
    }

    const authorization = await authorizeAiRouteSession(boundedRequest, {
      allowUnscoped: true,
    });
    if (authorization instanceof Response) return authorization;

    let formData: FormData;
    try {
      formData = await boundedRequest.formData();
    } catch {
      throw new ApiRouteError(
        "invalid_request",
        "语音上传请求必须使用有效的 multipart/form-data。"
      );
    }
    const audio = formData.get("audio");
    const audioFile = audio instanceof File ? audio : null;
    const durationMs = readNumber(formData.get("durationMs"));
    const transcript = readString(formData.get("transcript"));
    const fallbackText = readString(formData.get("fallbackText"));

    let detectedAudioMimeType: string | undefined;
    if (audioFile) {
      try {
        detectedAudioMimeType = (
          await validateAudioUploadFile(audioFile, VOICE_AUDIO_MAX_BYTES)
        ).mimeType;
      } catch (error) {
        rethrowUploadSecurityError(error);
      }
    }

    const validationError =
      validateVoiceDuration(durationMs) ||
      validateVoiceText(transcript) ||
      validateVoiceText(fallbackText);
    if (validationError) {
      throw new ApiRouteError("invalid_request", validationError);
    }
    const audioBytes = audioFile ? Buffer.from(await audioFile.arrayBuffer()) : undefined;
    const provider = resolveAsrProvider();
    const providerStatus = provider.getStatus();
    const result = await provider
      .transcribe({
        attachmentName: audioFile?.name || readString(formData.get("attachmentName")) || "voice-assistant.webm",
        audioBytes,
        durationMs,
        fallbackText,
        // 有二进制音频时只使用服务端检测结果，不能被独立 mimeType 字段覆盖。
        mimeType:
          detectedAudioMimeType ||
          readString(formData.get("mimeType")) ||
          undefined,
        scene: readString(formData.get("scene")) || "voice-orb",
        transcript,
        deadlineAtMs: Date.now() + ASR_REQUEST_DEADLINE_MS,
        signal: request.signal,
        operationScope: {
          institutionId: authorization.session.user.institutionId,
          userId: authorization.session.user.id,
        },
      })
      .catch((error: unknown) => {
        if (error instanceof VivoProviderError) {
          return null;
        }
        throw error;
      });

    if (!result) {
      const providerTrace = buildAiProviderTrace({
        provider: providerStatus.providerName,
        source: "provider_unavailable",
        mode: "fallback",
        fallback: true,
        fallbackReason: "provider-unavailable",
        realProvider: false,
        capability: "asr",
        providerStatus,
      });
      return Response.json(
        {
          ok: false,
          code: "provider_unavailable",
          error: "ASR provider is unavailable for this audio input.",
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

    if (result.source === "provider_unavailable" && !result.output.transcript) {
      const providerTrace = buildAiProviderTrace({
        provider: result.provider,
        source: result.source,
        mode: "fallback",
        fallback: true,
        fallbackReason: "provider-unavailable",
        realProvider: false,
        capability: "asr",
        providerStatus: result.output.providerStatus,
      });
      return Response.json(
        {
          ok: false,
          code: "provider_unavailable",
          error: "ASR provider is unavailable; provide fallback text or a transcript.",
          source: result.source,
          provider: result.provider,
          mode: providerTrace.mode,
          fallback: providerTrace.fallback,
          fallbackReason: providerTrace.fallbackReason,
          providerTrace,
          status: result.output.providerStatus,
          warnings: result.output.warnings,
        },
        { status: 503 }
      );
    }

    const fallbackReason = result.output.fallback
      ? result.output.source === "provided_transcript"
        ? "provided-transcript"
        : result.output.source === "text_fallback"
          ? "text-fallback"
          : "provider-unavailable"
      : null;
    const providerTrace = buildAiProviderTrace({
      provider: result.provider,
      source: result.source,
      mode: result.mode,
      fallback: result.output.fallback,
      fallbackReason,
      realProvider: result.mode === "live" && !result.output.fallback,
      capability: "asr",
      model: result.model,
      providerStatus: result.output.providerStatus,
    });

    const payload: VoiceAsrResponse = {
      transcript: result.output.transcript,
      source: result.source,
      mode: providerTrace.mode,
      provider: result.provider,
      fallback: result.output.fallback,
      fallbackReason: providerTrace.fallbackReason,
      providerTrace,
      status: result.output.providerStatus,
      warnings: result.output.warnings,
    };

    return apiOk(payload);
  });
}
