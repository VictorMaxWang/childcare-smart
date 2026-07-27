import "server-only";

import type { AiCapabilityMode } from "@/lib/ai/provider-trace";
import {
  resolveBailianRuntimeConfig,
  resolveBailianVisionModel,
} from "@/lib/ai/dashscope";
import {
  getEffectiveAsrProviderStatus,
  getEffectiveOcrProviderStatus,
} from "@/lib/ai/providers";
import { resolveDashScopeStoryImageConfig } from "@/lib/providers/dashscope/dashscope-story-image-provider";
import { getVivoProviderStatus, type VivoProviderStatus } from "@/lib/providers/vivo";
import type {
  AssistantProviderStatus,
  VoiceProviderCapabilityStatus,
} from "@/lib/voice-assistant/types";

type ProviderStatusCapability =
  | "llm"
  | "chat"
  | "vision"
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
  if (value.startsWith("填入")) return "";
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
  model?: string;
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
    model: input.model,
    warnings: input.warnings ?? [],
    requiredEnv: input.requiredEnv,
  };
}

function buildBailianStatus(
  capability: "chat" | "vision"
): UnifiedCapabilityStatus {
  const configured = Boolean(readConfiguredEnv("DASHSCOPE_API_KEY"));
  const model =
    capability === "vision"
      ? resolveBailianVisionModel()
      : resolveBailianRuntimeConfig().model;

  return {
    providerName: "dashscope",
    capability,
    state: configured ? "configured" : "fallback",
    configured,
    supported: true,
    isRealProvider: configured,
    live: false,
    fallback: !configured,
    mock: false,
    mode: configured ? "configured" : "fallback",
    status: configured ? "ready" : "missing-env",
    reason: configured
      ? undefined
      : "Missing required env for DashScope: DASHSCOPE_API_KEY",
    model,
    warnings: [
      "Status is config-based; live is reported only after a successful provider request.",
    ],
    requiredEnv: ["DASHSCOPE_API_KEY"],
  };
}

function resolveEffectiveChatStatus(
  vivo: UnifiedCapabilityStatus,
  bailian: UnifiedCapabilityStatus
): UnifiedCapabilityStatus {
  if (vivo.configured && vivo.supported) {
    return {
      ...vivo,
      warnings: [
        ...vivo.warnings,
        ...(bailian.configured
          ? [`DashScope ${bailian.model ?? ""} is configured as the secondary chat provider.`]
          : []),
      ],
    };
  }

  if (bailian.configured) {
    return {
      ...bailian,
      warnings: [
        ...bailian.warnings,
        "Vivo chat is unavailable; real requests use DashScope instead of local mock data.",
      ],
    };
  }

  return {
    ...vivo,
    providerName: "vivo / dashscope",
    requiredEnv: Array.from(
      new Set([...(vivo.requiredEnv ?? []), ...(bailian.requiredEnv ?? [])])
    ),
    warnings: [...vivo.warnings, ...bailian.warnings],
    reason:
      vivo.reason ??
      bailian.reason ??
      "No real chat provider is configured.",
  };
}

export function getUnifiedAiProviderStatus(): AssistantProviderStatus {
  const vivoChat = toUnifiedCapability(getVivoProviderStatus("chat"), "chat");
  const bailianChat = buildBailianStatus("chat");
  const chat = resolveEffectiveChatStatus(vivoChat, bailianChat);
  const llm = {
    ...chat,
    capability: "llm" as const,
  };
  const vision = buildBailianStatus("vision");
  const ocr = toUnifiedCapability(getEffectiveOcrProviderStatus(), "ocr");
  const asr = toUnifiedCapability(getEffectiveAsrProviderStatus(), "asr");
  const tts = toUnifiedCapability(getVivoProviderStatus("tts"), "tts");
  const dashscopeStoryImage = resolveDashScopeStoryImageConfig();
  const requireDashscopeStoryImage =
    dashscopeStoryImage.selected || process.env.NODE_ENV === "production";
  const storybookImage = requireDashscopeStoryImage
    ? buildStorybookMediaStatus({
        capability: "storybook-image",
        providerName: "dashscope-qwen-image",
        fallbackProviderName: "storybook-dynamic-fallback",
        requiredEnv: [
          "NEXT_STORYBOOK_IMAGE_PROVIDER",
          "DASHSCOPE_API_KEY",
          "DATABASE_URL",
        ],
        model: dashscopeStoryImage.model,
        warnings: [
          "Status is config-based; live is reported after an async image task succeeds.",
        ],
      })
    : buildStorybookMediaStatus({
        capability: "storybook-image",
        providerName: "vivo-story-image",
        fallbackProviderName: "storybook-dynamic-fallback",
        requiredEnv: ["VIVO_APP_ID", "VIVO_APP_KEY"],
        warnings: [
          "Status is config-based; no image generation request is made by provider-status.",
        ],
      });
  const storybookAudio = buildStorybookMediaStatus({
    capability: "storybook-audio",
    providerName: "vivo-story-tts",
    fallbackProviderName: "storybook-mock-preview",
    requiredEnv: ["VIVO_APP_ID", "VIVO_APP_KEY", "DATABASE_URL"],
    warnings: ["Status is config-based; no TTS synthesis request is made by provider-status."],
  });
  const capabilities = {
    llm,
    vision,
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
    vision,
    ocr,
    asr,
    tts,
    storybookImage,
    storybookAudio,
    capabilities,
    fallbackText: allConfigured
      ? "AI providers are configured; live is reported only by request results."
      : anyConfigured
        ? "Some AI capabilities are configured; unavailable capabilities use explicit fallback/mock paths."
        : "No real AI provider is configured; only explicit local fallback and preview paths are available.",
  };
}
