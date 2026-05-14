import { expect, test } from "@playwright/test";

test.describe("login demo presentation", () => {
  test("login page opens browser-contained PDF presentation mode", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByTestId("demo-presentation-open")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("v2.0.0");
    await expect(page.locator("body")).not.toContainText("客服支持");
    await expect(page.locator("body")).not.toContainText("400-888-2020");
    await expect(page.locator("body")).not.toContainText("推荐使用 Chrome / Edge 浏览器");

    await page.getByTestId("demo-presentation-open").click();

    const overlay = page.getByTestId("demo-presentation-overlay");
    await expect(overlay).toBeVisible();
    await expect(page.getByTestId("demo-presentation-canvas")).toBeVisible();
    await expect(page.getByTestId("demo-presentation-page-count")).toHaveText("1 / 22", { timeout: 30_000 });
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);

    await page.getByTestId("demo-presentation-next").click();
    await expect(page.getByTestId("demo-presentation-page-count")).toHaveText("2 / 22");

    await page.getByTestId("demo-presentation-prev").click();
    await expect(page.getByTestId("demo-presentation-page-count")).toHaveText("1 / 22");

    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("demo-presentation-page-count")).toHaveText("2 / 22");

    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("demo-presentation-page-count")).toHaveText("3 / 22");

    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("demo-presentation-page-count")).toHaveText("2 / 22");

    await page.keyboard.press("ArrowUp");
    await expect(page.getByTestId("demo-presentation-page-count")).toHaveText("1 / 22");

    await page.keyboard.press("Escape");
    await expect(overlay).toBeHidden();
  });
});
