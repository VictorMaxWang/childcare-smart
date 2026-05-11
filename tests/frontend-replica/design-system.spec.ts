import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "../feature-completion/helpers";

const ASSET_404_PATTERN = /\.(?:png|jpe?g|webp|svg|json|avif)(?:\?|$)/i;

const requiredPublicAssets = [
  "/pixel-replica/manifest.json",
  "/pixel-replica/login/brand-shield.png",
  "/pixel-replica/login/hero-illustration.png",
  "/pixel-replica/illustrations/login-left-illustration.png",
  "/pixel-replica/parent/parent-home-ai-robot.png",
  "/pixel-replica/parent/parent-agent-robot.png",
  "/pixel-replica/storybook/storybook-illustration-panel.png",
  "/demo-media/manifest.json",
  "/demo-media/gpt-image2/growth/demo-growth-auto-001.webp",
];

function collectAsset404s(page: Page) {
  const missingAssets: string[] = [];
  page.on("response", (response) => {
    if (response.status() === 404 && ASSET_404_PATTERN.test(response.url())) {
      missingAssets.push(response.url());
    }
  });
  return missingAssets;
}

async function expectNoBrokenLoadedImages(page: Page) {
  const broken = await page.locator("img").evaluateAll((images) =>
    images
      .map((image) => {
        const img = image as HTMLImageElement;
        return {
          src: img.currentSrc || img.src,
          complete: img.complete,
          width: img.naturalWidth,
        };
      })
      .filter((image) => image.src && image.complete && image.width === 0)
  );
  expect(broken).toEqual([]);
}

async function expectVisibleHref(page: Page, hrefPart: string) {
  const visible = await page.locator(`a[href*="${hrefPart}"]`).evaluateAll((links) =>
    links.some((link) => {
      const rect = link.getBoundingClientRect();
      const style = window.getComputedStyle(link);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    })
  );
  expect(visible, `expected visible link containing ${hrefPart}`).toBe(true);
}

async function expectRoleShell(page: Page, role: "director" | "teacher" | "parent", hrefPart: string) {
  const missingAssets = collectAsset404s(page);
  await expect(page.getByTestId("r02-app-shell")).toHaveAttribute("data-role-shell", role);
  await expect(page.getByTestId("r02-shell-topbar")).toBeVisible();
  await expectVisibleHref(page, hrefPart);
  await expectNoBrokenLoadedImages(page);
  expect(missingAssets).toEqual([]);
}

test.describe("FRONTEND-REPLICA-R02 design system shell", () => {
  test("login shell keeps replica assets and real form controls", async ({ page, request }) => {
    const missingAssets = collectAsset404s(page);
    await page.goto("/login");

    await expect(page.getByTestId("login-username")).toBeVisible();
    await expect(page.getByTestId("login-password")).toBeVisible();
    await expect(page.getByTestId("demo-account-u-admin")).toBeVisible();
    await expect(page.getByTestId("demo-account-u-teacher")).toBeVisible();
    await expect(page.getByTestId("demo-account-u-parent")).toBeVisible();
    await expectNoBrokenLoadedImages(page);

    for (const asset of requiredPublicAssets) {
      const response = await request.get(asset);
      expect(response.status(), asset).toBeLessThan(400);
    }

    expect(missingAssets).toEqual([]);
  });

  test("director shell exposes topbar sidebar and AI entry", async ({ page }) => {
    await loginAs(page, "u-admin", "/admin");
    await expectRoleShell(page, "director", "/admin/agent");
    await expect(page.getByTestId("r02-shell-sidebar")).toBeVisible();
    await expect(page.getByTestId("r02-shell-breadcrumb")).toBeVisible();
  });

  test("teacher shell exposes topbar tabs and AI entry", async ({ page }) => {
    await loginAs(page, "u-teacher", "/teacher");
    await expectRoleShell(page, "teacher", "/teacher/agent");
  });

  test("parent shell preserves child scoped route and AI entry", async ({ page }) => {
    await loginAs(page, "u-parent", "/parent?child=c-1");
    await expectRoleShell(page, "parent", "/parent/agent");
    expect(new URL(page.url()).searchParams.get("child")).toBe("c-1");
  });

  test("mobile shell uses bottom navigation and keeps AI entry visible", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, "u-admin", "/admin");

    await expect(page.getByTestId("r02-app-shell")).toHaveAttribute("data-role-shell", "director");
    await expect(page.getByTestId("r02-shell-topbar")).toBeVisible();
    await expect(page.getByTestId("r02-mobile-bottom-nav")).toBeVisible();
    await expect(page.getByTestId("r02-shell-sidebar")).toBeHidden();
    await expectVisibleHref(page, "/admin/agent");
    await expectNoBrokenLoadedImages(page);
  });
});
