import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAdminCommunicationSummary,
  buildHomeSchoolThreads,
  buildStructuredFeedbackMessageContent,
} from "./home-school";
import type { Child } from "@/lib/store";
import type { DemoConversation, DemoMessage } from "@/lib/persistence/snapshot";

const children = [
  { id: "c-1", name: "小林", className: "向阳班" },
  { id: "c-3", name: "小周", className: "晨曦班" },
] as Child[];

function message(input: Partial<DemoMessage> & Pick<DemoMessage, "messageId" | "conversationId" | "childId" | "classId" | "senderRole" | "createdAt" | "content">): DemoMessage {
  return {
    senderId: input.senderRole === "teacher" ? "u-teacher" : "u-parent",
    senderName: input.senderRole === "teacher" ? "李老师" : "林妈妈",
    receiverRole: input.senderRole === "teacher" ? "parent" : "teacher",
    targetRole: input.senderRole === "teacher" ? "parent" : "teacher",
    readBy: [],
    status: "sent",
    ...input,
  };
}

function conversation(input: Partial<DemoConversation> & Pick<DemoConversation, "conversationId" | "childId" | "classId">): DemoConversation {
  return {
    participantIds: ["u-parent", "u-teacher"],
    participantRoles: ["parent", "teacher"],
    status: "open",
    createdAt: "2026-05-01T08:00:00.000Z",
    updatedAt: "2026-05-01T08:00:00.000Z",
    ...input,
  };
}

test("buildHomeSchoolThreads derives pending, replied, handled, and class isolation", () => {
  const messages = [
    message({
      messageId: "m-1",
      conversationId: "conv-c-1-home-school",
      childId: "c-1",
      classId: "向阳班",
      senderRole: "parent",
      createdAt: "2026-05-01T08:00:00.000Z",
      content: "parent asks",
    }),
    message({
      messageId: "m-2",
      conversationId: "conv-c-3-home-school",
      childId: "c-3",
      classId: "晨曦班",
      senderRole: "parent",
      createdAt: "2026-05-01T08:05:00.000Z",
      content: "other class",
    }),
    message({
      messageId: "m-3",
      conversationId: "conv-c-3-home-school",
      childId: "c-3",
      classId: "晨曦班",
      senderRole: "teacher",
      createdAt: "2026-05-01T08:06:00.000Z",
      content: "teacher replied",
    }),
  ];

  const threads = buildHomeSchoolThreads({
    messages,
    conversations: [
      conversation({ conversationId: "conv-c-1-home-school", childId: "c-1", classId: "向阳班" }),
      conversation({ conversationId: "conv-c-3-home-school", childId: "c-3", classId: "晨曦班" }),
      conversation({ conversationId: "conv-closed", childId: "c-1", classId: "向阳班", status: "closed" }),
    ],
    children: [children[0]],
  });

  assert.equal(threads.some((thread) => thread.childId === "c-3"), false);
  assert.equal(threads.find((thread) => thread.conversationId === "conv-c-1-home-school")?.status, "pending");
  assert.equal(threads.find((thread) => thread.conversationId === "conv-closed")?.status, "handled");
});

test("buildAdminCommunicationSummary counts class distribution and status totals", () => {
  const summary = buildAdminCommunicationSummary({
    children,
    conversations: [
      conversation({ conversationId: "conv-c-1-home-school", childId: "c-1", classId: "向阳班" }),
      conversation({ conversationId: "conv-c-3-home-school", childId: "c-3", classId: "晨曦班" }),
    ],
    messages: [
      message({
        messageId: "m-1",
        conversationId: "conv-c-1-home-school",
        childId: "c-1",
        classId: "向阳班",
        senderRole: "parent",
        createdAt: "2026-05-01T08:00:00.000Z",
        content: "need reply",
      }),
      message({
        messageId: "m-2",
        conversationId: "conv-c-3-home-school",
        childId: "c-3",
        classId: "晨曦班",
        senderRole: "parent",
        createdAt: "2026-05-01T08:01:00.000Z",
        content: "need reply",
      }),
      message({
        messageId: "m-3",
        conversationId: "conv-c-3-home-school",
        childId: "c-3",
        classId: "晨曦班",
        senderRole: "teacher",
        createdAt: "2026-05-01T08:02:00.000Z",
        content: "done",
      }),
    ],
  });

  assert.equal(summary.totalThreads, 2);
  assert.equal(summary.pendingThreads, 1);
  assert.equal(summary.repliedThreads, 1);
  assert.equal(summary.classBreakdown.find((item) => item.classId === "向阳班")?.totalThreads, 1);
});

test("buildStructuredFeedbackMessageContent keeps structured feedback as a readable message", () => {
  const content = buildStructuredFeedbackMessageContent({
    childName: "小林",
    executionStatus: "partial",
    childReaction: "accepted",
    improvementStatus: "slight_improvement",
    barriers: ["今晚没时间"],
    notes: "D02-token",
  });

  assert.match(content, /小林今晚反馈/);
  assert.match(content, /D02-token/);
});
