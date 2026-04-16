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

export interface AppStateSnapshot {
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

function isArrayOf<T>(value: unknown, predicate: (item: unknown) => item is T) {
  return Array.isArray(value) && value.every(predicate);
}

export function normalizeAppStateSnapshot(value: unknown): AppStateSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const normalizedFeedback = normalizeGuardianFeedbackCollection(data.feedback, {
    strict: true,
    allowGenerateId: false,
  });

  if (
    !isArrayOf(data.children, isChild) ||
    !isArrayOf(data.attendance, isAttendanceRecord) ||
    !isArrayOf(data.meals, isMealRecord) ||
    !isArrayOf(data.growth, isGrowthRecord) ||
    !normalizedFeedback ||
    !isArrayOf(data.health, isHealthCheckRecord) ||
    !isArrayOf(data.taskCheckIns, isTaskCheckInRecord) ||
    !isArrayOf(data.interventionCards, isInterventionCard) ||
    !isArrayOf(data.consultations, isConsultationResult) ||
    !isArrayOf(data.mobileDrafts, isMobileDraft) ||
    !isArrayOf(data.reminders, isReminderItem) ||
    typeof data.updatedAt !== "string"
  ) {
    return null;
  }

  if (typeof data.tasks !== "undefined" && !isArrayOf(data.tasks, isCanonicalTask)) {
    return null;
  }

  const snapshot = {
    children: data.children,
    attendance: data.attendance,
    meals: data.meals,
    growth: data.growth,
    feedback: normalizedFeedback,
    health: data.health,
    taskCheckIns: data.taskCheckIns,
    interventionCards: data.interventionCards,
    consultations: data.consultations,
    mobileDrafts: data.mobileDrafts,
    reminders: data.reminders,
    tasks: materializeTasksFromLegacy({
      existingTasks: (data.tasks as CanonicalTask[] | undefined) ?? [],
      interventionCards: data.interventionCards,
      consultations: data.consultations,
      reminders: data.reminders,
      guardianFeedbacks: normalizedFeedback,
      taskCheckIns: data.taskCheckIns,
      now: data.updatedAt,
    }),
    updatedAt: data.updatedAt,
  } satisfies AppStateSnapshot;

  return snapshot;
}

export function isAppStateSnapshot(value: unknown): value is AppStateSnapshot {
  return normalizeAppStateSnapshot(value) !== null;
}
