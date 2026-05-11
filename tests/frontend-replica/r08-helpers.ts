import { expect, type Locator, type Page } from "@playwright/test";

export async function expectNoHorizontalOverflow(page: Page) {
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasOverflow).toBe(false);
}

export async function expectNoBrokenImages(page: Page) {
  const brokenImages = await page.locator("img").evaluateAll((images) =>
    images.filter((node) => {
      const image = node as HTMLImageElement;
      return image.complete && image.naturalWidth === 0;
    }).length
  );
  expect(brokenImages).toBe(0);
}

export async function expectLocatorCenterIsTopmost(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  const isTopmost = await locator.evaluate(
    (element, point) => {
      const hit = document.elementFromPoint(point.x, point.y);
      return Boolean(hit && (hit === element || element.contains(hit)));
    },
    { x, y }
  );
  expect(isTopmost).toBe(true);
}

export async function expectNoIntersection(left: Locator, right: Locator) {
  const [leftBox, rightBox] = await Promise.all([left.boundingBox(), right.boundingBox()]);
  if (!leftBox || !rightBox) return;
  const overlapX = Math.max(0, Math.min(leftBox.x + leftBox.width, rightBox.x + rightBox.width) - Math.max(leftBox.x, rightBox.x));
  const overlapY = Math.max(0, Math.min(leftBox.y + leftBox.height, rightBox.y + rightBox.height) - Math.max(leftBox.y, rightBox.y));
  expect(overlapX * overlapY).toBe(0);
}

export async function expectChartTooltip(page: Page, testId: string) {
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
