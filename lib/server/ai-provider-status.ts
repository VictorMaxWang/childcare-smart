import "server-only";

import type { AiCapabilityMode } from "@/lib/ai/provider-trace";
import { getVivoProviderStatus, type VivoProviderStatus } from "@/lib/providers/vivo";
import type {
  AssistantProviderStatus,
  VoiceProviderCapabilityStatus,
} from "@/lib/voice-assistant/types";

type ProviderStatusCapability =
  | "llm"
  | "chat"
  | "ocr"
  | "asr"
  | "tts"
  | "storybook-image"
  | "storybook-audio";

type UnifiedCapabilityStatus = VoiceProviderCapabilityStatus & {
  capability: ProviderStatusCapability;
  state: "configured" | "live" | "fallback" | "mock";
  configured: boolean;
  live: boolean;
  fallback: boolean;
  mock: boolean;
  mode: AiCapabilityMode;
};

const PLACEHOLDER_VALUES = new Set([
  "",
  "unknown",
  "n/a",
  "na",
  "null",
  "undefined",
  "placeholder",
  "changeme",
  "change_me",
  "your_appkey",
  "your_appid",
  "your_vivo_app_key",
  "your_vivo_app_id",
]);

function readConfiguredEnv(name: string) {
  const value = process.env[name]?.trim() ?? "";
  if (value.startsWith("濉叆")) return "";
  return PLACEHOLDER_VALUES.has(value.toLowerCase()) ? "" : value;
}

function toUnifiedCapability(
  status: VivoProviderStatus,
  capability: ProviderStatusCapability,
  providerName = status.providerName
): UnifiedCapabilityStatus {
  const state = status.state ?? ((providerName ?? "").toLowerCase().includes("mock") ? "mock" : "fallback");
  const mode: AiCapabilityMode = state;

  return {
    ...status,
    providerName,
    capability,
    state,
    configured: status.configured,
    isRealProvider: status.isRealProvider,
    live: status.live ?? mode === "live",
    fallback: status.fallback ?? mode === "fallback",
    mock: status.mock ?? mode === "mock",
    mode,
    warnings: status.warnings ?? [],
    requiredEnv: status.requiredEnv ?? [],
  };
}

function buildStorybookMediaStatus(input: {
  capability: "storybook-image" | "storybook-audio";
  providerName: string;
  fallbackProviderName: string;
  requiredEnv: string[];
  warnings?: string[];
}): UnifiedCapabilityStatus {
  const missingEnv = input.requiredEnv.filter((name) => !readConfiguredEnv(name));
  const configured = missingEnv.length === 0;
  const mode: AiCapabilityMode = configured ? "configured" : "fallback";

  return {
    providerName: configured ? input.providerName : input.fallbackProviderName,
    capability: input.capability,
    state: configured ? "configured" : "fallback",
    configured,
    supported: true,
    isRealProvider: configured,
    live: false,
    fallback: !configured,
    mock: false,
    mode,
    status: configured ? "ready" : "missing-env",
    reason: configured
      ? undefined
      : `Missing required env for ${input.providerName}: ${missingEnv.join(", ")}`,
    warnings: input.warnings ?? [],
    requiredEnv: input.requiredEnv,
  };
}

export function getUnifiedAiProviderStatus(): AssistantProviderStatus {
  const chat = toUnifiedCapability(getVivoProviderStatus("chat"), "chat");
  const llm = {
    ...chat,
    capability: "llm" as const,
  };
  const ocr = toUnifiedCapability(getVivoProviderStatus("ocr"), "ocr");
  const asr = toUnifiedCapability(getVivoProviderStatus("asr"), "asr");
  const tts = toUnifiedCapability(getVivoProviderStatus("tts"), "tts");
  const storybookImage = buildStorybookMediaStatus({
    capability: "storybook-image",
    providerName: "vivo-story-image",
    fallbackProviderName: "storybook-dynamic-fallback",
    requiredEnv: ["VIVO_APP_ID", "VIVO_APP_KEY"],
    warnings: ["Status is config-based; no image generation request is made by provider-status."],
  });
  const storybookAudio = buildStorybookMediaStatus({
    capability: "storybook-audio",
    providerName: "vivo-story-tts",
    fallbackProviderName: "storybook-mock-preview",
    requiredEnv: ["VIVO_APP_ID", "VIVO_APP_KEY"],
    warnings: ["Status is config-based; no TTS synthesis request is made by provider-status."],
  });
  const capabilities = {
    llm,
    ocr,
    asr,
    tts,
    storybookImage,
    storybookAudio,
  };
  const statuses = Object.values(capabilities);
  const allConfigured = statuses.every((capability) => capability.configured);
  const anyConfigured = statuses.some((capability) => capability.configured);

  return {
    chat,
    llm,
    ocr,
    asr,
    tts,
    storybookImage,
    storybookAudio,
    capabilities,
    fallbackText: allConfigured
      ? "vivo providers are configured; live is reported only by request results."
      : anyConfigured
        ? "some vivo capabilities are configured; unavailable capabilities use explicit fallback/mock paths."
        : "vivo provider missing-env; text/local fallback and storybook preview paths are available.",
  };
}
