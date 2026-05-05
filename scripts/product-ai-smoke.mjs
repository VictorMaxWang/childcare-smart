import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

const projectDir = process.cwd();

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

const tinyPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

function readEnv(name) {
  const value = (process.env[name] ?? "").trim();
  if (value.startsWith("填入")) return "";
  return placeholderValues.has(value.toLowerCase()) ? "" : value;
}

function createRequestId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function envStatus() {
  return Object.fromEntries(vivoEnvNames.map((name) => [name, readEnv(name) ? "SET" : "MISSING"]));
}

function capabilityStatus(capability) {
  const requiredEnv = capabilityRequirements[capability];
  const missingEnv = requiredEnv.filter((name) => !readEnv(name));
  return {
    status: missingEnv.length === 0 ? "ready" : "missing-env",
    requiredEnv,
    missingEnv,
  };
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/u, "");
}

function buildUrl(pathname, query = {}) {
  const baseUrl = trimTrailingSlash(readEnv("VIVO_BASE_URL"));
  const url = new URL(pathname, `${baseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (typeof value !== "undefined" && String(value).length > 0) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function classifyProviderError(error) {
  if (error?.classification) return error.classification;
  if (error?.name === "AbortError" || error?.code === "ABORT_ERR") return "network";
  const status = error?.httpStatus;
  const text = `${error?.message ?? ""} ${error?.bodyText ?? ""}`.toLowerCase();

  if (status === 401 || /signature|authorization|unauthorized|appkey|token|bearer/u.test(text)) {
    return "auth/signature";
  }
  if (status === 403 || /forbidden|permission|denied|quota|scope/u.test(text)) return "permission";
  if (status === 404 || status === 405 || /not found|endpoint|path|route/u.test(text)) return "endpoint";
  if (/model|模型/u.test(text)) return "model";
  if (status === 415 || /unsupported|format|mime|audio_type|image/u.test(text)) return "unsupported format";
  if (/network|fetch failed|econn|enotfound|timeout|timed out/u.test(text)) return "network";
  return "unknown";
}

async function fetchJson(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: "no-store",
    });
    const bodyText = await response.text();
    let body = null;
    try {
      body = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      body = null;
    }

    if (!response.ok) {
      const error = new Error(`provider HTTP ${response.status}`);
      error.httpStatus = response.status;
      error.bodyText = bodyText;
      throw error;
    }

    return { body, httpStatus: response.status };
  } finally {
    clearTimeout(timeout);
  }
}

function authHeaders(extra = {}) {
  return {
    ...extra,
    Authorization: `Bearer ${readEnv("VIVO_APP_KEY")}`,
  };
}

async function smokeChat() {
  const requestId = createRequestId("chat");
  const { body, httpStatus } = await fetchJson(
    buildUrl("/v1/chat/completions", { request_id: requestId, requestId }),
    {
      method: "POST",
      headers: authHeaders({
        "Content-Type": "application/json; charset=utf-8",
      }),
      body: JSON.stringify({
        model: readEnv("VIVO_LLM_MODEL"),
        messages: [
          { role: "system", content: "Return a short health-check response." },
          { role: "user", content: "Say READY in one short sentence." },
        ],
        stream: false,
        temperature: 0.1,
        max_tokens: 32,
      }),
    },
    60_000
  );
  const text = body?.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) {
    const error = new Error("chat response missing text");
    error.classification = "unknown";
    throw error;
  }
  return { httpStatus, requestId, evidence: "READY" };
}

async function smokeOcr() {
  const requestId = createRequestId("ocr");
  const body = new URLSearchParams();
  body.set("image", tinyPngBase64);
  body.set("pos", "2");
  body.set("businessid", `aigc${readEnv("VIVO_APP_ID")}`);

  const result = await fetchJson(
    buildUrl(readEnv("VIVO_OCR_PATH"), { requestId }),
    {
      method: "POST",
      headers: authHeaders({
        "Content-Type": "application/x-www-form-urlencoded",
      }),
      body,
    },
    30_000
  );

  if (typeof result.body?.error_code !== "undefined" && result.body.error_code !== 0) {
    const error = new Error("ocr provider returned non-zero code");
    error.bodyText = `${result.body?.error_msg ?? ""}`;
    error.classification = classifyProviderError(error);
    throw error;
  }

  return { httpStatus: result.httpStatus, requestId, evidence: "READY" };
}

function createSilentWav() {
  const sampleRate = 16_000;
  const seconds = 1;
  const samples = sampleRate * seconds;
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

function commonAsrQuery(requestId) {
  return {
    client_version: readEnv("VIVO_ASR_CLIENT_VERSION"),
    package: readEnv("VIVO_ASR_PACKAGE"),
    user_id: readEnv("VIVO_ASR_USER_ID"),
    system_time: Date.now(),
    engineid: readEnv("VIVO_ASR_ENGINE_ID"),
    requestId,
  };
}

function ensureAsrSuccess(body, stage) {
  if (body?.code !== 0) {
    const error = new Error(`asr ${stage} failed`);
    error.bodyText = `${body?.desc ?? ""}`;
    error.classification = classifyProviderError(error);
    throw error;
  }
  return body?.data ?? {};
}

async function smokeAsr() {
  const requestId = createRequestId("asr");
  const sessionId = createRequestId("session");
  const audio = createSilentWav();

  const create = await fetchJson(
    buildUrl("/lasr/create", commonAsrQuery(requestId)),
    {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json; charset=UTF-8" }),
      body: JSON.stringify({
        audio_type: "auto",
        "x-sessionId": sessionId,
        slice_num: 1,
      }),
    },
    30_000
  );
  const audioId = ensureAsrSuccess(create.body, "create").audio_id;
  if (!audioId) {
    const error = new Error("asr create missing audio_id");
    error.classification = "unknown";
    throw error;
  }

  const formData = new FormData();
  formData.set("file", new Blob([audio], { type: "audio/wav" }), "vivo-smoke.wav");
  const uploadController = new AbortController();
  const uploadTimeout = setTimeout(() => uploadController.abort(), 30_000);
  try {
    const uploadResponse = await fetch(
      buildUrl("/lasr/upload", {
        ...commonAsrQuery(requestId),
        audio_id: audioId,
        slice_index: 0,
        "x-sessionId": sessionId,
      }),
      {
        method: "POST",
        headers: authHeaders(),
        body: formData,
        cache: "no-store",
        signal: uploadController.signal,
      }
    );
    const uploadText = await uploadResponse.text();
    let uploadBody = null;
    try {
      uploadBody = uploadText ? JSON.parse(uploadText) : null;
    } catch {
      uploadBody = null;
    }
    if (!uploadResponse.ok || uploadBody?.code !== 0) {
      const error = new Error("asr upload failed");
      error.httpStatus = uploadResponse.status;
      error.bodyText = uploadText;
      throw error;
    }
  } finally {
    clearTimeout(uploadTimeout);
  }

  const run = await fetchJson(
    buildUrl("/lasr/run", commonAsrQuery(requestId)),
    {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json; charset=UTF-8" }),
      body: JSON.stringify({ audio_id: audioId, "x-sessionId": sessionId }),
    },
    30_000
  );
  const taskId = ensureAsrSuccess(run.body, "run").task_id;
  if (!taskId) {
    const error = new Error("asr run missing task_id");
    error.classification = "unknown";
    throw error;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const progress = await fetchJson(
      buildUrl("/lasr/progress", commonAsrQuery(requestId)),
      {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json; charset=UTF-8" }),
        body: JSON.stringify({ task_id: taskId, "x-sessionId": sessionId }),
      },
      30_000
    );
    const progressData = ensureAsrSuccess(progress.body, "progress");
    if (typeof progressData.progress === "number" && progressData.progress >= 100) break;
    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  const result = await fetchJson(
    buildUrl("/lasr/result", commonAsrQuery(requestId)),
    {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json; charset=UTF-8" }),
      body: JSON.stringify({ task_id: taskId, "x-sessionId": sessionId }),
    },
    30_000
  );
  ensureAsrSuccess(result.body, "result");
  return { httpStatus: result.httpStatus, requestId, evidence: "READY" };
}

async function runCapability(capability, runner) {
  const config = capabilityStatus(capability);
  if (config.status !== "ready") {
    return {
      status: "missing-env",
      sentLiveRequest: false,
      missingEnv: config.missingEnv,
      classification: null,
      httpStatus: null,
    };
  }

  const started = Date.now();
  try {
    const result = await runner();
    return {
      status: "live-pass",
      sentLiveRequest: true,
      missingEnv: [],
      classification: null,
      httpStatus: result.httpStatus,
      requestId: result.requestId,
      durationMs: Date.now() - started,
      evidence: result.evidence,
    };
  } catch (error) {
    return {
      status: "provider-error",
      sentLiveRequest: true,
      missingEnv: [],
      classification: classifyProviderError(error),
      httpStatus: error?.httpStatus ?? null,
      durationMs: Date.now() - started,
    };
  }
}

function markdownReport(report) {
  const lines = [
    "# R04 vivo product:ai live smoke",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Environment",
    "",
    `- .env.local: ${report.envLocalExists ? "SET" : "MISSING"}`,
    `- NEXT_PUBLIC_VIVO_*: ${report.publicVivoEnv === "NONE" ? "MISSING" : "SET"}`,
    `- product:ai: ${report.productAiStatus}`,
    `- Release gate: ${report.releaseGate}`,
    "",
    "## Variables",
    "",
    ...Object.entries(report.env).map(([name, status]) => `- ${name}: ${status}`),
    "",
    "## Capability smoke",
    "",
    ...Object.entries(report.capabilities).map(([name, result]) => {
      const suffix = result.classification ? ` (${result.classification})` : "";
      return `- ${name}: ${result.status}${suffix}`;
    }),
    "",
    "## Secret safety",
    "",
    "- Real AppKEY/token/signature values were not written to this report.",
    "- NEXT_PUBLIC_VIVO_* must remain absent.",
  ];
  return `${lines.join("\n")}\n`;
}

const envLocalExists = await fs
  .access(path.join(projectDir, ".env.local"))
  .then(() => true)
  .catch(() => false);
const publicVivoEnv = Object.keys(process.env)
  .filter((name) => name.startsWith("NEXT_PUBLIC_VIVO_"))
  .sort();

const capabilities = {
  chat: await runCapability("chat", smokeChat),
  ocr: await runCapability("ocr", smokeOcr),
  asr: await runCapability("asr", smokeAsr),
};

const missingEnv = vivoEnvNames.filter((name) => !readEnv(name));
const providerFailures = Object.values(capabilities).filter((item) => item.status === "provider-error");
const livePasses = Object.values(capabilities).filter((item) => item.status === "live-pass");
const missingCapabilities = Object.values(capabilities).filter((item) => item.status === "missing-env");
const productAiStatus =
  providerFailures.length > 0
    ? "provider-error"
    : livePasses.length === 3
      ? "live-pass"
      : livePasses.length > 0
        ? "fallback-pass"
        : missingCapabilities.length > 0
          ? "missing-env"
          : "fallback-pass";
const releaseGate =
  publicVivoEnv.length > 0
    ? "blocked-public-env"
    : providerFailures.length > 0
      ? "blocked-provider-error"
      : missingEnv.length > 0
        ? "demo-ok-production-blocked"
        : livePasses.length === 3
          ? "live-provider-verified"
          : "needs-real-provider";

const report = {
  taskId: "R04",
  smoke: "product-ai-live",
  generatedAt: new Date().toISOString(),
  projectRoot: projectDir,
  envLocalExists,
  env: envStatus(),
  missingEnv,
  publicVivoEnv: publicVivoEnv.length > 0 ? publicVivoEnv : "NONE",
  capabilities,
  productAiStatus,
  releaseGate,
  secretsExposed: false,
};

const outDir = path.join(projectDir, "artifacts", "product-completion", "R04");
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, "product-ai-live-smoke.json"), `${JSON.stringify(report, null, 2)}\n`);
await fs.writeFile(path.join(outDir, "product-ai-live-smoke.md"), markdownReport(report));

console.log(JSON.stringify(report, null, 2));

if (missingEnv.length > 0) {
  console.warn(`product-ai missing-env: ${missingEnv.join(", ")}`);
}
if (publicVivoEnv.length > 0) {
  console.error("product-ai security risk: NEXT_PUBLIC_VIVO_* SET");
}
if (providerFailures.length > 0) {
  console.error(
    `product-ai provider-error: ${providerFailures.map((item) => item.classification ?? "unknown").join(", ")}`
  );
}

process.exitCode = publicVivoEnv.length > 0 || providerFailures.length > 0 ? 1 : 0;
