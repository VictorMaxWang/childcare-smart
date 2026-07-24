import "server-only";

import type { VivoCapability, VivoProviderStatus } from "./types";

const PLACEHOLDER_VALUES = new Set([
  "",
  "unknown",
  "n/a",
  "na",
  "null",
  "undefined",
  "mock",
  "demo",
  "example",
  "placeholder",
  "changeme",
  "change_me",
  "todo",
  "your_appkey",
  "your_appid",
  "your_vivo_app_key",
  "your_vivo_app_id",
  "your_vivo_base_url",
  "your_vivo_llm_model",
  "your_vivo_ocr_path",
  "your_vivo_asr_package",
  "your_vivo_asr_client_version",
  "your_vivo_asr_user_id",
  "your_vivo_asr_engine_id",
  "your_storybook_tts_model",
  "your_storybook_tts_product",
  "your_storybook_tts_package",
  "your_storybook_tts_client_version",
  "your_storybook_tts_system_version",
  "your_storybook_tts_sdk_version",
  "your_storybook_tts_android_version",
]);

function readEnv(name: string) {
  const value = process.env[name]?.trim() ?? "";
  const compact = value.toLowerCase().replace(/[-_\s]/g, "");
  if (value.startsWith("填入") || value.startsWith("濉叆")) return "";
  if (PLACEHOLDER_VALUES.has(value.toLowerCase()) || compact.startsWith("your")) return "";
  return value;
}

function readNumberEnv(name: string, fallback: number) {
  const value = readEnv(name);
  const parsed = value ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getVivoEnv() {
  return {
    appId: readEnv("VIVO_APP_ID"),
    appKey: readEnv("VIVO_APP_KEY"),
    baseUrl: readEnv("VIVO_BASE_URL") || "https://api-ai.vivo.com.cn",
    llmModel: readEnv("VIVO_LLM_MODEL") || "Volc-DeepSeek-V3.2",
    ocrPath: readEnv("VIVO_OCR_PATH") || "/ocr/general_recognition",
    asrPackage: readEnv("VIVO_ASR_PACKAGE"),
    asrClientVersion: readEnv("VIVO_ASR_CLIENT_VERSION"),
    asrUserId: readEnv("VIVO_ASR_USER_ID"),
    asrEngineId: readEnv("VIVO_ASR_ENGINE_ID") || "fileasrrecorder",
    storybookTtsEngineId: readEnv("STORYBOOK_TTS_ENGINEID") || "short_audio_synthesis_jovi",
    storybookTtsVoice: readEnv("STORYBOOK_TTS_VOICE") || "yige_child",
    storybookTtsFallbackEngineId: readEnv("STORYBOOK_TTS_FALLBACK_ENGINEID") || "short_audio_synthesis_jovi",
    storybookTtsFallbackVoice: readEnv("STORYBOOK_TTS_FALLBACK_VOICE") || "vivoHelper",
    storybookTtsModel: readEnv("STORYBOOK_TTS_MODEL") || "short_audio_synthesis_jovi",
    storybookTtsProduct: readEnv("STORYBOOK_TTS_PRODUCT") || "smartchildcare-demo",
    storybookTtsPackage: readEnv("STORYBOOK_TTS_PACKAGE") || "com.smartchildcare.demo",
    storybookTtsClientVersion: readEnv("STORYBOOK_TTS_CLIENT_VERSION") || "1.0.0",
    storybookTtsSystemVersion: readEnv("STORYBOOK_TTS_SYSTEM_VERSION") || "1",
    storybookTtsSdkVersion: readEnv("STORYBOOK_TTS_SDK_VERSION") || "1",
    storybookTtsAndroidVersion: readEnv("STORYBOOK_TTS_ANDROID_VERSION") || "13",
    storybookTtsSpeed: readNumberEnv("STORYBOOK_TTS_SPEED", 45),
    storybookTtsVolume: readNumberEnv("STORYBOOK_TTS_VOLUME", 50),
  };
}

function requiredEnvForCapability(capability: VivoCapability) {
  if (capability === "chat") return ["VIVO_APP_KEY", "VIVO_APP_ID", "VIVO_BASE_URL", "VIVO_LLM_MODEL"];
  if (capability === "ocr") return ["VIVO_APP_KEY", "VIVO_APP_ID", "VIVO_BASE_URL", "VIVO_OCR_PATH"];
  if (capability === "asr") {
    return [
      "VIVO_APP_KEY",
      "VIVO_APP_ID",
      "VIVO_BASE_URL",
      "VIVO_ASR_PACKAGE",
      "VIVO_ASR_CLIENT_VERSION",
      "VIVO_ASR_USER_ID",
      "VIVO_ASR_ENGINE_ID",
    ];
  }
  // TTS 协议元数据在 getVivoEnv 中都有可工作的默认值；这里只要求真正决定鉴权和端点的核心配置。
  return [
    "VIVO_APP_KEY",
    "VIVO_APP_ID",
    "VIVO_BASE_URL",
  ];
}

function hasRequiredEnv(capability: VivoCapability) {
  return requiredEnvForCapability(capability).every((name) => Boolean(readEnv(name)));
}

export function getVivoProviderStatus<TCapability extends VivoCapability>(
  capability: TCapability
): VivoProviderStatus<TCapability> {
  const configured = hasRequiredEnv(capability);
  const warnings: string[] = [];

  if (capability === "asr") {
    warnings.push("vivo ASR HTTP is configured only when package/client/user/engine metadata is present.");
    warnings.push("Health/status reports configuration only; live ASR is claimed only by request results.");
  }

  if (capability === "ocr") {
    warnings.push("vivo OCR supports image input only; PDF or text-only inputs must remain fallback.");
  }

  if (capability === "tts") {
    warnings.push("vivo TTS uses the server WebSocket adapter; high-risk consultation remains script-only.");
  }

  if (!configured) {
    return {
      providerName: "vivo",
      capability,
      state: "fallback",
      configured: false,
      live: false,
      fallback: true,
      mock: false,
      supported: true,
      isRealProvider: false,
      status: "missing-env",
      reason: "Missing or placeholder vivo provider environment variables.",
      warnings,
      requiredEnv: requiredEnvForCapability(capability),
    };
  }

  return {
    providerName: "vivo",
    capability,
    state: "configured",
    configured: true,
    live: false,
    fallback: false,
    mock: false,
    supported: true,
    isRealProvider: true,
    status: "ready",
    reason: "Configuration is sufficient to attempt vivo provider calls; live is only set by request results.",
    warnings,
    requiredEnv: requiredEnvForCapability(capability),
  };
}
