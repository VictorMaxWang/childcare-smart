import { expect, request as playwrightRequest, test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

import { loginAs } from "../feature-completion/helpers";

const ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "product-completion", "E09");
const CHILD_ID = "c-1";
const LIVE_OR_FALLBACK_PROVIDER_STATUS = /vivo provider ready|fallback|missing-env/i;

async function captureE09(page: Page, fileName: string) {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(ARTIFACT_DIR, fileName), fullPage: true });
}

async function demoContext(testInfo: TestInfo, accountId: string) {
  const baseURL = testInfo.project.use.baseURL as string | undefined;
  return playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: { "x-demo-account-id": accountId },
  });
}

async function expectOk(response: Awaited<ReturnType<APIRequestContext["get"]>>, expectedStatus = 200) {
  expect(response.status()).toBe(expectedStatus);
  const body = await response.json();
  expect(body.ok).toBe(true);
  return body.data;
}

async function expectApiFailure(response: Awaited<ReturnType<APIRequestContext["get"]>>, status: number, code: string) {
  expect(response.status()).toBe(status);
  const body = await response.json();
  expect(body.ok).toBe(false);
  expect(body.code).toBe(code);
  return body;
}

async function planVoiceCommand(api: APIRequestContext, text: string, context: Record<string, unknown> = {}) {
  const result = await expectOk(
    await api.post("/api/voice-assistant/commands", {
      data: {
        action: "plan",
        utterance: { text, inputMode: "text", transcriptSource: "playwright-e09" },
        context: {
          currentPath: "/parent?child=c-1",
          currentQuery: { child: CHILD_ID },
          objects: { childId: CHILD_ID },
          ...context,
        },
      },
    })
  );
  return result.command;
}

async function executeVoiceCommand(api: APIRequestContext, text: string, context: Record<string, unknown> = {}) {
  const command = await planVoiceCommand(api, text, context);
  const result = await expectOk(
    await api.post("/api/voice-assistant/commands", {
      data: {
        action: "execute",
        command,
        confirmed: true,
        context: {
          currentPath: "/parent?child=c-1",
          currentQuery: { child: CHILD_ID },
          objects: { childId: CHILD_ID },
          ...context,
        },
      },
    })
  );
  return result;
}

async function seedStorybook(api: APIRequestContext, storybookId: string) {
  return expectOk(
    await api.post("/api/storybooks", {
      data: {
        storybookId,
        childId: CHILD_ID,
        generatedAt: new Date().toISOString(),
        sourceRecordIds: ["growth-e09"],
        response: {
          storyId: storybookId,
          childId: CHILD_ID,
          title: "小雨的勇气绘本",
          summary: "林小雨今天尝试自己整理书包。",
          moral: "一点点练习也值得被看见。",
          parentNote: "可以在家继续鼓励孩子整理自己的小物件。",
          generatedAt: new Date().toISOString(),
          scenes: [
            {
              sceneIndex: 1,
              sceneTitle: "整理书包",
              sceneText: "小雨把彩笔和水杯放回自己的书包里。",
              imageStatus: "ready",
              audioStatus: "preview-only",
              audioScript: "小雨把彩笔和水杯放回自己的书包里。",
              voiceStyle: "warm",
              imagePrompt: "child organizing bag",
              highlightSource: "growth",
            },
          ],
        },
      },
    }),
    201
  );
}

async function openVoiceOrb(page: Page) {
  if (!(await page.getByTestId("voice-orb-panel").isVisible().catch(() => false))) {
    await page.getByTestId("voice-orb-button").click();
  }
  await expect(page.getByTestId("voice-orb-panel")).toBeVisible();
}

async function submitVoiceText(page: Page, text: string, confirm = false) {
  await openVoiceOrb(page);
  await page.getByTestId("voice-orb-input").fill(text);
  await page.getByTestId("voice-orb-submit").click();
  if (confirm) {
    await expect(page.getByTestId("voice-orb-confirm")).toBeVisible();
    await page.getByTestId("voice-orb-confirm").click();
  }
}

test.describe.configure({ mode: "serial" });

test.describe("E09 parent voice assistant skills", () => {
  test("API commands require confirmation, persist, and enforce child scope", async ({}, testInfo) => {
    const parent = await demoContext(testInfo, "u-parent");
    const teacher = await demoContext(testInfo, "u-teacher");
    const teacher2 = await demoContext(testInfo, "u-teacher2");
    const token = `E09-api-${Date.now()}`;
    const storybookId = `storybook-e09-api-${Date.now()}`;
    try {
      const messageCommand = await planVoiceCommand(parent, `给老师留言，今天晚上孩子有点咳嗽 ${token}`);
      expect(messageCommand.intent).toBe("send_message");
      expect(messageCommand.status).toBe("needs_confirmation");
      await expectApiFailure(
        await parent.post("/api/voice-assistant/commands", {
          data: { action: "execute", command: messageCommand, confirmed: false },
        }),
        422,
        "needs_confirmation"
      );
      await executeVoiceCommand(parent, `给老师留言，今天晚上孩子有点咳嗽 ${token}`);
      const teacherMessages = await expectOk(await teacher.get(`/api/messages?childId=${CHILD_ID}`));
      expect(teacherMessages.some((message: { content?: string }) => message.content?.includes(token))).toBe(true);
      await expectApiFailure(await teacher2.get(`/api/messages?childId=${CHILD_ID}`), 403, "forbidden_scope");

      await executeVoiceCommand(parent, `我要反馈，孩子最近睡眠不太好 ${token}`);
      const feedback = await expectOk(await parent.get(`/api/feedback?childId=${CHILD_ID}`));
      expect(JSON.stringify(feedback)).toContain(token);

      await expectOk(
        await teacher.post("/api/messages", {
          data: { childId: CHILD_ID, content: `老师回复 ${token}` },
        }),
        201
      );
      const replies = await executeVoiceCommand(parent, "查看老师回复");
      expect(replies.message).toContain(token);

      await expectOk(
        await parent.post("/api/reminders", {
          data: {
            childId: CHILD_ID,
            reminderType: "family-task",
            targetRole: "parent",
            title: `E09 提醒 ${token}`,
            description: "语音标记已读验收",
            scheduledAt: "2099-05-02T09:00:00.000Z",
          },
        }),
        201
      );
      await executeVoiceCommand(parent, "标记这个提醒已读");
      const reminders = await expectOk(await parent.get(`/api/reminders?childId=${CHILD_ID}`));
      expect(reminders.some((reminder: { title?: string; status?: string }) => reminder.title?.includes(token) && reminder.status === "acknowledged")).toBe(true);

      await seedStorybook(parent, storybookId);
      const exported = await executeVoiceCommand(parent, "导出成长绘本");
      expect(exported.data.kind).toBe("download");
      expect(exported.data.content).toContain("小雨的勇气绘本");
      const shared = await executeVoiceCommand(parent, "分享成长绘本");
      expect(shared.data.kind).toBe("share-text");
      expect(shared.data.copyText).toContain("小雨的勇气绘本");

      const forbiddenChild = await planVoiceCommand(parent, "查看张浩然今天状态", {
        currentQuery: { child: "c-2" },
        objects: { childId: "c-2" },
      });
      expect(forbiddenChild.status).toBe("forbidden");

      const nav = await planVoiceCommand(parent, "打开成长档案");
      await expectApiFailure(
        await parent.post("/api/voice-assistant/commands", {
          data: {
            action: "execute",
            command: {
              ...nav,
              params: { ...nav.params, path: "/growth?child=c-2" },
              deeplink: "/growth?child=c-2",
            },
            confirmed: true,
          },
        }),
        403,
        "forbidden_scope"
      );
    } finally {
      await parent.dispose();
      await teacher.dispose();
      await teacher2.dispose();
    }
  });

  test("parent VoiceOrb UI covers message, query, storybook share/export, reminder read, and teacher visibility", async ({ page }) => {
    const token = `E09-ui-${Date.now()}`;
    const storybookId = `storybook-e09-ui-${Date.now()}`;

    await loginAs(page, "u-parent", `/parent?child=${CHILD_ID}`);
    await seedStorybook(page.request, storybookId);
    await expectOk(
      await page.request.post("/api/reminders", {
        data: {
          childId: CHILD_ID,
          reminderType: "family-task",
          targetRole: "parent",
          title: `E09 UI 提醒 ${token}`,
          description: "刷新后仍应已读",
          scheduledAt: "2099-05-02T10:00:00.000Z",
        },
      }),
      201
    );

    await openVoiceOrb(page);
    await expect(page.getByTestId("voice-orb-provider-status")).toContainText(LIVE_OR_FALLBACK_PROVIDER_STATUS);
    await submitVoiceText(page, `给老师留言，今天晚上孩子有点咳嗽 ${token}`, true);
    await expect(page.getByTestId("voice-orb-result")).toContainText("留言已发送", { timeout: 20_000 });
    await captureE09(page, "01-parent-message-executed.png");

    await loginAs(page, "u-teacher", "/teacher/agent?action=communication");
    await expect(page.locator("body")).toContainText(token, { timeout: 20_000 });
    await captureE09(page, "02-teacher-sees-parent-message.png");

    await loginAs(page, "u-parent", `/parent?child=${CHILD_ID}`);
    await submitVoiceText(page, "查看今天吃了什么");
    await expect(page.getByTestId("voice-orb-result")).toContainText(/饮食|暂无/);
    await captureE09(page, "03-parent-query-diet.png");

    await submitVoiceText(page, "打开成长绘本");
    await expect(page).toHaveURL(/\/parent\/storybook/);
    await captureE09(page, "04-open-storybook.png");

    await submitVoiceText(page, "导出成长绘本", true);
    await expect(page.getByTestId("voice-orb-download")).toBeVisible({ timeout: 20_000 });
    await captureE09(page, "05-storybook-export.png");

    await submitVoiceText(page, "分享成长绘本", true);
    await expect(page.getByTestId("voice-orb-copy-share")).toBeVisible({ timeout: 20_000 });
    await captureE09(page, "06-storybook-share.png");

    await page.goto(`/parent/reminders?child=${CHILD_ID}`);
    await submitVoiceText(page, "标记这个提醒已读", true);
    await expect(page.getByTestId("voice-orb-result")).toContainText("已标记为已读", { timeout: 20_000 });
    await page.reload();
    await expect(page.locator("body")).toContainText("已读", { timeout: 20_000 });
    await captureE09(page, "07-reminder-read-refresh.png");

    await page.goto("/parent?child=c-2");
    await expect(page.locator("body")).toContainText(/无权|授权|不能/);
    await captureE09(page, "08-forbidden-other-child.png");
  });

  test("mobile VoiceOrb is usable above bottom navigation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, "u-parent", `/parent?child=${CHILD_ID}`);
    const orb = page.getByTestId("voice-orb-button");
    await expect(orb).toBeVisible();
    const box = await orb.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThan(844 - 48);
    await orb.click();
    await expect(page.getByTestId("voice-orb-panel")).toBeVisible();
    await page.getByTestId("voice-orb-input").fill("查看今天的提醒");
    await page.getByTestId("voice-orb-submit").click();
    await expect(page.getByTestId("voice-orb-result")).toContainText(/提醒|任务|没有/);
    await captureE09(page, "09-mobile-voice-orb.png");
  });
});
