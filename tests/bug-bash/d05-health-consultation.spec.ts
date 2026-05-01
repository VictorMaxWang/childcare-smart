import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const SHARED_NAMESPACE = "demo:v5-d01-shared-demo:institution:inst-1";
const HEALTH_MATERIALS_KEY = `childcare.${SHARED_NAMESPACE}.health-materials.v1`;
const CONSULTATIONS_KEY = `childcare.${SHARED_NAMESPACE}.consultations.v1`;
const ARTIFACT_DIR = path.resolve("artifacts/feature-implementation/D05");

async function loginAs(page: Page, accountId: string, route: string) {
  const response = await page.request.post("/api/auth/demo-login", {
    data: { accountId },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto(route);
  await expect(page.locator("body")).not.toHaveText("");
}

async function screenshot(page: Page, name: string) {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, name),
    fullPage: true,
  });
}

async function readD05Persistence(page: Page, filename: string, noteToken: string) {
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
      const material = healthMaterials.find((material) => material.filename === filename) ?? null;

      return {
        material,
        consultation:
          consultations.find(
            (consultation) =>
              (material?.materialId && consultation.sourceMaterialId === material.materialId) ||
              consultation.notes?.some((note) => note.note?.includes(noteToken))
          ) ?? null,
      };
    },
    {
      healthKey: HEALTH_MATERIALS_KEY,
      consultationKey: CONSULTATIONS_KEY,
      filename,
      noteToken,
    }
  );
}

async function readFeedItems(page: Page) {
  const origin = new URL(page.url()).origin;
  const response = await page.request.get(
    `${origin}/api/ai/high-risk-consultation/feed?limit=4&escalated_only=true`
  );
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["content-type"] ?? "").toContain("application/json");
  return (await response.json()) as { items?: unknown[]; fallback?: boolean; empty?: boolean };
}

test("D05 health material parse and consultation persist across teacher director parent views", async ({ page }) => {
  const stamp = Date.now();
  const filename = `d05-health-note-${stamp}.pdf`;
  const materialToken = `D05-E2E-${stamp}`;
  const noteToken = `D05-NOTE-${stamp}`;

  await page.goto("/login");
  await page.evaluate(() => window.localStorage.clear());

  await loginAs(page, "u-admin", "/admin/agent");
  const emptyFeed = await readFeedItems(page);
  expect(emptyFeed.items ?? []).toHaveLength(0);

  await loginAs(page, "u-teacher", "/teacher/health-file-bridge");
  await page.getByTestId("d05-health-file-input").setInputFiles({
    name: filename,
    mimeType: "application/pdf",
    buffer: Buffer.from(`${materialToken} 体温 39.0℃，高风险，明早复查，今晚继续观察。`),
  });
  await page
    .getByTestId("d05-health-preview-text")
    .fill(`${materialToken}：材料说明包含体温 39.0℃、high risk、明早复查和晚间观察。`);
  await screenshot(page, "01-li-health-material-ready.png");

  await page.getByTestId("d05-start-parse").click();
  await expect
    .poll(
      () =>
        page.evaluate(
          ({ healthKey, filename }) => {
            const healthMaterials = JSON.parse(window.localStorage.getItem(healthKey) ?? "[]") as Array<{
              filename?: string;
              parseStatus?: string;
            }>;
            return healthMaterials.find((material) => material.filename === filename)?.parseStatus ?? null;
          },
          { healthKey: HEALTH_MATERIALS_KEY, filename }
        ),
      { timeout: 10_000 }
    )
    .toBe("processing");
  await expect(page.getByTestId("d05-parse-result")).toContainText("本地演示解析", { timeout: 30_000 });
  await expect(page.getByTestId("d05-parse-result")).toContainText("T9 mapped");
  await screenshot(page, "02-li-local-demo-parse-result.png");

  await page.getByTestId("d05-save-parse").click();
  await expect(page.locator("body")).toContainText("刷新后仍可查看");
  await page.reload();
  await expect(page.getByTestId("d05-health-history")).toContainText(filename);
  await expect(page.getByTestId("d05-parse-result")).toContainText("本地演示解析");
  await screenshot(page, "03-li-parse-persists-after-refresh.png");

  await page.getByTestId("d05-create-consultation").click();
  await page.waitForURL(/\/teacher\/high-risk-consultation/);
  await expect(page.locator("body")).toContainText(filename, { timeout: 15_000 });
  const created = await readD05Persistence(page, filename, noteToken);
  expect(created.material?.materialId).toBeTruthy();
  expect(created.consultation).toMatchObject({
    childId: "c-1",
    workflowStatus: "pending",
    sourceMaterialId: created.material?.materialId,
    directorDecisionCard: { status: "pending" },
  });
  await screenshot(page, "04-li-consultation-created.png");

  await page.getByTestId("d05-consultation-note-input").fill(noteToken);
  await page.getByTestId("d05-consultation-note-send").click();
  await expect(page.getByTestId("d05-consultation-discussion")).toContainText(noteToken);
  await page.getByTestId("d05-consultation-status-in-progress").click();
  await expect(page.locator("body")).toContainText("会诊状态已更新为 处理中");
  await page.getByTestId("d05-consultation-status-resolved").click();
  await expect(page.locator("body")).toContainText("会诊状态已更新为 已解决");
  await page.reload();
  await expect(page.getByTestId("d05-consultation-discussion")).toContainText(noteToken);
  await expect(page.locator("body")).toContainText("已解决");
  await screenshot(page, "05-li-consultation-note-status-refresh.png");

  await loginAs(page, "u-teacher2", `/teacher/high-risk-consultation?childId=c-1`);
  await expect(page.locator("body")).not.toContainText(filename);
  await expect(page.locator("body")).not.toContainText(noteToken);
  await screenshot(page, "06-zhou-consultation-scope-isolated.png");

  await loginAs(page, "u-admin", "/admin");
  await expect(page.locator("body")).toContainText("林小雨");
  await expect(page.locator("body")).toContainText(filename);
  await screenshot(page, "07-chen-director-home-summary.png");

  await loginAs(page, "u-admin", "/admin/agent");
  await expect(page.locator("body")).toContainText("林小雨");
  await expect(page.locator("body")).toContainText(filename);
  await screenshot(page, "08-chen-director-agent-consultation-summary.png");

  await loginAs(page, "u-parent", "/parent?child=c-1");
  await expect(page.locator("body")).toContainText("健康材料摘要");
  await expect(page.locator("body")).toContainText("T9 mapped");
  await screenshot(page, "09-lin-parent-health-summary.png");

  const persisted = await readD05Persistence(page, filename, noteToken);
  expect(persisted.material).toMatchObject({
    childId: "c-1",
    filename,
    parseStatus: "completed",
  });
  expect(persisted.material?.parseResult).toMatchObject({
    sourceLabel: "本地演示解析",
  });
  expect(persisted.consultation).toMatchObject({
    childId: "c-1",
    workflowStatus: "resolved",
    sourceMaterialId: persisted.material?.materialId,
    directorDecisionCard: { status: "completed" },
  });
});
