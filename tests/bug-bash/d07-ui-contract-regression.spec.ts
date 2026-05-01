import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "feature-implementation", "D07");
const SHARED_NAMESPACE = "demo:v5-d01-shared-demo:institution:inst-1";
const BUCKETS = {
  children: `childcare.${SHARED_NAMESPACE}.children.v3`,
  attendance: `childcare.${SHARED_NAMESPACE}.attendance.v3`,
  health: `childcare.${SHARED_NAMESPACE}.health.v3`,
  meals: `childcare.${SHARED_NAMESPACE}.meals.v3`,
  growth: `childcare.${SHARED_NAMESPACE}.growth.v3`,
  reminders: `childcare.${SHARED_NAMESPACE}.reminders.v1`,
} as const;

async function screenshot(page: Page, fileName: string) {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, fileName),
    fullPage: true,
  });
}

async function loginAs(page: Page, accountId: string, route: string) {
  const response = await page.request.post("/api/auth/demo-login", {
    data: { accountId },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto(route);
  await expect(page.locator("body")).not.toHaveText("");
}

async function bucketIncludes(page: Page, bucketKey: string, token: string) {
  return page.evaluate(
    ({ bucketKey, token }) => window.localStorage.getItem(bucketKey)?.includes(token) ?? false,
    { bucketKey, token }
  );
}

async function getChildIdByName(page: Page, childName: string) {
  return page.evaluate(
    ({ bucketKey, childName }) => {
      const children = JSON.parse(window.localStorage.getItem(bucketKey) ?? "[]") as Array<{
        id?: string;
        name?: string;
      }>;
      return children.find((child) => child.name === childName)?.id ?? null;
    },
    { bucketKey: BUCKETS.children, childName }
  );
}

async function hasAttendanceForChild(page: Page, childId: string) {
  return page.evaluate(
    ({ bucketKey, childId }) => {
      const attendance = JSON.parse(window.localStorage.getItem(bucketKey) ?? "[]") as Array<{
        childId?: string;
      }>;
      return attendance.some((record) => record.childId === childId);
    },
    { bucketKey: BUCKETS.attendance, childId }
  );
}

async function hasManualFollowUpReminder(page: Page, childId: string) {
  return page.evaluate(
    ({ bucketKey, childId }) => {
      const reminders = JSON.parse(window.localStorage.getItem(bucketKey) ?? "[]") as Array<{
        childId?: string;
        reminderId?: string;
      }>;
      return reminders.some(
        (item) => item.childId === childId && item.reminderId?.includes("manual-follow-up")
      );
    },
    { bucketKey: BUCKETS.reminders, childId }
  );
}

async function selectDietChild(page: Page, childName: string) {
  const childCard = page.locator("button").filter({ hasText: childName }).filter({ hasText: "今日评分" });
  await childCard.scrollIntoViewIfNeeded();
  await childCard.click();
  await expect(page.locator("h2").filter({ hasText: childName })).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("D07 removes fake success and preserves shared demo writes", async ({ page }) => {
  const suffix = Date.now();
  const childName = `D07幼儿${suffix}`;
  const healthToken = `D07-HEALTH-${suffix}`;
  const dietToken = `D07-DIET-${suffix}`;
  const growthToken = `D07-GROWTH-${suffix}`;

  await page.goto("/login");
  await page.evaluate(() => window.localStorage.clear());
  await expect(page.getByTestId("d07-forgot-password-disabled")).toBeDisabled();
  await expect(page.getByTestId("d07-forgot-password-disabled")).toContainText("密码找回暂未开放");
  await screenshot(page, "01-login-forgot-disabled.png");

  await loginAs(page, "u-admin", "/children");
  await page.getByTestId("d07-open-add-child").click();
  await page.getByTestId("d07-child-name").fill(childName);
  await page.getByTestId("d07-child-guardian").fill("D07监护人");
  await page.getByTestId("d07-save-child").click();
  await expect.poll(() => bucketIncludes(page, BUCKETS.children, childName)).toBe(true);
  const childId = await getChildIdByName(page, childName);
  expect(childId).toBeTruthy();
  await expect(page.locator("body")).toContainText(childName);
  await screenshot(page, "02-children-added.png");

  await page.reload();
  await expect(page.locator("body")).toContainText(childName);
  await page.getByTestId(`d07-attendance-toggle-${childId}`).click();
  await expect.poll(() => hasAttendanceForChild(page, childId as string)).toBe(true);
  await page.reload();
  await expect.poll(() => hasAttendanceForChild(page, childId as string)).toBe(true);
  await expect(page.getByTestId(`d07-archive-disabled-${childId}`)).toBeDisabled();
  await expect(page.getByTestId(`d07-archive-disabled-${childId}`)).toContainText("归档暂未开放");
  await screenshot(page, "03-children-attendance-delete-disabled.png");

  await loginAs(page, "u-teacher", "/health");
  await expect(page.locator("body")).not.toContainText("导出记录");
  await expect(page.locator("body")).toContainText("查看全部");
  await page.getByRole("button", { name: /打开 林小雨 的晨检记录/ }).click();
  await page.locator("#remark").fill(healthToken);
  await page.getByRole("button", { name: "保存记录" }).click();
  await expect.poll(() => bucketIncludes(page, BUCKETS.health, healthToken)).toBe(true);
  await screenshot(page, "04-health-d01-and-no-export.png");

  await loginAs(page, "u-teacher", "/diet");
  await selectDietChild(page, "林小雨");
  const lunchCard = page.getByTestId("meal-card-午餐");
  await lunchCard.locator('input[placeholder="食物名称"]').fill(dietToken);
  await lunchCard.locator('input[placeholder="摄入量"]').fill("1份");
  await page.getByTestId("add-food-午餐").click();
  await expect.poll(() => bucketIncludes(page, BUCKETS.meals, dietToken)).toBe(true);
  await screenshot(page, "05-diet-d01-save.png");

  await loginAs(page, "u-teacher", "/growth");
  await page.locator("#growth-child").click();
  await page.getByRole("option", { name: /林小雨/ }).click();
  await page.locator("#growth-tags").fill("D07, 共享演示");
  await page.locator("#growth-description").fill(growthToken);
  await page.getByRole("button", { name: "正常观察" }).click();
  await page.getByRole("button", { name: /保存记录/ }).click();
  await expect.poll(() => bucketIncludes(page, BUCKETS.growth, growthToken)).toBe(true);
  await screenshot(page, "06-growth-d01-save.png");

  await loginAs(page, "u-teacher", "/teacher/agent?action=communication");
  await expect(page.getByTestId("d07-static-class-label")).toContainText("当前班级");
  await screenshot(page, "07-teacher-static-class-label.png");

  await loginAs(page, "u-teacher", "/teacher/agent");
  await expect(page.getByRole("button", { name: /演示语音草稿/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /演示 OCR 草稿/ })).toBeVisible();
  await expect(page.locator("body")).toContainText("仅生成演示样例草稿");
  await screenshot(page, "08-teacher-demo-draft-labels.png");

  await loginAs(page, "u-teacher", "/teacher/high-risk-consultation?childId=c-1&consultationId=consultation-c-1");
  await page.getByRole("button", { name: /发起会诊/ }).click();
  await page.getByRole("button", { name: /一键生成会诊/ }).click();
  await expect(page.getByTestId("d07-follow-up-reminder")).toBeVisible({ timeout: 90_000 });
  await page.getByTestId("d07-follow-up-reminder").click();
  await expect(page.locator("body")).toContainText("已加入后续提醒，并写入共享演示数据");
  await expect.poll(() => hasManualFollowUpReminder(page, "c-1")).toBe(true);
  await page.reload();
  await expect.poll(() => hasManualFollowUpReminder(page, "c-1")).toBe(true);
  await screenshot(page, "09-consultation-follow-up-reminder.png");

  await loginAs(page, "u-admin", "/admin");
  const exportWeekly = page.getByRole("button", { name: /导出周报.*暂未开放/ }).first();
  await expect(exportWeekly).toBeDisabled();
  await expect(page.getByRole("button", { name: /分享周报.*暂未开放/ }).first()).toBeDisabled();
  await screenshot(page, "10-admin-weekly-visual-only-disabled.png");

  await loginAs(page, "u-admin", "/admin/agent");
  await expect(page.getByRole("button", { name: /使用说明.*暂未开放/ }).first()).toBeDisabled();
  await expect(page.getByRole("button", { name: /批量派单.*暂未开放/ }).first()).toBeDisabled();
  await expect(page.locator('[data-testid="d07-replica-unavailable"]').first()).toContainText("暂未开放");
  await screenshot(page, "11-admin-agent-disabled-actions.png");

  await loginAs(page, "u-admin", "/admin/agent?action=weekly-report");
  await expect(page.getByRole("button", { name: /导出周报.*暂未开放/ }).first()).toBeDisabled();
  await expect(page.getByRole("button", { name: /分享周报.*暂未开放/ }).first()).toBeDisabled();
  await screenshot(page, "12-admin-agent-weekly-disabled-actions.png");
});
