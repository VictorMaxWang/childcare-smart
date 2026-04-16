import { normalizeTaskEscalationSuggestion } from "@/lib/tasks/escalation-rules";
import type { TaskSourceType } from "@/lib/tasks/types";

const TASK_SOURCE_TYPES = new Set<TaskSourceType>([
  "intervention_card",
  "consultation",
  "admin_dispatch",
  "legacy_weekly_task",
]);

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asTaskSourceType(value: unknown): TaskSourceType | undefined {
  const normalized = asText(value);
  return TASK_SOURCE_TYPES.has(normalized as TaskSourceType)
    ? (normalized as TaskSourceType)
    : undefined;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    const normalized = asText(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function normalizeAdminNotificationSource(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const institutionName = asText(record.institutionName) || undefined;
  const workflow = asText(record.workflow) || undefined;
  const relatedChildIds = asStringArray(record.relatedChildIds);
  const relatedClassNames = asStringArray(record.relatedClassNames);
  const consultationId = asText(record.consultationId) || undefined;
  const relatedConsultationIds = asStringArray(record.relatedConsultationIds);
  const taskId = asText(record.taskId) || undefined;
  const sourceType = asTaskSourceType(record.sourceType);
  const sourceId = asText(record.sourceId) || undefined;
  const relatedTaskIds = asStringArray(record.relatedTaskIds);
  const escalation = normalizeTaskEscalationSuggestion(record.escalation);

  if (
    !institutionName &&
    !workflow &&
    relatedChildIds.length === 0 &&
    relatedClassNames.length === 0 &&
    !consultationId &&
    relatedConsultationIds.length === 0 &&
    !taskId &&
    !sourceType &&
    !sourceId &&
    relatedTaskIds.length === 0 &&
    !escalation
  ) {
    return null;
  }

  return {
    institutionName,
    workflow,
    relatedChildIds: relatedChildIds.length > 0 ? relatedChildIds : undefined,
    relatedClassNames: relatedClassNames.length > 0 ? relatedClassNames : undefined,
    consultationId,
    relatedConsultationIds:
      relatedConsultationIds.length > 0 ? relatedConsultationIds : undefined,
    taskId,
    sourceType,
    sourceId,
    relatedTaskIds: relatedTaskIds.length > 0 ? relatedTaskIds : undefined,
    escalation: escalation ?? undefined,
  };
}
