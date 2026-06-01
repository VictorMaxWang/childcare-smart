import "server-only";

import { createHash, createHmac, randomBytes } from "node:crypto";
import WebSocket, { type RawData } from "ws";
import { createRequestId } from "./vivo-client";
import { VivoProviderError } from "./vivo-errors";
import { getVivoEnv, getVivoProviderStatus } from "./vivo-provider-status";
import type { VivoTtsInput, VivoTtsResult } from "./types";

type TtsProfile = {
  label: string;
  engineId: string;
  voiceName: string;
};

export type VivoTtsErrorKind =
  | "missing-env"
  | "provider-unavailable"
  | "auth/signature"
  | "endpoint"
  | "network"
  | "unsupported-format"
  | "unknown";

const TTS_PATH = "/tts";
const TTS_AUDIO_FORMAT = "audio/L16;rate=24000";
const TTS_SAMPLE_RATE = 24_000;
const TTS_CHANNELS = 1;
const TTS_SAMPLE_WIDTH = 2;
const TTS_SIGNED_HEADERS = "x-ai-gateway-app-id;x-ai-gateway-timestamp;x-ai-gateway-nonce";
const DEFAULT_TIMEOUT_MS = 30_000;

function normalizeText(value: unknown) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function stableHash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function toWebSocketBaseUrl(baseUrl: string) {
  const parsed = new URL(baseUrl.replace(/\/+$/u, ""));
  if (parsed.protocol === "https:") parsed.protocol = "wss:";
  if (parsed.protocol === "http:") parsed.protocol = "ws:";
  return parsed.toString().replace(/\/+$/u, "");
}

function canonicalQueryString(query: Record<string, string | number>) {
  return Object.keys(query)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(query[key]))}`)
    .join("&");
}

function buildGatewayHeaders(input: {
  appId: string;
  appKey: string;
  query: Record<string, string | number>;
  timestamp: string;
  nonce: string;
}) {
  const signedHeadersString = [
    `x-ai-gateway-app-id:${input.appId}`,
    `x-ai-gateway-timestamp:${input.timestamp}`,
    `x-ai-gateway-nonce:${input.nonce}`,
  ].join("\n");
  const signingString = [
    "GET",
    TTS_PATH,
    canonicalQueryString(input.query),
    input.appId,
    input.timestamp,
    signedHeadersString,
  ].join("\n");
  const signature = createHmac("sha256", input.appKey)
    .update(signingString, "utf8")
    .digest("base64");

  return {
    Authorization: `Bearer ${input.appKey}`,
    "X-AI-GATEWAY-APP-ID": input.appId,
    "X-AI-GATEWAY-TIMESTAMP": input.timestamp,
    "X-AI-GATEWAY-NONCE": input.nonce,
    "X-AI-GATEWAY-SIGNED-HEADERS": TTS_SIGNED_HEADERS,
    "X-AI-GATEWAY-SIGNATURE": signature,
  };
}

function buildWavBytes(pcmBytes: Buffer) {
  const dataSize = pcmBytes.byteLength;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(TTS_CHANNELS, 22);
  buffer.writeUInt32LE(TTS_SAMPLE_RATE, 24);
  buffer.writeUInt32LE(TTS_SAMPLE_RATE * TTS_CHANNELS * TTS_SAMPLE_WIDTH, 28);
  buffer.writeUInt16LE(TTS_CHANNELS * TTS_SAMPLE_WIDTH, 32);
  buffer.writeUInt16LE(TTS_SAMPLE_WIDTH * 8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcmBytes.copy(buffer, 44);
  return buffer;
}

function parseFrame(raw: RawData) {
  const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : raw.toString();
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("vivo TTS frame is not an object");
  }
  return parsed as {
    error_code?: number | string;
    error_msg?: string;
    data?: {
      audio?: string;
      status?: number | string;
    };
  };
}

function buildUserId(input: Pick<VivoTtsInput, "childId" | "storyId" | "page">) {
  return stableHash(
    [
      normalizeText(input.childId) || "child",
      normalizeText(input.storyId) || "story",
      String(input.page ?? 1),
    ].join("::")
  ).slice(0, 32);
}

function buildNumericReqId(requestId: string) {
  const hex = requestId.replace(/[^a-f0-9]/giu, "").slice(0, 12) || randomBytes(6).toString("hex");
  return parseInt(hex, 16);
}

function buildProfiles() {
  const env = getVivoEnv();
  const profiles: TtsProfile[] = [
    {
      label: "primary",
      engineId: env.storybookTtsEngineId,
      voiceName: env.storybookTtsVoice,
    },
    {
      label: "fallback",
      engineId: env.storybookTtsFallbackEngineId,
      voiceName: env.storybookTtsFallbackVoice,
    },
  ];
  const seen = new Set<string>();
  return profiles.filter((profile) => {
    const key = `${profile.engineId}:${profile.voiceName}`;
    if (!profile.engineId || !profile.voiceName || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function synthesizeOnce(input: {
  text: string;
  requestId: string;
  profile: TtsProfile;
  childId?: string;
  storyId?: string;
  page?: number;
}) {
  const env = getVivoEnv();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const query = {
    engineid: input.profile.engineId,
    system_time: timestamp,
    user_id: buildUserId(input),
    model: env.storybookTtsModel,
    product: env.storybookTtsProduct,
    package: env.storybookTtsPackage,
    client_version: env.storybookTtsClientVersion,
    system_version: env.storybookTtsSystemVersion,
    sdk_version: env.storybookTtsSdkVersion,
    android_version: env.storybookTtsAndroidVersion,
    requestId: input.requestId,
  };
  const wsUrl = `${toWebSocketBaseUrl(env.baseUrl)}${TTS_PATH}?${canonicalQueryString(query)}`;
  const headers = buildGatewayHeaders({
    appId: env.appId,
    appKey: env.appKey,
    query,
    timestamp,
    nonce: randomBytes(4).toString("hex"),
  });

  return new Promise<Buffer>((resolve, reject) => {
    let settled = false;
    const chunks: Buffer[] = [];
    const ws = new WebSocket(wsUrl, {
      headers,
      handshakeTimeout: DEFAULT_TIMEOUT_MS,
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      ws.close();
      reject(
        new VivoProviderError("vivo TTS request timed out", {
          capability: "tts",
          status: "provider-unavailable",
        })
      );
    }, DEFAULT_TIMEOUT_MS);
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };

    ws.once("open", () => {
      ws.send(JSON.stringify({
        aue: 0,
        auf: TTS_AUDIO_FORMAT,
        vcn: input.profile.voiceName,
        text: Buffer.from(input.text, "utf8").toString("base64"),
        encoding: "utf8",
        reqId: buildNumericReqId(input.requestId),
        speed: env.storybookTtsSpeed,
        volume: env.storybookTtsVolume,
      }));
    });

    ws.on("message", (raw) => {
      try {
        const frame = parseFrame(raw);
        const errorCode = Number(frame.error_code ?? 0);
        if (errorCode) {
          finish(() => {
            ws.close();
            reject(
              new VivoProviderError(`vivo TTS synthesis failed: ${frame.error_msg ?? errorCode}`, {
                capability: "tts",
                status: "provider-unavailable",
                raw: { errorCode, errorMsg: frame.error_msg, profile: input.profile.label },
              })
            );
          });
          return;
        }
        if (frame.data?.audio) {
          chunks.push(Buffer.from(frame.data.audio, "base64"));
        }
        if (Number(frame.data?.status ?? 0) === 2) {
          finish(() => {
            ws.close();
            const pcmBytes = Buffer.concat(chunks);
            if (!pcmBytes.byteLength) {
              reject(
                new VivoProviderError("vivo TTS finished without audio data", {
                  capability: "tts",
                  status: "provider-unavailable",
                })
              );
              return;
            }
            resolve(buildWavBytes(pcmBytes));
          });
        }
      } catch (error) {
        finish(() => {
          ws.close();
          reject(
            new VivoProviderError(error instanceof Error ? error.message : "vivo TTS invalid frame", {
              capability: "tts",
              status: "provider-unavailable",
              raw: error,
            })
          );
        });
      }
    });

    ws.once("unexpected-response", (_request, response) => {
      finish(() => {
        reject(
          new VivoProviderError(`vivo TTS websocket handshake failed with HTTP ${response.statusCode}`, {
            capability: "tts",
            status: response.statusCode === 401 || response.statusCode === 403 ? "error" : "provider-unavailable",
            httpStatus: response.statusCode,
          })
        );
      });
    });

    ws.once("error", (error) => {
      finish(() => {
        reject(
          new VivoProviderError(error.message, {
            capability: "tts",
            status: "provider-unavailable",
            raw: error,
          })
        );
      });
    });

    ws.once("close", () => {
      finish(() => {
        reject(
          new VivoProviderError("vivo TTS websocket closed before audio completed", {
            capability: "tts",
            status: "provider-unavailable",
          })
        );
      });
    });
  });
}

export function classifyVivoTtsError(error: unknown): VivoTtsErrorKind {
  if (error instanceof VivoProviderError) {
    const message = error.message.toLowerCase();
    if (error.status === "missing-env") return "missing-env";
    if (error.httpStatus === 401 || error.httpStatus === 403) return "auth/signature";
    if (message.includes("signature") || message.includes("auth")) return "auth/signature";
    if (message.includes("unsupported")) return "unsupported-format";
    if (message.includes("handshake") || error.httpStatus) return "endpoint";
    if (message.includes("network") || message.includes("econn") || message.includes("timed out")) return "network";
    return "provider-unavailable";
  }
  return "unknown";
}

export async function requestVivoTts(input: VivoTtsInput): Promise<VivoTtsResult> {
  const text = normalizeText(input.text);
  if (!text) {
    throw new VivoProviderError("vivo TTS requires non-empty text", {
      capability: "tts",
      status: "provider-unavailable",
    });
  }
  if (text.length > 500) {
    throw new VivoProviderError("vivo TTS text exceeds the fixed storybook limit", {
      capability: "tts",
      status: "provider-unavailable",
    });
  }

  const status = getVivoProviderStatus("tts");
  if (!status.configured || !status.supported) {
    throw new VivoProviderError(status.reason ?? "vivo TTS provider is unavailable", {
      capability: "tts",
      status: status.status,
    });
  }

  const requestId = input.requestId ?? createRequestId();
  const profiles = buildProfiles();
  let lastError: unknown = null;

  for (const profile of profiles) {
    try {
      const audioBytes = await synthesizeOnce({
        text,
        requestId,
        profile,
        childId: input.childId,
        storyId: input.storyId,
        page: input.page,
      });
      return {
        audioBytes,
        audioContentType: "audio/wav",
        providerName: "vivo",
        state: "live",
        live: true,
        fallback: false,
        mock: false,
        engineId: profile.engineId,
        voiceName: profile.voiceName,
        requestId,
        isRealProvider: true,
        status: {
          ...status,
          state: "live",
          live: true,
          fallback: false,
          mock: false,
          status: "ready",
        },
        warnings: status.warnings,
      };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  throw new VivoProviderError("vivo TTS provider has no configured profiles", {
    capability: "tts",
    status: "missing-env",
  });
}
