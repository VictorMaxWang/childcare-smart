import { expect, test, type Page } from "@playwright/test";
import { finalizeFeatureTest, loginAs, resetDemoStorage } from "./helpers";

test.describe.configure({ mode: "serial" });

test.afterEach(async ({ page }, testInfo) => {
  await finalizeFeatureTest(page, testInfo);
});

async function waitForWorkflowResult(page: Page, workflow: string, expected: RegExp[]) {
  const status = page.getByTestId("teacher-agent-ai-status-bar");
  await expect(status).toContainText(`workflow: ${workflow}`, { timeout: 45_000 });
  await expect(status).toContainText("lastRequestStatus: success", { timeout: 45_000 });

  const latest = page.getByTestId("teacher-agent-latest-result");
  await expect(latest).toBeVisible({ timeout: 45_000 });
  for (const pattern of expected) {
    await expect(latest).toContainText(pattern, { timeout: 45_000 });
  }
}

async function clickPromptChip(page: Page, label: string) {
  await page
    .getByTestId("r04-prompt-chip")
    .filter({ hasText: label })
    .first()
    .click();
}

async function submitAssistantQuestion(page: Page, question: string) {
  await page.getByTestId("r04-assistant-input").fill(question);
  await page.getByTestId("r04-assistant-send").click();
}

test("teacher agent prompt chips generate demo-ready workflow results", async ({ page }) => {
  await resetDemoStorage(page);
  await loginAs(page, "u-teacher", "/teacher/agent");
  await expect(page.getByTestId("r04-prompt-chip")).toHaveCount(3);

  await clickPromptChip(page, "班级待办总结 / 本周观察总结");
  await waitForWorkflowResult(page, "weekly-summary", [
    /林小雨/,
    /高远舟/,
    /陈安安/,
    /走廊活动/,
    /48 小时复查/,
  ]);
  await expect(page.getByTestId("teacher-agent-history-item")).toHaveCount(1, { timeout: 45_000 });

  await clickPromptChip(page, "生成今日跟进行动");
  await waitForWorkflowResult(page, "follow-up", [/高远舟/, /午睡前焦虑/, /饮水偏少/, /离园前复查/]);
  await expect(page.getByTestId("teacher-agent-history-item")).toHaveCount(2, { timeout: 45_000 });

  await clickPromptChip(page, "生成家长沟通建议");
  await waitForWorkflowResult(page, "communication", [/陈安安/, /午餐进食偏少/, /家园同步饮食观察/]);
  await expect(page.getByTestId("teacher-agent-history-item")).toHaveCount(3, { timeout: 45_000 });
});

test("teacher agent composer routes typed prompts to the correct workflow", async ({ page }) => {
  await resetDemoStorage(page);
  await loginAs(page, "u-teacher", "/teacher/agent");

  await submitAssistantQuestion(page, "请生成本周观察总结，覆盖班级待办和 48 小时复查。");
  await waitForWorkflowResult(page, "weekly-summary", [/班级层面/, /48 小时复查/]);

  await submitAssistantQuestion(page, "请生成高远舟今日跟进行动，重点看午睡和饮水。");
  await waitForWorkflowResult(page, "follow-up", [/高远舟/, /午睡前焦虑/, /饮水偏少/]);

  await submitAssistantQuestion(page, "帮我生成陈安安家长沟通建议，说明午餐进食偏少。");
  await waitForWorkflowResult(page, "communication", [/陈安安/, /午餐进食偏少/, /家园同步饮食观察/]);

  await expect(page.getByTestId("teacher-agent-history-item")).toHaveCount(3, { timeout: 45_000 });
});
