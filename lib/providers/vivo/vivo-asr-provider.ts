import "server-only";

import { createRequestId, vivoFetch, vivoJsonRequest } from "./vivo-client";
import { VivoProviderError } from "./vivo-errors";
import { getVivoEnv, getVivoProviderStatus } from "./vivo-provider-status";
import type { VivoAsrInput, VivoAsrResult, VivoAsrSegment } from "./types";

type VivoAsrBaseResponse<TData extends Record<string, unknown> = Record<string, unknown>> = {
  sid?: string;
  action?: string;
  data?: TData;
  code?: number;
  desc?: string;
  type?: string;
  [key: string]: unknown;
};

type VivoLasrResultData = {
  result?: Array<{ onebest?: string; bg?: number; ed?: number; speaker?: number }>;
};

const SUPPORTED_ASR_MIME_TYPES = new Map<string, string>([
  ["audio/wav", "auto"],
  ["audio/wave", "auto"],
  ["audio/x-wav", "auto"],
  ["audio/pcm", "pcm"],
  ["audio/mpeg", "auto"],
  ["audio/mp3", "auto"],
  ["audio/mp4", "auto"],
  ["audio/m4a", "auto"],
  ["audio/aac", "auto"],
  ["audio/ogg", "auto"],
  ["audio/opus", "auto"],
]);

const SLICE_SIZE = 5 * 1024 * 1024;
const MAX_SIZE = 500 * 1024 * 1024;

export function isVivoAsrSupportedMimeType(mimeType?: string) {
  return SUPPORTED_ASR_MIME_TYPES.has((mimeType ?? "").toLowerCase());
}

function audioTypeFromMime(mimeType?: string) {
  return SUPPORTED_ASR_MIME_TYPES.get((mimeType ?? "").toLowerCase()) ?? "auto";
}

function toBuffer(input: NonNullable<VivoAsrInput["audioBytes"]>) {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input);
  return Buffer.from(input);
}

function buildCommonQuery(requestId: string) {
  const env = getVivoEnv();
  return {
    client_version: env.asrClientVersion,
    package: env.asrPackage,
    user_id: env.asrUserId,
    system_time: Date.now(),
    engineid: env.asrEngineId,
    requestId,
  };
}

function ensureSuccess<TData extends Record<string, unknown>>(
  response: VivoAsrBaseResponse<TData>,
  stage: string
) {
  if (response.code !== 0) {
    throw new VivoProviderError(response.desc ?? `vivo ASR ${stage} failed`, {
      capability: "asr",
      status: "provider-unavailable",
      raw: response,
    });
  }
  return response.data ?? ({} as TData);
}

function buildResult(raw: VivoAsrBaseResponse<VivoLasrResultData>, requestId: string): VivoAsrResult {
  const status = getVivoProviderStatus("asr");
  const segments: VivoAsrSegment[] =
    raw.data?.result
      ?.map((item) => ({
        text: item.onebest?.trim() ?? "",
        bg: item.bg,
        ed: item.ed,
        speaker: item.speaker,
      }))
      .filter((item) => item.text.length > 0) ?? [];

  return {
    transcript: segments.map((item) => item.text).join(""),
    confidence: null,
    providerName: "vivo",
    isRealProvider: true,
    warnings: status.warnings,
    rawResponse: raw,
    segments,
    requestId,
    status,
    model: getVivoEnv().asrEngineId,
  };
}

async function waitForProgress(taskId: string, sessionId: string, requestId: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const raw = await vivoJsonRequest<VivoAsrBaseResponse<{ progress?: number }>>({
      capability: "asr",
      path: "/lasr/progress",
      query: buildCommonQuery(requestId),
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ task_id: taskId, "x-sessionId": sessionId }),
      timeoutMs: 20_000,
    });
    const data = ensureSuccess(raw, "progress");
    if (typeof data.progress === "number" && data.progress >= 100) return;
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
}

export async function requestVivoAsr(input: VivoAsrInput): Promise<VivoAsrResult> {
  const transcript = input.transcript?.trim();
  const fallbackText = input.fallbackText?.trim();
  const status = getVivoProviderStatus("asr");
  if (transcript || fallbackText) {
    return {
      transcript: transcript || fallbackText || "",
      confidence: null,
      providerName: "vivo",
      isRealProvider: false,
      warnings: ["使用文本 fallback，未调用真实 vivo ASR。"],
      requestId: input.requestId,
      status,
      model: getVivoEnv().asrEngineId,
    };
  }

  if (!input.audioBytes) {
    throw new VivoProviderError("缺少可转写的音频内容。", {
      capability: "asr",
      status: "provider-unavailable",
    });
  }

  if (!isVivoAsrSupportedMimeType(input.mimeType)) {
    throw new VivoProviderError("vivo ASR 文档未确认当前音频格式。", {
      capability: "asr",
      status: "unsupported",
      raw: { mimeType: input.mimeType, attachmentName: input.attachmentName },
    });
  }

  if (!status.configured || !status.supported) {
    throw new VivoProviderError(status.reason ?? "vivo ASR provider is unavailable", {
      capability: "asr",
      status: status.status,
    });
  }

  const audio = toBuffer(input.audioBytes);
  if (audio.length > MAX_SIZE) {
    throw new VivoProviderError("vivo ASR 单次转写文件必须小于 500M。", {
      capability: "asr",
      status: "unsupported",
    });
  }

  const requestId = input.requestId ?? createRequestId();
  const sessionId = createRequestId();
  const sliceNum = Math.max(1, Math.ceil(audio.length / SLICE_SIZE));

  const createRaw = await vivoJsonRequest<VivoAsrBaseResponse<{ audio_id?: string }>>({
    capability: "asr",
    path: "/lasr/create",
    query: buildCommonQuery(requestId),
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({
      audio_type: audioTypeFromMime(input.mimeType),
      "x-sessionId": sessionId,
      slice_num: sliceNum,
    }),
    timeoutMs: 20_000,
  });
  const audioId = ensureSuccess(createRaw, "create").audio_id;
  if (!audioId) {
    throw new VivoProviderError("vivo ASR create did not return audio_id", {
      capability: "asr",
      status: "provider-unavailable",
      raw: createRaw,
    });
  }

  for (let index = 0; index < sliceNum; index += 1) {
    const formData = new FormData();
    const slice = audio.subarray(index * SLICE_SIZE, Math.min(audio.length, (index + 1) * SLICE_SIZE));
    const blobPart = new ArrayBuffer(slice.byteLength);
    new Uint8Array(blobPart).set(slice);
    formData.set("file", new Blob([blobPart]), input.attachmentName ?? `audio-${index}`);
    const uploadResponse = await vivoFetch({
      capability: "asr",
      path: "/lasr/upload",
      query: {
        ...buildCommonQuery(requestId),
        audio_id: audioId,
        slice_index: index,
        "x-sessionId": sessionId,
      },
      body: formData,
      timeoutMs: 30_000,
    });
    const uploadBody = (await uploadResponse.json().catch(() => null)) as VivoAsrBaseResponse | null;
    if (!uploadResponse.ok || !uploadBody || uploadBody.code !== 0) {
      throw new VivoProviderError("vivo ASR upload failed", {
        capability: "asr",
        status: "provider-unavailable",
        httpStatus: uploadResponse.status,
        raw: uploadBody,
      });
    }
  }

  const runRaw = await vivoJsonRequest<VivoAsrBaseResponse<{ task_id?: string }>>({
    capability: "asr",
    path: "/lasr/run",
    query: buildCommonQuery(requestId),
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ audio_id: audioId, "x-sessionId": sessionId }),
    timeoutMs: 20_000,
  });
  const taskId = ensureSuccess(runRaw, "run").task_id;
  if (!taskId) {
    throw new VivoProviderError("vivo ASR run did not return task_id", {
      capability: "asr",
      status: "provider-unavailable",
      raw: runRaw,
    });
  }

  await waitForProgress(taskId, sessionId, requestId);

  const resultRaw = await vivoJsonRequest<VivoAsrBaseResponse<VivoLasrResultData>>({
    capability: "asr",
    path: "/lasr/result",
    query: buildCommonQuery(requestId),
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ task_id: taskId, "x-sessionId": sessionId }),
    timeoutMs: 20_000,
  });
  ensureSuccess(resultRaw, "result");
  return buildResult(resultRaw, requestId);
}
