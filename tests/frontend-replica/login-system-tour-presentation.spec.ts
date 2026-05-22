import { expect, test } from "@playwright/test";

async function expectSystemTourImageLoaded(page: import("@playwright/test").Page) {
  const image = page.getByTestId("system-tour-image");
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((node) => {
        if (!(node instanceof HTMLImageElement)) return false;
        return node.complete && node.naturalWidth > 0 && node.naturalHeight > 0;
      }),
    )
    .toBe(true);
}

test.describe("login system tour presentation", () => {
  test("login page opens image-backed system tour without loading the PDF renderer", async ({ page }) => {
    const blockedTourRendererRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/demo/huiyu-tongxing.pdf") || url.includes("/vendor/pdfjs/pdf.worker.mjs")) {
        blockedTourRendererRequests.push(url);
      }
    });

    await page.goto("/login");

    await expect(page.getByTestId("system-tour-open")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("v2.0.0");
    await expect(page.locator("body")).not.toContainText("客服支持");
    await expect(page.locator("body")).not.toContainText("400-888-2020");
    await expect(page.locator("body")).not.toContainText("推荐使用 Chrome / Edge 浏览器");

    await page.getByTestId("system-tour-open").click();

    const overlay = page.getByTestId("system-tour-overlay");
    await expect(overlay).toBeVisible();
    await expectSystemTourImageLoaded(page);
    await expect(page.getByTestId("system-tour-page-count")).toHaveText("1 / 22");
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);

    await page.getByTestId("system-tour-next").click();
    await expect(page.getByTestId("system-tour-page-count")).toHaveText("2 / 22");
    await expectSystemTourImageLoaded(page);

    await page.getByTestId("system-tour-prev").click();
    await expect(page.getByTestId("system-tour-page-count")).toHaveText("1 / 22");
    await expectSystemTourImageLoaded(page);

    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("system-tour-page-count")).toHaveText("2 / 22");

    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("system-tour-page-count")).toHaveText("3 / 22");
    await expectSystemTourImageLoaded(page);

    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("system-tour-page-count")).toHaveText("2 / 22");

    await page.keyboard.press("ArrowUp");
    await expect(page.getByTestId("system-tour-page-count")).toHaveText("1 / 22");

    await page.keyboard.press("Escape");
    await expect(overlay).toBeHidden();
    expect(blockedTourRendererRequests).toEqual([]);
  });
});
