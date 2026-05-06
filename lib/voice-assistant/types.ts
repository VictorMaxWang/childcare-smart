import type { AccountRole, SessionUser } from "@/lib/auth/accounts";
import type { ApiErrorCode } from "@/lib/api/types";

export type AssistantRole = "director" | "teacher" | "parent";

export type AssistantIntent =
  | "navigate"
  | "send_message"
  | "reply_message"
  | "create_morning_check"
  | "create_diet_record"
  | "create_growth_record"
  | "create_feedback"
  | "mark_reminder_read"
  | "generate_weekly_report"
  | "export_weekly_report"
  | "share_weekly_report"
  | "query_teacher_replies"
  | "export_storybook"
  | "share_storybook"
  | "create_consultation"
  | "add_consultation_note"
  | "update_consultation_status"
  | "create_health_material_task"
  | "update_dispatch_status"
  | "assign_task"
  | "update_assignment_status"
  | "mark_feedback_resolved"
  | "query_director_risk"
  | "query_director_feedback"
  | "query_director_trend"
  | "query_consultation_status"
  | "view_feedback_detail"
  | "open_child_profile"
  | "query_dashboard"
  | "query_child_status"
  | "query_parent_messages"
  | "query_today_tasks"
  | "unknown";

export type AssistantSafetyLevel = "safe" | "write" | "risky";
export type AssistantInputMode = "text" | "browser-speech" | "asr-provider";
export type AssistantCommandStatus =
  | "ready"
  | "needs_confirmation"
  | "needs_params"
  | "unsupported"
  | "forbidden"
  | "unknown"
  | "executed"
  | "failed"
  | "cancelled";

export interface AssistantChildRef {
  id: string;
  name: string;
  className?: string;
  nickname?: string;
  guardianNames?: string[];
}

export interface AssistantTeacherRef {
  id: string;
  name: string;
  className?: string;
}

export interface AssistantObjectRefs {
  childId?: string;
  messageId?: string;
  reminderId?: string;
  feedbackId?: string;
  consultationId?: string;
  dispatchId?: string;
  assignmentId?: string;
  materialId?: string;
  weeklyReportId?: string;
  storybookId?: string;
}

export interface AssistantReminderRef {
  id: string;
  childId: string;
  title: string;
  status: string;
  scheduledAt?: string;
}

export interface AssistantStorybookRef {
  id: string;
  childId: string;
  title?: string;
  generatedAt: string;
}

export interface AssistantParseContext {
  role: AssistantRole;
  accountRole: AccountRole;
  user: Pick<SessionUser, "id" | "name" | "role" | "institutionId" | "className" | "childIds">;
  currentPath?: string;
  currentQuery?: Record<string, string | undefined>;
  children?: AssistantChildRef[];
  allChildren?: AssistantChildRef[];
  teachers?: AssistantTeacherRef[];
  reminders?: AssistantReminderRef[];
  storybooks?: AssistantStorybookRef[];
  objects?: AssistantObjectRefs;
}

export interface AssistantUtterance {
  text: string;
  inputMode: AssistantInputMode;
  transcriptSource?: string;
}

export interface AssistantCommand<TParams extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  intent: AssistantIntent;
  confidence: number;
  role: AssistantRole;
  requiredConfirmation: boolean;
  params: TParams;
  missingParams: string[];
  safetyLevel: AssistantSafetyLevel;
  previewText: string;
  execute: string;
  status: AssistantCommandStatus;
  riskText?: string;
  examples?: string[];
  utterance?: AssistantUtterance;
  deeplink?: string;
}

export interface AssistantPlanResult {
  command: AssistantCommand;
  providerStatus?: AssistantProviderStatus;
}

export interface AssistantResultLink {
  label: string;
  href: string;
}

export interface AssistantResultDownload {
  filename: string;
  mimeType: string;
  content: string;
}

export interface AssistantExecuteResult {
  command: AssistantCommand;
  message: string;
  data?: unknown;
  deeplink?: string;
  refreshed?: boolean;
  links?: AssistantResultLink[];
  refs?: AssistantObjectRefs;
  download?: AssistantResultDownload;
  shareText?: string;
}

export interface AssistantCommandApiRequest {
  action: "plan" | "execute";
  utterance?: AssistantUtterance;
  command?: AssistantCommand;
  confirmed?: boolean;
  context?: {
    currentPath?: string;
    currentQuery?: Record<string, string | undefined>;
    objects?: AssistantObjectRefs;
  };
}

export interface VoiceProviderCapabilityStatus {
  providerName: string;
  capability: "chat" | "asr" | "ocr";
  configured: boolean;
  supported: boolean;
  isRealProvider: boolean;
  status: "ready" | "missing-env" | "unsupported" | "provider-unavailable" | "error";
  reason?: string;
  warnings: string[];
  requiredEnv?: string[];
}

export interface AssistantProviderStatus {
  chat: VoiceProviderCapabilityStatus;
  ocr: VoiceProviderCapabilityStatus;
  asr: VoiceProviderCapabilityStatus;
  fallbackText: string;
}

export interface AssistantHistoryItem {
  id: string;
  role: AssistantRole;
  commandText: string;
  intent: AssistantIntent;
  status: AssistantCommandStatus;
  resultText?: string;
  errorText?: string;
  createdAt: string;
}

export interface VoiceAsrResponse {
  transcript: string;
  source: string;
  provider: string;
  fallback: boolean;
  status: VoiceProviderCapabilityStatus;
  warnings: string[];
}

export interface AssistantClientError {
  code: ApiErrorCode | "unknown";
  message: string;
  status?: number;
}
