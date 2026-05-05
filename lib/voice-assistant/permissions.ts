import { canRoleAccessPath } from "@/lib/auth/route-access";
import type { AssistantCommand, AssistantIntent, AssistantParseContext, AssistantRole } from "@/lib/voice-assistant/types";

const DIRECTOR_INTENTS = new Set<AssistantIntent>([
  "navigate",
  "generate_weekly_report",
  "export_weekly_report",
  "share_weekly_report",
  "assign_task",
  "update_assignment_status",
  "mark_feedback_resolved",
  "query_director_risk",
  "query_director_feedback",
  "query_director_trend",
  "query_consultation_status",
  "view_feedback_detail",
  "open_child_profile",
  "query_dashboard",
  "query_child_status",
  "query_today_tasks",
  "unknown",
]);

const TEACHER_INTENTS = new Set<AssistantIntent>([
  "navigate",
  "send_message",
  "reply_message",
  "create_morning_check",
  "create_diet_record",
  "create_growth_record",
  "create_consultation",
  "add_consultation_note",
  "update_consultation_status",
  "create_health_material_task",
  "update_dispatch_status",
  "view_feedback_detail",
  "open_child_profile",
  "query_dashboard",
  "query_child_status",
  "query_parent_messages",
  "query_today_tasks",
  "unknown",
]);

const PARENT_INTENTS = new Set<AssistantIntent>([
  "navigate",
  "send_message",
  "create_feedback",
  "mark_reminder_read",
  "query_teacher_replies",
  "export_storybook",
  "share_storybook",
  "view_feedback_detail",
  "open_child_profile",
  "query_child_status",
  "query_today_tasks",
  "unknown",
]);

const INTENTS_BY_ROLE: Record<AssistantRole, Set<AssistantIntent>> = {
  director: DIRECTOR_INTENTS,
  teacher: TEACHER_INTENTS,
  parent: PARENT_INTENTS,
};

export function isWriteIntent(intent: AssistantIntent) {
  return (
    intent === "send_message" ||
    intent === "reply_message" ||
    intent === "create_morning_check" ||
    intent === "create_diet_record" ||
    intent === "create_growth_record" ||
    intent === "create_feedback" ||
    intent === "mark_reminder_read" ||
    intent === "generate_weekly_report" ||
    intent === "create_consultation" ||
    intent === "add_consultation_note" ||
    intent === "update_consultation_status" ||
    intent === "create_health_material_task" ||
    intent === "update_dispatch_status" ||
    intent === "update_assignment_status" ||
    intent === "mark_feedback_resolved"
  );
}

export function isRiskyIntent(intent: AssistantIntent) {
  return (
    intent === "export_weekly_report" ||
    intent === "share_weekly_report" ||
    intent === "export_storybook" ||
    intent === "share_storybook" ||
    intent === "assign_task"
  );
}

export function intentNeedsConfirmation(intent: AssistantIntent) {
  return isWriteIntent(intent) || isRiskyIntent(intent);
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function hasAccessibleChild(context: AssistantParseContext, childId: string) {
  return (context.children ?? []).some((child) => child.id === childId);
}

function hasAccessibleClass(context: AssistantParseContext, className: string) {
  if (!className) return true;
  if (context.role === "director") {
    return (context.children ?? []).some((child) => child.className === className);
  }
  if (context.role === "teacher") {
    return context.user.className === className;
  }
  return false;
}

function childIdsFromPath(path: string) {
  if (!path) return [];
  try {
    const url = new URL(path, "https://childcare-smart.local");
    return [url.searchParams.get("child"), url.searchParams.get("childId")].filter(
      (childId): childId is string => Boolean(childId)
    );
  } catch {
    return [];
  }
}

export function validateAssistantCommandPermission(command: AssistantCommand, context: AssistantParseContext) {
  if (command.role !== context.role) {
    return {
      ok: false,
      status: "forbidden" as const,
      message: "语音命令角色与当前会话不一致，已拒绝执行。",
    };
  }

  if (!INTENTS_BY_ROLE[context.role].has(command.intent)) {
    return {
      ok: false,
      status: "forbidden" as const,
      message: "当前角色不能执行这类语音命令。",
    };
  }

  if (command.intent === "unknown") {
    return {
      ok: false,
      status: "unknown" as const,
      message: "暂时不能理解这条指令，不会执行任何操作。",
    };
  }

  if (command.status === "unsupported") {
    return {
      ok: false,
      status: "unsupported" as const,
      message: command.riskText ?? "这条命令尚未接入稳定执行器。",
    };
  }

  if (command.intent === "navigate") {
    const path = readString(command.params.path) || command.deeplink || "";
    if (!path || !canRoleAccessPath(context.accountRole, path)) {
      return {
        ok: false,
        status: "forbidden" as const,
        message: "当前角色不能打开该页面。",
      };
    }
    const forbiddenChildId = childIdsFromPath(path).find((pathChildId) => !hasAccessibleChild(context, pathChildId));
    if (forbiddenChildId) {
      return {
        ok: false,
        status: "forbidden" as const,
        message: "当前角色无权打开该儿童档案。",
      };
    }
  }

  const childId = readString(command.params.childId);
  if (childId && !hasAccessibleChild(context, childId)) {
    return {
      ok: false,
      status: "forbidden" as const,
      message: "当前角色无权访问该儿童数据。",
    };
  }

  const className = readString(command.params.className);
  if (className && !hasAccessibleClass(context, className)) {
    return {
      ok: false,
      status: "forbidden" as const,
      message: "当前角色无权操作该班级数据。",
    };
  }

  if (command.missingParams.length > 0) {
    return {
      ok: false,
      status: "needs_params" as const,
      message: `还缺少参数：${command.missingParams.join("、")}。`,
    };
  }

  return {
    ok: true,
    status: command.requiredConfirmation ? ("needs_confirmation" as const) : ("ready" as const),
    message: command.requiredConfirmation ? "需要确认后执行。" : "可以执行。",
  };
}
