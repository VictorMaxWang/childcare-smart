import "server-only";

import { resolveBailianRuntimeConfig } from "@/lib/ai/dashscope";

export type DashscopeChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type DashscopeChatFailureKind =
  | "missing-env"
  | "request-cancelled"
  | "request-timeout"
  | "authentication"
  | "rate-limited"
  | "provider-response";

export class DashscopeChatProviderError extends Error {
  failureKind: DashscopeChatFailureKind;
  httpStatus?: number;

  constructor(
    message: string,
    options: {
      failureKind: DashscopeChatFailureKind;
      httpStatus?: number;
    }
  ) {
    super(message);
    this.name = "DashscopeChatProviderError";
    this.failureKind = options.failureKind;
    this.httpStatus = options.httpStatus;
  }
}

export interface DashscopeChatInput {
  messages: DashscopeChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  deadlineAtMs?: number;
  onRequestStart?: () => void;
}

export interface DashscopeChatResult {
  text: string;
  model: string;
  requestId: string | null;
}

type DashscopeChatResponse = {
  id?: unknown;
  model?: unknown;
  request_id?: unknown;
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

export function isDashscopeChatConfigured() {
  return Boolean(process.env.DASHSCOPE_API_KEY?.trim());
}

function failureKindFromStatus(status: number): DashscopeChatFailureKind {
  if (status === 401 || status === 403) return "authentication";
  if (status === 429) return "rate-limited";
  return "provider-response";
}

function readMessageText(content: unknown) {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object" || Array.isArray(part)) return "";
      const text = (part as Record<string, unknown>).text;
      return typeof text === "string" ? text : "";
    })
    .join("\n")
    .trim();
}

function readRequestId(
  response: Response,
  raw: DashscopeChatResponse
) {
  const rawRequestId =
    typeof raw.request_id === "string"
      ? raw.request_id
      : typeof raw.id === "string"
        ? raw.id
        : null;
  return response.headers.get("x-request-id") ?? rawRequestId;
}

/**
 * 调用百炼 OpenAI 兼容接口，并让请求头、响应头和响应正文共享同一取消时限。
 * 上游原文不会进入异常，避免日志意外携带模型输入或服务端敏感细节。
 */
export async function requestDashscopeChat(
  input: DashscopeChatInput
): Promise<DashscopeChatResult> {
  const apiKey = process.env.DASHSCOPE_API_KEY?.trim();
  if (!apiKey) {
    throw new DashscopeChatProviderError(
      "dashscope chat provider is not configured",
      { failureKind: "missing-env" }
    );
  }

  if (input.signal?.aborted) {
    throw new DashscopeChatProviderError(
      "dashscope chat request was cancelled",
      { failureKind: "request-cancelled" }
    );
  }

  const config = resolveBailianRuntimeConfig();
  const remainingMs =
    typeof input.deadlineAtMs === "number"
      ? input.deadlineAtMs - Date.now()
      : config.timeoutMs;
  if (remainingMs <= 0) {
    throw new DashscopeChatProviderError(
      "dashscope chat request deadline was exceeded",
      { failureKind: "request-timeout" }
    );
  }

  const timeoutSignal = AbortSignal.timeout(
    Math.max(1, Math.min(config.timeoutMs, remainingMs))
  );
  const signal = input.signal
    ? AbortSignal.any([input.signal, timeoutSignal])
    : timeoutSignal;
  const model = input.model?.trim() || config.model;

  try {
    input.onRequestStart?.();
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        enable_thinking: false,
        response_format: { type: "json_object" },
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxTokens ?? 1800,
        messages: input.messages,
      }),
      cache: "no-store",
      signal,
    });

    // 正文读取也必须受同一 AbortSignal 约束，避免只拿到响应头后无限等待。
    const responseText = await response.text();
    if (!response.ok) {
      throw new DashscopeChatProviderError(
        "dashscope chat provider returned a non-success status",
        {
          failureKind: failureKindFromStatus(response.status),
          httpStatus: response.status,
        }
      );
    }

    let raw: DashscopeChatResponse;
    try {
      raw = JSON.parse(responseText) as DashscopeChatResponse;
    } catch {
      throw new DashscopeChatProviderError(
        "dashscope chat provider returned invalid JSON",
        { failureKind: "provider-response", httpStatus: response.status }
      );
    }

    const text = readMessageText(raw.choices?.[0]?.message?.content);
    if (!text) {
      throw new DashscopeChatProviderError(
        "dashscope chat provider returned no message content",
        { failureKind: "provider-response", httpStatus: response.status }
      );
    }

    return {
      text,
      model: typeof raw.model === "string" && raw.model.trim()
        ? raw.model.trim()
        : model,
      requestId: readRequestId(response, raw),
    };
  } catch (error) {
    if (error instanceof DashscopeChatProviderError) throw error;
    const failureKind: DashscopeChatFailureKind = input.signal?.aborted
      ? "request-cancelled"
      : timeoutSignal.aborted
        ? "request-timeout"
        : "provider-response";
    throw new DashscopeChatProviderError(
      failureKind === "request-cancelled"
        ? "dashscope chat request was cancelled"
        : failureKind === "request-timeout"
          ? "dashscope chat request deadline was exceeded"
          : "dashscope chat provider request failed",
      { failureKind }
    );
  }
}
