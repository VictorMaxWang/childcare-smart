import { resolveAsrProvider } from "@/lib/ai/providers/asr-provider";
import { buildAiProviderTrace } from "@/lib/ai/provider-trace";
import { VivoProviderError } from "@/lib/providers/vivo/vivo-errors";
import { apiOk, withApiErrors } from "@/lib/server/api-errors";
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
    const providerStatus = provider.getStatus();
    const result = await provider
      .transcribe({
        attachmentName: audioFile?.name || readString(formData.get("attachmentName")) || "voice-assistant.webm",
        audioBytes,
        durationMs: readNumber(formData.get("durationMs")),
        fallbackText: readString(formData.get("fallbackText")),
        mimeType: readString(formData.get("mimeType")) || audioFile?.type,
        scene: readString(formData.get("scene")) || "voice-orb",
        transcript: readString(formData.get("transcript")),
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
      model: result.provider,
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
