import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const SHARED_NAMESPACE = "demo:v5-d01-shared-demo:institution:inst-1";
const MESSAGE_KEY = `childcare.${SHARED_NAMESPACE}.messages.v1`;
const CONVERSATION_KEY = `childcare.${SHARED_NAMESPACE}.conversations.v1`;
const ARTIFACT_DIR = path.resolve("artifacts/feature-implementation/D02");

async function loginAs(page: Page, accountId: string, pathName: string) {
  const response = await page.request.post("/api/auth/demo-login", {
    data: { accountId },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto(pathName);
  await expect(page.locator("body")).not.toHaveText("");
}

async function screenshot(page: Page, name: string) {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, name),
    fullPage: true,
  });
}

async function seedOtherClassMessage(page: Page, token: string) {
  await page.evaluate(
    ({ messageKey, conversationKey, token }) => {
      const now = new Date().toISOString();
      const messages = JSON.parse(window.localStorage.getItem(messageKey) ?? "[]");
      messages.push({
        messageId: `msg-d02-c3-${Date.now()}`,
        conversationId: "conv-c-3-home-school",
        childId: "c-3",
        classId: "晨曦班",
        senderRole: "parent",
        senderId: "u-parent-c3",
        senderName: "琪琪家长",
        receiverRole: "teacher",
        targetRole: "teacher",
        content: token,
        createdAt: now,
        readBy: ["u-parent-c3"],
        status: "sent",
      });
      window.localStorage.setItem(messageKey, JSON.stringify(messages));

      const conversations = JSON.parse(window.localStorage.getItem(conversationKey) ?? "[]");
      const existingIndex = conversations.findIndex(
        (item: { conversationId?: string }) => item.conversationId === "conv-c-3-home-school"
      );
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
      if (existingIndex === -1) {
        conversations.push(conversation);
      } else {
        conversations[existingIndex] = { ...conversations[existingIndex], ...conversation };
      }
      window.localStorage.setItem(conversationKey, JSON.stringify(conversations));
    },
    { messageKey: MESSAGE_KEY, conversationKey: CONVERSATION_KEY, token }
  );
}

test("D02 home-school communication closes parent teacher director loop", async ({ page }) => {
  const stamp = Date.now();
  const parentToken = `D02-parent-${stamp}`;
  const teacherToken = `D02-li-reply-${stamp}`;
  const otherClassToken = `D02-c3-${stamp}`;

  await page.goto("/login");
  await page.evaluate(() => window.localStorage.clear());

  await loginAs(page, "u-parent", "/parent/agent?child=c-1#feedback");
  await page.getByTestId("parent-message-input").scrollIntoViewIfNeeded();
  await page.getByTestId("parent-message-input").fill(parentToken);
  await page.getByTestId("parent-send-message").click();
  await expect(page.getByTestId("parent-message-list")).toContainText(parentToken);
  await screenshot(page, "01-parent-send.png");

  await page.reload();
  await expect(page.getByTestId("parent-message-list")).toContainText(parentToken);
  await screenshot(page, "02-parent-refresh.png");

  await loginAs(page, "u-teacher", "/teacher/agent?action=communication");
  await expect(page.getByTestId("communication-thread-card").filter({ hasText: parentToken })).toBeVisible();
  await screenshot(page, "03-li-teacher-sees-parent.png");

  const liThread = page.getByTestId("communication-thread-card").filter({ hasText: parentToken });
  await liThread.getByRole("button", { name: "回复家长" }).click();
  await liThread.getByTestId("teacher-reply-input").fill(teacherToken);
  await liThread.getByTestId("teacher-send-reply").click();
  await expect(page.getByText(teacherToken)).toBeVisible();
  await screenshot(page, "04-li-teacher-reply.png");

  await page.reload();
  await page.getByRole("button", { name: /我发起的/ }).click();
  await expect(page.getByText(teacherToken)).toBeVisible();
  await screenshot(page, "05-li-teacher-reply-refresh.png");

  await loginAs(page, "u-teacher2", "/teacher/agent?action=communication");
  await seedOtherClassMessage(page, otherClassToken);
  await page.reload();
  await expect(page.getByText(parentToken)).toHaveCount(0);
  await expect(page.getByText(teacherToken)).toHaveCount(0);
  await expect(page.getByText(otherClassToken)).toBeVisible();
  await screenshot(page, "06-zhou-class-isolation.png");

  await loginAs(page, "u-parent", "/parent/agent?child=c-1#feedback");
  await expect(page.getByTestId("parent-message-list")).toContainText(teacherToken);
  await screenshot(page, "07-parent-sees-reply.png");

  await loginAs(page, "u-admin", "/admin");
  const adminSummary = page.getByTestId("admin-communication-summary");
  await expect(adminSummary).toBeVisible();
  await expect(adminSummary).toContainText(teacherToken);
  await adminSummary.getByTestId("admin-mark-communication-handled").first().click();
  await expect(adminSummary).toContainText("已处理");
  await screenshot(page, "08-admin-summary-handled.png");

  await page.reload();
  await expect(page.getByTestId("admin-communication-summary")).toContainText("已处理");
  await screenshot(page, "09-admin-summary-refresh.png");

  const persisted = await page.evaluate(
    ({ messageKey, parentToken, otherClassToken }) => {
      const messages = JSON.parse(window.localStorage.getItem(messageKey) ?? "[]");
      return {
        parentMessage: messages.find((message: { content?: string }) => message.content === parentToken),
        otherClassMessage: messages.find((message: { content?: string }) => message.content === otherClassToken),
      };
    },
    { messageKey: MESSAGE_KEY, parentToken, otherClassToken }
  );

  expect(persisted.parentMessage).toMatchObject({ childId: "c-1", classId: "向阳班" });
  expect(persisted.otherClassMessage).toMatchObject({ childId: "c-3", classId: "晨曦班" });
});
