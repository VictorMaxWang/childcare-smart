import type { AccountRole } from "@/lib/auth/accounts";

export type ParentFeedbackExecutionStatus =
  | "not_started"
  | "partial"
  | "completed"
  | "unable_to_execute";

export type ParentFeedbackExecutorRole =
  | "parent"
  | "grandparent"
  | "caregiver"
  | "teacher"
  | "mixed";

export type ParentFeedbackChildReaction =
  | "resisted"
  | "neutral"
  | "accepted"
  | "improved";

export type ParentFeedbackImprovementStatus =
  | "no_change"
  | "slight_improvement"
  | "clear_improvement"
  | "worse"
  | "unknown";

export type ParentStructuredFeedbackSourceRole =
  | "parent"
  | "teacher"
  | "admin"
  | "system"
  | "unknown";

export type LegacyGuardianFeedbackSourceWorkflow =
  | "parent-agent"
  | "teacher-agent"
  | "manual";

export interface ParentFeedbackAttachmentRef {
  url?: string;
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
  meta?: Record<string, unknown>;
}

export interface ParentFeedbackAttachments {
  voice?: ParentFeedbackAttachmentRef[];
  image?: ParentFeedbackAttachmentRef[];
}

export interface ParentStructuredFeedbackSource {
  kind: "structured" | "legacy_guardian_feedback";
  workflow?: string;
  createdBy?: string;
  createdByRole?: AccountRole;
  traceId?: string;
  meta?: Record<string, unknown>;
}

export interface ParentStructuredFeedbackFallback {
  rawStatus?: string;
  rawChildReaction?: string;
  rawImproved?: boolean | string;
  rawExecutionStatus?: string;
  rawInterventionCardId?: string;
  rawSourceWorkflow?: string;
  notesSummary?: string;
}

export interface ParentStructuredFeedback {
  feedbackId: string;
  childId: string;
  sourceRole: ParentStructuredFeedbackSourceRole;
  sourceChannel: string;
  relatedTaskId?: string;
  relatedConsultationId?: string;
  executionStatus: ParentFeedbackExecutionStatus;
  executionCount?: number;
  executorRole: ParentFeedbackExecutorRole;
  childReaction: ParentFeedbackChildReaction;
  improvementStatus: ParentFeedbackImprovementStatus;
  barriers: string[];
  notes: string;
  attachments: ParentFeedbackAttachments;
  submittedAt: string;
  source: ParentStructuredFeedbackSource;
  fallback: ParentStructuredFeedbackFallback;
}

export interface GuardianFeedbackLegacyMirror {
  id: string;
  childId: string;
  date: string;
  status: string;
  content: string;
  interventionCardId?: string;
  sourceWorkflow?: LegacyGuardianFeedbackSourceWorkflow;
  executionStatus?: ParentFeedbackExecutionStatus;
  executed?: boolean;
  childReaction?: string;
  improved?: boolean | "unknown";
  freeNote?: string;
  createdBy: string;
  createdByRole: AccountRole;
}

export type ParentStructuredFeedbackRecord =
  ParentStructuredFeedback & GuardianFeedbackLegacyMirror;

export type GuardianFeedback = ParentStructuredFeedbackRecord;

export type GuardianFeedbackInput = Partial<ParentStructuredFeedbackRecord> &
  Pick<GuardianFeedbackLegacyMirror, "childId">;

export type ParentStructuredFeedbackLite = Pick<
  ParentStructuredFeedbackRecord,
  | "feedbackId"
  | "childId"
  | "sourceRole"
  | "sourceChannel"
  | "relatedTaskId"
  | "relatedConsultationId"
  | "executionStatus"
  | "executionCount"
  | "executorRole"
  | "childReaction"
  | "improvementStatus"
  | "barriers"
  | "notes"
  | "attachments"
  | "submittedAt"
  | "source"
  | "fallback"
  | "id"
  | "date"
  | "status"
  | "content"
  | "interventionCardId"
  | "sourceWorkflow"
  | "executed"
  | "improved"
  | "freeNote"
>;
