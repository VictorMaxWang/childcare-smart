import { DEMO_ACCOUNTS } from "@/lib/auth/accounts";
import { scopeSnapshotForSessionUser } from "@/lib/persistence/state-scope";
import type { AppStateSnapshot } from "@/lib/persistence/snapshot";
import type {
  DailyRecordType,
  DemoDataContext,
  DemoDailyRecord,
  DirectorDashboardMetrics,
  ParentHomeData,
  TeacherWorkbenchData,
} from "./types";
import { getCurrentDemoContext, readContextSnapshot } from "./persistence";

function getChild(snapshot: AppStateSnapshot, childId: string) {
  return snapshot.children.find((child) => child.id === childId);
}

export function listMessages(context = getCurrentDemoContext("parent")) {
  const snapshot = scopeSnapshotForSessionUser(readContextSnapshot(context), context.user);
  return [...snapshot.messages].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function listDailyRecords(
  childId: string,
  type?: DailyRecordType,
  context?: DemoDataContext
): DemoDailyRecord[] {
  const effectiveContext = context ?? getCurrentDemoContext("parent");
  const snapshot = scopeSnapshotForSessionUser(readContextSnapshot(effectiveContext), effectiveContext.user);

  const healthRecords: DemoDailyRecord[] = snapshot.health
    .filter((record) => record.childId === childId)
    .map((record) => ({
      recordId: record.id,
      childId: record.childId,
      classId: getChild(snapshot, record.childId)?.className ?? "",
      type: "morning-check",
      payload: { ...record },
      createdBy: record.checkedBy,
      createdAt: record.date,
      updatedAt: record.date,
      visibleToParent: true,
    }));

  const mealRecords: DemoDailyRecord[] = snapshot.meals
    .filter((record) => record.childId === childId)
    .map((record) => ({
      recordId: record.id,
      childId: record.childId,
      classId: getChild(snapshot, record.childId)?.className ?? "",
      type: "diet",
      payload: { ...record },
      createdBy: record.recordedBy,
      createdAt: record.date,
      updatedAt: record.date,
      visibleToParent: true,
    }));

  const growthRecords: DemoDailyRecord[] = snapshot.growth
    .filter((record) => record.childId === childId)
    .map((record) => ({
      recordId: record.id,
      childId: record.childId,
      classId: getChild(snapshot, record.childId)?.className ?? "",
      type: "growth",
      payload: { ...record },
      createdBy: record.recorder,
      createdAt: record.createdAt,
      updatedAt: record.createdAt,
      visibleToParent: true,
    }));

  return [...healthRecords, ...mealRecords, ...growthRecords]
    .filter((record) => !type || record.type === type)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function listHealthMaterials(childId: string, context = getCurrentDemoContext("parent")) {
  const snapshot = scopeSnapshotForSessionUser(readContextSnapshot(context), context.user);
  return snapshot.healthMaterials
    .filter((material) => material.childId === childId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function listConsultations(context = getCurrentDemoContext("director")) {
  const snapshot = scopeSnapshotForSessionUser(readContextSnapshot(context), context.user);
  return [...snapshot.consultations].sort((left, right) => right.generatedAt.localeCompare(left.generatedAt));
}

export function listReminders(childId: string, context = getCurrentDemoContext("parent")) {
  const snapshot = scopeSnapshotForSessionUser(readContextSnapshot(context), context.user);
  return snapshot.reminders
    .filter((reminder) => reminder.childId === childId || reminder.targetId === childId)
    .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt));
}

export function listNutritionMenus(input: {
  context?: DemoDataContext;
  childId?: string;
  classId?: string;
  dateRange?: { from?: string; to?: string };
}) {
  const context = input.context ?? getCurrentDemoContext(input.childId ? "parent" : "teacher");
  const snapshot = scopeSnapshotForSessionUser(readContextSnapshot(context), context.user);
  const childClassId = input.childId ? snapshot.children.find((child) => child.id === input.childId)?.className : undefined;
  const classId = input.classId ?? childClassId;
  return snapshot.nutritionMenus.filter((menu) => {
    if (classId && menu.classId !== classId) return false;
    if (input.dateRange?.from && menu.date < input.dateRange.from) return false;
    if (input.dateRange?.to && menu.date > input.dateRange.to) return false;
    return true;
  });
}

export function listStorybooks(childId: string, context = getCurrentDemoContext("parent")) {
  const snapshot = scopeSnapshotForSessionUser(readContextSnapshot(context), context.user);
  return snapshot.storybooks
    .filter((storybook) => storybook.childId === childId)
    .sort((left, right) => right.generatedAt.localeCompare(left.generatedAt));
}

export function getDirectorDashboardMetrics(context = getCurrentDemoContext("director")): DirectorDashboardMetrics {
  const snapshot = scopeSnapshotForSessionUser(readContextSnapshot(context), context.user);
  return {
    childCount: snapshot.children.length,
    teacherCount: DEMO_ACCOUNTS.filter((account) => account.role === "教师").length,
    feedbackCount: snapshot.feedback.length,
    consultationCount: snapshot.consultations.length,
    highRiskConsultationCount: snapshot.consultations.filter((item) => item.riskLevel === "high").length,
    unreadReminderCount: snapshot.reminders.filter((item) => item.status === "pending").length,
    dailyRecordCount: snapshot.health.length + snapshot.meals.length + snapshot.growth.length,
  };
}

export function getTeacherWorkbenchData(teacherId: string, context = getCurrentDemoContext("teacher")): TeacherWorkbenchData {
  const teacher = DEMO_ACCOUNTS.find((account) => account.id === teacherId) ?? context.user;
  const snapshot = scopeSnapshotForSessionUser(readContextSnapshot(context), teacher);
  const today = context.now().slice(0, 10);
  return {
    teacherId,
    className: teacher.className,
    visibleChildCount: snapshot.children.length,
    pendingMessages: snapshot.messages.filter((message) => !message.readBy.includes(teacherId)),
    todayRecords: snapshot.children.flatMap((child) =>
      listDailyRecords(child.id, undefined, { ...context, user: teacher })
        .filter((record) => record.createdAt.slice(0, 10) === today)
    ),
    activeConsultations: snapshot.consultations,
    reminders: snapshot.reminders,
  };
}

export function getParentHomeData(childId: string, context = getCurrentDemoContext("parent")): ParentHomeData {
  return {
    childId,
    messages: listMessages(context).filter((message) => message.childId === childId),
    dailyRecords: listDailyRecords(childId, undefined, context),
    healthMaterials: listHealthMaterials(childId, context),
    consultations: listConsultations(context).filter((item) => item.childId === childId),
    reminders: listReminders(childId, context),
    nutritionMenus: listNutritionMenus({ context, childId }),
    storybooks: listStorybooks(childId, context),
  };
}
