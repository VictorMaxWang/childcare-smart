import "server-only";

import { createRequestId, vivoJsonRequest } from "./vivo-client";
import { VivoProviderError } from "./vivo-errors";
import { getVivoEnv, getVivoProviderStatus } from "./vivo-provider-status";
import type { VivoChatInput, VivoChatResult } from "./types";

type VivoChatResponse = {
  choices?: Array<{
    message?: { content?: string; reasoning_content?: string; role?: string };
    delta?: { content?: string; reasoning_content?: string };
  }>;
  model?: string;
  id?: string;
  usage?: Record<string, unknown>;
  [key: string]: unknown;
};

function readChatText(raw: VivoChatResponse) {
  return raw.choices?.[0]?.message?.content?.trim() ?? "";
}

export async function requestVivoChat(input: VivoChatInput): Promise<VivoChatResult> {
  const status = getVivoProviderStatus("chat");
  if (!status.configured || !status.supported) {
    throw new VivoProviderError(status.reason ?? "vivo chat provider is unavailable", {
      capability: "chat",
      status: status.status,
    });
  }

  const env = getVivoEnv();
  const requestId = input.requestId ?? createRequestId();
  const model = input.model ?? env.llmModel;
  const raw = await vivoJsonRequest<VivoChatResponse>({
    capability: "chat",
    path: "/v1/chat/completions",
    query: {
      request_id: requestId,
      requestId,
    },
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      model,
      messages: input.messages,
      stream: input.stream ?? false,
      temperature: input.temperature ?? 0.2,
      max_tokens: input.maxTokens ?? 1024,
    }),
    timeoutMs: 60_000,
  });

  const text = readChatText(raw);
  if (!text) {
    throw new VivoProviderError("vivo chat response did not include text content", {
      capability: "chat",
      status: "error",
      raw,
    });
  }

  return {
    text,
    providerName: "vivo",
    model: raw.model ?? model,
    state: "live",
    live: true,
    fallback: false,
    mock: false,
    isRealProvider: true,
    warnings: status.warnings,
    rawResponse: raw,
    requestId,
    status: {
      ...status,
      state: "live",
      live: true,
      fallback: false,
      mock: false,
      status: "ready",
    },
  };
}
