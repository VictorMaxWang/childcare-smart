import { expect, request as playwrightRequest, test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

import { loginAs } from "./helpers";

const E03_ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "product-completion", "E03");

async function demoContext(testInfo: TestInfo, accountId: string) {
  const baseURL = testInfo.project.use.baseURL as string | undefined;
  return playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: {
      "x-demo-account-id": accountId,
    },
  });
}

async function expectSuccess(response: Awaited<ReturnType<APIRequestContext["get"]>>, status = 200) {
  expect(response.status()).toBe(status);
  const body = await response.json();
  expect(body.ok).toBe(true);
  expect(body.data).toBeDefined();
  return body.data;
}

async function expectFailure(response: Awaited<ReturnType<APIRequestContext["get"]>>, status: number, code: string) {
  expect(response.status()).toBe(status);
  const body = await response.json();
  expect(body.ok).toBe(false);
  expect(body.code).toBe(code);
}

async function captureE03(page: Page, fileName: string) {
  await fs.mkdir(E03_ARTIFACT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(E03_ARTIFACT_DIR, fileName),
    fullPage: true,
  });
}

test.describe("E03 real aggregation, trends, and weekly reports", () => {
  test("director can query real metrics, generate weekly report, export/share/archive, and scope blocks overreach", async ({
    page,
  }, testInfo) => {
    const director = await demoContext(testInfo, "u-admin");
    const parent = await demoContext(testInfo, "u-parent");

    try {
      const summary = await expectSuccess(await director.get("/api/analytics/admin/summary"));
      expect(summary.childCount).toBeGreaterThanOrEqual(3);
      expect(summary.teacherCount).toBeGreaterThanOrEqual(2);
      expect(summary.recent7DayTrend.series).toHaveLength(7);

      const trend = await expectSuccess(await director.get("/api/analytics/trends?timeRange=7d&metric=meal"));
      expect(trend.metric).toBe("meal");
      expect(trend.series).toHaveLength(7);
      expect(trend.dataQuality.source).toBe("app-data-service");

      const created = await expectSuccess(
        await director.post("/api/weekly-reports", {
          data: {
            scopeType: "institution",
            scopeId: "inst-1",
            title: `E03 acceptance ${Date.now()}`,
            periodStart: "2026-04-27",
            periodEnd: "2026-05-03",
          },
        }),
        201
      );
      expect(created.status).toBe("draft");
      expect(created.sourceRecordIds.length).toBeGreaterThan(0);

      const listed = await expectSuccess(await director.get("/api/weekly-reports"));
      expect(listed.some((report: { reportId: string }) => report.reportId === created.reportId)).toBe(true);

      const detail = await expectSuccess(await director.get(`/api/weekly-reports/${created.reportId}`));
      expect(detail.payload.summary.recordCount).toBeGreaterThanOrEqual(0);

      const exported = await expectSuccess(await director.get(`/api/weekly-reports/${created.reportId}/export?format=markdown`));
      expect(exported.content).toContain(created.title);

      const shared = await expectSuccess(await director.post(`/api/weekly-reports/${created.reportId}/share`, { data: {} }));
      expect(shared.status).toBe("shared");
      expect(shared.share.localText).toContain(created.reportId);

      await expectFailure(await parent.get(`/api/weekly-reports/${created.reportId}`), 403, "forbidden_scope");
      await expectFailure(await parent.get("/api/analytics/trends?classId=%E5%90%91%E9%98%B3%E7%8F%AD&metric=meal"), 403, "forbidden_scope");

      const archived = await expectSuccess(
        await director.post(`/api/weekly-reports/${created.reportId}/archive`, {
          data: { action: "archive" },
        })
      );
      expect(archived.status).toBe("archived");

      await loginAs(page, "u-admin", "/admin");
      await expect(page.getByTestId("admin-api-summary")).toBeVisible();
      await captureE03(page, "admin-summary-real-aggregation.png");

      await page.goto("/admin/agent?action=weekly-report");
      await expect(page.getByTestId("weekly-history-list")).toBeVisible();
      await page.getByText("查看归档").click();
      const historyItem = page.getByTestId("weekly-history-list").getByRole("button", { name: new RegExp(created.title) });
      await expect(historyItem).toBeVisible();
      await historyItem.click();
      await expect(page.getByTestId("weekly-report-detail")).toBeVisible();
      await captureE03(page, "weekly-report-history-detail.png");
    } finally {
      await director.dispose();
      await parent.dispose();
    }
  });
});
