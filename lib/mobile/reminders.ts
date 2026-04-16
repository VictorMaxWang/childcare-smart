import type { ConsultationResult, ReminderItem } from "@/lib/ai/types";
import type { InterventionCard } from "@/lib/agent/intervention-card";
import { pickHighestPriorityEscalation } from "@/lib/tasks/escalation-rules";
import {
  buildConsultationAdminTask,
  buildInterventionTasksFromCard,
  buildReminderFromTask,
} from "@/lib/tasks/task-model";
import type { CanonicalTask, TaskEscalationSuggestion } from "@/lib/tasks/types";

function dedupeReminders(items: ReminderItem[]) {
  const reminderMap = new Map<string, ReminderItem>();
  for (const item of items) {
    reminderMap.set(item.reminderId, item);
  }
  return Array.from(reminderMap.values());
}

export function buildReminderItemsFromTasks(params: {
  tasks: CanonicalTask[];
  childName: string;
  targetId?: string;
}) {
  return dedupeReminders(
    params.tasks
      .map((task) =>
        buildReminderFromTask(task, {
          childName: params.childName,
          targetId: task.ownerRole === "admin" ? task.childId : params.targetId ?? task.childId,
        })
      )
      .filter((item): item is ReminderItem => Boolean(item))
  );
}

export function buildReminderItems(params: {
  childId: string;
  targetRole: ReminderItem["targetRole"];
  targetId: string;
  childName: string;
  interventionCard?: InterventionCard | null;
  consultation?: ConsultationResult | null;
}): ReminderItem[] {
  const tasks: CanonicalTask[] = [];

  if (params.interventionCard) {
    const taskSet = buildInterventionTasksFromCard(params.interventionCard);
    tasks.push(...taskSet.tasks.filter((task) => task.ownerRole === params.targetRole));
  }

  const adminTask = params.consultation ? buildConsultationAdminTask(params.consultation) : null;
  if (adminTask) {
    tasks.push(adminTask);
  }

  return buildReminderItemsFromTasks({
    tasks,
    childName: params.childName,
    targetId: params.targetId,
  });
}

export function getReminderStatusLabel(status: ReminderItem["status"]) {
  if (status === "done") return "已完成";
  if (status === "snoozed") return "稍后提醒";
  if (status === "acknowledged") return "已确认";
  return "待提醒";
}

export function getReminderEscalationSummary(params: {
  task: CanonicalTask;
  taskEscalations?: TaskEscalationSuggestion[] | null;
}) {
  const matchingEscalation = pickHighestPriorityEscalation(
    (params.taskEscalations ?? []).filter(
      (item) =>
        item.taskId === params.task.taskId ||
        item.relatedTaskIds.includes(params.task.taskId)
    )
  );

  if (!matchingEscalation) {
    return null;
  }

  return {
    escalationLevel: matchingEscalation.escalationLevel,
    escalationReason: matchingEscalation.escalationReason,
    recommendedNextStep: matchingEscalation.recommendedNextStep,
    dueRiskLabel: matchingEscalation.dueRiskWindow.label,
  };
}
