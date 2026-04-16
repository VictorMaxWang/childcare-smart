import type {
  ParentFeedbackChildReaction,
  ParentFeedbackExecutionStatus,
  ParentFeedbackExecutorRole,
  ParentFeedbackImprovementStatus,
  ParentStructuredFeedbackSourceRole,
} from "@/lib/feedback/types";

export type TaskStatus = "pending" | "in_progress" | "completed" | "overdue";
export type TaskType = "intervention" | "follow_up";
export type TaskSourceType =
  | "intervention_card"
  | "consultation"
  | "admin_dispatch"
  | "legacy_weekly_task";
export type TaskOwnerRole = "parent" | "teacher" | "admin";
export type TaskEvidenceSubmissionMode =
  | "guardian_feedback"
  | "task_checkin"
  | "dispatch_status_update";

export interface TaskDueWindow {
  kind: "same_day" | "within_48h" | "deadline";
  label: string;
}

export interface TaskLegacyRefs {
  interventionCardId?: string;
  reminderIds?: string[];
  legacyWeeklyTaskId?: string;
  adminDispatchEventId?: string;
  consultationId?: string;
}

export interface BaseTask {
  taskId: string;
  taskType: TaskType;
  childId: string;
  sourceType: TaskSourceType;
  sourceId: string;
  ownerRole: TaskOwnerRole;
  title: string;
  description: string;
  dueWindow: TaskDueWindow;
  dueAt: string;
  status: TaskStatus;
  evidenceSubmissionMode: TaskEvidenceSubmissionMode;
  completionSummary?: string;
  createdAt: string;
  updatedAt: string;
  statusChangedAt?: string;
  completedAt?: string;
  lastEvidenceAt?: string;
  relatedTaskIds?: string[];
  legacyRefs?: TaskLegacyRefs;
}

export interface InterventionTask extends BaseTask {
  taskType: "intervention";
}

export interface FollowUpTask extends BaseTask {
  taskType: "follow_up";
}

export type CanonicalTask = InterventionTask | FollowUpTask;

export type TaskEscalationRuleCode =
  | "overdue_48h"
  | "continuous_non_completion"
  | "guardian_feedback_negative_no_improvement"
  | "same_child_repeated_follow_up_48h"
  | "teacher_follow_up_stalled"
  | "multiple_pending_tasks_same_child"
  | "legacy_low_response_proxy";

export type TaskEscalationLevel =
  | "none"
  | "review_required"
  | "reconsult_required"
  | "director_attention";

export interface TaskEscalationDueRiskWindow {
  referenceDueAt: string;
  windowStartAt: string;
  windowEndAt: string;
  status: "on_track" | "due_soon" | "overdue";
  hoursOverdue: number;
  label: string;
}

export interface TaskEscalationSuggestion {
  taskId: string;
  childId: string;
  shouldEscalate: boolean;
  escalationLevel: TaskEscalationLevel;
  escalationReason: string;
  recommendedNextStep: string;
  triggeredRules: TaskEscalationRuleCode[];
  relatedTaskIds: string[];
  ownerRole: TaskOwnerRole;
  dueRiskWindow: TaskEscalationDueRiskWindow;
}

export interface TaskEscalationFeedbackSignal {
  feedbackId?: string;
  childId: string;
  date: string;
  submittedAt?: string;
  interventionCardId?: string;
  relatedTaskId?: string;
  relatedConsultationId?: string;
  sourceRole?: ParentStructuredFeedbackSourceRole;
  sourceChannel?: string;
  status?: string;
  content?: string;
  executionStatus?: ParentFeedbackExecutionStatus;
  executionCount?: number;
  executed?: boolean;
  executorRole?: ParentFeedbackExecutorRole;
  childReaction?: ParentFeedbackChildReaction | string;
  improved?: boolean | "unknown";
  improvementStatus?: ParentFeedbackImprovementStatus;
  freeNote?: string;
  notes?: string;
  barriers?: string[];
}

export interface TaskEscalationTaskCheckInSignal {
  childId: string;
  taskId: string;
  date: string;
}

export interface TaskEscalationReminderSignal {
  reminderId?: string;
  childId?: string;
  taskId?: string;
  sourceId?: string;
  sourceType?: TaskSourceType;
  reminderType?: string;
  scheduledAt?: string;
  status?: "pending" | "acknowledged" | "done" | "snoozed";
}

export interface EvaluateTaskEscalationsInput {
  tasks: CanonicalTask[];
  guardianFeedbacks?: TaskEscalationFeedbackSignal[];
  taskCheckIns?: TaskEscalationTaskCheckInSignal[];
  reminders?: TaskEscalationReminderSignal[];
  now?: string;
}
