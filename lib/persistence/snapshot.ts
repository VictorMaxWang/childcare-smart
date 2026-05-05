import type {
  AttendanceRecord,
  Child,
  GrowthRecord,
  HealthCheckRecord,
  MealRecord,
  TaskCheckInRecord,
} from "@/lib/store";
import type { ConsultationResult, MobileDraft, ReminderItem } from "@/lib/ai/types";
import type { InterventionCard } from "@/lib/agent/intervention-card";
import {
  normalizeGuardianFeedbackCollection,
} from "@/lib/feedback/normalize";
import type { GuardianFeedback } from "@/lib/feedback/types";
import { materializeTasksFromLegacy } from "@/lib/tasks/task-model";
import type { CanonicalTask } from "@/lib/tasks/types";

export interface DemoConversation {
  conversationId: string;
  childId: string;
  classId: string;
  participantIds: string[];
  participantRoles: Array<"parent" | "teacher" | "director" | "admin" | "system">;
  status: "open" | "closed" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface DemoMessage {
  messageId: string;
  conversationId: string;
  childId: string;
  classId: string;
  senderRole: "parent" | "teacher" | "director" | "admin" | "system";
  senderId: string;
  senderName: string;
  receiverRole?: "parent" | "teacher" | "director" | "admin" | "system";
  targetRole?: "parent" | "teacher" | "director" | "admin" | "system";
  content: string;
  createdAt: string;
  readBy: string[];
  status: "sent" | "failed" | "draft";
}

export interface DemoHealthMaterial {
  materialId: string;
  childId: string;
  uploadedBy: string;
  filename: string;
  fileType: string;
  parseStatus: "pending" | "processing" | "completed" | "failed";
  description?: string;
  parseResult?: Record<string, unknown>;
  parseError?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface DemoNutritionMenu {
  menuId: string;
  date: string;
  classId: string;
  meals: Record<string, unknown>;
}

export interface DemoStorybook {
  storybookId: string;
  childId: string;
  sourceRecordIds: string[];
  pages: Array<Record<string, unknown>>;
  generatedAt: string;
  updatedAt?: string;
  share?: {
    shareId: string;
    sharedBy: string;
    sharedAt: string;
    summary: string;
    localText: string;
  };
}

export interface AppStateSnapshot {
  demoPersistenceSchemaVersion?: "d01-v1";
  children: Child[];
  attendance: AttendanceRecord[];
  meals: MealRecord[];
  growth: GrowthRecord[];
  feedback: GuardianFeedback[];
  health: HealthCheckRecord[];
  taskCheckIns: TaskCheckInRecord[];
  interventionCards: InterventionCard[];
  consultations: ConsultationResult[];
  mobileDrafts: MobileDraft[];
  reminders: ReminderItem[];
  tasks: CanonicalTask[];
  messages: DemoMessage[];
  conversations: DemoConversation[];
  healthMaterials: DemoHealthMaterial[];
  nutritionMenus: DemoNutritionMenu[];
  storybooks: DemoStorybook[];
  updatedAt: string;
}

function hasStringId(value: unknown) {
  return Boolean(value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string");
}

function isChild(value: unknown): value is Child {
  return hasStringId(value) && typeof (value as { name?: unknown }).name === "string";
}

function isAttendanceRecord(value: unknown): value is AttendanceRecord {
  return (
    hasStringId(value) &&
    typeof (value as { childId?: unknown }).childId === "string" &&
    typeof (value as { date?: unknown }).date === "string"
  );
}

function isMealRecord(value: unknown): value is MealRecord {
  return (
    hasStringId(value) &&
    typeof (value as { childId?: unknown }).childId === "string" &&
    Array.isArray((value as { foods?: unknown }).foods) &&
    (!(value as { photoUrls?: unknown }).photoUrls ||
      (Array.isArray((value as { photoUrls?: unknown }).photoUrls) &&
        (value as { photoUrls: unknown[] }).photoUrls.every((item) => typeof item === "string")))
  );
}

function isGrowthRecord(value: unknown): value is GrowthRecord {
  return (
    hasStringId(value) &&
    typeof (value as { childId?: unknown }).childId === "string" &&
    typeof (value as { description?: unknown }).description === "string"
  );
}

function isHealthCheckRecord(value: unknown): value is HealthCheckRecord {
  return (
    hasStringId(value) &&
    typeof (value as { childId?: unknown }).childId === "string" &&
    typeof (value as { date?: unknown }).date === "string"
  );
}

function isTaskCheckInRecord(value: unknown): value is TaskCheckInRecord {
  return (
    hasStringId(value) &&
    typeof (value as { childId?: unknown }).childId === "string" &&
    typeof (value as { taskId?: unknown }).taskId === "string"
  );
}

function isInterventionCard(value: unknown): value is InterventionCard {
  const item = value as {
    targetChildId?: unknown;
    riskLevel?: unknown;
    summary?: unknown;
    consultationMode?: unknown;
    consultationId?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
  };

  return (
    hasStringId(value) &&
    typeof item.targetChildId === "string" &&
    typeof item.summary === "string" &&
    (item.riskLevel === "low" || item.riskLevel === "medium" || item.riskLevel === "high") &&
    (item.consultationMode === undefined || typeof item.consultationMode === "boolean") &&
    (item.consultationId === undefined || typeof item.consultationId === "string") &&
    (item.createdAt === undefined || typeof item.createdAt === "string") &&
    (item.updatedAt === undefined || typeof item.updatedAt === "string")
  );
}

function isConsultationResult(value: unknown): value is ConsultationResult {
  const item = value as {
    consultationId?: unknown;
    childId?: unknown;
    triggerReason?: unknown;
    participants?: unknown;
    agentFindings?: unknown;
    shouldEscalateToAdmin?: unknown;
  };

  return (
    Boolean(item) &&
    typeof item === "object" &&
    typeof item.consultationId === "string" &&
    typeof item.childId === "string" &&
    typeof item.triggerReason === "string" &&
    Array.isArray(item.participants) &&
    Array.isArray(item.agentFindings) &&
    typeof item.shouldEscalateToAdmin === "boolean"
  );
}

function isMobileDraft(value: unknown): value is MobileDraft {
  const item = value as {
    draftId?: unknown;
    draftType?: unknown;
    targetRole?: unknown;
    content?: unknown;
    syncStatus?: unknown;
  };

  return (
    Boolean(item) &&
    typeof item === "object" &&
    typeof item.draftId === "string" &&
    typeof item.draftType === "string" &&
    typeof item.targetRole === "string" &&
    typeof item.content === "string" &&
    typeof item.syncStatus === "string"
  );
}

function isReminderItem(value: unknown): value is ReminderItem {
  const item = value as {
    reminderId?: unknown;
    reminderType?: unknown;
    targetRole?: unknown;
    title?: unknown;
    description?: unknown;
    scheduledAt?: unknown;
    status?: unknown;
    taskId?: unknown;
    sourceType?: unknown;
    relatedTaskIds?: unknown;
  };

  return (
    Boolean(item) &&
    typeof item === "object" &&
    typeof item.reminderId === "string" &&
    typeof item.reminderType === "string" &&
    typeof item.targetRole === "string" &&
    typeof item.title === "string" &&
    typeof item.description === "string" &&
    typeof item.scheduledAt === "string" &&
    typeof item.status === "string" &&
    (item.taskId === undefined || typeof item.taskId === "string") &&
    (item.sourceType === undefined || typeof item.sourceType === "string") &&
    (item.relatedTaskIds === undefined ||
      (Array.isArray(item.relatedTaskIds) && item.relatedTaskIds.every((value) => typeof value === "string")))
  );
}

function isCanonicalTask(value: unknown): value is CanonicalTask {
  const item = value as Partial<CanonicalTask>;

  return (
    Boolean(item) &&
    typeof item === "object" &&
    typeof item.taskId === "string" &&
    typeof item.childId === "string" &&
    typeof item.sourceType === "string" &&
    typeof item.sourceId === "string" &&
    typeof item.ownerRole === "string" &&
    typeof item.title === "string" &&
    typeof item.description === "string" &&
    Boolean(item.dueWindow && typeof item.dueWindow === "object" && typeof item.dueWindow.label === "string") &&
    typeof item.dueAt === "string" &&
    typeof item.status === "string" &&
    typeof item.evidenceSubmissionMode === "string" &&
    typeof item.createdAt === "string" &&
    typeof item.updatedAt === "string"
  );
}

function isDemoMessage(value: unknown): value is DemoMessage {
  const item = value as Partial<DemoMessage>;
  return (
    Boolean(item) &&
    typeof item === "object" &&
    typeof item.messageId === "string" &&
    typeof item.conversationId === "string" &&
    typeof item.childId === "string" &&
    typeof item.classId === "string" &&
    typeof item.senderRole === "string" &&
    typeof item.senderId === "string" &&
    typeof item.senderName === "string" &&
    typeof item.content === "string" &&
    typeof item.createdAt === "string" &&
    Array.isArray(item.readBy) &&
    item.readBy.every((value) => typeof value === "string") &&
    typeof item.status === "string"
  );
}

function isDemoConversation(value: unknown): value is DemoConversation {
  const item = value as Partial<DemoConversation>;
  return (
    Boolean(item) &&
    typeof item === "object" &&
    typeof item.conversationId === "string" &&
    typeof item.childId === "string" &&
    typeof item.classId === "string" &&
    Array.isArray(item.participantIds) &&
    item.participantIds.every((value) => typeof value === "string") &&
    Array.isArray(item.participantRoles) &&
    item.participantRoles.every((value) => typeof value === "string") &&
    typeof item.status === "string" &&
    typeof item.createdAt === "string" &&
    typeof item.updatedAt === "string"
  );
}

function isDemoHealthMaterial(value: unknown): value is DemoHealthMaterial {
  const item = value as Partial<DemoHealthMaterial>;
  return (
    Boolean(item) &&
    typeof item === "object" &&
    typeof item.materialId === "string" &&
    typeof item.childId === "string" &&
    typeof item.uploadedBy === "string" &&
    typeof item.filename === "string" &&
    typeof item.fileType === "string" &&
    typeof item.parseStatus === "string" &&
    typeof item.createdAt === "string"
  );
}

function isDemoNutritionMenu(value: unknown): value is DemoNutritionMenu {
  const item = value as Partial<DemoNutritionMenu>;
  return (
    Boolean(item) &&
    typeof item === "object" &&
    typeof item.menuId === "string" &&
    typeof item.date === "string" &&
    typeof item.classId === "string" &&
    Boolean(item.meals && typeof item.meals === "object" && !Array.isArray(item.meals))
  );
}

function isDemoStorybook(value: unknown): value is DemoStorybook {
  const item = value as Partial<DemoStorybook>;
  return (
    Boolean(item) &&
    typeof item === "object" &&
    typeof item.storybookId === "string" &&
    typeof item.childId === "string" &&
    Array.isArray(item.sourceRecordIds) &&
    item.sourceRecordIds.every((value) => typeof value === "string") &&
    Array.isArray(item.pages) &&
    typeof item.generatedAt === "string"
  );
}

function isArrayOf<T>(value: unknown, predicate: (item: unknown) => item is T) {
  return Array.isArray(value) && value.every(predicate);
}

function readArrayBucket(data: Record<string, unknown>, key: string) {
  const value = data[key];
  if (typeof value === "undefined") return [];
  return Array.isArray(value) ? value : null;
}

export function normalizeAppStateSnapshot(value: unknown): AppStateSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const children = readArrayBucket(data, "children");
  const attendance = readArrayBucket(data, "attendance");
  const meals = readArrayBucket(data, "meals");
  const growth = readArrayBucket(data, "growth");
  const feedback = readArrayBucket(data, "feedback");
  const health = readArrayBucket(data, "health");
  const taskCheckIns = readArrayBucket(data, "taskCheckIns");
  const interventionCards = readArrayBucket(data, "interventionCards");
  const consultations = readArrayBucket(data, "consultations");
  const mobileDrafts = readArrayBucket(data, "mobileDrafts");
  const reminders = readArrayBucket(data, "reminders");
  const tasks = readArrayBucket(data, "tasks");
  const messages = readArrayBucket(data, "messages");
  const conversations = readArrayBucket(data, "conversations");
  const healthMaterials = readArrayBucket(data, "healthMaterials");
  const nutritionMenus = readArrayBucket(data, "nutritionMenus");
  const storybooks = readArrayBucket(data, "storybooks");
  const updatedAt = typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString();
  const normalizedFeedback = normalizeGuardianFeedbackCollection(feedback ?? [], {
    strict: true,
    allowGenerateId: false,
  });

  if (
    !children ||
    !attendance ||
    !meals ||
    !growth ||
    !feedback ||
    !health ||
    !taskCheckIns ||
    !interventionCards ||
    !consultations ||
    !mobileDrafts ||
    !reminders ||
    !tasks ||
    !messages ||
    !conversations ||
    !healthMaterials ||
    !nutritionMenus ||
    !storybooks ||
    !isArrayOf(children, isChild) ||
    !isArrayOf(attendance, isAttendanceRecord) ||
    !isArrayOf(meals, isMealRecord) ||
    !isArrayOf(growth, isGrowthRecord) ||
    !normalizedFeedback ||
    !isArrayOf(health, isHealthCheckRecord) ||
    !isArrayOf(taskCheckIns, isTaskCheckInRecord) ||
    !isArrayOf(interventionCards, isInterventionCard) ||
    !isArrayOf(consultations, isConsultationResult) ||
    !isArrayOf(mobileDrafts, isMobileDraft) ||
    !isArrayOf(reminders, isReminderItem) ||
    !isArrayOf(tasks, isCanonicalTask) ||
    !isArrayOf(messages, isDemoMessage) ||
    !isArrayOf(conversations, isDemoConversation) ||
    !isArrayOf(healthMaterials, isDemoHealthMaterial) ||
    !isArrayOf(nutritionMenus, isDemoNutritionMenu) ||
    !isArrayOf(storybooks, isDemoStorybook)
  ) {
    return null;
  }

  const snapshot = {
    demoPersistenceSchemaVersion: data.demoPersistenceSchemaVersion === "d01-v1" ? "d01-v1" : undefined,
    children,
    attendance,
    meals,
    growth,
    feedback: normalizedFeedback,
    health,
    taskCheckIns,
    interventionCards,
    consultations,
    mobileDrafts,
    reminders,
    tasks: materializeTasksFromLegacy({
      existingTasks: tasks,
      interventionCards,
      consultations,
      reminders,
      guardianFeedbacks: normalizedFeedback,
      taskCheckIns,
      now: updatedAt,
    }),
    messages,
    conversations,
    healthMaterials: healthMaterials.map((material) => ({
      ...material,
      parseStatus: (material.parseStatus as string) === "parsed" ? "completed" : material.parseStatus,
    })),
    nutritionMenus,
    storybooks,
    updatedAt,
  } satisfies AppStateSnapshot;

  return snapshot;
}

export function isAppStateSnapshot(value: unknown): value is AppStateSnapshot {
  return normalizeAppStateSnapshot(value) !== null;
}
