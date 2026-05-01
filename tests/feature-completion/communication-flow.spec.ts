import { expect, test } from "@playwright/test";
import {
  BUCKETS,
  capture,
  finalizeFeatureTest,
  loginAs,
  resetDemoStorage,
} from "./helpers";

test.describe.configure({ mode: "serial" });

test.afterEach(async ({ page }, testInfo) => {
  await finalizeFeatureTest(page, testInfo);
});

test("D08 parent teacher communication round trip persists across roles", async ({ page }) => {
  const stamp = Date.now();
  const parentToken = `D08-parent-message-${stamp}`;
  const teacherToken = `D08-teacher-reply-${stamp}`;
  const otherClassToken = `D08-other-class-${stamp}`;

  await resetDemoStorage(page);

  await loginAs(page, "u-parent", "/parent/agent?child=c-1#feedback");
  await page.getByTestId("parent-message-input").scrollIntoViewIfNeeded();
  await page.getByTestId("parent-message-input").fill(parentToken);
  await page.getByTestId("parent-send-message").click();
  await expect(page.getByTestId("parent-message-list")).toContainText(parentToken);
  await capture(page, "communication-01-parent-send.png");

  await page.reload();
  await expect(page.getByTestId("parent-message-list")).toContainText(parentToken);

  await loginAs(page, "u-teacher", "/teacher/agent?action=communication");
  const liThread = page.getByTestId("communication-thread-card").filter({ hasText: parentToken });
  await expect(liThread).toBeVisible();
  await liThread.getByRole("button", { name: "回复家长" }).click();
  await liThread.getByTestId("teacher-reply-input").fill(teacherToken);
  await liThread.getByTestId("teacher-send-reply").click();
  await expect(page.getByText(teacherToken)).toBeVisible();
  await capture(page, "communication-02-teacher-reply.png");

  await page.reload();
  await page.getByRole("button", { name: /我发起的/ }).click();
  await expect(page.getByText(teacherToken)).toBeVisible();

  await loginAs(page, "u-teacher2", "/teacher/agent?action=communication");
  await seedOtherClassMessage(page, otherClassToken);
  await page.reload();
  await expect(page.getByText(parentToken)).toHaveCount(0);
  await expect(page.getByText(teacherToken)).toHaveCount(0);
  await expect(page.getByText(otherClassToken)).toBeVisible();
  await capture(page, "communication-03-class-isolation.png");

  await loginAs(page, "u-parent", "/parent/agent?child=c-1#feedback");
  await expect(page.getByTestId("parent-message-list")).toContainText(teacherToken);
  await capture(page, "communication-04-parent-sees-reply.png");

  await loginAs(page, "u-admin", "/admin");
  const adminSummary = page.getByTestId("admin-communication-summary");
  await expect(adminSummary).toBeVisible();
  await expect(adminSummary).toContainText(teacherToken);
  await adminSummary.getByTestId("admin-mark-communication-handled").first().click();
  await expect(adminSummary).toContainText("已处理");
  await page.reload();
  await expect(page.getByTestId("admin-communication-summary")).toContainText("已处理");
  await capture(page, "communication-05-director-summary.png");

  const persisted = await page.evaluate(
    ({ messageKey, parentToken, teacherToken, otherClassToken }) => {
      const messages = JSON.parse(window.localStorage.getItem(messageKey) ?? "[]") as Array<{
        childId?: string;
        classId?: string;
        content?: string;
        senderRole?: string;
      }>;
      return {
        parentMessage: messages.find((message) => message.content === parentToken),
        teacherReply: messages.find((message) => message.content === teacherToken),
        otherClassMessage: messages.find((message) => message.content === otherClassToken),
      };
    },
    { messageKey: BUCKETS.messages, parentToken, teacherToken, otherClassToken }
  );

  expect(persisted.parentMessage).toMatchObject({ childId: "c-1", senderRole: "parent" });
  expect(persisted.teacherReply).toMatchObject({ childId: "c-1", senderRole: "teacher" });
  expect(persisted.otherClassMessage).toMatchObject({ childId: "c-3", classId: "晨曦班" });
});

async function seedOtherClassMessage(page: import("@playwright/test").Page, token: string) {
  await page.evaluate(
    ({ messageKey, conversationKey, token }) => {
      const now = new Date().toISOString();
      const messages = JSON.parse(window.localStorage.getItem(messageKey) ?? "[]");
      messages.push({
        messageId: `msg-d08-c3-${Date.now()}`,
        conversationId: "conv-c-3-home-school",
        childId: "c-3",
        classId: "晨曦班",
        senderRole: "parent",
        senderId: "u-parent-c3",
        senderName: "D08 test parent",
        receiverRole: "teacher",
        targetRole: "teacher",
        content: token,
        createdAt: now,
        readBy: ["u-parent-c3"],
        status: "sent",
      });
      window.localStorage.setItem(messageKey, JSON.stringify(messages));

      const conversations = JSON.parse(window.localStorage.getItem(conversationKey) ?? "[]");
      const conversation = {
        conversationId: "conv-c-3-home-school",
        childId: "c-3",
        classId: "晨曦班",
        participantIds: ["u-parent-c3", "u-teacher2"],
        participantRoles: ["parent", "teacher"],
        status: "open",
        createdAt: now,
        updatedAt: now,
      };
      const existingIndex = conversations.findIndex(
        (item: { conversationId?: string }) => item.conversationId === conversation.conversationId
      );
      if (existingIndex === -1) conversations.push(conversation);
      else conversations[existingIndex] = conversation;
      window.localStorage.setItem(conversationKey, JSON.stringify(conversations));
    },
    { messageKey: BUCKETS.messages, conversationKey: BUCKETS.conversations, token }
  );

  const otherMessages = await page.evaluate((key) => window.localStorage.getItem(key), BUCKETS.messages);
  expect(otherMessages).toContain(token);
}
