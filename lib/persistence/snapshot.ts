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

export function isAppStateSnapshot(value: unknown): value is AppStateSnapshot {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return (
    Array.isArray(data.children) &&
    Array.isArray(data.attendance) &&
    Array.isArray(data.meals) &&
    Array.isArray(data.growth) &&
    Array.isArray(data.feedback) &&
    Array.isArray(data.health) &&
    Array.isArray(data.taskCheckIns)
  );
}
