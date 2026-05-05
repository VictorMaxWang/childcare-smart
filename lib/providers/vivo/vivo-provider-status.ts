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
  "placeholder",
  "changeme",
  "change_me",
]);

function readEnv(name: string) {
  const value = process.env[name]?.trim() ?? "";
  if (value.startsWith("填入")) return "";
  return PLACEHOLDER_VALUES.has(value.toLowerCase()) ? "" : value;
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
  };
}

function requiredEnvForCapability(capability: VivoCapability) {
  if (capability === "chat") return ["VIVO_APP_KEY", "VIVO_APP_ID", "VIVO_BASE_URL", "VIVO_LLM_MODEL"];
  if (capability === "ocr") return ["VIVO_APP_KEY", "VIVO_APP_ID", "VIVO_BASE_URL", "VIVO_OCR_PATH"];
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

function hasRequiredEnv(capability: VivoCapability) {
  return requiredEnvForCapability(capability).every((name) => Boolean(readEnv(name)));
}

export function getVivoProviderStatus(capability: VivoCapability): VivoProviderStatus {
  const configured = hasRequiredEnv(capability);
  const warnings: string[] = [];

  if (capability === "asr") {
    warnings.push("vivo ASR HTTP 长语音转写仅确认支持 wav/pcm/m4a/mp3/aac/ogg/ogg_opus。");
    warnings.push("vivo 实时 ASR WebSocket 已确认支持，但当前 E05 只落地服务端 HTTP 文件转写接口，E06 可继续复用扩展。");
  }

  if (capability === "ocr") {
    warnings.push("vivo 通用 OCR 文档仅确认 jpg/png/bmp 图片识别，未确认 PDF。");
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
