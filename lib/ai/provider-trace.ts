export type AiCapabilityMode = "configured" | "live" | "fallback" | "mock";

export type AiProviderCapability =
  | "llm"
  | "ocr"
  | "asr"
  | "tts"
  | "storybook-image"
  | "storybook-audio"
  | (string & {});

export type AiFallbackReason =
  | "brain-base-url-missing"
  | "brain-proxy-unavailable"
  | "brain-proxy-timeout"
  | "brain-proxy-invalid-json"
  | "brain-incomplete-result"
  | "brain-stream-done-timeout"
  | "brain-stream-ended-without-done"
  | "forced-local-fallback"
  | "provider-unavailable"
  | "provider-authentication-error"
  | "missing-env"
  | "provided-transcript"
  | "text-fallback"
  | "mock-provider"
  | (string & {});

export interface AiProviderStatusSnapshot {
  providerName?: string;
  capability?: string;
  configured?: boolean;
  supported?: boolean;
  isRealProvider?: boolean;
  status?: string;
  reason?: string;
  warnings?: string[];
  requiredEnv?: string[];
  mode?: AiCapabilityMode;
  live?: boolean;
  fallback?: boolean;
  mock?: boolean;
  [key: string]: unknown;
}

export interface AiProviderTrace {
  provider?: string;
  source?: string;
  mode?: AiCapabilityMode;
  fallback?: boolean;
  fallbackReason?: AiFallbackReason | null;
  realProvider?: boolean;
  capability?: AiProviderCapability;
  model?: string | null;
  requestId?: string | null;
  transport?: string | null;
  transportSource?: string | null;
  providerStatus?: unknown;
  [key: string]: unknown;
}

export const SMARTCHILDCARE_PROVIDER_TRACE_HEADER = "x-smartchildcare-provider-trace";

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeAiCapabilityMode(input: {
  mode?: unknown;
  fallback?: unknown;
  realProvider?: unknown;
  source?: unknown;
}): AiCapabilityMode {
  const mode = readString(input.mode).toLowerCase();
  if (mode === "configured") return "configured";
  if (mode === "live" || mode === "real" || mode === "provider") return "live";
  if (mode === "mock") return "mock";
  if (mode === "fallback" || mode === "mixed") return "fallback";

  const source = readString(input.source).toLowerCase();
  if (source.includes("mock")) return "mock";
  if (readBoolean(input.realProvider) === true) return "live";
  if (readBoolean(input.fallback) === true || source.includes("fallback")) return "fallback";
  return "fallback";
}

export function buildAiProviderTrace(input: {
  provider?: unknown;
  source?: unknown;
  mode?: unknown;
  fallback?: unknown;
  fallbackReason?: unknown;
  realProvider?: unknown;
  capability?: AiProviderCapability;
  model?: unknown;
  requestId?: unknown;
  transport?: unknown;
  transportSource?: unknown;
  providerStatus?: AiProviderStatusSnapshot | null;
  extra?: Record<string, unknown>;
}): AiProviderTrace {
  const mode = normalizeAiCapabilityMode(input);
  const fallback =
    readBoolean(input.fallback) ??
    (mode === "fallback" || readString(input.source).toLowerCase().includes("fallback"));
  const realProvider = readBoolean(input.realProvider) ?? mode === "live";
  const provider = readString(input.provider) || (mode === "mock" ? "mock-provider" : "provider-unavailable");
  const source = readString(input.source) || (mode === "live" ? provider : mode);
  const fallbackReason =
    readString(input.fallbackReason) ||
    (fallback ? (mode === "mock" ? "mock-provider" : "provider-unavailable") : "");

  return {
    provider,
    source,
    mode,
    fallback,
    fallbackReason: fallbackReason || null,
    realProvider,
    capability: input.capability,
    model: readString(input.model) || null,
    requestId: readString(input.requestId) || null,
    transport: readString(input.transport) || null,
    transportSource: readString(input.transportSource) || null,
    providerStatus: input.providerStatus ? readRecord(input.providerStatus) : null,
    ...(input.extra ?? {}),
  };
}

export function buildAiProviderTraceFromProviderMeta(input: {
  providerMeta?: unknown;
  source?: unknown;
  fallback?: unknown;
  fallbackReason?: unknown;
  capability?: AiProviderCapability;
  transport?: unknown;
  extra?: Record<string, unknown>;
}) {
  const meta = readRecord(input.providerMeta);
  return buildAiProviderTrace({
    provider: meta.provider ?? meta.textProvider ?? meta.imageProvider ?? meta.audioProvider,
    source: input.source ?? meta.provider ?? meta.textProvider,
    mode: meta.mode,
    fallback: input.fallback,
    fallbackReason: input.fallbackReason ?? meta.fallbackReason,
    realProvider: meta.realProvider,
    capability: input.capability,
    transport: input.transport ?? meta.transport,
    providerStatus: readRecord(meta.diagnostics),
    extra: {
      textProvider: meta.textProvider,
      textDelivery: meta.textDelivery,
      imageProvider: meta.imageProvider,
      imageDelivery: meta.imageDelivery,
      audioProvider: meta.audioProvider,
      audioDelivery: meta.audioDelivery,
      ...(input.extra ?? {}),
    },
  });
}

export function buildAiProviderTraceHeader(trace: AiProviderTrace) {
  const safeTrace = {
    provider: trace.provider,
    source: trace.source,
    mode: trace.mode,
    fallback: trace.fallback,
    fallbackReason: trace.fallbackReason,
    realProvider: trace.realProvider,
    capability: trace.capability,
    model: trace.model,
    requestId: trace.requestId,
    transport: trace.transport,
  };
  return JSON.stringify(safeTrace);
}
