import { expect, test } from "@playwright/test";

const SHARED_NAMESPACE = "demo:v5-d01-shared-demo:institution:inst-1";
const MESSAGE_KEY = `childcare.${SHARED_NAMESPACE}.messages.v1`;
const CONVERSATION_KEY = `childcare.${SHARED_NAMESPACE}.conversations.v1`;

async function loginAs(page: import("@playwright/test").Page, accountId: string, path: string) {
  const response = await page.request.post("/api/auth/demo-login", {
    data: { accountId },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto(path);
  await expect(page.locator("body")).not.toHaveText("");
}

async function appendMessage(
  page: import("@playwright/test").Page,
  message: {
    messageId: string;
    conversationId: string;
    senderRole: "parent" | "teacher";
    senderId: string;
    senderName: string;
    receiverRole: "parent" | "teacher";
    content: string;
  }
) {
  await page.evaluate(
    ({ key, conversationKey, message }) => {
      const messages = JSON.parse(window.localStorage.getItem(key) ?? "[]");
      messages.push({
        ...message,
        childId: "c-1",
        classId: "向阳班",
        targetRole: message.receiverRole,
        createdAt: new Date().toISOString(),
        readBy: [message.senderId],
        status: "sent",
      });
      window.localStorage.setItem(key, JSON.stringify(messages));

      const conversations = JSON.parse(window.localStorage.getItem(conversationKey) ?? "[]");
      if (!conversations.some((item: { conversationId?: string }) => item.conversationId === message.conversationId)) {
        conversations.push({
          conversationId: message.conversationId,
          childId: "c-1",
          classId: "向阳班",
          participantIds: ["u-parent", "u-teacher"],
          participantRoles: ["parent", "teacher"],
          status: "open",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      window.localStorage.setItem(conversationKey, JSON.stringify(conversations));
    },
    { key: MESSAGE_KEY, conversationKey: CONVERSATION_KEY, message }
  );
}

async function hasMessage(page: import("@playwright/test").Page, token: string) {
  return page.evaluate(
    ({ key, token }) => {
      const messages = JSON.parse(window.localStorage.getItem(key) ?? "[]");
      return messages.some((message: { content?: string }) => message.content === token);
    },
    { key: MESSAGE_KEY, token }
  );
}

test("D01 shared demo persistence keeps parent and teacher messages across refresh", async ({ page }) => {
  const parentToken = `D01-parent-${Date.now()}`;
  const teacherToken = `D01-teacher-${Date.now()}`;
  const conversationId = `conv-d01-${Date.now()}`;

  await page.goto("/login");
  await page.evaluate(() => window.localStorage.clear());

  await loginAs(page, "u-parent", "/parent?child=c-1");
  await appendMessage(page, {
    messageId: `msg-parent-${Date.now()}`,
    conversationId,
    senderRole: "parent",
    senderId: "u-parent",
    senderName: "林妈妈",
    receiverRole: "teacher",
    content: parentToken,
  });
  await page.reload();
  await expect.poll(() => hasMessage(page, parentToken)).toBe(true);

  await loginAs(page, "u-teacher", "/teacher");
  await expect.poll(() => hasMessage(page, parentToken)).toBe(true);
  await appendMessage(page, {
    messageId: `msg-teacher-${Date.now()}`,
    conversationId,
    senderRole: "teacher",
    senderId: "u-teacher",
    senderName: "李老师",
    receiverRole: "parent",
    content: teacherToken,
  });
  await page.reload();
  await expect.poll(() => hasMessage(page, teacherToken)).toBe(true);

  await loginAs(page, "u-parent", "/parent?child=c-1");
  await expect.poll(() => hasMessage(page, teacherToken)).toBe(true);
});
