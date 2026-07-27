import {
  apiGet,
  apiPatch,
  apiPost,
  apiRequest,
  type ApiClientOptions,
} from "@/lib/api/client";
import { ApiClientError } from "@/lib/api/errors";
import type {
  ApiAttachment,
  ApiFeedbackDetail,
  AttachmentKind,
  AttachmentRelatedType,
  FeedbackStatus,
} from "@/lib/api/types";
import type { AppStateSnapshot } from "@/lib/persistence/snapshot";

export type ApiMessage = AppStateSnapshot["messages"][number];
export type ApiConversation = AppStateSnapshot["conversations"][number];
export type ApiFeedback = AppStateSnapshot["feedback"][number] & { status?: FeedbackStatus | string };

export interface ApiSendMessageInput {
  childId: string;
  conversationId?: string;
  content: string;
}

export interface ApiCreateFeedbackInput {
  childId: string;
  executionStatus?: string;
  executionCount?: number;
  executorRole?: string;
  childReaction?: string;
  improvementStatus?: string;
  barriers?: string[];
  notes?: string;
  content?: string;
  relatedTaskId?: string;
  relatedConsultationId?: string;
  interventionCardId?: string;
  attachments?: unknown;
  sourceChannel?: string;
}

export interface ApiCreateAttachmentInput {
  childId?: string;
  relatedType?: AttachmentRelatedType;
  relatedId?: string;
  kind?: AttachmentKind;
  fileName: string;
  mimeType: string;
  byteSize?: number;
  localPreviewUrl?: string;
  durationMs?: number;
}

function withParams(path: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export function listMessages(childId?: string, options?: ApiClientOptions) {
  return apiGet<ApiMessage[]>(withParams("/api/messages", { childId }), options);
}

export function sendMessage(input: ApiSendMessageInput, options?: ApiClientOptions) {
  return apiPost<ApiMessage>("/api/messages", input, options);
}

export function replyMessage(messageId: string, input: { conversationId?: string; content: string }, options?: ApiClientOptions) {
  return apiPost<ApiMessage>(`/api/messages/${messageId}/reply`, input, options);
}

export function markMessageRead(messageId: string, options?: ApiClientOptions) {
  return apiPost<ApiMessage>(`/api/messages/${messageId}/read`, undefined, options);
}

export function updateConversationStatus(
  conversationId: string,
  status: ApiConversation["status"],
  options?: ApiClientOptions
) {
  return apiPatch<ApiConversation>(
    `/api/conversations/${encodeURIComponent(conversationId)}/status`,
    { status },
    options
  );
}

export function listFeedback(childId?: string, options?: ApiClientOptions) {
  return apiGet<ApiFeedback[]>(withParams("/api/feedback", { childId }), options);
}

export function createFeedback(input: ApiCreateFeedbackInput, options?: ApiClientOptions) {
  return apiPost<ApiFeedbackDetail>("/api/feedback", input, options);
}

export function getFeedbackDetail(feedbackId: string, options?: ApiClientOptions) {
  return apiGet<ApiFeedbackDetail>(`/api/feedback/${feedbackId}`, options);
}

export function updateFeedbackStatus(feedbackId: string, status: FeedbackStatus, options?: ApiClientOptions) {
  return apiPatch<ApiFeedbackDetail>(`/api/feedback/${feedbackId}`, { status }, options);
}

export function listAttachments(
  options: { childId?: string; relatedType?: AttachmentRelatedType; relatedId?: string } = {},
  clientOptions?: ApiClientOptions
) {
  return apiGet<ApiAttachment[]>(
    withParams("/api/attachments", {
      childId: options.childId,
      relatedType: options.relatedType,
      relatedId: options.relatedId,
    }),
    clientOptions
  );
}

export function createAttachment(input: ApiCreateAttachmentInput, options?: ApiClientOptions) {
  return apiPost<ApiAttachment>("/api/attachments", input, options);
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function createAttachmentUploadRequestId(input: {
  file: File;
  childId?: string;
  relatedType: AttachmentRelatedType;
  relatedId?: string;
}) {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.subtle) {
    try {
      const scope = [
        input.childId ?? "",
        input.relatedType,
        input.relatedId ?? "",
        input.file.name,
        input.file.type,
        input.file.size,
      ].join("\u0000");
      const scopeBytes = new TextEncoder().encode(`${scope}\u0000`);
      const fileBytes = new Uint8Array(await input.file.arrayBuffer());
      const fingerprintInput = new Uint8Array(
        scopeBytes.byteLength + fileBytes.byteLength
      );
      fingerprintInput.set(scopeBytes);
      fingerprintInput.set(fileBytes, scopeBytes.byteLength);
      const digest = await cryptoApi.subtle.digest(
        "SHA-256",
        fingerprintInput
      );
      // 同一业务记录中的同一原文件可跨人工重试复用请求号；内容变化则自然得到新请求号。
      return `attachment-${bytesToHex(digest)}`;
    } catch {
      // 某些旧 WebView 不支持 File.arrayBuffer；回退仍保留单次调用内的幂等恢复。
    }
  }
  if (
    typeof cryptoApi !== "undefined" &&
    typeof cryptoApi.randomUUID === "function"
  ) {
    return `attachment-${cryptoApi.randomUUID()}`;
  }
  return `attachment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function shouldRetryAttachmentUpload(
  error: unknown,
  signal?: AbortSignal | null
) {
  if (signal?.aborted) return false;
  if (error instanceof ApiClientError) {
    // 已收到成功状态但响应体在断线中损坏时，仍可依靠幂等请求号恢复结果。
    return error.status >= 200 && error.status < 300;
  }
  if (
    typeof DOMException !== "undefined" &&
    error instanceof DOMException &&
    error.name === "AbortError"
  ) {
    return false;
  }
  return (
    error instanceof TypeError ||
    (error instanceof Error &&
      /(?:ECONNRESET|ETIMEDOUT|fetch failed|socket hang up)/iu.test(
        error.message
      ))
  );
}

export async function uploadAttachmentFile(
  input: {
    file: File;
    childId?: string;
    relatedType: AttachmentRelatedType;
    relatedId?: string;
    uploadRequestId?: string;
  },
  options?: ApiClientOptions
) {
  const uploadRequestId =
    input.uploadRequestId ?? (await createAttachmentUploadRequestId(input));
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const formData = new FormData();
    formData.set("file", input.file);
    if (input.childId) formData.set("childId", input.childId);
    formData.set("relatedType", input.relatedType);
    if (input.relatedId) formData.set("relatedId", input.relatedId);
    formData.set("uploadRequestId", uploadRequestId);
    try {
      return await apiRequest<ApiAttachment>("/api/attachments/upload", {
        ...options,
        method: "POST",
        body: formData,
      });
    } catch (error) {
      lastError = error;
      if (
        attempt > 0 ||
        !shouldRetryAttachmentUpload(error, options?.signal)
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError;
}
