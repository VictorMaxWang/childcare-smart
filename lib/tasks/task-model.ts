import type { ReminderItem, ReminderStatus, ReminderType } from "@/lib/ai/types";
import type { InterventionCard } from "@/lib/agent/intervention-card";
import type { AdminDispatchEvent } from "@/lib/agent/admin-types";
import type { ConsultationResult } from "@/lib/ai/types";
import type { GuardianFeedback, TaskCheckInRecord } from "@/lib/store";
import type { CanonicalTask, FollowUpTask, TaskDueWindow, TaskLegacyRefs, TaskOwnerRole, TaskSourceType, TaskStatus } from "@/lib/tasks/types";

type TaskCoreStatus = Exclude<TaskStatus, "overdue">;

export interface MaterializeTasksInput {
  existingTasks?: CanonicalTask[];
  interventionCards?: InterventionCard[];
  consultations?: ConsultationResult[];
  reminders?: ReminderItem[];
  guardianFeedbacks?: GuardianFeedback[];
  taskCheckIns?: TaskCheckInRecord[];
  now?: string;
}

export interface FollowUpCardContext {
  childId: string;
  currentInterventionCard: {
    id?: string;
    consultationId?: string;
    title: string;
    tonightHomeAction: string;
    observationPoints: string[];
    tomorrowObservationPoint: string;
    reviewIn48h: string;
  };
  createdAt?: string;
  updatedAt?: string;
  legacyWeeklyTaskId?: string;
}

export interface ReminderProjectionOptions {
  childName?: string;
  targetId?: string;
}

const DEFAULT_TASK_TITLE = "Intervention Task";
const DEFAULT_LEGACY_TASK_DESCRIPTION = "Recovered from legacy task data.";
const STATUS_PRIORITY: Record<TaskCoreStatus, number> = {
  pending: 0,
  in_progress: 1,
  completed: 2,
};

function safeIso(value: string | undefined, fallback = new Date().toISOString()) {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function safeDateMs(value: string | undefined) {
  if (!value) return 0;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function maxIso(...values: Array<string | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => safeDateMs(right) - safeDateMs(left))[0];
}

function endOfLocalDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

function addHours(value: string, hours: number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

function toStableHash(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36);
}

function buildDueWindow(kind: TaskDueWindow["kind"]): TaskDueWindow {
  if (kind === "same_day") {
    return { kind, label: "Today" };
  }
  if (kind === "within_48h") {
    return { kind, label: "Within 48 hours" };
  }
  return { kind, label: "Deadline" };
}

function mergeLegacyRefs(left?: TaskLegacyRefs, right?: TaskLegacyRefs): TaskLegacyRefs | undefined {
  if (!left && !right) return undefined;
  const reminderIds = [...(left?.reminderIds ?? []), ...(right?.reminderIds ?? [])];
  const dedupedReminderIds = reminderIds.filter((value, index) => value && reminderIds.indexOf(value) === index);

  return {
    interventionCardId: right?.interventionCardId ?? left?.interventionCardId,
    reminderIds: dedupedReminderIds.length > 0 ? dedupedReminderIds : undefined,
    legacyWeeklyTaskId: right?.legacyWeeklyTaskId ?? left?.legacyWeeklyTaskId,
    adminDispatchEventId: right?.adminDispatchEventId ?? left?.adminDispatchEventId,
    consultationId: right?.consultationId ?? left?.consultationId,
  };
}

function mergeRelatedTaskIds(left?: string[], right?: string[]) {
  const values = [...(left ?? []), ...(right ?? [])];
  const deduped = values.filter((value, index) => value && values.indexOf(value) === index);
  return deduped.length > 0 ? deduped : undefined;
}

function isTaskCoreStatus(value: string): value is TaskCoreStatus {
  return value === "pending" || value === "in_progress" || value === "completed";
}

function coerceTaskCoreStatus(value: TaskStatus | undefined): TaskCoreStatus {
  if (value === "completed") return "completed";
  if (value === "in_progress") return "in_progress";
  return "pending";
}

function mapReminderTypeToTaskShape(reminderType: ReminderType) {
  if (reminderType === "family-task") {
    return {
      taskType: "intervention" as const,
      ownerRole: "parent" as const,
      dueWindow: buildDueWindow("same_day"),
      evidenceSubmissionMode: "guardian_feedback" as const,
      sourceType: "legacy_weekly_task" as const,
    };
  }

  if (reminderType === "review-48h") {
    return {
      taskType: "follow_up" as const,
      ownerRole: "teacher" as const,
      dueWindow: buildDueWindow("within_48h"),
      evidenceSubmissionMode: "task_checkin" as const,
      sourceType: "legacy_weekly_task" as const,
    };
  }

  return {
    taskType: "follow_up" as const,
    ownerRole: "admin" as const,
    dueWindow: buildDueWindow("deadline"),
    evidenceSubmissionMode: "dispatch_status_update" as const,
    sourceType: "consultation" as const,
  };
}

function inferReminderSourceType(reminder: ReminderItem): TaskSourceType {
  if (reminder.reminderType === "admin-focus") {
    return reminder.sourceType === "admin_dispatch" ? "admin_dispatch" : "consultation";
  }

  if (reminder.sourceType === "intervention_card") {
    return "intervention_card";
  }

  return reminder.sourceId ? "intervention_card" : "legacy_weekly_task";
}

export function buildTaskId(params: {
  childId: string;
  sourceType: TaskSourceType;
  sourceId: string;
  taskType: CanonicalTask["taskType"];
  ownerRole: TaskOwnerRole;
}) {
  const hash = toStableHash(
    [params.childId, params.sourceType, params.sourceId, params.taskType, params.ownerRole].join(":")
  );
  return `task-${params.childId}-${params.taskType}-${params.ownerRole}-${hash}`;
}

export function mapReminderStatusToTaskStatus(status: ReminderStatus): TaskCoreStatus {
  if (status === "done") return "completed";
  if (status === "acknowledged") return "in_progress";
  return "pending";
}

export function mapTaskStatusToReminderStatus(status: TaskStatus): ReminderStatus {
  if (status === "completed") return "done";
  if (status === "in_progress") return "acknowledged";
  return "pending";
}

function getReminderTypeForTask(task: CanonicalTask): ReminderType | null {
  if (task.ownerRole === "parent" && task.taskType === "intervention") return "family-task";
  if (task.ownerRole === "teacher" && task.taskType === "follow_up") return "review-48h";
  if (task.ownerRole === "admin" && task.taskType === "follow_up") return "admin-focus";
  return null;
}

function buildReminderTitle(task: CanonicalTask, childName?: string) {
  const prefix = childName?.trim() ? `${childName} ` : "";
  const reminderType = getReminderTypeForTask(task);
  if (reminderType === "family-task") {
    return `${prefix}Tonight Action`;
  }
  if (reminderType === "review-48h") {
    return `${prefix}48h Review`;
  }
  return `${prefix}Admin Focus`;
}

function buildReminderId(task: CanonicalTask, reminderType: ReminderType) {
  return `reminder-${reminderType}-${task.taskId}`;
}

function buildTaskBase(params: {
  childId: string;
  sourceType: TaskSourceType;
  sourceId: string;
  taskType: CanonicalTask["taskType"];
  ownerRole: TaskOwnerRole;
  title: string;
  description: string;
  dueWindow: TaskDueWindow;
  dueAt: string;
  evidenceSubmissionMode: CanonicalTask["evidenceSubmissionMode"];
  createdAt: string;
  updatedAt: string;
  relatedTaskIds?: string[];
  legacyRefs?: TaskLegacyRefs;
}) {
  return {
    taskId: buildTaskId({
      childId: params.childId,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      taskType: params.taskType,
      ownerRole: params.ownerRole,
    }),
    taskType: params.taskType,
    childId: params.childId,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    ownerRole: params.ownerRole,
    title: params.title.trim() || DEFAULT_TASK_TITLE,
    description: params.description.trim() || DEFAULT_LEGACY_TASK_DESCRIPTION,
    dueWindow: params.dueWindow,
    dueAt: safeIso(params.dueAt),
    status: "pending" as const,
    evidenceSubmissionMode: params.evidenceSubmissionMode,
    createdAt: safeIso(params.createdAt),
    updatedAt: safeIso(params.updatedAt),
    relatedTaskIds: params.relatedTaskIds,
    legacyRefs: params.legacyRefs,
  };
}

export function buildInterventionTasksFromCard(
  card: Pick<
    InterventionCard,
    | "id"
    | "title"
    | "targetChildId"
    | "tonightHomeAction"
    | "reviewIn48h"
    | "consultationId"
    | "createdAt"
    | "updatedAt"
  >,
  options?: { legacyWeeklyTaskId?: string; consultationId?: string }
) {
  const createdAt = safeIso(card.createdAt ?? card.updatedAt);
  const updatedAt = safeIso(card.updatedAt ?? card.createdAt ?? createdAt);
  const sourceId = card.id;
  const consultationId = options?.consultationId ?? card.consultationId;

  const parentTask = buildTaskBase({
    childId: card.targetChildId,
    sourceType: "intervention_card",
    sourceId,
    taskType: "intervention",
    ownerRole: "parent",
    title: card.title,
    description: card.tonightHomeAction,
    dueWindow: buildDueWindow("same_day"),
    dueAt: endOfLocalDay(createdAt),
    evidenceSubmissionMode: "guardian_feedback",
    createdAt,
    updatedAt,
    legacyRefs: {
      interventionCardId: card.id,
      legacyWeeklyTaskId: options?.legacyWeeklyTaskId,
      consultationId,
    },
  });

  const teacherTask = buildTaskBase({
    childId: card.targetChildId,
    sourceType: "intervention_card",
    sourceId,
    taskType: "follow_up",
    ownerRole: "teacher",
    title: card.title,
    description: card.reviewIn48h,
    dueWindow: buildDueWindow("within_48h"),
    dueAt: addHours(createdAt, 48),
    evidenceSubmissionMode: "task_checkin",
    createdAt,
    updatedAt,
    legacyRefs: {
      interventionCardId: card.id,
      legacyWeeklyTaskId: options?.legacyWeeklyTaskId,
      consultationId,
    },
  });

  parentTask.relatedTaskIds = [teacherTask.taskId];
  teacherTask.relatedTaskIds = [parentTask.taskId];

  return {
    parentTask,
    followUpTask: teacherTask,
    tasks: [parentTask, teacherTask] satisfies CanonicalTask[],
  };
}

export function buildConsultationAdminTask(consultation: ConsultationResult) {
  if (!consultation.shouldEscalateToAdmin) {
    return null;
  }

  const createdAt = safeIso(consultation.generatedAt);
  const title = consultation.coordinatorSummary.finalConclusion || consultation.summary || DEFAULT_TASK_TITLE;
  return buildTaskBase({
    childId: consultation.childId,
    sourceType: "consultation",
    sourceId: consultation.consultationId,
    taskType: "follow_up",
    ownerRole: "admin",
    title,
    description: consultation.coordinatorSummary.finalConclusion || consultation.reviewIn48h || consultation.summary,
    dueWindow: buildDueWindow("deadline"),
    dueAt: consultation.directorDecisionCard.recommendedAt || consultation.generatedAt,
    evidenceSubmissionMode: "dispatch_status_update",
    createdAt,
    updatedAt: createdAt,
    legacyRefs: {
      consultationId: consultation.consultationId,
    },
  });
}

export function buildTaskFromReminder(reminder: ReminderItem): CanonicalTask {
  const shape = mapReminderTypeToTaskShape(reminder.reminderType);
  const sourceId = reminder.sourceId ?? reminder.taskId ?? reminder.reminderId;
  const sourceType = reminder.sourceType ?? inferReminderSourceType(reminder);

  return buildTaskBase({
    childId: reminder.childId ?? reminder.targetId,
    sourceType,
    sourceId,
    taskType: shape.taskType,
    ownerRole: shape.ownerRole,
    title: reminder.title,
    description: reminder.description,
    dueWindow: shape.dueWindow,
    dueAt: reminder.scheduledAt,
    evidenceSubmissionMode: shape.evidenceSubmissionMode,
    createdAt: reminder.scheduledAt,
    updatedAt: reminder.scheduledAt,
    legacyRefs: {
      reminderIds: [reminder.reminderId],
    },
  });
}

export function buildTaskFromLegacyCheckIn(record: TaskCheckInRecord): CanonicalTask {
  return buildTaskBase({
    childId: record.childId,
    sourceType: "legacy_weekly_task",
    sourceId: record.taskId,
    taskType: "intervention",
    ownerRole: "parent",
    title: "Legacy Follow-up Task",
    description: DEFAULT_LEGACY_TASK_DESCRIPTION,
    dueWindow: buildDueWindow("deadline"),
    dueAt: endOfLocalDay(record.date),
    evidenceSubmissionMode: "task_checkin",
    createdAt: safeIso(record.date),
    updatedAt: safeIso(record.date),
    legacyRefs: {
      legacyWeeklyTaskId: record.taskId,
    },
  });
}

function findMatchingReminder(task: CanonicalTask, reminder: ReminderItem) {
  if (reminder.taskId && reminder.taskId === task.taskId) return true;

  if (reminder.reminderType === "family-task") {
    return task.ownerRole === "parent" && task.taskType === "intervention" && reminder.sourceId === task.sourceId;
  }
  if (reminder.reminderType === "review-48h") {
    return task.ownerRole === "teacher" && task.taskType === "follow_up" && reminder.sourceId === task.sourceId;
  }
  if (reminder.reminderType === "admin-focus") {
    return task.ownerRole === "admin" && reminder.sourceId === task.sourceId;
  }

  return false;
}

function findMatchingFeedback(task: CanonicalTask, feedback: GuardianFeedback) {
  if (task.childId !== feedback.childId) return false;
  if (task.ownerRole !== "parent") return false;
  if (feedback.relatedTaskId) {
    return feedback.relatedTaskId === task.taskId;
  }
  const consultationId = task.legacyRefs?.consultationId;
  if (feedback.relatedConsultationId && consultationId) {
    return feedback.relatedConsultationId === consultationId;
  }
  const interventionCardId = task.legacyRefs?.interventionCardId ?? task.sourceId;
  if (feedback.interventionCardId) {
    return feedback.interventionCardId === interventionCardId;
  }
  return task.sourceType === "legacy_weekly_task";
}

function findMatchingCheckIn(task: CanonicalTask, record: TaskCheckInRecord) {
  if (task.childId !== record.childId) return false;
  if (record.taskId === task.taskId) return true;
  if (task.legacyRefs?.legacyWeeklyTaskId && record.taskId === task.legacyRefs.legacyWeeklyTaskId) return true;
  if (task.ownerRole === "parent" && task.taskType === "intervention" && record.taskId === task.sourceId) return true;
  return false;
}

function toFeedbackCoreStatus(feedback: GuardianFeedback): TaskCoreStatus {
  if (feedback.executionStatus === "completed" || feedback.executed === true) return "completed";
  if (feedback.executionStatus === "partial") return "in_progress";
  if (feedback.executionStatus === "unable_to_execute") return "pending";
  return "pending";
}

function collectEvidence(task: CanonicalTask, input: MaterializeTasksInput, existingTask?: CanonicalTask) {
  const reminders = (input.reminders ?? []).filter((item) => findMatchingReminder(task, item));
  const guardianFeedbacks = (input.guardianFeedbacks ?? []).filter((item) => findMatchingFeedback(task, item));
  const taskCheckIns = (input.taskCheckIns ?? []).filter((item) => findMatchingCheckIn(task, item));

  const evidenceStatuses: TaskCoreStatus[] = [];
  if (existingTask && isTaskCoreStatus(existingTask.status)) {
    evidenceStatuses.push(existingTask.status);
  } else if (existingTask) {
    evidenceStatuses.push(coerceTaskCoreStatus(existingTask.status));
  }
  evidenceStatuses.push(...reminders.map((item) => mapReminderStatusToTaskStatus(item.status)));
  evidenceStatuses.push(...guardianFeedbacks.map(toFeedbackCoreStatus));
  evidenceStatuses.push(...taskCheckIns.map(() => "completed" as const));

  const latestReminder = reminders.sort((left, right) => safeDateMs(right.scheduledAt) - safeDateMs(left.scheduledAt))[0];
  const latestFeedback = guardianFeedbacks
    .sort((left, right) => safeDateMs(right.submittedAt ?? right.date) - safeDateMs(left.submittedAt ?? left.date))[0];
  const latestCheckIn = taskCheckIns.sort((left, right) => safeDateMs(right.date) - safeDateMs(left.date))[0];
  const latestFeedbackAt = latestFeedback?.submittedAt ?? latestFeedback?.date;
  const lastEvidenceAt = maxIso(existingTask?.lastEvidenceAt, latestReminder?.scheduledAt, latestFeedbackAt, latestCheckIn?.date);
  const completionSummary =
    latestFeedback?.notes?.trim() ||
    latestFeedback?.freeNote?.trim() ||
    latestFeedback?.content?.trim() ||
    existingTask?.completionSummary;

  let coreStatus: TaskCoreStatus = "pending";
  for (const status of evidenceStatuses) {
    if (STATUS_PRIORITY[status] > STATUS_PRIORITY[coreStatus]) {
      coreStatus = status;
    }
  }

  return {
    coreStatus,
    completionSummary,
    completedAt:
      coreStatus === "completed"
        ? maxIso(existingTask?.completedAt, latestFeedbackAt, latestCheckIn?.date, latestReminder?.scheduledAt)
        : undefined,
    lastEvidenceAt,
    reminderIds: reminders.map((item) => item.reminderId),
  };
}

export function resolveTaskStatus(task: Pick<CanonicalTask, "dueAt">, coreStatus: TaskCoreStatus, now = new Date().toISOString()): TaskStatus {
  if (coreStatus === "completed") return "completed";
  return safeDateMs(task.dueAt) < safeDateMs(now) ? "overdue" : coreStatus;
}

function hydrateTask(task: CanonicalTask, input: MaterializeTasksInput, existingTask?: CanonicalTask): CanonicalTask {
  const evidence = collectEvidence(task, input, existingTask);
  const status = resolveTaskStatus(task, evidence.coreStatus, input.now);
  const updatedAt = maxIso(task.updatedAt, evidence.lastEvidenceAt, existingTask?.updatedAt) ?? task.updatedAt;

  return {
    ...task,
    status,
    completionSummary: evidence.completionSummary,
    completedAt: evidence.completedAt,
    lastEvidenceAt: evidence.lastEvidenceAt,
    statusChangedAt: evidence.lastEvidenceAt ?? existingTask?.statusChangedAt ?? task.updatedAt,
    updatedAt,
    relatedTaskIds: mergeRelatedTaskIds(task.relatedTaskIds, existingTask?.relatedTaskIds),
    legacyRefs: mergeLegacyRefs(task.legacyRefs, {
      reminderIds: evidence.reminderIds,
    }),
  };
}

export function materializeTasksFromLegacy(input: MaterializeTasksInput): CanonicalTask[] {
  const existingTaskMap = new Map((input.existingTasks ?? []).map((task) => [task.taskId, task]));
  const taskMap = new Map<string, CanonicalTask>();

  for (const card of input.interventionCards ?? []) {
    const taskSet = buildInterventionTasksFromCard(card);
    taskMap.set(taskSet.parentTask.taskId, taskSet.parentTask);
    taskMap.set(taskSet.followUpTask.taskId, taskSet.followUpTask);
  }

  for (const consultation of input.consultations ?? []) {
    const adminTask = buildConsultationAdminTask(consultation);
    if (adminTask) {
      taskMap.set(adminTask.taskId, adminTask);
    }
  }

  for (const reminder of input.reminders ?? []) {
    const matchingTask = Array.from(taskMap.values()).find((task) => findMatchingReminder(task, reminder));
    if (matchingTask) {
      continue;
    }

    const reminderTask = buildTaskFromReminder(reminder);
    taskMap.set(reminderTask.taskId, reminderTask);
  }

  for (const record of input.taskCheckIns ?? []) {
    const matchingTask = Array.from(taskMap.values()).find((task) => findMatchingCheckIn(task, record));
    if (matchingTask) {
      continue;
    }

    const recoveredTask = buildTaskFromLegacyCheckIn(record);
    taskMap.set(recoveredTask.taskId, recoveredTask);
  }

  for (const existingTask of input.existingTasks ?? []) {
    if (!taskMap.has(existingTask.taskId)) {
      taskMap.set(existingTask.taskId, existingTask);
    }
  }

  return Array.from(taskMap.values())
    .map((task) => hydrateTask(task, input, existingTaskMap.get(task.taskId)))
    .sort((left, right) => safeDateMs(left.dueAt) - safeDateMs(right.dueAt));
}

export function buildReminderFromTask(task: CanonicalTask, options?: ReminderProjectionOptions): ReminderItem | null {
  const reminderType = getReminderTypeForTask(task);
  if (!reminderType) return null;

  return {
    reminderId: buildReminderId(task, reminderType),
    reminderType,
    targetRole: task.ownerRole,
    targetId: options?.targetId ?? task.childId,
    childId: task.childId,
    title: buildReminderTitle(task, options?.childName),
    description: task.description,
    scheduledAt: task.dueAt,
    status: mapTaskStatusToReminderStatus(task.status),
    sourceId: task.sourceId,
    taskId: task.taskId,
    sourceType: task.sourceType,
    relatedTaskIds: task.relatedTaskIds,
  };
}

export function buildReminderItemsForRole(tasks: CanonicalTask[], role: TaskOwnerRole, options?: ReminderProjectionOptions) {
  return tasks
    .filter((task) => task.ownerRole === role)
    .map((task) => buildReminderFromTask(task, options))
    .filter((task): task is ReminderItem => Boolean(task));
}

export function buildTaskFromAdminDispatchEvent(event: AdminDispatchEvent): FollowUpTask {
  const baseTask = buildTaskBase({
    childId: event.source?.relatedChildIds?.[0] ?? event.targetId,
    sourceType: "admin_dispatch",
    sourceId: event.id,
    taskType: "follow_up",
    ownerRole: "admin",
    title: event.title,
    description: event.recommendedAction || event.summary,
    dueWindow: buildDueWindow("deadline"),
    dueAt: event.recommendedDeadline,
    evidenceSubmissionMode: "dispatch_status_update",
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    legacyRefs: {
      adminDispatchEventId: event.id,
      consultationId: event.source?.consultationId,
    },
  }) as FollowUpTask;

  const coreStatus = coerceTaskCoreStatus(event.status);
  return {
    ...baseTask,
    status: resolveTaskStatus(baseTask, coreStatus),
    completedAt: event.completedAt ?? undefined,
  };
}

export function buildTasksFromFollowUpCardContext(input: FollowUpCardContext) {
  const createdAt = safeIso(input.createdAt ?? input.updatedAt);
  const sourceId = input.currentInterventionCard.id ?? `follow-up-card-${input.childId}`;
  const baseCard = {
    id: sourceId,
    consultationId: input.currentInterventionCard.consultationId,
    title: input.currentInterventionCard.title,
    targetChildId: input.childId,
    tonightHomeAction: input.currentInterventionCard.tonightHomeAction,
    reviewIn48h: input.currentInterventionCard.reviewIn48h,
    createdAt,
    updatedAt: input.updatedAt ?? createdAt,
  };
  return buildInterventionTasksFromCard(baseCard, {
    legacyWeeklyTaskId: input.legacyWeeklyTaskId,
    consultationId: input.currentInterventionCard.consultationId,
  });
}

export function buildCurrentInterventionCardFromTask(params: {
  activeTask: CanonicalTask;
  relatedTasks?: CanonicalTask[];
}) {
  const relatedTasks = params.relatedTasks ?? [];
  const parentTask =
    params.activeTask.ownerRole === "parent" && params.activeTask.taskType === "intervention"
      ? params.activeTask
      : relatedTasks.find((task) => task.ownerRole === "parent" && task.taskType === "intervention");
  const followUpTask =
    params.activeTask.ownerRole === "teacher" && params.activeTask.taskType === "follow_up"
      ? params.activeTask
      : relatedTasks.find((task) => task.ownerRole === "teacher" && task.taskType === "follow_up");

  const title = parentTask?.title ?? followUpTask?.title ?? params.activeTask.title;
  const tonightHomeAction = parentTask?.description ?? params.activeTask.description;
  const reviewIn48h = followUpTask?.description ?? params.activeTask.description;

  return {
    id: parentTask?.legacyRefs?.interventionCardId ?? followUpTask?.legacyRefs?.interventionCardId ?? params.activeTask.sourceId,
    consultationId:
      parentTask?.legacyRefs?.consultationId ??
      followUpTask?.legacyRefs?.consultationId ??
      params.activeTask.legacyRefs?.consultationId,
    title,
    tonightHomeAction,
    observationPoints: [] as string[],
    tomorrowObservationPoint: reviewIn48h,
    reviewIn48h,
  };
}

export function pickActiveTask(tasks: CanonicalTask[], childId: string, ownerRole?: TaskOwnerRole) {
  return [...tasks]
    .filter((task) => task.childId === childId && (!ownerRole || task.ownerRole === ownerRole))
    .sort((left, right) => {
      const leftRank = left.status === "completed" ? 3 : left.status === "pending" ? 2 : left.status === "overdue" ? 1 : 0;
      const rightRank = right.status === "completed" ? 3 : right.status === "pending" ? 2 : right.status === "overdue" ? 1 : 0;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      return safeDateMs(left.dueAt) - safeDateMs(right.dueAt);
    })[0];
}
