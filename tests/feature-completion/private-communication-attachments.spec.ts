import { expect, test } from "@playwright/test";

import { tinyPngDataUrl } from "./helpers";

test("normal parent retries a private message attachment without sending a duplicate message", async ({
  page,
}) => {
  const demoLogin = await page.request.post("/api/auth/demo-login", {
    data: { accountId: "u-parent" },
  });
  expect(demoLogin.ok()).toBe(true);
  const sessionBody = await (await page.request.get("/api/auth/session")).json();
  const stateBody = await (await page.request.get("/api/state")).json();
  const normalUser = { ...sessionBody.user, accountKind: "normal" };
  const messageId = "msg-private-retry";
  let messagePosts = 0;
  let uploadPosts = 0;

  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, user: normalUser }),
    });
  });
  await page.route("**/api/state", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...stateBody, isDemo: false }),
    });
  });
  await page.route("**/api/messages?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: [] }),
    });
  });
  await page.route("**/api/feedback?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: [] }),
    });
  });
  await page.route("**/api/attachments?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: [] }),
    });
  });
  await page.route("**/api/messages", async (route) => {
    messagePosts += 1;
    const input = route.request().postDataJSON() as {
      childId: string;
      conversationId: string;
      content: string;
    };
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          messageId,
          institutionId: normalUser.institutionId,
          childId: input.childId,
          conversationId: input.conversationId,
          senderId: normalUser.id,
          senderName: normalUser.name,
          senderRole: "parent",
          content: input.content,
          readBy: [normalUser.id],
          createdAt: new Date().toISOString(),
        },
      }),
    });
  });
  await page.route("**/api/attachments/upload", async (route) => {
    uploadPosts += 1;
    const contentType = await route.request().headerValue("content-type");
    expect(contentType).toContain("multipart/form-data");
    expect(route.request().postData() ?? "").not.toContain("data:image");
    if (uploadPosts === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          code: "provider_unavailable",
          error: "temporary upload failure",
        }),
      });
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          attachmentId: "attch-private-retry",
          institutionId: normalUser.institutionId,
          childId: "c-1",
          relatedType: "message",
          relatedId: messageId,
          kind: "image",
          fileName: "message-photo.png",
          mimeType: "image/png",
          byteSize: 68,
          storageMode: "object_storage",
          uploadStatus: "uploaded",
          storageProvider: "vercel_blob",
          downloadUrl: "/api/attachments/attch-private-retry/content",
          createdBy: normalUser.id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }),
    });
  });

  await page.goto("/parent/agent?child=c-1#feedback");
  const panel = page.getByTestId("parent-communication-panel");
  await panel.getByTestId("parent-message-input").fill("附上今晚观察照片");
  await panel.locator('input[type="file"]').first().setInputFiles({
    name: "message-photo.png",
    mimeType: "image/png",
    buffer: Buffer.from(tinyPngDataUrl().split(",")[1], "base64"),
  });
  await panel.getByTestId("parent-send-message").click();
  await expect(panel).toContainText("再次点击可继续上传");

  await panel.getByTestId("parent-send-message").click();
  await expect(panel).toContainText("消息与附件已保存");
  expect(messagePosts).toBe(1);
  expect(uploadPosts).toBe(2);
});
