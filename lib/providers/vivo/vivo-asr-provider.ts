import "server-only";

import { createHash } from "node:crypto";
import { createRequestId, vivoJsonRequest } from "./vivo-client";
import { VivoProviderError } from "./vivo-errors";
import { getVivoEnv, getVivoProviderStatus } from "./vivo-provider-status";
import type { VivoAsrInput, VivoAsrResult, VivoAsrSegment } from "./types";
import {
  getVivoAsrTaskStore,
  type VivoAsrTaskIdentity,
  type VivoAsrTaskStore,
} from "@/lib/server/vivo-asr-task-store";

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
const DEFAULT_ASR_OPERATION_TIMEOUT_MS = 45_000;
const MAX_ASR_OPERATION_TIMEOUT_MS = 55_000;
const ASR_PROGRESS_POLL_INTERVAL_MS = 800;
const ASR_LEDGER_COMMIT_TIMEOUT_MS = 5_000;

type VivoAsrOperation = {
  deadlineAtMs: number;
  signal?: AbortSignal;
};

type VivoAsrDependencies = {
  requestJson?: typeof vivoJsonRequest;
  taskStore?: VivoAsrTaskStore;
};

function asrOperationError(
  operation: VivoAsrOperation,
  message: string
) {
  const cancelled = operation.signal?.aborted === true;
  return new VivoProviderError(
    cancelled ? "vivo ASR request was cancelled" : message,
    {
      capability: "asr",
      status: "provider-unavailable",
      failureKind: cancelled ? "request-cancelled" : "request-timeout",
    }
  );
}

function resolveAsrStageTimeout(
  operation: VivoAsrOperation,
  stageLimitMs: number
) {
  if (operation.signal?.aborted) {
    throw asrOperationError(operation, "vivo ASR deadline was exceeded");
  }
  const remainingMs = Math.floor(operation.deadlineAtMs - Date.now());
  if (remainingMs <= 0) {
    throw asrOperationError(operation, "vivo ASR deadline was exceeded");
  }
  return Math.max(1, Math.min(stageLimitMs, remainingMs));
}

async function waitForAsrPoll(
  operation: VivoAsrOperation,
  delayMs = ASR_PROGRESS_POLL_INTERVAL_MS
) {
  const timeoutMs = resolveAsrStageTimeout(operation, delayMs);
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(asrOperationError(operation, "vivo ASR deadline was exceeded"));
    };
    const timer = setTimeout(() => {
      operation.signal?.removeEventListener("abort", abort);
      resolve();
    }, timeoutMs);
    operation.signal?.addEventListener("abort", abort, { once: true });
  });
}

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
    state: "live",
    live: true,
    fallback: false,
    mock: false,
    isRealProvider: true,
    warnings: status.warnings,
    rawResponse: raw,
    segments,
    requestId,
    status: {
      ...status,
      state: "live",
      live: true,
      fallback: false,
      mock: false,
      status: "ready",
    },
    model: getVivoEnv().asrEngineId,
  };
}

function assertUsableAsrResult(
  result: VivoAsrResult,
  raw: VivoAsrBaseResponse<VivoLasrResultData>
) {
  if (!result.transcript) {
    throw new VivoProviderError(
      "vivo ASR completed without a usable transcript",
      {
        capability: "asr",
        status: "provider-unavailable",
        raw,
      }
    );
  }
  return result;
}

function buildAsrTaskIdentity(
  input: VivoAsrInput,
  audio: Buffer
): VivoAsrTaskIdentity | null {
  if (!input.operationScope || !input.mimeType) return null;
  return {
    institutionId: input.operationScope.institutionId,
    userId: input.operationScope.userId,
    providerModel: getVivoEnv().asrEngineId,
    audioDigest: createHash("sha256").update(audio).digest("hex"),
    mimeType: input.mimeType,
  };
}

function asrLedgerOperation() {
  // 上游可能已经开始计费，关键账本提交不能被已断开的浏览器信号取消。
  return { deadlineAtMs: Date.now() + ASR_LEDGER_COMMIT_TIMEOUT_MS };
}

async function bestEffortLedgerMutation(
  mutation: () => Promise<boolean>
) {
  try {
    return await mutation();
  } catch {
    return false;
  }
}

function parseStoredAsrResult(resultJson: unknown) {
  if (!resultJson) return null;
  try {
    const value =
      typeof resultJson === "string"
        ? (JSON.parse(resultJson) as unknown)
        : resultJson;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as VivoAsrBaseResponse<VivoLasrResultData>)
      : null;
  } catch {
    return null;
  }
}

function taskStateError(message: string) {
  return new VivoProviderError(message, {
    capability: "asr",
    status: "provider-unavailable",
  });
}

async function waitForProgress(
  taskId: string,
  sessionId: string,
  requestId: string,
  operation: VivoAsrOperation,
  requestJson = vivoJsonRequest,
  pollIntervalMs = ASR_PROGRESS_POLL_INTERVAL_MS
) {
  while (true) {
    const raw = await requestJson<VivoAsrBaseResponse<{ progress?: number }>>({
      capability: "asr",
      path: "/lasr/progress",
      query: buildCommonQuery(requestId),
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ task_id: taskId, "x-sessionId": sessionId }),
      timeoutMs: resolveAsrStageTimeout(operation, 20_000),
      signal: operation.signal,
    });
    const data = ensureSuccess(raw, "progress");
    if (typeof data.progress === "number" && data.progress >= 100) return;
    await waitForAsrPoll(operation, pollIntervalMs);
  }
}

export async function requestVivoAsr(
  input: VivoAsrInput,
  dependencies: VivoAsrDependencies = {}
): Promise<VivoAsrResult> {
  const transcript = input.transcript?.trim();
  const fallbackText = input.fallbackText?.trim();
  const status = getVivoProviderStatus("asr");
  if (transcript || fallbackText) {
    return {
      transcript: transcript || fallbackText || "",
      confidence: null,
      providerName: "vivo",
      state: "fallback",
      live: false,
      fallback: true,
      mock: false,
      isRealProvider: false,
      warnings: ["使用文本 fallback，未调用真实 vivo ASR。"],
      requestId: input.requestId,
      status: {
        ...status,
        state: "fallback",
        live: false,
        fallback: true,
        mock: false,
        isRealProvider: false,
        status: "provider-unavailable",
        reason: "ASR request used provided transcript/fallback text; no live audio transcription was made.",
      },
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

  const sliceNum = Math.max(1, Math.ceil(audio.length / SLICE_SIZE));
  const configuredTimeoutMs = Number(process.env.VIVO_ASR_TOTAL_TIMEOUT_MS);
  const totalTimeoutMs =
    Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs >= 1_000
      ? Math.min(
          MAX_ASR_OPERATION_TIMEOUT_MS,
          Math.floor(configuredTimeoutMs)
        )
      : DEFAULT_ASR_OPERATION_TIMEOUT_MS;
  const operation: VivoAsrOperation = {
    deadlineAtMs: Math.min(
      input.deadlineAtMs ?? Number.POSITIVE_INFINITY,
      Date.now() + totalTimeoutMs
    ),
    signal: input.signal,
  };
  const requestJson = dependencies.requestJson ?? vivoJsonRequest;
  const taskIdentity = buildAsrTaskIdentity(input, audio);
  const taskStore = taskIdentity
    ? (dependencies.taskStore ?? getVivoAsrTaskStore())
    : null;
  let leaseToken: string | null = null;
  let requestId = input.requestId ?? createRequestId();
  let sessionId = createRequestId();
  let taskId: string | null = null;
  let shouldSubmit = true;

  if (taskIdentity && taskStore) {
    const claim = await taskStore.claim(taskIdentity, {
      deadlineAtMs: operation.deadlineAtMs,
    });
    requestId = claim.requestId;
    sessionId = claim.sessionId;
    leaseToken = claim.leaseToken;

    if (claim.action === "ready") {
      const storedRaw = parseStoredAsrResult(claim.resultJson);
      if (!storedRaw) {
        throw taskStateError("vivo ASR completed result ledger is invalid");
      }
      ensureSuccess(storedRaw, "stored result");
      return assertUsableAsrResult(buildResult(storedRaw, requestId), storedRaw);
    }
    if (claim.action === "wait") {
      throw taskStateError("vivo ASR task is already being processed");
    }
    if (claim.action === "blocked") {
      throw taskStateError(
        claim.lastErrorReason ||
          "vivo ASR submission outcome is unknown; automatic resubmission was suppressed"
      );
    }
    if (!leaseToken) {
      throw taskStateError("vivo ASR task lease is unavailable");
    }
    if (claim.action === "resume") {
      if (!claim.taskId) {
        throw taskStateError("vivo ASR resumable task is missing its task id");
      }
      taskId = claim.taskId;
      shouldSubmit = false;
    }
  }

  if (shouldSubmit) {
    let audioId: string;
    try {
      const createRaw = await requestJson<
        VivoAsrBaseResponse<{ audio_id?: string }>
      >({
        capability: "asr",
        path: "/lasr/create",
        query: buildCommonQuery(requestId),
        headers: { "Content-Type": "application/json; charset=UTF-8" },
        body: JSON.stringify({
          audio_type: audioTypeFromMime(input.mimeType),
          "x-sessionId": sessionId,
          slice_num: sliceNum,
        }),
        timeoutMs: resolveAsrStageTimeout(operation, 20_000),
        signal: operation.signal,
      });
      const createdAudioId = ensureSuccess(createRaw, "create").audio_id;
      if (!createdAudioId) {
        throw new VivoProviderError(
          "vivo ASR create did not return audio_id",
          {
            capability: "asr",
            status: "provider-unavailable",
            raw: createRaw,
          }
        );
      }
      audioId = createdAudioId;

      for (let index = 0; index < sliceNum; index += 1) {
        const formData = new FormData();
        const slice = audio.subarray(
          index * SLICE_SIZE,
          Math.min(audio.length, (index + 1) * SLICE_SIZE)
        );
        const blobPart = new ArrayBuffer(slice.byteLength);
        new Uint8Array(blobPart).set(slice);
        formData.set(
          "file",
          new Blob([blobPart]),
          input.attachmentName ?? `audio-${index}`
        );
        const uploadBody = await requestJson<VivoAsrBaseResponse>({
          capability: "asr",
          path: "/lasr/upload",
          query: {
            ...buildCommonQuery(requestId),
            audio_id: audioId,
            slice_index: index,
            "x-sessionId": sessionId,
          },
          body: formData,
          timeoutMs: resolveAsrStageTimeout(operation, 30_000),
          signal: operation.signal,
        });
        if (!uploadBody || uploadBody.code !== 0) {
          throw new VivoProviderError("vivo ASR upload failed", {
            capability: "asr",
            status: "provider-unavailable",
            raw: uploadBody,
          });
        }
      }
    } catch (error) {
      if (taskIdentity && taskStore && leaseToken) {
        await bestEffortLedgerMutation(() =>
          taskStore.markRetryable(
            taskIdentity,
            leaseToken!,
            error instanceof Error ? error.message : "vivo ASR pre-run failed",
            asrLedgerOperation()
          )
        );
      }
      throw error;
    }

    if (taskIdentity && taskStore && leaseToken) {
      const dispatchRecorded = await bestEffortLedgerMutation(() =>
        taskStore.markRunDispatching(
          taskIdentity,
          leaseToken!,
          asrLedgerOperation()
        )
      );
      if (!dispatchRecorded) {
        throw taskStateError(
          "vivo ASR run dispatch ledger could not be confirmed"
        );
      }
    }

    let runRaw: VivoAsrBaseResponse<{ task_id?: string }>;
    try {
      runRaw = await requestJson<
        VivoAsrBaseResponse<{ task_id?: string }>
      >({
        capability: "asr",
        path: "/lasr/run",
        query: buildCommonQuery(requestId),
        headers: { "Content-Type": "application/json; charset=UTF-8" },
        body: JSON.stringify({
          audio_id: audioId,
          "x-sessionId": sessionId,
        }),
        timeoutMs: resolveAsrStageTimeout(operation, 20_000),
        signal: operation.signal,
      });
    } catch (error) {
      if (taskIdentity && taskStore && leaseToken) {
        await bestEffortLedgerMutation(() =>
          taskStore.markBlocked(
            taskIdentity,
            leaseToken!,
            "vivo ASR run outcome is unknown; automatic resubmission was suppressed",
            asrLedgerOperation()
          )
        );
      }
      throw error;
    }

    taskId = ensureSuccess(runRaw, "run").task_id ?? null;
    if (!taskId) {
      if (taskIdentity && taskStore && leaseToken) {
        await bestEffortLedgerMutation(() =>
          taskStore.markBlocked(
            taskIdentity,
            leaseToken!,
            "vivo ASR run did not return task_id",
            asrLedgerOperation()
          )
        );
      }
      throw new VivoProviderError("vivo ASR run did not return task_id", {
        capability: "asr",
        status: "provider-unavailable",
        raw: runRaw,
      });
    }

    if (taskIdentity && taskStore && leaseToken) {
      await bestEffortLedgerMutation(() =>
        taskStore.markRunning(
          taskIdentity,
          leaseToken!,
          taskId!,
          asrLedgerOperation()
        )
      );
    }
  }

  if (!taskId) {
    throw taskStateError("vivo ASR task id is unavailable");
  }

  try {
    await waitForProgress(
      taskId,
      sessionId,
      requestId,
      operation,
      requestJson
    );
  } catch (error) {
    if (taskIdentity && taskStore && leaseToken) {
      await bestEffortLedgerMutation(() =>
        taskStore.markPending(
          taskIdentity,
          leaseToken!,
          taskId!,
          error instanceof Error ? error.message : "vivo ASR polling failed",
          asrLedgerOperation()
        )
      );
    }
    throw error;
  }

  let resultRaw: VivoAsrBaseResponse<VivoLasrResultData>;
  try {
    resultRaw = await requestJson<
      VivoAsrBaseResponse<VivoLasrResultData>
    >({
      capability: "asr",
      path: "/lasr/result",
      query: buildCommonQuery(requestId),
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ task_id: taskId, "x-sessionId": sessionId }),
      timeoutMs: resolveAsrStageTimeout(operation, 20_000),
      signal: operation.signal,
    });
    ensureSuccess(resultRaw, "result");
  } catch (error) {
    if (taskIdentity && taskStore && leaseToken) {
      await bestEffortLedgerMutation(() =>
        taskStore.markPending(
          taskIdentity,
          leaseToken!,
          taskId!,
          error instanceof Error ? error.message : "vivo ASR result read failed",
          asrLedgerOperation()
        )
      );
    }
    throw error;
  }

  let result: VivoAsrResult;
  try {
    result = assertUsableAsrResult(buildResult(resultRaw, requestId), resultRaw);
  } catch (error) {
    if (taskIdentity && taskStore && leaseToken) {
      await bestEffortLedgerMutation(() =>
        taskStore.markBlocked(
          taskIdentity,
          leaseToken!,
          error instanceof Error ? error.message : "vivo ASR result is unusable",
          asrLedgerOperation()
        )
      );
    }
    throw error;
  }

  if (taskIdentity && taskStore && leaseToken) {
    await bestEffortLedgerMutation(() =>
      taskStore.markReady(
        taskIdentity,
        leaseToken!,
        taskId!,
        resultRaw,
        asrLedgerOperation()
      )
    );
  }
  return result;
}

export const vivoAsrProviderInternals = {
  waitForProgress,
  resolveAsrStageTimeout,
  buildResult,
  assertUsableAsrResult,
  defaultOperationTimeoutMs: DEFAULT_ASR_OPERATION_TIMEOUT_MS,
  maxOperationTimeoutMs: MAX_ASR_OPERATION_TIMEOUT_MS,
};
