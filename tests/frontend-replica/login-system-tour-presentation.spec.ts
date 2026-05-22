import { promises as fs } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import sharp from "sharp";

const TOUR_PAGE_COUNT = 22;
const TOUR_PAGES = Array.from({ length: TOUR_PAGE_COUNT }, (_, index) => index + 1);
const TOUR_ROOT = path.resolve(process.cwd(), "public", "demo", "system-tour", "v3");
const PREVIEW_DIR = path.join(TOUR_ROOT, "preview");
const DISPLAY_DIR = path.join(TOUR_ROOT, "display");
const PREVIEW_WEBP_FIRST_PAGE_BUDGET = 40 * 1024;
const PREVIEW_WEBP_TOTAL_BUDGET = 750 * 1024;
const PREVIEW_AVIF_TOTAL_BUDGET = 450 * 1024;
const DISPLAY_AVIF_FIRST_PAGE_BUDGET = 95 * 1024;
const DISPLAY_WEBP_FIRST_PAGE_BUDGET = 180 * 1024;
const MIN_DISPLAY_IMAGE_WIDTH = 1200;

async function expectSystemTourDisplayImageLoaded(page: import("@playwright/test").Page) {
  const image = page.getByTestId("system-tour-image");
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((node) => {
        if (!(node instanceof HTMLImageElement)) return null;
        return {
          complete: node.complete,
          naturalWidth: node.naturalWidth,
          naturalHeight: node.naturalHeight,
          currentSrc: node.currentSrc,
        };
      }),
    )
    .toMatchObject({
      complete: true,
      naturalWidth: expect.any(Number),
      naturalHeight: expect.any(Number),
      currentSrc: expect.stringContaining("/demo/system-tour/v3/display/"),
    });

  await expect.poll(() => image.evaluate((node) => (node instanceof HTMLImageElement ? node.naturalWidth : 0))).toBeGreaterThanOrEqual(
    MIN_DISPLAY_IMAGE_WIDTH,
  );
}

async function sumAssetBytes(dir: string, files: string[]) {
  const sizes = await Promise.all(files.map((file) => fs.stat(path.join(dir, file)).then((stats) => stats.size)));
  return sizes.reduce((total, size) => total + size, 0);
}

test.describe("login system tour presentation", () => {
  test.use({ viewport: { width: 1365, height: 768 } });

  test("system tour assets stay clear enough without regressing weak-network budgets", async () => {
    const previewFiles = await fs.readdir(PREVIEW_DIR);
    const displayFiles = await fs.readdir(DISPLAY_DIR);
    const previewWebpFiles = previewFiles.filter((file) => /^page-\d+\.webp$/i.test(file)).sort();
    const previewAvifFiles = previewFiles.filter((file) => /^page-\d+\.avif$/i.test(file)).sort();
    const displayWebpFiles = displayFiles.filter((file) => /^page-\d+\.webp$/i.test(file)).sort();
    const displayAvifFiles = displayFiles.filter((file) => /^page-\d+\.avif$/i.test(file)).sort();

    expect(previewWebpFiles).toHaveLength(TOUR_PAGE_COUNT);
    expect(previewAvifFiles).toHaveLength(TOUR_PAGE_COUNT);
    expect(displayWebpFiles).toHaveLength(TOUR_PAGE_COUNT);
    expect(displayAvifFiles).toHaveLength(TOUR_PAGE_COUNT);

    const previewFirstWebpBytes = (await fs.stat(path.join(PREVIEW_DIR, "page-01.webp"))).size;
    const displayFirstAvifBytes = (await fs.stat(path.join(DISPLAY_DIR, "page-01.avif"))).size;
    const displayFirstWebpBytes = (await fs.stat(path.join(DISPLAY_DIR, "page-01.webp"))).size;
    const totalPreviewWebpBytes = await sumAssetBytes(PREVIEW_DIR, previewWebpFiles);
    const totalPreviewAvifBytes = await sumAssetBytes(PREVIEW_DIR, previewAvifFiles);
    const displayFirstMetadata = await sharp(path.join(DISPLAY_DIR, "page-01.webp")).metadata();

    expect(previewFirstWebpBytes).toBeLessThanOrEqual(PREVIEW_WEBP_FIRST_PAGE_BUDGET);
    expect(totalPreviewWebpBytes).toBeLessThanOrEqual(PREVIEW_WEBP_TOTAL_BUDGET);
    expect(totalPreviewAvifBytes).toBeLessThanOrEqual(PREVIEW_AVIF_TOTAL_BUDGET);
    expect(displayFirstAvifBytes).toBeLessThanOrEqual(DISPLAY_AVIF_FIRST_PAGE_BUDGET);
    expect(displayFirstWebpBytes).toBeLessThanOrEqual(DISPLAY_WEBP_FIRST_PAGE_BUDGET);
    expect(displayFirstMetadata.width).toBeGreaterThanOrEqual(MIN_DISPLAY_IMAGE_WIDTH);
  });

  test("login page opens a full-size clear image-backed system tour", async ({ page }) => {
    const blockedTourRendererRequests: string[] = [];
    const displayPageRequests = new Set<number>();

    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/demo/huiyu-tongxing.pdf") || url.includes("/vendor/pdfjs/pdf.worker.mjs")) {
        blockedTourRendererRequests.push(url);
      }

      const displayMatch = url.match(/\/demo\/system-tour\/v3\/display\/page-(\d+)\.(?:avif|webp)(?:[?#]|$)/);
      if (displayMatch) {
        displayPageRequests.add(Number(displayMatch[1]));
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
    await expectSystemTourDisplayImageLoaded(page);
    await expect(page.getByTestId("system-tour-page-count")).toHaveText("1 / 22");
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);

    const box = await image.boundingBox();
    expect(box?.width).toBeGreaterThan(900);
    expect(box?.height).toBeGreaterThan(650);

    await expect
      .poll(() => [1, 2, 3].every((tourPage) => displayPageRequests.has(tourPage)), { timeout: 10_000 })
      .toBe(true);

    await page.getByTestId("system-tour-next").click();
    await expect(page.getByTestId("system-tour-page-count")).toHaveText("2 / 22");
    await expectSystemTourDisplayImageLoaded(page);

    await page.getByTestId("system-tour-prev").click();
    await expect(page.getByTestId("system-tour-page-count")).toHaveText("1 / 22");
    await expectSystemTourDisplayImageLoaded(page);

    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("system-tour-page-count")).toHaveText("2 / 22");

    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("system-tour-page-count")).toHaveText("3 / 22");
    await expectSystemTourDisplayImageLoaded(page);

    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("system-tour-page-count")).toHaveText("2 / 22");

    await page.keyboard.press("ArrowUp");
    await expect(page.getByTestId("system-tour-page-count")).toHaveText("1 / 22");

    for (let expectedPage = 2; expectedPage <= TOUR_PAGE_COUNT; expectedPage += 1) {
      await page.getByTestId("system-tour-next").click();
      await expect(page.getByTestId("system-tour-page-count")).toHaveText(`${expectedPage} / 22`);
      await expectSystemTourDisplayImageLoaded(page);
    }

    await expect.poll(() => TOUR_PAGES.slice(0, 4).every((tourPage) => displayPageRequests.has(tourPage))).toBe(true);

    await page.keyboard.press("Escape");
    await expect(overlay).toBeHidden();
    expect(blockedTourRendererRequests).toEqual([]);
  });
});
