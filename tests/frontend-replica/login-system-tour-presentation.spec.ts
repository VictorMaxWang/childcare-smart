import { expect, test } from "@playwright/test";

test.describe("login system tour presentation", () => {
  test("login page opens browser-contained PDF system tour", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByTestId("system-tour-open")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("v2.0.0");
    await expect(page.locator("body")).not.toContainText("客服支持");
    await expect(page.locator("body")).not.toContainText("400-888-2020");
    await expect(page.locator("body")).not.toContainText("推荐使用 Chrome / Edge 浏览器");

    await page.getByTestId("system-tour-open").click();

    const overlay = page.getByTestId("system-tour-overlay");
    await expect(overlay).toBeVisible();
    await expect(page.getByTestId("system-tour-canvas")).toBeVisible();
    await expect(page.getByTestId("system-tour-page-count")).toHaveText("1 / 22", { timeout: 30_000 });
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);

    await page.getByTestId("system-tour-next").click();
    await expect(page.getByTestId("system-tour-page-count")).toHaveText("2 / 22");

    await page.getByTestId("system-tour-prev").click();
    await expect(page.getByTestId("system-tour-page-count")).toHaveText("1 / 22");

    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("system-tour-page-count")).toHaveText("2 / 22");

    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("system-tour-page-count")).toHaveText("3 / 22");

    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("system-tour-page-count")).toHaveText("2 / 22");

    await page.keyboard.press("ArrowUp");
    await expect(page.getByTestId("system-tour-page-count")).toHaveText("1 / 22");

    await page.keyboard.press("Escape");
    await expect(overlay).toBeHidden();
  });
});
