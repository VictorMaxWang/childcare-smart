import { getRoleHomePath, type AccountRole } from "@/lib/auth/accounts";
import type { AssistantIntent, AssistantRole } from "@/lib/voice-assistant/types";

export const ASSISTANT_INTENTS: AssistantIntent[] = [
  "navigate",
  "send_message",
  "reply_message",
  "create_morning_check",
  "create_diet_record",
  "create_growth_record",
  "create_feedback",
  "mark_reminder_read",
  "generate_weekly_report",
  "export_weekly_report",
  "share_weekly_report",
  "query_teacher_replies",
  "export_storybook",
  "share_storybook",
  "create_consultation",
  "add_consultation_note",
  "update_consultation_status",
  "create_health_material_task",
  "update_dispatch_status",
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
  "query_parent_messages",
  "query_today_tasks",
  "unknown",
];

export const ROLE_LABELS: Record<AssistantRole, string> = {
  director: "园长端",
  teacher: "教师端",
  parent: "家长端",
};

export const ROLE_ASSISTANT_NAMES: Record<AssistantRole, string> = {
  director: "园长语音助手",
  teacher: "教师语音助手",
  parent: "家长语音助手",
};

export const ROLE_EXAMPLES: Record<AssistantRole, string[]> = {
  director: ["生成本周周报", "查看重点跟进记录", "查看未处理反馈", "给李老师派单，跟进小明晨检异常"],
  teacher: ["给小明记录晨检，体温三十六点八，状态正常", "记录小明午餐吃完了", "回复林妈妈，今天小明午睡很好", "查看未回复家长消息"],
  parent: ["给老师留言，今天晚上孩子有点咳嗽", "查看今天吃了什么", "标记这个提醒已读", "打开成长绘本"],
};

export function accountRoleToAssistantRole(role: AccountRole): AssistantRole {
  if (role === "机构管理员") return "director";
  if (role === "教师") return "teacher";
  return "parent";
}

export function assistantRoleToAccountRole(role: AssistantRole): AccountRole {
  if (role === "director") return "机构管理员";
  if (role === "teacher") return "教师";
  return "家长";
}

export function getAssistantRoleHomePath(role: AssistantRole) {
  return getRoleHomePath(assistantRoleToAccountRole(role));
}

export function makeCommandId() {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `voice-cmd-${randomPart}`;
}

export function appendChildQuery(path: string, childId?: string) {
  if (!childId) return path;
  const url = new URL(path, "https://childcare-smart.local");
  url.searchParams.set("child", childId);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function appendChildIdQuery(path: string, childId?: string) {
  if (!childId) return path;
  const url = new URL(path, "https://childcare-smart.local");
  url.searchParams.set("childId", childId);
  return `${url.pathname}${url.search}${url.hash}`;
}
