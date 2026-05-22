import { promises as fs } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const TOUR_PAGE_COUNT = 22;
const TOUR_PAGES = Array.from({ length: TOUR_PAGE_COUNT }, (_, index) => index + 1);
const PREVIEW_DIR = path.resolve(process.cwd(), "public", "demo", "system-tour", "v2", "preview");
const PREVIEW_WEBP_FIRST_PAGE_BUDGET = 40 * 1024;
const PREVIEW_WEBP_TOTAL_BUDGET = 750 * 1024;
const PREVIEW_AVIF_TOTAL_BUDGET = 450 * 1024;

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

async function sumAssetBytes(files: string[]) {
  const sizes = await Promise.all(files.map((file) => fs.stat(path.join(PREVIEW_DIR, file)).then((stats) => stats.size)));
  return sizes.reduce((total, size) => total + size, 0);
}

test.describe("login system tour presentation", () => {
  test("system tour preview assets stay within weak-network budgets", async () => {
    const files = await fs.readdir(PREVIEW_DIR);
    const previewWebpFiles = files.filter((file) => /^page-\d+\.webp$/i.test(file)).sort();
    const previewAvifFiles = files.filter((file) => /^page-\d+\.avif$/i.test(file)).sort();

    expect(previewWebpFiles).toHaveLength(TOUR_PAGE_COUNT);
    expect(previewAvifFiles).toHaveLength(TOUR_PAGE_COUNT);

    const firstWebpBytes = (await fs.stat(path.join(PREVIEW_DIR, "page-01.webp"))).size;
    const totalWebpBytes = await sumAssetBytes(previewWebpFiles);
    const totalAvifBytes = await sumAssetBytes(previewAvifFiles);

    expect(firstWebpBytes).toBeLessThanOrEqual(PREVIEW_WEBP_FIRST_PAGE_BUDGET);
    expect(totalWebpBytes).toBeLessThanOrEqual(PREVIEW_WEBP_TOTAL_BUDGET);
    expect(totalAvifBytes).toBeLessThanOrEqual(PREVIEW_AVIF_TOTAL_BUDGET);
  });

  test("login page opens image-backed system tour and preloads every preview page", async ({ page }) => {
    const blockedTourRendererRequests: string[] = [];
    const previewPageRequests = new Set<number>();

    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/demo/huiyu-tongxing.pdf") || url.includes("/vendor/pdfjs/pdf.worker.mjs")) {
        blockedTourRendererRequests.push(url);
      }

      const previewMatch = url.match(/\/demo\/system-tour\/v2\/preview\/page-(\d+)\.(?:avif|webp)(?:[?#]|$)/);
      if (previewMatch) {
        previewPageRequests.add(Number(previewMatch[1]));
      }
    });

    await page.goto("/login");

    const openButton = page.getByTestId("system-tour-open");
    await expect(openButton).toBeVisible();
    await expect(page.locator("body")).not.toContainText("v2.0.0");
    await expect(page.locator("body")).not.toContainText("瀹㈡湇鏀寔");
    await expect(page.locator("body")).not.toContainText("400-888-2020");
    await expect(page.locator("body")).not.toContainText("鎺ㄨ崘浣跨敤 Chrome / Edge 娴忚鍣?");

    await openButton.hover();
    await openButton.click();

    const overlay = page.getByTestId("system-tour-overlay");
    const image = page.getByTestId("system-tour-image");

    await expect(overlay).toBeVisible();
    await expectSystemTourImageLoaded(page);
    await expect(page.getByTestId("system-tour-page-count")).toHaveText("1 / 22");
    await expect.poll(() => image.evaluate((node) => (node instanceof HTMLImageElement ? node.currentSrc : ""))).toContain(
      "/demo/system-tour/v2/",
    );
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);

    await expect
      .poll(
        () => TOUR_PAGES.slice(3).every((tourPage) => previewPageRequests.has(tourPage)),
        { timeout: 10_000 },
      )
      .toBe(true);

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

    for (let expectedPage = 2; expectedPage <= TOUR_PAGE_COUNT; expectedPage += 1) {
      await page.getByTestId("system-tour-next").click();
      await expect(page.getByTestId("system-tour-page-count")).toHaveText(`${expectedPage} / 22`);
      await expectSystemTourImageLoaded(page);
    }

    await page.keyboard.press("Escape");
    await expect(overlay).toBeHidden();
    expect(blockedTourRendererRequests).toEqual([]);
  });
});
