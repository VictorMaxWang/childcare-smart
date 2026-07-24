import { NextResponse } from "next/server";
import { resolveAsrProvider, type AsrProvider } from "@/lib/ai/providers";
import { buildAiProviderTrace } from "@/lib/ai/provider-trace";
import { buildTeacherVoiceUnderstandFallback } from "@/lib/ai/teacher-voice-understand";
import { VivoProviderError } from "@/lib/providers/vivo";
import { createBrainTransportHeaders } from "@/lib/server/brain-client";
import { authorizeAiRoute } from "@/lib/server/ai-route-guard";

const TEACHER_VOICE_UNDERSTAND_TARGET = "/api/v1/agents/teacher/voice-understand";

export type TeacherVoiceUnderstandRouteDependencies = {
  authorize: typeof authorizeAiRoute;
  resolveProvider: () => AsrProvider;
};

const defaultDependencies: TeacherVoiceUnderstandRouteDependencies = {
  authorize: authorizeAiRoute,
  resolveProvider: resolveAsrProvider,
};

function buildLocalFallbackHeaders() {
  return createBrainTransportHeaders({
    transport: "next-json-fallback",
    targetPath: TEACHER_VOICE_UNDERSTAND_TARGET,
    fallbackReason: "next-provider-gated-local-route",
  });
}

function toOptionalString(value: FormDataEntryValue | unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function toOptionalNumber(value: FormDataEntryValue | unknown) {
  if (typeof value !== "string") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildProviderUnavailableResponse(
  provider: AsrProvider,
  error: VivoProviderError,
  headers: Headers,
  inputMode: "multipart" | "json"
) {
  const providerStatus = {
    ...provider.getStatus(),
    state: "fallback" as const,
    live: false,
    fallback: true,
    isRealProvider: false,
    status: error.status,
    reason: "ASR provider rejected this audio input.",
  };
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
      workflow: "teacher-voice-understand",
      inputMode,
    },
  });

  return NextResponse.json(
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
    { status: 503, headers }
  );
}

export async function handleTeacherVoiceUnderstandRequest(
  request: Request,
  dependencies: TeacherVoiceUnderstandRouteDependencies = defaultDependencies
) {
  const authError = await dependencies.authorize(request, { requiredRole: "staff" });
  if (authError) return authError;

  const headers = buildLocalFallbackHeaders();
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const asrProvider = dependencies.resolveProvider();

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const audio = formData.get("audio");
    const transcript = toOptionalString(formData.get("transcript"));
    const fallbackText = toOptionalString(formData.get("fallbackText"));

    if (!(audio instanceof File) && !transcript && !fallbackText) {
      return NextResponse.json(
        { error: "Missing transcript or audio input" },
        { status: 400, headers }
      );
    }

    const attachmentName =
      toOptionalString(formData.get("attachmentName")) ||
      (audio instanceof File ? audio.name : undefined) ||
      "teacher-voice-note.webm";
    const mimeType =
      toOptionalString(formData.get("mimeType")) ||
      (audio instanceof File ? audio.type : undefined) ||
      "audio/webm";
    const durationMs = toOptionalNumber(formData.get("durationMs"));
    const scene = toOptionalString(formData.get("scene")) || "teacher-global-fab";

    let asrResult;
    try {
      asrResult = await asrProvider.transcribe({
        attachmentName,
        audioBytes: audio instanceof File ? Buffer.from(await audio.arrayBuffer()) : undefined,
        fallbackText,
        transcript,
        mimeType,
        durationMs,
        scene,
      });
    } catch (error) {
      // 供应商拒绝浏览器音频格式属于可恢复能力降级，不应把真实账号推入 500 错误页。
      if (error instanceof VivoProviderError) {
        return buildProviderUnavailableResponse(asrProvider, error, headers, "multipart");
      }
      throw error;
    }

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
          workflow: "teacher-voice-understand",
          inputMode: "multipart",
        },
      });
      return NextResponse.json(
        {
          ok: false,
          code: "provider_unavailable",
          error:
            "ASR provider is unavailable; provide a text transcript or configure a provider.",
          source: asrResult.source,
          provider: asrResult.provider,
          mode: providerTrace.mode,
          fallback: providerTrace.fallback,
          fallbackReason: providerTrace.fallbackReason,
          providerTrace,
          status: asrResult.output.providerStatus,
          warnings: asrResult.output.warnings,
        },
        { status: 503, headers }
      );
    }

    return NextResponse.json(
      buildTeacherVoiceUnderstandFallback({
        transcript: asrResult.output.transcript,
        childId: toOptionalString(formData.get("childId")),
        childName: toOptionalString(formData.get("childName")),
        attachmentName,
        mimeType,
        durationMs,
        scene,
        traceId: toOptionalString(formData.get("traceId")),
        inputMode: "multipart",
        asrProvider: asrResult.provider,
        asrMode: asrResult.mode,
        asrSource: asrResult.output.source,
        asrConfidence: asrResult.output.confidence,
        asrRaw: asrResult.output.raw,
        asrMeta: asrResult.output.meta,
        asrFallback: asrResult.output.fallback,
      }),
      { status: 200, headers }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be an object" }, { status: 400, headers });
  }

  const payload = body as Record<string, unknown>;
  const transcript = toOptionalString(payload.transcript);
  const fallbackText = toOptionalString(payload.fallbackText);
  if (!transcript && !fallbackText) {
    return NextResponse.json(
      { error: "Missing transcript or audio input" },
      { status: 400, headers }
    );
  }

  let asrResult;
  try {
    asrResult = await asrProvider.transcribe({
      attachmentName: toOptionalString(payload.attachmentName),
      fallbackText,
      transcript,
      mimeType: toOptionalString(payload.mimeType),
      durationMs:
        typeof payload.durationMs === "number" && Number.isFinite(payload.durationMs)
          ? payload.durationMs
          : undefined,
      scene: toOptionalString(payload.scene) || "teacher-global-fab",
    });
  } catch (error) {
    if (error instanceof VivoProviderError) {
      return buildProviderUnavailableResponse(asrProvider, error, headers, "json");
    }
    throw error;
  }

  return NextResponse.json(
    buildTeacherVoiceUnderstandFallback({
      transcript: asrResult.output.transcript,
      childId: toOptionalString(payload.childId),
      childName: toOptionalString(payload.childName),
      attachmentName: toOptionalString(payload.attachmentName),
      mimeType: toOptionalString(payload.mimeType),
      durationMs:
        typeof payload.durationMs === "number" && Number.isFinite(payload.durationMs)
          ? payload.durationMs
          : undefined,
      scene: toOptionalString(payload.scene) || "teacher-global-fab",
      traceId: toOptionalString(payload.traceId),
      inputMode: "json",
      asrProvider: asrResult.provider,
      asrMode: asrResult.mode,
      asrSource: asrResult.output.source,
      asrConfidence: asrResult.output.confidence,
      asrRaw: asrResult.output.raw,
      asrMeta: asrResult.output.meta,
      asrFallback: asrResult.output.fallback,
    }),
    { status: 200, headers }
  );
}

export async function POST(request: Request) {
  return handleTeacherVoiceUnderstandRequest(request);
}
