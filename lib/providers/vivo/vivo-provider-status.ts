import "server-only";

import type { VivoCapability, VivoProviderStatus } from "./types";

const PLACEHOLDER_VALUES = new Set([
  "",
  "unknown",
  "n/a",
  "na",
  "null",
  "undefined",
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
  "placeholder",
  "changeme",
  "change_me",
]);

function readEnv(name: string) {
  const value = process.env[name]?.trim() ?? "";
  if (value.startsWith("填入")) return "";
  return PLACEHOLDER_VALUES.has(value.toLowerCase()) ? "" : value;
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
    storybookTtsVoice: readEnv("STORYBOOK_TTS_VOICE") || "yige",
    storybookTtsFallbackEngineId: readEnv("STORYBOOK_TTS_FALLBACK_ENGINEID") || "short_audio_synthesis_jovi",
    storybookTtsFallbackVoice: readEnv("STORYBOOK_TTS_FALLBACK_VOICE") || "vivoHelper",
    storybookTtsModel: readEnv("STORYBOOK_TTS_MODEL"),
    storybookTtsProduct: readEnv("STORYBOOK_TTS_PRODUCT"),
    storybookTtsPackage: readEnv("STORYBOOK_TTS_PACKAGE"),
    storybookTtsClientVersion: readEnv("STORYBOOK_TTS_CLIENT_VERSION"),
    storybookTtsSystemVersion: readEnv("STORYBOOK_TTS_SYSTEM_VERSION"),
    storybookTtsSdkVersion: readEnv("STORYBOOK_TTS_SDK_VERSION"),
    storybookTtsAndroidVersion: readEnv("STORYBOOK_TTS_ANDROID_VERSION"),
    storybookTtsSpeed: readNumberEnv("STORYBOOK_TTS_SPEED", 45),
    storybookTtsVolume: readNumberEnv("STORYBOOK_TTS_VOLUME", 50),
  };
}

function requiredEnvForCapability(capability: VivoCapability) {
  if (capability === "chat") return ["VIVO_APP_KEY", "VIVO_APP_ID", "VIVO_BASE_URL", "VIVO_LLM_MODEL"];
  if (capability === "ocr") return ["VIVO_APP_KEY", "VIVO_APP_ID", "VIVO_BASE_URL", "VIVO_OCR_PATH"];
  if (capability === "asr") return [
    "VIVO_APP_KEY",
    "VIVO_APP_ID",
    "VIVO_BASE_URL",
    "VIVO_ASR_PACKAGE",
    "VIVO_ASR_CLIENT_VERSION",
    "VIVO_ASR_USER_ID",
    "VIVO_ASR_ENGINE_ID",
  ];
  return [
    "VIVO_APP_KEY",
    "VIVO_APP_ID",
    "VIVO_BASE_URL",
    "STORYBOOK_TTS_MODEL",
    "STORYBOOK_TTS_PRODUCT",
    "STORYBOOK_TTS_PACKAGE",
    "STORYBOOK_TTS_CLIENT_VERSION",
    "STORYBOOK_TTS_SYSTEM_VERSION",
    "STORYBOOK_TTS_SDK_VERSION",
    "STORYBOOK_TTS_ANDROID_VERSION",
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
    warnings.push("vivo ASR HTTP 长语音转写仅确认支持 wav/pcm/m4a/mp3/aac/ogg/ogg_opus。");
    warnings.push("vivo 实时 ASR WebSocket 已确认支持，但当前 E05 只落地服务端 HTTP 文件转写接口，E06 可继续复用扩展。");
  }

  if (capability === "ocr") {
    warnings.push("vivo 通用 OCR 文档仅确认 jpg/png/bmp 图片识别，未确认 PDF。");
  }

  if (capability === "tts") {
    warnings.push("vivo TTS 使用服务端 WebSocket 签名调用；前端只播放静态音频或受控服务端 endpoint。");
  }

  if (!configured) {
    return {
      providerName: "vivo",
      capability,
      configured: false,
      supported: true,
      isRealProvider: false,
      status: "missing-env",
      reason: "缺少 vivo AIGC provider 必需环境变量。",
      warnings,
      requiredEnv: requiredEnvForCapability(capability),
    };
  }

  return {
    providerName: "vivo",
    capability,
    configured: true,
    supported: true,
    isRealProvider: true,
    status: "ready",
    warnings,
    requiredEnv: requiredEnvForCapability(capability),
  };
}
