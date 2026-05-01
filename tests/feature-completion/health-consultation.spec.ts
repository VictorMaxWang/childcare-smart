import { expect, test, type Page } from "@playwright/test";
import {
  BUCKETS,
  capture,
  finalizeFeatureTest,
  loginAs,
  resetDemoStorage,
} from "./helpers";

test.describe.configure({ mode: "serial" });

test.afterEach(async ({ page }, testInfo) => {
  await finalizeFeatureTest(page, testInfo);
});

test("D08 health material parse and consultation persist across teacher director parent", async ({ page }) => {
  const stamp = Date.now();
  const filename = `d08-health-note-${stamp}.pdf`;
  const materialToken = `D08-MATERIAL-${stamp}`;
  const noteToken = `D08-NOTE-${stamp}`;

  await resetDemoStorage(page);
  const emptyConsultations = await page.evaluate(
    (consultationKey) => JSON.parse(window.localStorage.getItem(consultationKey) ?? "[]") as unknown[],
    BUCKETS.consultations
  );
  expect(emptyConsultations).toHaveLength(0);

  await loginAs(page, "u-teacher", "/teacher/health-file-bridge");
  await page.getByTestId("d05-health-file-input").setInputFiles({
    name: filename,
    mimeType: "application/pdf",
    buffer: Buffer.from(`${materialToken} temperature 39.0 high risk follow up tomorrow`),
  });
  await page
    .getByTestId("d05-health-preview-text")
    .fill(`${materialToken}: temperature 39.0, high risk, review tomorrow morning, observe tonight.`);
  await capture(page, "health-01-material-ready.png");

  await page.getByTestId("d05-start-parse").click();
  await expect(page.getByTestId("d05-parse-result")).toContainText(/本地演示解析|T9 mapped/, { timeout: 30_000 });
  await page.getByTestId("d05-save-parse").click();
  await page.reload();
  await expect(page.getByTestId("d05-health-history")).toContainText(filename);
  await expect(page.getByTestId("d05-parse-result")).toContainText(/本地演示解析|T9 mapped/);
  await capture(page, "health-02-parse-refresh.png");

  await page.getByTestId("d05-create-consultation").click();
  await page.waitForURL(/\/teacher\/high-risk-consultation/);
  await expect(page.locator("body")).toContainText(filename, { timeout: 15_000 });

  const created = await readHealthConsultationPersistence(page, filename, noteToken);
  expect(created.material).toMatchObject({
    childId: "c-1",
    filename,
    parseStatus: "completed",
  });
  expect(created.consultation).toMatchObject({
    childId: "c-1",
    workflowStatus: "pending",
    sourceMaterialId: created.material?.materialId,
    directorDecisionCard: { status: "pending" },
  });
  await capture(page, "health-03-consultation-created.png");

  await page.getByTestId("d05-consultation-note-input").fill(noteToken);
  await page.getByTestId("d05-consultation-note-send").click();
  await expect(page.getByTestId("d05-consultation-discussion")).toContainText(noteToken);
  await page.getByTestId("d05-consultation-status-in-progress").click();
  await page.getByTestId("d05-consultation-status-resolved").click();
  await page.reload();
  await expect(page.getByTestId("d05-consultation-discussion")).toContainText(noteToken);
  await expect(page.locator("body")).toContainText("已解决");
  await capture(page, "health-04-note-status-refresh.png");

  await loginAs(page, "u-admin", "/admin");
  await expect(page.locator("body")).toContainText(filename);
  await loginAs(page, "u-admin", "/admin/agent");
  await expect(page.locator("body")).toContainText(filename);
  await capture(page, "health-05-director-visible.png");

  await loginAs(page, "u-parent", "/parent?child=c-1");
  await expect(page.locator("body")).toContainText(/健康材料摘要|T9 mapped/);
  await capture(page, "health-06-parent-visible.png");

  const persisted = await readHealthConsultationPersistence(page, filename, noteToken);
  expect(persisted.consultation).toMatchObject({
    childId: "c-1",
    workflowStatus: "resolved",
    sourceMaterialId: persisted.material?.materialId,
    directorDecisionCard: { status: "completed" },
  });
});

async function readHealthConsultationPersistence(page: Page, filename: string, noteToken: string) {
  return page.evaluate(
    ({ healthKey, consultationKey, filename, noteToken }) => {
      const healthMaterials = JSON.parse(window.localStorage.getItem(healthKey) ?? "[]") as Array<{
        materialId?: string;
        childId?: string;
        filename?: string;
        parseStatus?: string;
        parseResult?: { sourceLabel?: string; summary?: string };
      }>;
      const consultations = JSON.parse(window.localStorage.getItem(consultationKey) ?? "[]") as Array<{
        consultationId?: string;
        childId?: string;
        workflowStatus?: string;
        sourceMaterialId?: string;
        directorDecisionCard?: { status?: string };
        notes?: Array<{ note?: string }>;
      }>;
      const material = healthMaterials.find((item) => item.filename === filename) ?? null;
      return {
        material,
        consultation:
          consultations.find(
            (item) =>
              (material?.materialId && item.sourceMaterialId === material.materialId) ||
              item.notes?.some((note) => note.note?.includes(noteToken))
          ) ?? null,
      };
    },
    { healthKey: BUCKETS.healthMaterials, consultationKey: BUCKETS.consultations, filename, noteToken }
  );
}
