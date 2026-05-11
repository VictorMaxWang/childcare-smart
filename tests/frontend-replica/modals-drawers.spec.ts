import { expect, test } from "@playwright/test";
import { loginAs } from "../feature-completion/helpers";
import { expectLocatorCenterIsTopmost, expectNoHorizontalOverflow } from "./r08-helpers";

test.describe("FRONTEND-REPLICA-R08 modals and drawers", () => {
  test("child form validates, closes with Escape, and archive confirm gates writes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, "u-admin", "/children");

    await page.getByTestId("e02-open-add-child").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByTestId("e02-child-name").fill("");
    await page.getByTestId("e02-save-child").click();
    await expect(page.getByRole("alert").filter({ hasText: "请至少填写" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    let archiveRequests = 0;
    await page.route(/\/api\/children\/[^/]+\/archive$/, async (route) => {
      archiveRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { id: "r08-child", name: "R08 Child" } }),
      });
    });

    const archiveButton = page
      .locator('[data-testid^="e02-archive-child-mobile-"]:visible, [data-testid^="e02-archive-child-"]:visible')
      .first();
    await archiveButton.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "取消" }).click();
    expect(archiveRequests).toBe(0);

    await archiveButton.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectLocatorCenterIsTopmost(page.getByTestId("r08-confirm-dialog-confirm"));
    await page.getByTestId("r08-confirm-dialog-confirm").click();
    await expect.poll(() => archiveRequests).toBe(1);
  });

  test("teacher management uses shared confirm dialog for archive/restore", async ({ page }) => {
    await loginAs(page, "u-admin", "/admin/teachers");

    let archiveRequests = 0;
    await page.route(/\/api\/teachers\/[^/]+\/archive$/, async (route) => {
      archiveRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { teacherId: "r08-teacher", name: "R08 Teacher" } }),
      });
    });

    await page.locator('[data-testid^="e02-archive-teacher-"]').first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "取消" }).click();
    expect(archiveRequests).toBe(0);

    await page.locator('[data-testid^="e02-archive-teacher-"]').first().click();
    await page.getByTestId("r08-confirm-dialog-confirm").click();
    await expect.poll(() => archiveRequests).toBe(1);
  });

  test("feedback detail dialog and health parse sheet are Radix-layered mobile surfaces", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await loginAs(page, "u-admin", "/admin");
    await page.getByTestId("admin-open-feedback-detail").click();
    await expect(page.getByTestId("feedback-detail-dialog")).toBeVisible();
    await expectLocatorCenterIsTopmost(page.getByTestId("feedback-detail-dialog"));
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("feedback-detail-dialog")).toHaveCount(0);

    await loginAs(page, "u-teacher", "/teacher/health-file-bridge");
    await page.getByTestId("d05-health-preview-text").fill("R08 health material parse fallback check. fever 38.2, milk allergy.");
    await page.getByTestId("d05-start-parse").click();
    await expect(page.getByTestId("d05-parse-result-sheet")).toBeVisible({ timeout: 30_000 });
    await expectNoHorizontalOverflow(page);
  });
});
