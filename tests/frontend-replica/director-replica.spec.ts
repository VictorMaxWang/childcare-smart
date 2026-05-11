import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "../feature-completion/helpers";

type PageGuards = {
  consoleErrors: string[];
  forbiddenUrls: string[];
  notFoundUrls: string[];
};

function installPageGuards(page: Page): PageGuards {
  const guards: PageGuards = { consoleErrors: [], forbiddenUrls: [], notFoundUrls: [] };

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/favicon|ResizeObserver loop/i.test(text)) return;
    guards.consoleErrors.push(text);
  });

  page.on("response", (response) => {
    const url = response.url();
    if (/favicon|provider-status|admin-agent/i.test(url)) return;
    if (response.status() === 404) guards.notFoundUrls.push(url);
    if (response.status() === 403) guards.forbiddenUrls.push(url);
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

async function expectDirectorShell(page: Page) {
  await expect(page.getByTestId("r02-app-shell")).toHaveAttribute("data-role-shell", "director");
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
    if (await page.getByTestId("r03-chart-tooltip").first().isVisible({ timeout: 1200 }).catch(() => false)) return;
    const box = await target.boundingBox();
    if (!box) continue;
    await page.mouse.move(box.x + Math.max(2, box.width * 0.5), box.y + Math.max(2, box.height * 0.5));
    if (await page.getByTestId("r03-chart-tooltip").first().isVisible({ timeout: 1200 }).catch(() => false)) return;
  }

  await expect(page.getByTestId("r03-chart-tooltip").first()).toBeVisible();
}

test.describe("FRONTEND-REPLICA-R05 director replica", () => {
  test("director dashboard renders design shell, real charts, feedback, and 36/18/18 baseline", async ({ page }) => {
    const guards = installPageGuards(page);

    await loginAs(page, "u-admin", "/admin");
    await expectDirectorShell(page);
    await expect(page.getByTestId("r05-director-replica-page")).toBeVisible();
    await expect(page.getByTestId("admin-api-summary")).toBeVisible();
    await expect(page.getByTestId("r03-admin-chart-suite")).toBeVisible();
    await expect(page.getByTestId("r03-admin-trend-chart")).toBeVisible();
    await expect(page.getByTestId("r03-admin-risk-donut")).toBeVisible();
    await expect(page.getByTestId("r03-admin-class-comparison")).toBeVisible();
    await expect(page.getByTestId("r03-admin-closure-combo")).toBeVisible();
    await expectChartTooltip(page, "r03-admin-trend-chart");

    const feedbackButton = page.getByTestId("admin-open-feedback-detail");
    await expect(feedbackButton).toBeVisible();
    await feedbackButton.click();
    await expect(page.getByTestId("feedback-detail-dialog")).toBeVisible();

    const response = await page.request.get("/api/analytics/admin/summary");
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as {
      ok: boolean;
      data: { childCount: number; classStats: Array<{ childCount: number }> };
    };
    expect(body.ok).toBe(true);
    expect(body.data.childCount).toBe(36);
    expect(body.data.classStats.map((item) => item.childCount).sort((left, right) => left - right)).toEqual([18, 18]);

    await expectNoHorizontalOverflow(page);
    await expectNoPageProblems(page, guards);
  });

  test("director AI assistant keeps R04 provider state and real dispatch controls", async ({ page }) => {
    const guards = installPageGuards(page);

    await loginAs(page, "u-admin", "/admin/agent");
    await expectDirectorShell(page);
    await expect(page.getByTestId("r05-director-replica-page")).toBeVisible();
    await expect(page.getByTestId("r04-assistant-workspace").first()).toBeVisible();
    await expect(page.getByTestId("r04-assistant-provider-status").first()).toContainText(/provider (ready|degraded|unavailable)|正在读取/u);
    await expect(page.getByTestId("d07-replica-unavailable")).toHaveCount(0);

    await page.getByTestId("r05-admin-agent-help").click();
    await expect(page.getByText("这些入口都连接真实园长端流程")).toBeVisible();
    await expect(page.getByTestId("r05-admin-agent-batch-dispatch")).toBeVisible();
    await page.getByTestId("r04-assistant-input").first().fill("请汇总本周全园高风险事项");
    await expect(page.getByTestId("r04-assistant-send").first()).toBeEnabled({ timeout: 30_000 });

    await expectNoHorizontalOverflow(page);
    await expectNoPageProblems(page, guards);
  });

  test("weekly report workspace exposes real charts, history, export, share, and archive controls", async ({ page }) => {
    const guards = installPageGuards(page);

    await loginAs(page, "u-admin", "/admin/agent?action=weekly-report");
    await expectDirectorShell(page);
    await expect(page.getByTestId("r03-weekly-chart-suite")).toBeVisible();
    await expect(page.getByTestId("r03-weekly-trend-chart")).toBeVisible();
    await expect(page.getByTestId("r03-weekly-class-ranking")).toBeVisible();
    await expect(page.getByTestId("r03-weekly-quality-combo")).toBeVisible();
    await expect(page.getByTestId("weekly-save-report")).toBeVisible();
    await expect(page.getByTestId("weekly-history-list")).toBeVisible();
    await expect(page.getByTestId("weekly-report-detail")).toBeVisible();
    await expect(page.getByTestId("weekly-export-markdown")).toBeVisible();
    await expect(page.getByTestId("weekly-share-report")).toBeVisible();
    await expect(page.getByTestId("weekly-archive-report")).toBeVisible();
    await expectChartTooltip(page, "r03-weekly-trend-chart");

    await expectNoHorizontalOverflow(page);
    await expectNoPageProblems(page, guards);
  });

  test("teacher management and child archive pages keep functional CRUD entry points", async ({ page }) => {
    const guards = installPageGuards(page);

    await loginAs(page, "u-admin", "/admin/teachers");
    await expectDirectorShell(page);
    await expect(page.getByTestId("r05-teachers-page")).toBeVisible();
    await expect(page.getByTestId("e02-open-add-teacher")).toBeEnabled();
    await expect(page.getByTestId("e02-toggle-archived-teachers")).toBeEnabled();
    await expect(page.getByTestId("e02-teacher-search")).toBeVisible();
    await expect(page.locator("[data-testid^='e02-teacher-row-']").first()).toBeVisible();
    await page.getByTestId("e02-open-add-teacher").click();
    await expect(page.getByTestId("e02-teacher-name")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.goto("/children");
    await expect(page.getByTestId("r05-children-page")).toBeVisible();
    await expect(page.getByTestId("e02-open-add-child")).toBeEnabled();
    await expect(page.getByTestId("e02-toggle-archived-children")).toBeEnabled();
    await expect(page.getByTestId("e02-child-search")).toBeVisible();
    await expect(page.locator("[data-testid^='e02-child-row-']").first()).toBeVisible();
    await expect(page.locator("[data-testid^='e02-attendance-toggle-']").first()).toBeVisible();

    await expectNoHorizontalOverflow(page);
    await expectNoPageProblems(page, guards);
  });

  test("health, diet, and growth pages use shared R05 charts and keep real workflow buttons", async ({ page }) => {
    const guards = installPageGuards(page);

    await loginAs(page, "u-admin", "/health");
    await expectDirectorShell(page);
    await expect(page.getByTestId("r05-health-page")).toBeVisible();
    await expect(page.getByTestId("r05-health-chart-suite")).toBeVisible();
    await expect(page.getByTestId("r05-health-temperature-chart")).toBeVisible();
    await expect(page.getByTestId("r05-health-mood-donut")).toBeVisible();
    await expect(page.getByTestId("r05-health-record-list")).toBeVisible();
    await expectChartTooltip(page, "r05-health-temperature-chart");

    await page.goto("/diet");
    await expect(page.getByTestId("r05-diet-page")).toBeVisible();
    await expect(page.getByTestId("r05-diet-chart-suite")).toBeVisible();
    await expect(page.getByTestId("r05-diet-meal-coverage-chart")).toBeVisible();
    await expect(page.getByTestId("r05-diet-category-donut")).toBeVisible();
    await expect(page.getByTestId("r05-diet-quality-combo")).toBeVisible();
    await expect(page.getByTestId("r05-diet-bulk-entry")).toBeVisible();
    await expect(page.locator("[data-testid^='meal-card-']").first()).toBeVisible();
    await expect(page.locator("[data-testid^='diet-ai-evaluate-']").first()).toBeVisible();
    await expectChartTooltip(page, "r05-diet-quality-combo");

    await page.goto("/growth");
    await expect(page.getByTestId("r05-growth-page")).toBeVisible();
    await expect(page.getByTestId("r05-growth-chart-suite")).toBeVisible();
    await expect(page.getByTestId("r05-growth-category-trend")).toBeVisible();
    await expect(page.getByTestId("r05-growth-category-donut")).toBeVisible();
    await expect(page.getByTestId("r05-growth-review-bars")).toBeVisible();
    await expect(page.getByTestId("r05-growth-save-record")).toBeVisible();
    await expect(page.getByTestId("growth-record-card").first()).toBeVisible();
    await expectChartTooltip(page, "r05-growth-category-trend");

    await expectNoHorizontalOverflow(page);
    await expectNoPageProblems(page, guards);
  });

  test("director routes remain responsive across desktop, tablet, and mobile", async ({ page }) => {
    const routes = ["/admin", "/admin/teachers", "/children", "/health", "/diet", "/growth", "/admin/agent"];
    const viewports = [
      { width: 1440, height: 900 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ];

    await loginAs(page, "u-admin", "/admin");
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const route of routes) {
        await page.goto(route);
        await expectDirectorShell(page);
        await expect(page.locator("main, [data-testid='r05-health-page'], [data-testid='r05-diet-page'], [data-testid='r05-growth-page'], [data-testid='r05-children-page'], [data-testid='r05-teachers-page']").first()).toBeVisible();
        await expectNoHorizontalOverflow(page);
      }
    }
  });
});
