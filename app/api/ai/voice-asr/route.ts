import { resolveAsrProvider } from "@/lib/ai/providers/asr-provider";
import { apiError, apiOk, withApiErrors } from "@/lib/server/api-errors";
import { authorizeAiRoute } from "@/lib/server/ai-route-guard";
import type { VoiceAsrResponse } from "@/lib/voice-assistant/types";

export const runtime = "nodejs";

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: FormDataEntryValue | null) {
  const parsed = Number(readString(value));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function POST(request: Request) {
  return withApiErrors(async () => {
    const authError = await authorizeAiRoute(request, { allowUnscoped: true });
    if (authError) return authError;

    const formData = await request.formData();
    const audio = formData.get("audio");
    const audioFile =
      audio && typeof audio === "object" && "arrayBuffer" in audio
        ? (audio as File)
        : null;
    const audioBytes = audioFile ? Buffer.from(await audioFile.arrayBuffer()) : undefined;
    const provider = resolveAsrProvider();
    const result = await provider.transcribe({
      attachmentName: audioFile?.name || readString(formData.get("attachmentName")) || "voice-assistant.webm",
      audioBytes,
      durationMs: readNumber(formData.get("durationMs")),
      fallbackText: readString(formData.get("fallbackText")),
      mimeType: readString(formData.get("mimeType")) || audioFile?.type,
      scene: readString(formData.get("scene")) || "voice-orb",
      transcript: readString(formData.get("transcript")),
    });

    if (result.source === "provider_unavailable" && !result.output.transcript) {
      return apiError("provider_unavailable", "当前 ASR provider 不可用，请使用文字指令 fallback。", { status: 503 });
    }

    const payload: VoiceAsrResponse = {
      transcript: result.output.transcript,
      source: result.source,
      provider: result.provider,
      fallback: result.output.fallback,
      status: result.output.providerStatus,
      warnings: result.output.warnings,
    };

    return apiOk(payload);
  });
}
