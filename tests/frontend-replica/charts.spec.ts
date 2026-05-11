import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "../feature-completion/helpers";

type PageGuards = {
  consoleErrors: string[];
  notFoundUrls: string[];
  forbiddenUrls: string[];
};

function installPageGuards(page: Page): PageGuards {
  const guards: PageGuards = { consoleErrors: [], notFoundUrls: [], forbiddenUrls: [] };

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/favicon/i.test(text)) return;
    guards.consoleErrors.push(text);
  });

  page.on("response", (response) => {
    const url = response.url();
    if (/favicon/i.test(url)) return;
    if (response.status() === 404) {
      guards.notFoundUrls.push(url);
    }
    if (response.status() === 403) {
      guards.forbiddenUrls.push(url);
    }
  });

  return guards;
}

async function expectNoPageProblems(page: Page, guards: PageGuards) {
  await page.waitForLoadState("networkidle");
  expect(guards.notFoundUrls, "no page asset/api 404").toEqual([]);
  expect(guards.forbiddenUrls, "no unexpected 403 responses").toEqual([]);
  expect(guards.consoleErrors, "no browser console errors").toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page) {
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasOverflow).toBe(false);
}

async function expectChartTooltip(page: Page, testId: string) {
  const chart = page.getByTestId(testId).first();
  await expect(chart).toBeVisible();
  await chart.scrollIntoViewIfNeeded();

  for (const selector of [
    "[data-r03-chart-hotspot='true']",
    ".recharts-dot",
    ".recharts-rectangle",
    ".recharts-sector",
    ".recharts-surface",
  ]) {
    const target = chart.locator(selector).first();
    if ((await target.count()) === 0) continue;
    await target.hover({ force: true }).catch(() => undefined);
    if (await page.getByTestId("r03-chart-tooltip").first().isVisible({ timeout: 1200 }).catch(() => false)) {
      return;
    }
    const box = await target.boundingBox();
    if (!box) continue;
    await page.mouse.move(box.x + Math.max(2, box.width * 0.5), box.y + Math.max(2, box.height * 0.5));
    if (await page.getByTestId("r03-chart-tooltip").first().isVisible({ timeout: 1200 }).catch(() => false)) {
      return;
    }
  }

  await expect(page.getByTestId("r03-chart-tooltip").first()).toBeVisible();
}

test.describe("FRONTEND-REPLICA-R03 charts", () => {
  test("园长端图表渲染并保持 36/18/18 数据基线", async ({ page }) => {
    const guards = installPageGuards(page);

    await loginAs(page, "u-admin", "/admin");
    await expect(page.getByTestId("r03-admin-chart-suite")).toBeVisible();
    await expect(page.getByTestId("r03-admin-trend-chart")).toBeVisible();
    await expect(page.getByTestId("r03-admin-risk-donut")).toBeVisible();
    await expect(page.getByTestId("r03-admin-class-comparison")).toBeVisible();
    await expect(page.getByTestId("r03-admin-closure-combo")).toBeVisible();
    await expectChartTooltip(page, "r03-admin-trend-chart");

    const response = await page.request.get("/api/analytics/admin/summary");
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as {
      ok: boolean;
      data: {
        childCount: number;
        feedbackCompletionRate: number;
        assignmentCounts: { total: number; sourceRecordIds: string[] };
        classStats: Array<{ classId: string; childCount: number }>;
      };
    };
    expect(body.ok).toBe(true);
    expect(body.data.childCount).toBe(36);
    expect(body.data.classStats.map((item) => item.childCount).sort((a, b) => a - b)).toEqual([18, 18]);
    expect(body.data.feedbackCompletionRate).toBeGreaterThanOrEqual(0);
    expect(body.data.assignmentCounts.total).toBeGreaterThan(0);
    expect(body.data.assignmentCounts.sourceRecordIds.length).toBeGreaterThan(0);

    await expectNoHorizontalOverflow(page);
    await expectNoPageProblems(page, guards);
  });

  test("园长周报工作区渲染趋势、ranking、质量和导出入口", async ({ page }) => {
    const guards = installPageGuards(page);

    await loginAs(page, "u-admin", "/admin/agent?action=weekly-report");
    await expect(page.getByTestId("r03-weekly-chart-suite")).toBeVisible();
    await expect(page.getByTestId("r03-weekly-trend-chart")).toBeVisible();
    await expect(page.getByTestId("r03-weekly-class-ranking")).toBeVisible();
    await expect(page.getByTestId("r03-weekly-quality-combo")).toBeVisible();
    await expect(page.getByTestId("weekly-history-list")).toBeVisible();
    await expect(page.getByTestId("weekly-export-markdown")).toBeVisible();
    await expectChartTooltip(page, "r03-weekly-trend-chart");

    await expectNoHorizontalOverflow(page);
    await expectNoPageProblems(page, guards);
  });

  test("教师端班级 KPI 与真实记录图表可用", async ({ page }) => {
    const guards = installPageGuards(page);

    await loginAs(page, "u-teacher", "/teacher");
    await expect(page.getByTestId("r03-teacher-chart-suite").first()).toBeVisible();
    await expect(page.getByTestId("r03-teacher-trend-chart").first()).toBeVisible();
    await expect(page.getByTestId("r03-teacher-summary-bars").first()).toBeVisible();
    await expect(page.getByTestId("r03-teacher-risk-donut").first()).toBeVisible();
    await expect(page.getByTestId("r03-teacher-operations-combo").first()).toBeVisible();
    await expect(page.getByText(/18/).first()).toBeVisible();
    await expectChartTooltip(page, "r03-teacher-trend-chart");

    await expectNoHorizontalOverflow(page);
    await expectNoPageProblems(page, guards);
  });

  test("家长端孩子 7 天趋势、饮食、成长和反馈状态可用", async ({ page }) => {
    const guards = installPageGuards(page);

    await loginAs(page, "u-parent", "/parent?child=c-1");
    expect(new URL(page.url()).searchParams.get("child")).toBe("c-1");
    await expect(page.getByTestId("r03-parent-health-trend")).toBeVisible();
    await expect(page.getByTestId("r03-parent-diet-growth-trend")).toBeVisible();
    await expectChartTooltip(page, "r03-parent-health-trend");

    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalOverflow(page);
    await expectNoPageProblems(page, guards);
  });

  test("家长 AI 页默认展示趋势图和反馈状态", async ({ page }) => {
    const guards = installPageGuards(page);

    await loginAs(page, "u-parent", "/parent/agent?child=c-1");
    expect(new URL(page.url()).searchParams.get("child")).toBe("c-1");
    await expect(page.getByTestId("r03-parent-agent-trend")).toBeVisible();
    await expectChartTooltip(page, "r03-parent-agent-trend");

    await expectNoHorizontalOverflow(page);
    await expectNoPageProblems(page, guards);
  });

  test("空态路由不会显示假成功图表", async ({ page }) => {
    const guards = installPageGuards(page);

    await loginAs(page, "u-parent", "/parent?child=not-authorized");
    await expect(page.locator("body")).toContainText(/无权|没有|暂无|not-authorized/);
    await expect(page.getByTestId("r03-parent-health-trend")).toHaveCount(0);

    await expectNoHorizontalOverflow(page);
    await expectNoPageProblems(page, guards);
  });
});
