import fs from "node:fs";
import path from "node:path";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import nextEnv from "@next/env";
import WebSocket from "ws";

const { loadEnvConfig } = nextEnv;
const projectDir = process.cwd();
const force = process.argv.includes("--force");

loadEnvConfig(projectDir, false, {
  info: () => {},
  error: () => {},
});

const story = {
  id: "lin-xiaoyu-one-small-brave-step",
  childId: "c-1",
  title: "林小雨的一小步勇敢",
  pages: [
    {
      page: 1,
      text: "今天，林小雨听见走廊里“哗啦”一声。\n她抱紧小兔，小声说：“我有一点害怕。”",
    },
    {
      page: 2,
      text: "老师蹲下来，说：“害怕也没关系。我们先吸一口气，再慢慢吐出来。”\n林小雨跟着做了一次，心里好像亮了一点点。",
    },
    {
      page: 3,
      text: "老师说：“勇敢不是一下子跑过去。勇敢可以是先走一小步。”\n林小雨看着前面，轻轻迈出了一步。",
    },
    {
      page: 4,
      text: "“叮铃铃——”\n林小雨终于看清楚了。\n原来不是怪声音，是窗边的小风铃在唱歌。",
    },
    {
      page: 5,
      text: "这时，一个小弟弟也小声说：“我害怕。”\n林小雨想了想，说：“没关系，我们可以一起走一小步。”",
    },
    {
      page: 6,
      text: "林小雨还是会害怕。\n可是她知道了：\n勇敢不是不害怕，勇敢是害怕的时候，也愿意试一小步。",
    },
  ],
};

const requiredEnv = [
  "VIVO_APP_ID",
  "VIVO_APP_KEY",
  "VIVO_BASE_URL",
  "STORYBOOK_TTS_MODEL",
  "STORYBOOK_TTS_PRODUCT",
  "STORYBOOK_TTS_PACKAGE",
  "STORYBOOK_TTS_CLIENT_VERSION",
  "STORYBOOK_TTS_SYSTEM_VERSION",
  "STORYBOOK_TTS_SDK_VERSION",
  "STORYBOOK_TTS_ANDROID_VERSION",
];
const placeholderValues = new Set([
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

function readEnv(name, fallback = "") {
  const value = (process.env[name] ?? fallback).trim();
  return placeholderValues.has(value.toLowerCase()) ? "" : value;
}

function readNumberEnv(name, fallback) {
  const parsed = Number(readEnv(name));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sha256(bufferOrText) {
  return createHash("sha256").update(bufferOrText).digest("hex");
}

function canonicalQueryString(query) {
  return Object.keys(query)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(query[key]))}`)
    .join("&");
}

function toWebSocketBaseUrl(baseUrl) {
  const parsed = new URL(baseUrl.replace(/\/+$/u, ""));
  if (parsed.protocol === "https:") parsed.protocol = "wss:";
  if (parsed.protocol === "http:") parsed.protocol = "ws:";
  return parsed.toString().replace(/\/+$/u, "");
}

function buildHeaders({ appId, appKey, query, timestamp }) {
  const nonce = randomBytes(4).toString("hex");
  const signedHeaders = [
    `x-ai-gateway-app-id:${appId}`,
    `x-ai-gateway-timestamp:${timestamp}`,
    `x-ai-gateway-nonce:${nonce}`,
  ].join("\n");
  const signingString = [
    "GET",
    "/tts",
    canonicalQueryString(query),
    appId,
    timestamp,
    signedHeaders,
  ].join("\n");
  return {
    Authorization: `Bearer ${appKey}`,
    "X-AI-GATEWAY-APP-ID": appId,
    "X-AI-GATEWAY-TIMESTAMP": timestamp,
    "X-AI-GATEWAY-NONCE": nonce,
    "X-AI-GATEWAY-SIGNED-HEADERS": "x-ai-gateway-app-id;x-ai-gateway-timestamp;x-ai-gateway-nonce",
    "X-AI-GATEWAY-SIGNATURE": createHmac("sha256", appKey).update(signingString, "utf8").digest("base64"),
  };
}

function buildWavBytes(pcmBytes) {
  const dataSize = pcmBytes.byteLength;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(24000, 24);
  buffer.writeUInt32LE(24000 * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcmBytes.copy(buffer, 44);
  return buffer;
}

function userIdFor(page) {
  return sha256(`${story.childId}::${story.id}::${page}`).slice(0, 32);
}

function numericReqId(requestId) {
  const hex = requestId.replace(/[^a-f0-9]/giu, "").slice(0, 12) || randomBytes(6).toString("hex");
  return parseInt(hex, 16);
}

function synthesizePage(page) {
  const appId = readEnv("VIVO_APP_ID");
  const appKey = readEnv("VIVO_APP_KEY");
  const baseUrl = readEnv("VIVO_BASE_URL", "https://api-ai.vivo.com.cn");
  const requestId = randomUUID();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const engineId = readEnv("STORYBOOK_TTS_ENGINEID", "short_audio_synthesis_jovi");
  const voice = readEnv("STORYBOOK_TTS_VOICE", "yige");
  const query = {
    engineid: engineId,
    system_time: timestamp,
    user_id: userIdFor(page.page),
    model: readEnv("STORYBOOK_TTS_MODEL"),
    product: readEnv("STORYBOOK_TTS_PRODUCT"),
    package: readEnv("STORYBOOK_TTS_PACKAGE"),
    client_version: readEnv("STORYBOOK_TTS_CLIENT_VERSION"),
    system_version: readEnv("STORYBOOK_TTS_SYSTEM_VERSION"),
    sdk_version: readEnv("STORYBOOK_TTS_SDK_VERSION"),
    android_version: readEnv("STORYBOOK_TTS_ANDROID_VERSION"),
    requestId,
  };
  const wsUrl = `${toWebSocketBaseUrl(baseUrl)}/tts?${canonicalQueryString(query)}`;
  const headers = buildHeaders({ appId, appKey, query, timestamp });
  const speed = readNumberEnv("STORYBOOK_TTS_SPEED", 45);
  const volume = readNumberEnv("STORYBOOK_TTS_VOLUME", 50);

  return new Promise((resolve, reject) => {
    const chunks = [];
    let settled = false;
    const ws = new WebSocket(wsUrl, {
      headers,
      handshakeTimeout: 30000,
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      ws.close();
      reject(new Error("network: vivo TTS timed out"));
    }, 30000);
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };

    ws.once("open", () => {
      ws.send(JSON.stringify({
        aue: 0,
        auf: "audio/L16;rate=24000",
        vcn: voice,
        text: Buffer.from(page.text.replace(/\s+/gu, " ").trim(), "utf8").toString("base64"),
        encoding: "utf8",
        reqId: numericReqId(requestId),
        speed,
        volume,
      }));
    });
    ws.on("message", (raw) => {
      try {
        const frame = JSON.parse(Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw));
        const errorCode = Number(frame.error_code ?? 0);
        if (errorCode) {
          finish(() => {
            ws.close();
            reject(new Error(`provider-unavailable: vivo error ${errorCode}`));
          });
          return;
        }
        if (frame.data?.audio) chunks.push(Buffer.from(frame.data.audio, "base64"));
        if (Number(frame.data?.status ?? 0) === 2) {
          finish(() => {
            ws.close();
            const pcm = Buffer.concat(chunks);
            if (!pcm.byteLength) {
              reject(new Error("provider-unavailable: empty audio"));
              return;
            }
            resolve({ wavBytes: buildWavBytes(pcm), engineId, voice });
          });
        }
      } catch (error) {
        finish(() => {
          ws.close();
          reject(new Error(`unknown: ${error instanceof Error ? error.message : "invalid frame"}`));
        });
      }
    });
    ws.once("unexpected-response", (_request, response) => {
      finish(() => {
        const kind = response.statusCode === 401 || response.statusCode === 403 ? "auth/signature" : "endpoint";
        reject(new Error(`${kind}: vivo websocket HTTP ${response.statusCode}`));
      });
    });
    ws.once("error", (error) => {
      finish(() => reject(new Error(`network: ${error.message}`)));
    });
    ws.once("close", () => {
      finish(() => reject(new Error("network: vivo websocket closed early")));
    });
  });
}

function convertWavToMp3(wavPath, mp3Path) {
  const candidates = [
    process.env.FFMPEG_PATH,
    "C:/msys64/mingw64/bin/ffmpeg.exe",
    "ffmpeg",
  ].filter(Boolean);
  for (const candidate of candidates) {
    const result = spawnSync(candidate, [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      wavPath,
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "96k",
      mp3Path,
    ], {
      stdio: "pipe",
    });
    if (result.status === 0) return true;
  }
  return false;
}

async function main() {
  const missingEnv = requiredEnv.filter((name) => !readEnv(name));
  if (missingEnv.length) {
    console.error(JSON.stringify({
      status: "missing-env",
      missingEnv,
      message: "vivo TTS env is incomplete; static audio was not generated.",
    }));
    process.exitCode = 1;
    return;
  }

  const audioDir = path.join(projectDir, "public/demo-media/storybooks/lin-xiaoyu/audio");
  const workDir = path.join(projectDir, "artifacts/demo-media/STORYBOOK-LOCK-01/audio-work");
  fs.mkdirSync(audioDir, { recursive: true });
  fs.mkdirSync(workDir, { recursive: true });

  const manifest = {
    storybookId: story.id,
    provider: "vivo",
    generatedAt: new Date().toISOString(),
    files: [],
  };

  for (const page of story.pages) {
    const fileName = `page-${String(page.page).padStart(2, "0")}.mp3`;
    const mp3Path = path.join(audioDir, fileName);
    if (!force && fs.existsSync(mp3Path)) {
      const bytes = fs.readFileSync(mp3Path);
      manifest.files.push({
        page: page.page,
        path: `/demo-media/storybooks/lin-xiaoyu/audio/${fileName}`,
        mimeType: "audio/mpeg",
        sizeBytes: bytes.byteLength,
        sha256: sha256(bytes),
        textHash: sha256(page.text),
        status: "skipped-existing",
      });
      continue;
    }

    const { wavBytes, engineId, voice } = await synthesizePage(page);
    const wavPath = path.join(workDir, `page-${String(page.page).padStart(2, "0")}.wav`);
    fs.writeFileSync(wavPath, wavBytes);
    if (!convertWavToMp3(wavPath, mp3Path)) {
      throw new Error("unsupported-format: ffmpeg mp3 conversion failed");
    }
    const bytes = fs.readFileSync(mp3Path);
    manifest.files.push({
      page: page.page,
      path: `/demo-media/storybooks/lin-xiaoyu/audio/${fileName}`,
      mimeType: "audio/mpeg",
      sizeBytes: bytes.byteLength,
      sha256: sha256(bytes),
      textHash: sha256(page.text),
      status: "generated",
      engineId,
      voice,
    });
  }

  fs.writeFileSync(
    path.join(audioDir, "audio-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
  console.log(JSON.stringify({
    status: "done",
    files: manifest.files.map((file) => file.path),
  }));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  const [kind] = message.split(":");
  console.error(JSON.stringify({
    status: [
      "missing-env",
      "provider-unavailable",
      "auth/signature",
      "endpoint",
      "network",
      "unsupported-format",
      "unknown",
    ].includes(kind)
      ? kind
      : "unknown",
    message,
  }));
  process.exitCode = 1;
});
