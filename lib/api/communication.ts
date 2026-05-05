import { apiGet, apiPatch, apiPost, type ApiClientOptions } from "@/lib/api/client";
import type {
  ApiAttachment,
  ApiFeedbackDetail,
  AttachmentKind,
  AttachmentRelatedType,
  FeedbackStatus,
} from "@/lib/api/types";
import type { AppStateSnapshot } from "@/lib/persistence/snapshot";

export type ApiMessage = AppStateSnapshot["messages"][number];
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
