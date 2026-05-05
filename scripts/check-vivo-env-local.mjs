import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

const projectDir = process.cwd();
const allowPartial = process.argv.includes("--allow-partial");

loadEnvConfig(projectDir, false, {
  info: () => {},
  error: () => {},
});

const vivoEnvNames = [
  "VIVO_APP_KEY",
  "VIVO_APP_ID",
  "VIVO_BASE_URL",
  "VIVO_LLM_MODEL",
  "VIVO_OCR_PATH",
  "VIVO_ASR_PACKAGE",
  "VIVO_ASR_CLIENT_VERSION",
  "VIVO_ASR_USER_ID",
  "VIVO_ASR_ENGINE_ID",
];

const capabilityRequirements = {
  chat: ["VIVO_APP_KEY", "VIVO_APP_ID", "VIVO_BASE_URL", "VIVO_LLM_MODEL"],
  ocr: ["VIVO_APP_KEY", "VIVO_APP_ID", "VIVO_BASE_URL", "VIVO_OCR_PATH"],
  asr: [
    "VIVO_APP_KEY",
    "VIVO_APP_ID",
    "VIVO_BASE_URL",
    "VIVO_ASR_PACKAGE",
    "VIVO_ASR_CLIENT_VERSION",
    "VIVO_ASR_USER_ID",
    "VIVO_ASR_ENGINE_ID",
  ],
};

const placeholderValues = new Set([
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

function readEnv(name) {
  const value = (process.env[name] ?? "").trim();
  if (value.startsWith("填入")) return "";
  return placeholderValues.has(value.toLowerCase()) ? "" : value;
}

function capabilityStatus(capability) {
  const requiredEnv = capabilityRequirements[capability];
  const missingEnv = requiredEnv.filter((name) => !readEnv(name));
  return {
    requiredEnv,
    missingEnv,
    status: missingEnv.length === 0 ? "ready" : "missing-env",
  };
}

const envLocalExists = fs.existsSync(path.join(projectDir, ".env.local"));
const missing = vivoEnvNames.filter((name) => !readEnv(name));
const publicVivoKeys = Object.keys(process.env)
  .filter((name) => name.startsWith("NEXT_PUBLIC_VIVO_"))
  .sort();
const capabilities = {
  Chat: capabilityStatus("chat"),
  OCR: capabilityStatus("ocr"),
  ASR: capabilityStatus("asr"),
};

console.log(`ProjectRoot SET`);
console.log(`.env.local ${envLocalExists ? "SET" : "MISSING"}`);

for (const name of vivoEnvNames) {
  console.log(`${name} ${readEnv(name) ? "SET" : "MISSING"}`);
}

console.log(`NEXT_PUBLIC_VIVO_* ${publicVivoKeys.length === 0 ? "MISSING" : "SET"}`);

for (const [label, result] of Object.entries(capabilities)) {
  console.log(`${label} ${result.status}`);
}

if (missing.length > 0) {
  console.log(`Missing variables: ${missing.join(", ")}`);
}

if (publicVivoKeys.length > 0) {
  console.log(`Security risk: NEXT_PUBLIC_VIVO_* SET`);
}

const chatReady = capabilities.Chat.status === "ready";
const ocrReady = capabilities.OCR.status === "ready";
const asrReady = capabilities.ASR.status === "ready";
const fullReady = missing.length === 0 && chatReady && ocrReady && asrReady;
const partialReady = allowPartial && chatReady && ocrReady;

process.exitCode = publicVivoKeys.length > 0 || !(fullReady || partialReady) ? 1 : 0;
