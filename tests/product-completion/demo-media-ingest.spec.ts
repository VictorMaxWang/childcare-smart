import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { demoContext, expectOk } from "./e11-helpers";

type ManifestAsset = {
  id: string;
  category?: string;
  src?: string;
  path?: string;
  syntheticDemo?: boolean;
  safetyStatus?: string;
};

const GPT_ROOT = path.join(process.cwd(), "public", "demo-media", "gpt-image2");
const MANIFEST_PATH = path.join(process.cwd(), "public", "demo-media", "manifest.json");
const CATEGORIES = ["meals", "health-materials", "growth", "storybooks"] as const;

function readAcceptedAssets() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as { assets: ManifestAsset[] };
  return manifest.assets.filter(
    (asset) => asset.syntheticDemo === true && asset.safetyStatus === "accepted"
  );
}

function assetSrc(asset: ManifestAsset) {
  return asset.src ?? asset.path ?? "";
}

test("M03 GPT Image 2 manifest and optimized files are present", async ({ request }) => {
  expect(fs.existsSync(GPT_ROOT)).toBe(true);

  const acceptedAssets = readAcceptedAssets();
  expect(acceptedAssets.length).toBeGreaterThan(0);

  for (const category of CATEGORIES) {
    expect(acceptedAssets.filter((asset) => asset.category === category).length, category).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(GPT_ROOT, category))).toBe(true);
  }

  for (const asset of acceptedAssets) {
    const src = assetSrc(asset);
    expect(src).toMatch(/^\/demo-media\/gpt-image2\//);
    expect(src).not.toMatch(/[A-Za-z]:\\/);
    expect(fs.existsSync(path.join(process.cwd(), "public", src))).toBe(true);
    const response = await request.get(src);
    expect(response.status(), src).toBe(200);
  }
});

test("M03 demo data uses GPT Image 2 assets while preserving 36/18/18 scoping", async ({}, testInfo) => {
  const director = await demoContext(testInfo, "u-admin");
  const teacherLi = await demoContext(testInfo, "u-teacher");
  const teacherZhou = await demoContext(testInfo, "u-teacher2");
  const parent = await demoContext(testInfo, "u-parent");

  const directorChildren = await expectOk<Array<{ id: string }>>(await director.get("/api/children"));
  const liChildren = await expectOk<Array<{ id: string }>>(await teacherLi.get("/api/children"));
  const zhouChildren = await expectOk<Array<{ id: string }>>(await teacherZhou.get("/api/children"));
  expect(directorChildren).toHaveLength(36);
  expect(liChildren).toHaveLength(18);
  expect(zhouChildren).toHaveLength(18);

  const meals = await expectOk<Array<{ mediaRefs?: string[]; photoUrls?: string[] }>>(
    await director.get("/api/records?type=meal")
  );
  const liMeals = await expectOk<Array<{ childId: string }>>(await teacherLi.get("/api/records?type=meal"));
  const zhouMeals = await expectOk<Array<{ childId: string }>>(await teacherZhou.get("/api/records?type=meal"));
  const growth = await expectOk<Array<{ mediaRefs?: string[]; mediaUrls?: string[] }>>(
    await director.get("/api/records?type=growth")
  );
  const materials = await expectOk<Array<{ parseResult?: { mediaRefs?: string[] } }>>(
    await director.get("/api/health-materials")
  );
  const storybooks = await expectOk<Array<{ pages?: Array<{ mediaRef?: string; fallbackMediaRef?: string }> }>>(
    await parent.get("/api/storybooks?childId=c-4")
  );

  expect(liMeals.length).toBeGreaterThan(0);
  expect(zhouMeals.length).toBeGreaterThan(0);
  expect(meals.some((record) => [...(record.mediaRefs ?? []), ...(record.photoUrls ?? [])].some((src) => src.includes("gpt-image2/meals")))).toBe(true);
  expect(growth.some((record) => [...(record.mediaRefs ?? []), ...(record.mediaUrls ?? [])].some((src) => src.includes("gpt-image2/growth")))).toBe(true);
  expect(materials.some((material) => material.parseResult?.mediaRefs?.some((src) => src.includes("gpt-image2/health-materials")))).toBe(true);
  expect(
    storybooks.some((storybook) =>
      storybook.pages?.some((page) => page.mediaRef?.includes("gpt-image2/storybooks") && page.fallbackMediaRef?.includes("demo-storybook-placeholder"))
    )
  ).toBe(true);
});

test("M03 key pages render GPT Image 2 media and tolerate fallback routes", async ({ page, context }) => {
  await context.clearCookies();
  await page.request.post("/api/auth/demo-login", { data: { accountId: "u-teacher" } });
  await page.goto("/diet");
  await expect(page.locator('img[src*="gpt-image2"]').first()).toBeVisible();
  await expect(page.locator('img[src*="demo-meal-placeholder"]')).toHaveCount(0);

  await context.clearCookies();
  await page.request.post("/api/auth/demo-login", { data: { accountId: "u-parent" } });
  await page.goto("/parent/storybook?child=c-1");
  await expect(page.getByText("林小雨的一小步勇敢").first()).toBeVisible();
  await expect(page.locator('img[src*="/demo-media/storybooks/lin-xiaoyu/images/page-01.webp"]').first()).toBeVisible();
  expect((await page.request.get("/demo-media/storybooks/lin-xiaoyu/images/page-01.webp")).status()).toBe(200);
  await page.goto("/parent/storybook?child=c-4");
  await expect(page.locator('img[src*="gpt-image2"]').first()).toBeVisible();
  expect(await page.locator('img[src*="demo-storybook-placeholder"]').count()).toBeLessThan(
    await page.locator("img").count()
  );
  await page.reload();
  await expect(page.locator('img[src*="gpt-image2"]').first()).toBeVisible();

  await page.goto("/parent/storybook?child=c-3");
  await expect(page.locator("body")).not.toHaveText("");

  await page.goto("/growth?child=c-1");
  const growthImage = page.getByTestId("growth-record-image").first();
  await expect(growthImage).toBeVisible();
  const growthSrc = await growthImage.getAttribute("src");
  expect(growthSrc).toBeTruthy();
  expect(growthSrc).not.toMatch(/[A-Za-z]:\\/);
  expect(growthSrc).toMatch(/^\/demo-media\/(?:gpt-image2\/growth\/|growth\/)/);
  expect((await page.request.get(growthSrc!)).status(), growthSrc!).toBe(200);
});
