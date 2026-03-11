import type {
  AttendanceRecord,
  Child,
  GrowthRecord,
  GuardianFeedback,
  HealthCheckRecord,
  MealRecord,
  TaskCheckInRecord,
} from "@/lib/store";

export interface AppStateSnapshot {
  children: Child[];
  attendance: AttendanceRecord[];
  meals: MealRecord[];
  growth: GrowthRecord[];
  feedback: GuardianFeedback[];
  health: HealthCheckRecord[];
  taskCheckIns: TaskCheckInRecord[];
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
    Array.isArray((value as { foods?: unknown }).foods)
  );
}

function isGrowthRecord(value: unknown): value is GrowthRecord {
  return (
    hasStringId(value) &&
    typeof (value as { childId?: unknown }).childId === "string" &&
    typeof (value as { description?: unknown }).description === "string"
  );
}

function isGuardianFeedback(value: unknown): value is GuardianFeedback {
  return (
    hasStringId(value) &&
    typeof (value as { childId?: unknown }).childId === "string" &&
    typeof (value as { content?: unknown }).content === "string"
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

export function isAppStateSnapshot(value: unknown): value is AppStateSnapshot {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return (
    Array.isArray(data.children) &&
    data.children.every(isChild) &&
    Array.isArray(data.attendance) &&
    data.attendance.every(isAttendanceRecord) &&
    Array.isArray(data.meals) &&
    data.meals.every(isMealRecord) &&
    Array.isArray(data.growth) &&
    data.growth.every(isGrowthRecord) &&
    Array.isArray(data.feedback) &&
    data.feedback.every(isGuardianFeedback) &&
    Array.isArray(data.health) &&
    data.health.every(isHealthCheckRecord) &&
    Array.isArray(data.taskCheckIns) &&
    data.taskCheckIns.every(isTaskCheckInRecord) &&
    typeof data.updatedAt === "string"
  );
}
