import "server-only";

import sharp from "sharp";

const DEFAULT_IMAGE_ENDPOINT =
  "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis";
const DEFAULT_IMAGE_MODEL = "qwen-image-plus";
const DEFAULT_IMAGE_SIZE = "1328*1328";
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const TASK_ID_PATTERN = /^[a-zA-Z0-9_-]{8,160}$/u;
const RESULT_HOST_SUFFIX = ".aliyuncs.com";
const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_PERSISTED_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_RESULT_REDIRECTS = 3;

export type DashScopeStoryImageTaskStatus =
  | "pending"
  | "succeeded"
  | "failed";

export type DashScopeStoryImageTaskResult = {
  taskId: string;
  status: DashScopeStoryImageTaskStatus;
  imageUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

type FetchLike = typeof fetch;

type DashScopeStoryImageDependencies = {
  fetch: FetchLike;
};

export class DashScopeStoryImageProviderError extends Error {
  readonly stage: "submit" | "poll" | "download";
  readonly retryable: boolean;
  readonly submissionState: "not-accepted" | "unknown" | null;

  constructor(
    message: string,
    options: {
      stage: "submit" | "poll" | "download";
      retryable: boolean;
      submissionState?: "not-accepted" | "unknown" | null;
    }
  ) {
    super(message);
    this.name = "DashScopeStoryImageProviderError";
    this.stage = options.stage;
    this.retryable = options.retryable;
    this.submissionState = options.submissionState ?? null;
  }
}

function readConfiguredEnv(name: string) {
  const value = process.env[name]?.trim() ?? "";
  return value && !/^填入|changeme|placeholder$/iu.test(value) ? value : "";
}

function resolveRequestTimeoutMs() {
  const parsed = Number(process.env.STORYBOOK_DASHSCOPE_IMAGE_TIMEOUT_MS);
  if (!Number.isFinite(parsed) || parsed < 1_000) {
    return DEFAULT_REQUEST_TIMEOUT_MS;
  }
  return Math.min(Math.floor(parsed), 10_000);
}

function resolveTaskEndpoint(imageEndpoint: string) {
  const configured = process.env.STORYBOOK_DASHSCOPE_TASK_ENDPOINT?.trim();
  if (configured) return configured.replace(/\/+$/u, "");
  return `${new URL(imageEndpoint).origin}/api/v1/tasks`;
}

/**
 * 解析 Next.js 专用绘本图片配置；只认独立选择变量，避免与 FastAPI 旧配置串线。
 */
export function resolveDashScopeStoryImageConfig() {
  const apiKey = readConfiguredEnv("DASHSCOPE_API_KEY");
  const selected =
    process.env.NEXT_STORYBOOK_IMAGE_PROVIDER?.trim().toLowerCase() ===
    "dashscope";
  const endpoint =
    process.env.STORYBOOK_DASHSCOPE_IMAGE_ENDPOINT?.trim() ||
    DEFAULT_IMAGE_ENDPOINT;

  return {
    enabled: selected && Boolean(apiKey),
    selected,
    apiKey,
    endpoint,
    taskEndpoint: resolveTaskEndpoint(endpoint),
    model:
      process.env.STORYBOOK_DASHSCOPE_IMAGE_MODEL?.trim() ||
      DEFAULT_IMAGE_MODEL,
    size:
      process.env.STORYBOOK_DASHSCOPE_IMAGE_SIZE?.trim() ||
      DEFAULT_IMAGE_SIZE,
    workspaceId:
      process.env.STORYBOOK_DASHSCOPE_WORKSPACE_ID?.trim() || "",
    timeoutMs: resolveRequestTimeoutMs(),
    missingConfig: [
      ...(selected && !apiKey ? ["DASHSCOPE_API_KEY"] : []),
      ...(!selected
        ? ["NEXT_STORYBOOK_IMAGE_PROVIDER=dashscope"]
        : []),
    ],
  };
}

function requireEnabledConfig() {
  const config = resolveDashScopeStoryImageConfig();
  if (!config.enabled) {
    throw new Error(
      `DashScope story image provider is unavailable: ${config.missingConfig.join(
        ", "
      )}`
    );
  }
  return config;
}

function normalizeTaskId(value: unknown) {
  const taskId = String(value ?? "").trim();
  if (!TASK_ID_PATTERN.test(taskId)) {
    throw new Error("DashScope image response did not include a valid task id");
  }
  return taskId;
}

function normalizeResultImageUrl(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      !(
        url.hostname === "aliyuncs.com" ||
        url.hostname.endsWith(RESULT_HOST_SUFFIX)
      )
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function safeProviderText(value: unknown) {
  return String(value ?? "").replace(/\s+/gu, " ").trim().slice(0, 300);
}

function resolveOperationTimeoutMs(
  configuredTimeoutMs: number,
  deadlineAtMs?: number
) {
  if (!deadlineAtMs) return configuredTimeoutMs;
  const remainingMs = Math.floor(deadlineAtMs - Date.now());
  if (remainingMs <= 0) {
    throw new Error("DashScope story image request deadline exhausted");
  }
  return Math.max(250, Math.min(configuredTimeoutMs, remainingMs));
}

async function requestJson(
  url: string,
  init: RequestInit,
  dependencies: Partial<DashScopeStoryImageDependencies>,
  options: {
    stage: "submit" | "poll";
    deadlineAtMs?: number;
    signal?: AbortSignal;
  }
) {
  const config = requireEnabledConfig();
  const timeoutMs = resolveOperationTimeoutMs(
    config.timeoutMs,
    options.deadlineAtMs
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abortRequest = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abortRequest();
  else {
    options.signal?.addEventListener("abort", abortRequest, {
      once: true,
    });
  }
  try {
    const response = await (dependencies.fetch ?? fetch)(url, {
      ...init,
      signal: controller.signal,
    });
    let body: Record<string, unknown> | null = null;
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      if (response.ok) {
        throw new DashScopeStoryImageProviderError(
          "DashScope image provider returned an invalid JSON response",
          {
            stage: options.stage,
            retryable: options.stage === "poll",
            submissionState:
              options.stage === "submit" ? "unknown" : null,
          }
        );
      }
    }
    if (!response.ok) {
      const code = safeProviderText(body?.code) || `HTTP_${response.status}`;
      const message =
        safeProviderText(body?.message) ||
        "DashScope image provider request failed";
      const ambiguousSubmission =
        options.stage === "submit" &&
        (response.status === 408 || response.status >= 500);
      const explicitRetryableRejection =
        options.stage === "submit" &&
        response.status === 429 &&
        /(?:throttl|rate.?limit|quota)/iu.test(`${code} ${message}`);
      throw new DashScopeStoryImageProviderError(
        `DashScope image provider ${code}: ${message}`,
        {
          stage: options.stage,
          retryable:
            options.stage === "submit"
              ? explicitRetryableRejection
              : response.status === 408 ||
                response.status === 409 ||
                response.status === 429 ||
                response.status >= 500,
          submissionState:
            options.stage === "submit"
              ? ambiguousSubmission
                ? "unknown"
                : "not-accepted"
              : null,
        }
      );
    }
    return body;
  } catch (error) {
    if (error instanceof DashScopeStoryImageProviderError) throw error;
    if (controller.signal.aborted) {
      throw new DashScopeStoryImageProviderError(
        options.signal?.aborted
          ? "DashScope image provider request aborted"
          : `DashScope image provider timed out after ${timeoutMs}ms`,
        {
          stage: options.stage,
          retryable: options.stage !== "submit",
          submissionState:
            options.stage === "submit" ? "unknown" : null,
        }
      );
    }
    throw new DashScopeStoryImageProviderError(
      error instanceof Error
        ? error.message
        : "DashScope image provider network request failed",
      {
        stage: options.stage,
        retryable: options.stage !== "submit",
        submissionState:
          options.stage === "submit" ? "unknown" : null,
      }
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abortRequest);
  }
}

/**
 * 提交单场景 Qwen-Image 异步任务，只返回不可推导凭据的 task id。
 */
export async function submitDashScopeStoryImageTask(
  input: {
    prompt: string;
    deadlineAtMs?: number;
    signal?: AbortSignal;
  },
  dependencies: Partial<DashScopeStoryImageDependencies> = {}
) {
  const config = requireEnabledConfig();
  const prompt = input.prompt.trim().slice(0, 800);
  if (!prompt) {
    throw new Error("DashScope story image prompt is required");
  }
  const headers = new Headers({
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
    "X-DashScope-Async": "enable",
  });
  if (config.workspaceId) {
    headers.set("X-DashScope-WorkSpace", config.workspaceId);
  }
  const body = await requestJson(
    config.endpoint,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.model,
        input: { prompt },
        parameters: {
          negative_prompt:
            "文字，字幕，水印，标志，界面，畸形手指，恐怖元素，成人内容",
          size: config.size,
          n: 1,
          prompt_extend: true,
          watermark: false,
        },
      }),
      cache: "no-store",
    },
    dependencies,
    {
      stage: "submit",
      deadlineAtMs: input.deadlineAtMs,
      signal: input.signal,
    }
  );
  const output =
    body?.output &&
    typeof body.output === "object" &&
    !Array.isArray(body.output)
      ? (body.output as Record<string, unknown>)
      : {};
  try {
    return {
      taskId: normalizeTaskId(output.task_id),
      status: "pending" as const,
    };
  } catch (error) {
    throw new DashScopeStoryImageProviderError(
      error instanceof Error
        ? error.message
        : "DashScope image response did not include a valid task id",
      {
        stage: "submit",
        retryable: false,
        submissionState: "unknown",
      }
    );
  }
}

/**
 * 查询已由服务端签名绑定的任务；只有明确 FAILED/CANCELED 才视为终态。
 * 未知状态、损坏响应或缺失结果 URL 会保留原 task id，避免重复创建付费任务。
 */
export async function readDashScopeStoryImageTask(
  input: {
    taskId: string;
    deadlineAtMs?: number;
    signal?: AbortSignal;
  },
  dependencies: Partial<DashScopeStoryImageDependencies> = {}
): Promise<DashScopeStoryImageTaskResult> {
  const config = requireEnabledConfig();
  const taskId = normalizeTaskId(input.taskId);
  const body = await requestJson(
    `${config.taskEndpoint}/${encodeURIComponent(taskId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      cache: "no-store",
    },
    dependencies,
    {
      stage: "poll",
      deadlineAtMs: input.deadlineAtMs,
      signal: input.signal,
    }
  );
  const output =
    body?.output &&
    typeof body.output === "object" &&
    !Array.isArray(body.output)
      ? (body.output as Record<string, unknown>)
      : {};
  const status = String(output.task_status ?? "")
    .trim()
    .toUpperCase();
  const results = Array.isArray(output.results) ? output.results : [];
  const imageUrl = results
    .map((item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? normalizeResultImageUrl(
            (item as Record<string, unknown>).url
          )
        : null
    )
    .find((value): value is string => Boolean(value));

  if (status === "SUCCEEDED" && imageUrl) {
    return {
      taskId,
      status: "succeeded",
      imageUrl,
      errorCode: null,
      errorMessage: null,
    };
  }
  if (status === "FAILED" || status === "CANCELED") {
    return {
      taskId,
      status: "failed",
      imageUrl: null,
      errorCode: safeProviderText(output.code) || null,
      errorMessage: safeProviderText(output.message) || null,
    };
  }
  if (status === "SUCCEEDED") {
    throw new DashScopeStoryImageProviderError(
      "DashScope image task succeeded without a safe image URL",
      {
        stage: "poll",
        retryable: true,
      }
    );
  }
  if (
    !status ||
    status === "UNKNOWN" ||
    !["PENDING", "RUNNING"].includes(status)
  ) {
    throw new DashScopeStoryImageProviderError(
      `DashScope image provider returned ambiguous task status ${
        status || "EMPTY"
      }`,
      {
        stage: "poll",
        retryable: true,
      }
    );
  }
  return {
    taskId,
    status: "pending",
    imageUrl: null,
    errorCode: null,
    errorMessage: null,
  };
}

/**
 * 百炼任务 URL 只保留约 24 小时。普通账号交付前先下载、压缩为 WebP，
 * 再由调用方写入机构媒体存储，避免过期链接和超大图片进入数据库。
 */
export async function downloadDashScopeStoryImage(
  input: {
    imageUrl: string;
    deadlineAtMs?: number;
    signal?: AbortSignal;
  },
  dependencies: Partial<DashScopeStoryImageDependencies> = {}
) {
  const config = requireEnabledConfig();
  const imageUrl = normalizeResultImageUrl(input.imageUrl);
  if (!imageUrl) {
    throw new Error("DashScope image result must use a safe Aliyun HTTPS URL");
  }

  const timeoutMs = resolveOperationTimeoutMs(
    config.timeoutMs,
    input.deadlineAtMs
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abortRequest = () => controller.abort(input.signal?.reason);
  if (input.signal?.aborted) abortRequest();
  else {
    input.signal?.addEventListener("abort", abortRequest, {
      once: true,
    });
  }
  try {
    let currentUrl = imageUrl;
    let response: Response | null = null;
    for (let redirectCount = 0; redirectCount <= MAX_RESULT_REDIRECTS; redirectCount += 1) {
      response = await (dependencies.fetch ?? fetch)(currentUrl, {
        method: "GET",
        cache: "no-store",
        redirect: "manual",
        signal: controller.signal,
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      if (redirectCount >= MAX_RESULT_REDIRECTS) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error("DashScope image download exceeded redirect limit");
      }
      const location = response.headers.get("location");
      if (!location) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error("DashScope image redirect is missing a location");
      }
      const redirectUrl = normalizeResultImageUrl(
        new URL(location, currentUrl).toString()
      );
      await response.body?.cancel().catch(() => undefined);
      if (!redirectUrl) {
        throw new Error(
          "DashScope image result must use a safe Aliyun HTTPS URL"
        );
      }
      currentUrl = redirectUrl;
    }
    if (!response) {
      throw new Error("DashScope image download returned no response");
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(
        `DashScope image download failed with HTTP ${response.status}`
      );
    }
    const contentType = (
      response.headers.get("content-type") ?? ""
    )
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!contentType.startsWith("image/")) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("DashScope image download returned non-image content");
    }
    const declaredLength = Number(
      response.headers.get("content-length")
    );
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_SOURCE_IMAGE_BYTES
    ) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("DashScope source image exceeds the size limit");
    }
    if (!response.body) {
      throw new Error("DashScope image download returned an empty body");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let sourceByteLength = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      sourceByteLength += value.byteLength;
      if (sourceByteLength > MAX_SOURCE_IMAGE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error("DashScope source image exceeds the size limit");
      }
      chunks.push(value);
    }
    if (!sourceByteLength) {
      throw new Error("DashScope source image exceeds the size limit");
    }
    const sourceBytes = Buffer.concat(
      chunks.map((chunk) => Buffer.from(chunk)),
      sourceByteLength
    );
    if (input.signal?.aborted) {
      throw new DashScopeStoryImageProviderError(
        "DashScope image download aborted",
        {
          stage: "download",
          retryable: true,
        }
      );
    }
    resolveOperationTimeoutMs(timeoutMs, input.deadlineAtMs);
    const bytes = await sharp(sourceBytes, {
      limitInputPixels: 32 * 1024 * 1024,
    })
      .rotate()
      .resize({
        width: 1024,
        height: 1024,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
    resolveOperationTimeoutMs(timeoutMs, input.deadlineAtMs);
    if (!bytes.byteLength || bytes.byteLength > MAX_PERSISTED_IMAGE_BYTES) {
      throw new Error("DashScope optimized image exceeds the size limit");
    }
    return {
      contentType: "image/webp" as const,
      bytes,
    };
  } catch (error) {
    if (error instanceof DashScopeStoryImageProviderError) throw error;
    if (controller.signal.aborted) {
      throw new DashScopeStoryImageProviderError(
        input.signal?.aborted
          ? "DashScope image download aborted"
          : `DashScope image download timed out after ${timeoutMs}ms`,
        {
          stage: "download",
          retryable: true,
        }
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", abortRequest);
  }
}
