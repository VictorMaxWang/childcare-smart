import type { SessionUser } from "@/lib/auth/accounts";
import type { AppStateSnapshot } from "@/lib/persistence/snapshot";

export type DemoPersistenceSchemaVersion = "d01-v1";
export type PersistStatus = "remote_synced" | "local_only" | "failed";
export type DemoRoleAlias = "director" | "teacher" | "teacher2" | "parent";
export type DailyRecordType = "morning-check" | "diet" | "growth";
export type MessageStatus = "sent" | "failed" | "draft";
export type HealthMaterialParseStatus = "pending" | "processing" | "completed" | "failed";
export type ConsultationWorkflowStatus = "pending" | "in-progress" | "resolved";

export interface DemoDataContext {
  user: SessionUser;
  namespace: string;
  storage: DemoStorage;
  now: () => string;
}

export interface DemoStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface MutationResult<T = AppStateSnapshot> {
  status: PersistStatus;
  snapshot: AppStateSnapshot;
  data?: T;
  persistedAt: string;
  message: string;
  error?: string;
}

export interface MessageInput {
  context: DemoDataContext;
  childId: string;
  classId?: string;
  content: string;
  receiverRole?: DemoMessage["receiverRole"];
  targetRole?: DemoMessage["targetRole"];
  conversationId?: string;
}

export interface ReplyMessageInput {
  context: DemoDataContext;
  messageId?: string;
  conversationId?: string;
  content: string;
}

export interface MarkMessageReadInput {
  context: DemoDataContext;
  messageId: string;
}

export interface DailyRecordInput {
  context: DemoDataContext;
  childId: string;
  classId?: string;
  type: DailyRecordType;
  payload: Record<string, unknown>;
  visibleToParent?: boolean;
}

export interface UpdateDailyRecordInput extends DailyRecordInput {
  recordId: string;
}

export interface HealthMaterialInput {
  context: DemoDataContext;
  childId: string;
  filename: string;
  fileType: string;
  description?: string;
  parseResult?: Record<string, unknown>;
}

export interface ParseHealthMaterialInput {
  context: DemoDataContext;
  materialId: string;
  parseResult?: Record<string, unknown>;
}

export interface UpdateHealthMaterialStatusInput {
  context: DemoDataContext;
  materialId: string;
  status: HealthMaterialParseStatus;
  error?: string;
}

export interface ConsultationInput {
  context: DemoDataContext;
  childId: string;
  riskLevel: "low" | "medium" | "high";
  notes?: string;
  assignedTo?: string;
  summary?: string;
  sourceMaterialId?: string;
  workflowStatus?: ConsultationWorkflowStatus;
}

export interface SaveConsultationResultInput {
  context: DemoDataContext;
  childId: string;
  consultation: AppStateSnapshot["consultations"][number];
  workflowStatus?: ConsultationWorkflowStatus;
  sourceMaterialId?: string;
}

export interface ConsultationNoteInput {
  context: DemoDataContext;
  consultationId: string;
  note: string;
}

export interface ConsultationStatusInput {
  context: DemoDataContext;
  consultationId: string;
  status: ConsultationWorkflowStatus;
}

export interface MarkReminderReadInput {
  context: DemoDataContext;
  reminderId: string;
}

export interface NutritionMenuListInput {
  context: DemoDataContext;
  childId?: string;
  classId?: string;
  dateRange?: {
    from?: string;
    to?: string;
  };
}

export interface DirectorDashboardMetrics {
  childCount: number;
  teacherCount: number;
  feedbackCount: number;
  consultationCount: number;
  highRiskConsultationCount: number;
  unreadReminderCount: number;
  dailyRecordCount: number;
}

export interface TeacherWorkbenchData {
  teacherId: string;
  className?: string;
  visibleChildCount: number;
  pendingMessages: DemoMessage[];
  todayRecords: DemoDailyRecord[];
  activeConsultations: AppStateSnapshot["consultations"];
  reminders: AppStateSnapshot["reminders"];
}

export interface ParentHomeData {
  childId: string;
  messages: DemoMessage[];
  dailyRecords: DemoDailyRecord[];
  healthMaterials: AppStateSnapshot["healthMaterials"];
  consultations: AppStateSnapshot["consultations"];
  reminders: AppStateSnapshot["reminders"];
  nutritionMenus: AppStateSnapshot["nutritionMenus"];
  storybooks: AppStateSnapshot["storybooks"];
}

export interface DemoDailyRecord {
  recordId: string;
  childId: string;
  classId: string;
  type: DailyRecordType;
  payload: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  visibleToParent: boolean;
}

export type DemoMessage = AppStateSnapshot["messages"][number];
export type DemoConversation = AppStateSnapshot["conversations"][number];
