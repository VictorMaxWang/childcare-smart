import { expect, test } from "@playwright/test";
import { capture, finalizeFeatureTest, loginAs, resetDemoStorage } from "./helpers";

test.describe.configure({ mode: "serial" });

test.afterEach(async ({ page }, testInfo) => {
  await finalizeFeatureTest(page, testInfo);
});

test("admin governance first screen connects risk signals to institution actions", async ({ page }) => {
  await resetDemoStorage(page);
  await loginAs(page, "u-admin", "/admin");

  const hero = page.getByTestId("admin-governance-hero");
  await expect(hero).toBeVisible({ timeout: 20_000 });
  await expect(hero).toContainText("风险优先级板");
  await expect(hero).toContainText("质量驾驶舱");
  await expect(hero).toContainText("周度摘要");

  const compactRiskBoard = page.getByTestId("admin-risk-priority-compact");
  await expect(compactRiskBoard).toContainText("林小雨");
  await expect(compactRiskBoard).toContainText("高远舟");
  await expect(compactRiskBoard).toContainText("陈安安");
  await expect(compactRiskBoard).toContainText("班级治理");

  await expect(page.getByTestId("admin-quality-cockpit")).toContainText("会诊承接");
  await expect(page.getByTestId("admin-quality-cockpit")).toContainText("48 小时复查");
  await expect(page.getByTestId("admin-weekly-governance-summary")).not.toBeEmpty();
  await expect(page.getByTestId("admin-review-48h-tasks")).toContainText("48 小时复查任务");
  await expect(page.getByTestId("admin-family-feedback-flow")).toContainText("林小雨");
  await expect(page.getByTestId("admin-family-feedback-flow")).toContainText("陈安安");
  await expect(page.getByTestId("admin-governance-actions")).toContainText("成长记录补录");
  await expect(page.getByTestId("admin-governance-actions")).toContainText("健康材料解析入口");

  await page.getByTestId("admin-risk-item-c-1").click();
  await expect(page.getByTestId("admin-risk-detail")).toContainText("林小雨");
  await expect(page.getByTestId("admin-risk-detail")).toContainText("48 小时复查");

  await page.getByTestId("admin-risk-item-c-2").click();
  await expect(page.getByTestId("admin-risk-detail")).toContainText("高远舟");
  await expect(page.getByTestId("admin-risk-detail")).toContainText(/午睡|饮水/);

  await page.getByTestId("admin-risk-item-c-3").click();
  await expect(page.getByTestId("admin-risk-detail")).toContainText("陈安安");
  await expect(page.getByTestId("admin-risk-detail")).toContainText(/进食|家园同步/);

  await capture(page, "admin-governance-first-screen.png");
});

test("admin feed and workflow fall back locally without admin console errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await resetDemoStorage(page);
  await page.route("**/api/ai/high-risk-consultation/feed**", (route) => route.abort("failed"));
  await page.route("**/api/ai/weekly-report", (route) => route.abort("failed"));

  await loginAs(page, "u-admin", "/admin");

  const compactRiskBoard = page.getByTestId("admin-risk-priority-compact");
  await expect(compactRiskBoard).toBeVisible({ timeout: 20_000 });
  await expect(compactRiskBoard).toContainText("P1");
  await expect(page.getByTestId("admin-family-feedback-flow")).toBeVisible();
  await expect(page.getByTestId("admin-family-feedback-flow")).not.toBeEmpty();
  await expect(page.getByTestId("admin-weekly-governance-summary")).toBeVisible();
  await expect(page.getByTestId("admin-weekly-governance-summary")).not.toBeEmpty();
  await expect(page.locator("body")).toContainText(/本地演示数据|最近缓存数据|远端 feed 暂不可用/);

  await page.route("**/api/ai/admin-agent", (route) => route.abort("failed"));
  await page.goto("/admin/agent");

  await expect(page.getByTestId("r05-director-replica-page")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("admin-agent-fallback-notice")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("admin-agent-fallback-notice")).toContainText(/本地演示数据|远端 workflow 暂不可用/);
  await expect(page.locator("body")).toContainText(/AI 工作台|重点会诊/);
  await expect(page.locator("body")).toContainText("P1");

  await page.waitForTimeout(500);
  expect(consoleErrors.filter((text) => text.includes("[ADMIN_FEED]") || text.includes("[ADMIN_AGENT]"))).toEqual([]);
  await capture(page, "admin-governance-feed-workflow-fallback.png");
});
