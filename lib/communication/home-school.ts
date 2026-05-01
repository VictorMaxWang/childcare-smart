import type { AppStateSnapshot, DemoConversation, DemoMessage } from "@/lib/persistence/snapshot";
import type {
  ParentFeedbackChildReaction,
  ParentFeedbackExecutionStatus,
  ParentFeedbackImprovementStatus,
} from "@/lib/feedback/types";

export type HomeSchoolThreadStatus = "pending" | "replied" | "handled";

export interface HomeSchoolThread {
  conversationId: string;
  childId: string;
  classId: string;
  childName: string;
  conversationStatus: DemoConversation["status"];
  messages: DemoMessage[];
  latestMessage?: DemoMessage;
  latestParentMessage?: DemoMessage;
  latestTeacherMessage?: DemoMessage;
  status: HomeSchoolThreadStatus;
  updatedAt: string;
}

export interface AdminCommunicationSummary {
  totalThreads: number;
  totalMessages: number;
  pendingThreads: number;
  repliedThreads: number;
  handledThreads: number;
  classBreakdown: Array<{
    classId: string;
    totalThreads: number;
    pendingThreads: number;
    handledThreads: number;
  }>;
  recentThreads: HomeSchoolThread[];
}

type HomeSchoolChildRef = {
  id: string;
  name: string;
};

const EXECUTION_LABELS: Record<ParentFeedbackExecutionStatus, string> = {
  not_started: "尚未开始执行",
  partial: "已部分执行",
  completed: "已完成执行",
  unable_to_execute: "暂时无法执行",
};

const REACTION_LABELS: Record<ParentFeedbackChildReaction, string> = {
  resisted: "孩子明显抗拒",
  neutral: "孩子反应一般",
  accepted: "孩子愿意配合",
  improved: "孩子反应比之前更顺",
};

const IMPROVEMENT_LABELS: Record<ParentFeedbackImprovementStatus, string> = {
  no_change: "目前还没有看到明显改善",
  slight_improvement: "已经有轻微改善",
  clear_improvement: "已经有明确改善",
  worse: "状态比之前更吃力",
  unknown: "效果暂时不确定",
};

function safeTime(value: string | undefined) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function compareCreatedAt(left: Pick<DemoMessage, "createdAt">, right: Pick<DemoMessage, "createdAt">) {
  return safeTime(left.createdAt) - safeTime(right.createdAt);
}

function sortMessages(messages: DemoMessage[]) {
  return [...messages].sort(compareCreatedAt);
}

function getChildName(children: HomeSchoolChildRef[], childId: string) {
  return children.find((child) => child.id === childId)?.name ?? childId;
}

export function getHomeSchoolConversationId(childId: string) {
  return `conv-${childId}-home-school`;
}

function getThreadStatus(params: {
  conversationStatus: DemoConversation["status"];
  latestParentMessage?: DemoMessage;
  latestTeacherMessage?: DemoMessage;
}): HomeSchoolThreadStatus {
  if (params.conversationStatus === "closed" || params.conversationStatus === "archived") {
    return "handled";
  }

  if (
    params.latestParentMessage &&
    (!params.latestTeacherMessage ||
      safeTime(params.latestParentMessage.createdAt) > safeTime(params.latestTeacherMessage.createdAt))
  ) {
    return "pending";
  }

  return "replied";
}

export function buildHomeSchoolThreads(params: {
  messages: DemoMessage[];
  conversations: DemoConversation[];
  children: HomeSchoolChildRef[];
}) {
  const visibleChildIds = new Set(params.children.map((child) => child.id));
  const conversationMap = new Map(params.conversations.map((item) => [item.conversationId, item]));
  const groupedMessages = params.messages.reduce<Map<string, DemoMessage[]>>((acc, message) => {
    const key = message.conversationId || `conv-${message.childId}-home-school`;
    acc.set(key, [...(acc.get(key) ?? []), message]);
    return acc;
  }, new Map());

  const conversationIds = new Set([...conversationMap.keys(), ...groupedMessages.keys()]);

  return Array.from(conversationIds)
    .map((conversationId): HomeSchoolThread | null => {
      const messages = sortMessages(groupedMessages.get(conversationId) ?? []);
      const conversation = conversationMap.get(conversationId);
      const latestMessage = messages.at(-1);
      const childId = conversation?.childId ?? latestMessage?.childId;
      if (!childId) return null;
      if (visibleChildIds.size > 0 && !visibleChildIds.has(childId)) return null;

      const latestParentMessage = [...messages].reverse().find((message) => message.senderRole === "parent");
      const latestTeacherMessage = [...messages].reverse().find((message) => message.senderRole === "teacher");
      const conversationStatus = conversation?.status ?? "open";
      const updatedAt = conversation?.updatedAt ?? latestMessage?.createdAt ?? conversation?.createdAt ?? "";

      return {
        conversationId,
        childId,
        classId: conversation?.classId ?? latestMessage?.classId ?? "",
        childName: getChildName(params.children, childId),
        conversationStatus,
        messages,
        latestMessage,
        latestParentMessage,
        latestTeacherMessage,
        status: getThreadStatus({
          conversationStatus,
          latestParentMessage,
          latestTeacherMessage,
        }),
        updatedAt,
      };
    })
    .filter((thread): thread is HomeSchoolThread => Boolean(thread))
    .sort((left, right) => safeTime(right.updatedAt) - safeTime(left.updatedAt));
}

export function formatHomeSchoolTime(value: string | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildAdminCommunicationSummary(params: {
  messages: DemoMessage[];
  conversations: DemoConversation[];
  children: HomeSchoolChildRef[];
}): AdminCommunicationSummary {
  const threads = buildHomeSchoolThreads(params);
  const classMap = threads.reduce<Map<string, AdminCommunicationSummary["classBreakdown"][number]>>((acc, thread) => {
    const classId = thread.classId || "未分班";
    const current = acc.get(classId) ?? {
      classId,
      totalThreads: 0,
      pendingThreads: 0,
      handledThreads: 0,
    };
    current.totalThreads += 1;
    if (thread.status === "pending") current.pendingThreads += 1;
    if (thread.status === "handled") current.handledThreads += 1;
    acc.set(classId, current);
    return acc;
  }, new Map());

  return {
    totalThreads: threads.length,
    totalMessages: params.messages.length,
    pendingThreads: threads.filter((thread) => thread.status === "pending").length,
    repliedThreads: threads.filter((thread) => thread.status === "replied").length,
    handledThreads: threads.filter((thread) => thread.status === "handled").length,
    classBreakdown: Array.from(classMap.values()).sort((left, right) => right.totalThreads - left.totalThreads),
    recentThreads: threads.slice(0, 5),
  };
}

export function buildStructuredFeedbackMessageContent(input: {
  childName: string;
  executionStatus: ParentFeedbackExecutionStatus;
  childReaction: ParentFeedbackChildReaction;
  improvementStatus: ParentFeedbackImprovementStatus;
  notes?: string;
  barriers?: string[];
}) {
  const parts = [
    `${input.childName}今晚反馈：${EXECUTION_LABELS[input.executionStatus]}。`,
    `孩子反应：${REACTION_LABELS[input.childReaction]}。`,
    `改善情况：${IMPROVEMENT_LABELS[input.improvementStatus]}。`,
  ];

  if (input.barriers && input.barriers.length > 0) {
    parts.push(`主要阻碍：${input.barriers.slice(0, 2).join("、")}。`);
  }

  const notes = input.notes?.trim();
  if (notes) {
    parts.push(`补充说明：${notes}`);
  }

  return parts.join("");
}

export function formatHomeSchoolPersistStatus(status: "saved" | "local_only" | "failed") {
  if (status === "saved") return "远端已同步";
  if (status === "local_only") return "演示持久化已保存";
  return "发送失败";
}

export function readMessageBucket(messages: AppStateSnapshot["messages"]) {
  return messages;
}
