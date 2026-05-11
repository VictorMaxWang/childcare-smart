import { expect, test } from "@playwright/test";
import { loginAs } from "../feature-completion/helpers";
import { expectLocatorCenterIsTopmost, expectNoBrokenImages, expectNoHorizontalOverflow } from "./r08-helpers";

const CHILD_ID = "c-1";

test.describe("FRONTEND-REPLICA-R08 mobile and tablet", () => {
  test("mobile parent storybook keeps fixed images, text, audio controls, and safe bottom actions", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, "u-parent", `/parent/storybook?child=lin-xiaoyu`);

    await expect(page.getByTestId("lin-xiaoyu-fixed-storybook")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("lin-xiaoyu-page-text")).toBeVisible();
    await expect(page.getByTestId("lin-xiaoyu-play-book")).toBeVisible();
    await expectLocatorCenterIsTopmost(page.getByTestId("lin-xiaoyu-play-page"));
    await expectNoBrokenImages(page);
    await expectNoHorizontalOverflow(page);
  });

  test("mobile parent feedback submit is not covered by voice orb or bottom navigation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, "u-parent", `/parent/agent?child=${CHILD_ID}#feedback`);

    const submit = page.getByTestId("parent-submit-structured-feedback");
    await expect(submit).toBeVisible();
    await expectLocatorCenterIsTopmost(submit);
    await expectNoHorizontalOverflow(page);
  });

  test("tablet director charts, teacher health bridge, and parent growth remain readable", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });

    await loginAs(page, "u-admin", "/admin");
    await expect(page.getByTestId("r03-admin-chart-suite")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await loginAs(page, "u-teacher", "/diet");
    await expect(page.locator("main")).toContainText(/饮食|记录|餐/i);
    await expectNoHorizontalOverflow(page);

    await loginAs(page, "u-parent", `/growth?child=${CHILD_ID}`);
    await expect(page.locator("main")).toContainText(/成长|档案|行为/i);
    await expectNoBrokenImages(page);
    await expectNoHorizontalOverflow(page);
  });
});
