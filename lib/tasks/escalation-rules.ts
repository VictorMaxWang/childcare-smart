import type {
  CanonicalTask,
  EvaluateTaskEscalationsInput,
  TaskEscalationDueRiskWindow,
  TaskEscalationFeedbackSignal,
  TaskEscalationLevel,
  TaskEscalationReminderSignal,
  TaskEscalationRuleCode,
  TaskEscalationSuggestion,
  TaskEscalationTaskCheckInSignal,
  TaskOwnerRole,
} from "@/lib/tasks/types";

const HOUR_IN_MS = 60 * 60 * 1000;
const INCOMPLETE_TASK_STATUSES = new Set<CanonicalTask["status"]>([
  "pending",
  "in_progress",
  "overdue",
]);
const ESCALATION_LEVEL_RANK: Record<TaskEscalationLevel, number> = {
  none: 0,
  review_required: 1,
  reconsult_required: 2,
  director_attention: 3,
};
const ESCALATION_RULE_CODES = new Set<TaskEscalationRuleCode>([
  "overdue_48h",
  "continuous_non_completion",
  "guardian_feedback_negative_no_improvement",
  "same_child_repeated_follow_up_48h",
  "teacher_follow_up_stalled",
  "multiple_pending_tasks_same_child",
  "legacy_low_response_proxy",
]);
const ESCALATION_LEVELS = new Set<TaskEscalationLevel>([
  "none",
  "review_required",
  "reconsult_required",
  "director_attention",
]);
const OWNER_ROLES = new Set<TaskOwnerRole>(["parent", "teacher", "admin"]);

type TaskRuleTrigger = {
  rule: TaskEscalationRuleCode;
  level: TaskEscalationLevel;
  reason: string;
  nextStep: string;
  relatedTaskIds?: string[];
};

function safeDateMs(value: string | undefined) {
  if (!value) return 0;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function safeIso(value: string | undefined, fallback: string) {
  const parsedMs = safeDateMs(value);
  return parsedMs > 0 ? new Date(parsedMs).toISOString() : fallback;
}

function addHours(value: string, hours: number) {
  const parsedMs = safeDateMs(value);
  if (parsedMs <= 0) return value;
  return new Date(parsedMs + hours * HOUR_IN_MS).toISOString();
}

function subtractHours(value: string, hours: number) {
  const parsedMs = safeDateMs(value);
  if (parsedMs <= 0) return value;
  return new Date(parsedMs - hours * HOUR_IN_MS).toISOString();
}

function roundHours(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 10) / 10);
}

function isIncompleteTask(task: CanonicalTask) {
  return INCOMPLETE_TASK_STATUSES.has(task.status);
}

function isReminderPending(reminder: TaskEscalationReminderSignal) {
  return reminder.status === "pending" || reminder.status === "snoozed";
}

function isNegativeFeedback(feedback: TaskEscalationFeedbackSignal) {
  return (
    feedback.improvementStatus === "worse" ||
    feedback.improvementStatus === "no_change" ||
    feedback.improved === false ||
    feedback.executed === false ||
    feedback.executionStatus === "not_started" ||
    feedback.executionStatus === "unable_to_execute"
  );
}

function getDueRiskWindow(task: CanonicalTask, now: string): TaskEscalationDueRiskWindow {
  const nowMs = safeDateMs(now);
  const dueAt = safeIso(task.dueAt, now);
  const dueAtMs = safeDateMs(dueAt);
  const hoursUntilDue = roundHours((dueAtMs - nowMs) / HOUR_IN_MS);
  const hoursOverdue = dueAtMs > 0 && nowMs > dueAtMs ? roundHours((nowMs - dueAtMs) / HOUR_IN_MS) : 0;
  const status =
    hoursOverdue > 0 ? "overdue" : hoursUntilDue <= 24 ? "due_soon" : "on_track";
  const label =
    status === "overdue"
      ? `Overdue by ${Math.max(1, Math.round(hoursOverdue))}h`
      : status === "due_soon"
        ? `Due in ${Math.max(1, Math.round(hoursUntilDue))}h`
        : "Within due window";

  return {
    referenceDueAt: dueAt,
    windowStartAt: subtractHours(dueAt, 24),
    windowEndAt: addHours(dueAt, 48),
    status,
    hoursOverdue,
    label,
  };
}

function getEscalationOwnerRole(task: CanonicalTask, level: TaskEscalationLevel): TaskOwnerRole {
  if (level === "director_attention" || level === "reconsult_required") {
    return "admin";
  }
  return task.ownerRole === "admin" ? "admin" : "teacher";
}

function mergeRelatedTaskIds(baseTask: CanonicalTask, triggers: TaskRuleTrigger[]) {
  const values = [
    ...(baseTask.relatedTaskIds ?? []),
    ...triggers.flatMap((trigger) => trigger.relatedTaskIds ?? []),
  ];
  return values.filter((value, index) => value && values.indexOf(value) === index);
}

function buildSuggestion(task: CanonicalTask, triggers: TaskRuleTrigger[], now: string): TaskEscalationSuggestion | null {
  if (triggers.length === 0) return null;

  const sortedTriggers = [...triggers].sort((left, right) => {
    const leftRank = ESCALATION_LEVEL_RANK[left.level];
    const rightRank = ESCALATION_LEVEL_RANK[right.level];
    if (leftRank !== rightRank) return rightRank - leftRank;
    return left.rule.localeCompare(right.rule);
  });
  const primaryTrigger = sortedTriggers[0];
  const secondaryRuleLabels = sortedTriggers.slice(1).map((trigger) => trigger.rule);
  const escalationReason =
    secondaryRuleLabels.length > 0
      ? `${primaryTrigger.reason} Additional triggers: ${secondaryRuleLabels.join(", ")}.`
      : primaryTrigger.reason;

  return {
    taskId: task.taskId,
    childId: task.childId,
    shouldEscalate: primaryTrigger.level !== "none",
    escalationLevel: primaryTrigger.level,
    escalationReason,
    recommendedNextStep: primaryTrigger.nextStep,
    triggeredRules: sortedTriggers.map((trigger) => trigger.rule),
    relatedTaskIds: mergeRelatedTaskIds(task, sortedTriggers),
    ownerRole: getEscalationOwnerRole(task, primaryTrigger.level),
    dueRiskWindow: getDueRiskWindow(task, now),
  };
}

function getLatestCheckInAt(task: CanonicalTask, taskCheckIns: TaskEscalationTaskCheckInSignal[]) {
  const taskIds = [task.taskId, task.legacyRefs?.legacyWeeklyTaskId].filter(
    (value): value is string => Boolean(value)
  );
  const matchingCheckIns = taskCheckIns.filter(
    (item) => item.childId === task.childId && taskIds.includes(item.taskId)
  );
  return matchingCheckIns
    .map((item) => item.date)
    .sort((left, right) => safeDateMs(right) - safeDateMs(left))[0];
}

function matchesFeedbackToTask(task: CanonicalTask, feedback: TaskEscalationFeedbackSignal) {
  if (task.childId !== feedback.childId) return false;
  if (feedback.relatedTaskId) {
    return feedback.relatedTaskId === task.taskId;
  }
  const consultationId = task.legacyRefs?.consultationId;
  if (feedback.relatedConsultationId && consultationId) {
    return feedback.relatedConsultationId === consultationId;
  }
  const cardId = task.legacyRefs?.interventionCardId;
  if (feedback.interventionCardId && cardId) {
    return feedback.interventionCardId === cardId;
  }
  return true;
}

function matchesReminderToTask(task: CanonicalTask, reminder: TaskEscalationReminderSignal) {
  if (reminder.taskId && reminder.taskId === task.taskId) return true;
  if (reminder.childId && reminder.childId !== task.childId) return false;
  if (reminder.sourceType && reminder.sourceType === task.sourceType && reminder.sourceId === task.sourceId) {
    return true;
  }
  return reminder.childId === task.childId;
}

function buildOverdue48hTrigger(task: CanonicalTask, dueRiskWindow: TaskEscalationDueRiskWindow) {
  if (task.status !== "overdue" || dueRiskWindow.hoursOverdue < 48) {
    return null;
  }

  if (task.ownerRole === "admin") {
    return {
      rule: "overdue_48h",
      level: "director_attention",
      reason: "An admin follow-up has remained overdue for more than 48 hours.",
      nextStep: "Escalate to director attention and confirm whether a re-consultation is required today.",
    } satisfies TaskRuleTrigger;
  }

  return {
    rule: "overdue_48h",
    level: "review_required",
    reason: "A canonical task has remained overdue for more than 48 hours.",
    nextStep:
      task.ownerRole === "parent"
        ? "Ask the teacher to review guardian execution and collect an updated response today."
        : "Ask the teacher to complete the follow-up review and record evidence today.",
  } satisfies TaskRuleTrigger;
}

function buildContinuousNonCompletionTrigger(task: CanonicalTask, childTasks: CanonicalTask[]) {
  if (!isIncompleteTask(task)) return null;

  const overdueTasks = childTasks.filter((item) => item.status === "overdue");
  if (overdueTasks.length < 2) return null;

  return {
    rule: "continuous_non_completion",
    level: "reconsult_required",
    reason: "The same child now has repeated overdue canonical tasks without closure.",
    nextStep: "Re-open consultation with the current task evidence and confirm a new follow-up plan.",
    relatedTaskIds: overdueTasks.map((item) => item.taskId).filter((item) => item !== task.taskId),
  } satisfies TaskRuleTrigger;
}

function buildNegativeFeedbackTrigger(task: CanonicalTask, guardianFeedbacks: TaskEscalationFeedbackSignal[]) {
  const matchingFeedback = guardianFeedbacks
    .filter((item) => matchesFeedbackToTask(task, item) && isNegativeFeedback(item))
    .sort((left, right) => safeDateMs(right.date) - safeDateMs(left.date))[0];

  if (!matchingFeedback) return null;

  return {
    rule: "guardian_feedback_negative_no_improvement",
    level: "reconsult_required",
    reason: "Guardian feedback indicates no improvement or non-execution after the current intervention.",
    nextStep: "Trigger re-consultation with the latest guardian feedback and align the next action set.",
  } satisfies TaskRuleTrigger;
}

function buildRepeatedFollowUpTrigger(task: CanonicalTask, childTasks: CanonicalTask[], now: string) {
  if (task.taskType !== "follow_up") return null;

  const nowMs = safeDateMs(now);
  const repeatedFollowUps = childTasks.filter((item) => {
    if (item.taskType !== "follow_up") return false;
    const createdAtMs = safeDateMs(item.createdAt);
    return createdAtMs > 0 && nowMs - createdAtMs <= 48 * HOUR_IN_MS;
  });

  if (repeatedFollowUps.length < 2) return null;

  const hasPendingAdminFollowUp = childTasks.some(
    (item) =>
      item.taskType === "follow_up" &&
      item.ownerRole === "admin" &&
      isIncompleteTask(item)
  );

  return {
    rule: "same_child_repeated_follow_up_48h",
    level: hasPendingAdminFollowUp ? "director_attention" : "reconsult_required",
    reason: "The same child has triggered repeated follow-up tasks within a 48-hour window.",
    nextStep: hasPendingAdminFollowUp
      ? "Escalate to director attention and consolidate the repeated follow-up trail into one review."
      : "Re-consult the case before creating another follow-up loop.",
    relatedTaskIds: repeatedFollowUps.map((item) => item.taskId).filter((item) => item !== task.taskId),
  } satisfies TaskRuleTrigger;
}

function buildTeacherStalledTrigger(
  task: CanonicalTask,
  taskCheckIns: TaskEscalationTaskCheckInSignal[],
  now: string
) {
  if (task.ownerRole !== "teacher" || task.taskType !== "follow_up" || !isIncompleteTask(task)) {
    return null;
  }

  const latestEvidenceAt = [task.lastEvidenceAt, getLatestCheckInAt(task, taskCheckIns)]
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => safeDateMs(right) - safeDateMs(left))[0];
  const createdAtMs = safeDateMs(task.createdAt);
  const latestEvidenceMs = safeDateMs(latestEvidenceAt);
  const nowMs = safeDateMs(now);
  const hoursSinceCreated = createdAtMs > 0 ? (nowMs - createdAtMs) / HOUR_IN_MS : 0;
  const hoursSinceEvidence =
    latestEvidenceMs > 0 ? (nowMs - latestEvidenceMs) / HOUR_IN_MS : hoursSinceCreated;

  if (hoursSinceCreated < 24 || hoursSinceEvidence < 24) {
    return null;
  }

  return {
    rule: "teacher_follow_up_stalled",
    level: "review_required",
    reason: "A teacher follow-up has stalled without fresh evidence for more than 24 hours.",
    nextStep: "Ask the teacher to update follow-up evidence today or request a review handoff.",
  } satisfies TaskRuleTrigger;
}

function buildMultiplePendingTasksTrigger(task: CanonicalTask, childTasks: CanonicalTask[]) {
  if (!isIncompleteTask(task)) return null;

  const incompleteTasks = childTasks.filter(isIncompleteTask);
  const distinctSourceKeys = new Set(
    incompleteTasks.map((item) => `${item.sourceType}:${item.sourceId}`)
  );
  const hasEscalatedBacklog =
    incompleteTasks.length >= 3 ||
    (incompleteTasks.length >= 2 &&
      distinctSourceKeys.size >= 2 &&
      incompleteTasks.some((item) => item.status === "overdue" || item.ownerRole === "admin"));

  if (!hasEscalatedBacklog) return null;

  return {
    rule: "multiple_pending_tasks_same_child",
    level: "director_attention",
    reason: "The same child now has multiple pending canonical tasks that require a coordinated review.",
    nextStep: "Escalate to director attention and consolidate the pending tasks into one owned review plan.",
    relatedTaskIds: incompleteTasks.map((item) => item.taskId).filter((item) => item !== task.taskId),
  } satisfies TaskRuleTrigger;
}

function buildLegacyLowResponseProxyTrigger(
  task: CanonicalTask,
  childTasks: CanonicalTask[],
  reminders: TaskEscalationReminderSignal[],
  now: string
) {
  const childHasCanonicalEvidence = childTasks.some((item) => {
    return Boolean(item.lastEvidenceAt || item.completedAt || item.completionSummary);
  });
  if (childHasCanonicalEvidence) return null;

  const nowMs = safeDateMs(now);
  const stalePendingReminders = reminders.filter((item) => {
    if (!isReminderPending(item) || !matchesReminderToTask(task, item)) return false;
    const scheduledAtMs = safeDateMs(item.scheduledAt);
    return scheduledAtMs > 0 && nowMs - scheduledAtMs >= 48 * HOUR_IN_MS;
  });
  if (stalePendingReminders.length === 0) return null;

  return {
    rule: "legacy_low_response_proxy",
    level: stalePendingReminders.length >= 2 ? "director_attention" : "review_required",
    reason: "Legacy reminder data shows a sustained low-response pattern and canonical evidence is still missing.",
    nextStep:
      stalePendingReminders.length >= 2
        ? "Escalate to director attention and decide whether a new review or consultation should replace the stale reminder loop."
        : "Review the stale reminder trail and confirm whether a fresh follow-up is required.",
  } satisfies TaskRuleTrigger;
}

export function getTaskEscalationLevelRank(level: TaskEscalationLevel) {
  return ESCALATION_LEVEL_RANK[level] ?? 0;
}

export function pickHighestPriorityEscalation(
  suggestions: TaskEscalationSuggestion[] | null | undefined
) {
  const validSuggestions = (suggestions ?? []).filter((item) => item.shouldEscalate);
  return [...validSuggestions].sort((left, right) => {
    const leftRank = getTaskEscalationLevelRank(left.escalationLevel);
    const rightRank = getTaskEscalationLevelRank(right.escalationLevel);
    if (leftRank !== rightRank) return rightRank - leftRank;
    if (right.triggeredRules.length !== left.triggeredRules.length) {
      return right.triggeredRules.length - left.triggeredRules.length;
    }
    if (right.dueRiskWindow.hoursOverdue !== left.dueRiskWindow.hoursOverdue) {
      return right.dueRiskWindow.hoursOverdue - left.dueRiskWindow.hoursOverdue;
    }
    return safeDateMs(left.dueRiskWindow.referenceDueAt) - safeDateMs(right.dueRiskWindow.referenceDueAt);
  })[0];
}

export function normalizeTaskEscalationSuggestion(value: unknown): TaskEscalationSuggestion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const taskId = typeof record.taskId === "string" ? record.taskId.trim() : "";
  const childId = typeof record.childId === "string" ? record.childId.trim() : "";
  const escalationLevel =
    typeof record.escalationLevel === "string" && ESCALATION_LEVELS.has(record.escalationLevel as TaskEscalationLevel)
      ? (record.escalationLevel as TaskEscalationLevel)
      : null;
  const ownerRole =
    typeof record.ownerRole === "string" && OWNER_ROLES.has(record.ownerRole as TaskOwnerRole)
      ? (record.ownerRole as TaskOwnerRole)
      : null;
  const dueRiskWindowRecord =
    record.dueRiskWindow && typeof record.dueRiskWindow === "object" && !Array.isArray(record.dueRiskWindow)
      ? (record.dueRiskWindow as Record<string, unknown>)
      : null;

  if (!taskId || !childId || !escalationLevel || !ownerRole || !dueRiskWindowRecord) {
    return null;
  }

  const dueRiskWindow: TaskEscalationDueRiskWindow = {
    referenceDueAt:
      typeof dueRiskWindowRecord.referenceDueAt === "string"
        ? dueRiskWindowRecord.referenceDueAt
        : "",
    windowStartAt:
      typeof dueRiskWindowRecord.windowStartAt === "string"
        ? dueRiskWindowRecord.windowStartAt
        : "",
    windowEndAt:
      typeof dueRiskWindowRecord.windowEndAt === "string"
        ? dueRiskWindowRecord.windowEndAt
        : "",
    status:
      dueRiskWindowRecord.status === "on_track" ||
      dueRiskWindowRecord.status === "due_soon" ||
      dueRiskWindowRecord.status === "overdue"
        ? dueRiskWindowRecord.status
        : "on_track",
    hoursOverdue:
      typeof dueRiskWindowRecord.hoursOverdue === "number"
        ? dueRiskWindowRecord.hoursOverdue
        : 0,
    label:
      typeof dueRiskWindowRecord.label === "string"
        ? dueRiskWindowRecord.label
        : "",
  };

  return {
    taskId,
    childId,
    shouldEscalate: Boolean(record.shouldEscalate),
    escalationLevel,
    escalationReason:
      typeof record.escalationReason === "string" ? record.escalationReason : "",
    recommendedNextStep:
      typeof record.recommendedNextStep === "string" ? record.recommendedNextStep : "",
    triggeredRules: Array.isArray(record.triggeredRules)
      ? record.triggeredRules.filter(
          (item): item is TaskEscalationRuleCode =>
            typeof item === "string" &&
            ESCALATION_RULE_CODES.has(item as TaskEscalationRuleCode)
        )
      : [],
    relatedTaskIds: Array.isArray(record.relatedTaskIds)
      ? record.relatedTaskIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [],
    ownerRole,
    dueRiskWindow,
  };
}

export function evaluateTaskEscalations(input: EvaluateTaskEscalationsInput) {
  const now = safeIso(input.now, new Date().toISOString());
  const tasks = [...input.tasks].sort((left, right) => safeDateMs(left.dueAt) - safeDateMs(right.dueAt));
  const guardianFeedbacks = input.guardianFeedbacks ?? [];
  const taskCheckIns = input.taskCheckIns ?? [];
  const reminders = input.reminders ?? [];
  const tasksByChildId = tasks.reduce<Map<string, CanonicalTask[]>>((map, task) => {
    const items = map.get(task.childId) ?? [];
    items.push(task);
    map.set(task.childId, items);
    return map;
  }, new Map<string, CanonicalTask[]>());

  return tasks
    .map((task) => {
      const childTasks = tasksByChildId.get(task.childId) ?? [task];
      const dueRiskWindow = getDueRiskWindow(task, now);
      const canonicalCandidates: Array<TaskRuleTrigger | null> = [
        buildOverdue48hTrigger(task, dueRiskWindow),
        buildContinuousNonCompletionTrigger(task, childTasks),
        buildNegativeFeedbackTrigger(task, guardianFeedbacks),
        buildRepeatedFollowUpTrigger(task, childTasks, now),
        buildTeacherStalledTrigger(task, taskCheckIns, now),
        buildMultiplePendingTasksTrigger(task, childTasks),
      ];
      const canonicalTriggers = canonicalCandidates.filter(
        (item): item is TaskRuleTrigger => Boolean(item)
      );
      const legacyTrigger =
        canonicalTriggers.length === 0
          ? buildLegacyLowResponseProxyTrigger(task, childTasks, reminders, now)
          : null;
      const triggers = legacyTrigger
        ? [...canonicalTriggers, legacyTrigger]
        : canonicalTriggers;

      return buildSuggestion(task, triggers, now);
    })
    .filter((item): item is TaskEscalationSuggestion => Boolean(item))
    .sort((left, right) => {
      const leftRank = getTaskEscalationLevelRank(left.escalationLevel);
      const rightRank = getTaskEscalationLevelRank(right.escalationLevel);
      if (leftRank !== rightRank) return rightRank - leftRank;
      if (right.dueRiskWindow.hoursOverdue !== left.dueRiskWindow.hoursOverdue) {
        return right.dueRiskWindow.hoursOverdue - left.dueRiskWindow.hoursOverdue;
      }
      return safeDateMs(left.dueRiskWindow.referenceDueAt) - safeDateMs(right.dueRiskWindow.referenceDueAt);
    });
}
