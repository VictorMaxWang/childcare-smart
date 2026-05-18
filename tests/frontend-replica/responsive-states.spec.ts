import { expect, test } from "@playwright/test";
import { loginAs } from "../feature-completion/helpers";
import {
  expectChartTooltip,
  expectNoHorizontalOverflow,
} from "./r08-helpers";

const CHILD_ID = "c-1";

test.describe("FRONTEND-REPLICA-R08 responsive states", () => {
  test("desktop director charts keep responsive surface and keyboard focus", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, "u-admin", "/admin");

    await expect(page.getByTestId("r03-admin-chart-suite")).toBeVisible();
    await expect(page.getByTestId("r03-admin-trend-chart")).toBeVisible();
    await page.getByTestId("r03-admin-trend-chart").focus();
    await expect(page.getByTestId("r03-admin-trend-chart")).toBeFocused();
    await expectChartTooltip(page, "r03-admin-closure-combo");
    await expectNoHorizontalOverflow(page);
  });

  test("tablet director, teacher, and parent surfaces do not overflow", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });

    for (const route of ["/admin", "/teacher", `/parent?child=${CHILD_ID}`]) {
      await loginAs(page, route.startsWith("/admin") ? "u-admin" : route.startsWith("/teacher") ? "u-teacher" : "u-parent", route);
      await expect(page.getByTestId("r02-app-shell")).toBeVisible();
      await expect(page.getByTestId("r02-mobile-bottom-nav")).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });

  test("mobile role pages keep bottom nav, voice entry, and teacher voice entries separated", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto("/login");
    await expect(page.locator("body")).not.toHaveText("");
    await expectNoHorizontalOverflow(page);

    await loginAs(page, "u-admin", "/admin");
    await expect(page.getByTestId("r02-mobile-bottom-nav")).toBeVisible();
    await expect(page.getByTestId("voice-orb-button")).toBeVisible();
    await expect(page.getByTestId("voice-orb-button")).toHaveClass(/rounded-full/);
    await expect(page.getByTestId("voice-orb-button")).toHaveClass(/from-indigo-500/);
    await expectNoHorizontalOverflow(page);

    await loginAs(page, "u-teacher", "/teacher");
    await expect(page.getByTestId("r06-teacher-voice-button")).toBeVisible();
    await expect(page.getByTestId("r06-teacher-command-assistant")).toBeVisible();
    await expect(page.getByTestId("voice-orb-button")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    await loginAs(page, "u-parent", `/parent?child=${CHILD_ID}`);
    await expect(page.getByTestId("r02-mobile-bottom-nav")).toBeVisible();
    await expect(page.getByTestId("voice-orb-button")).toBeVisible();
    await expect(page.getByTestId("voice-orb-button")).toHaveClass(/rounded-full/);
    await expect(page.getByTestId("voice-orb-button")).toHaveClass(/from-indigo-500/);
    await expectNoHorizontalOverflow(page);
  });
});
