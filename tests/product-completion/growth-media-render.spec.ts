import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { demoContext, expectOk } from "./e11-helpers";

async function loginAs(page: Page, accountId: string, path: string) {
  await page.context().clearCookies();
  const loginResponse = await page.request.post("/api/auth/demo-login", { data: { accountId } });
  expect(loginResponse.ok()).toBe(true);
  await page.goto(path);
}

async function expectGrowthImage200(page: Page) {
  const images = page.getByTestId("growth-record-image");
  await expect(images.first()).toBeVisible();
  const src = await images.first().getAttribute("src");
  expect(src).toBeTruthy();
  expect(src).not.toMatch(/[A-Za-z]:\\/);
  expect(src).toMatch(/^\/demo-media\/(?:gpt-image2\/growth\/|growth\/)/);
  const response = await page.request.get(src!);
  expect(response.status(), src!).toBe(200);
  return src!;
}

async function expectDataConsistency(testInfo: TestInfo) {
  const director = await demoContext(testInfo, "u-admin");
  const teacherLi = await demoContext(testInfo, "u-teacher");
  const teacherZhou = await demoContext(testInfo, "u-teacher2");

  const directorChildren = await expectOk<Array<{ id: string }>>(await director.get("/api/children"));
  const liChildren = await expectOk<Array<{ id: string }>>(await teacherLi.get("/api/children"));
  const zhouChildren = await expectOk<Array<{ id: string }>>(await teacherZhou.get("/api/children"));

  expect(directorChildren).toHaveLength(36);
  expect(liChildren).toHaveLength(18);
  expect(zhouChildren).toHaveLength(18);
}

test("M05 parent growth page renders GPT Image 2 growth media and survives refresh", async ({ page }, testInfo) => {
  const parent = await demoContext(testInfo, "u-parent");
  const growth = await expectOk<Array<{ childId: string; mediaRefs?: string[]; mediaUrls?: string[] }>>(
    await parent.get("/api/records?type=growth&childId=c-1")
  );
  expect(growth.length).toBeGreaterThan(0);
  expect(
    growth.some((record) =>
      [...(record.mediaRefs ?? []), ...(record.mediaUrls ?? [])].some((src) =>
        src.includes("/demo-media/gpt-image2/growth/")
      )
    )
  ).toBe(true);

  await loginAs(page, "u-parent", "/growth?child=c-1");
  await expect(page.getByTestId("growth-record-card").first()).toBeVisible();
  const firstSrc = await expectGrowthImage200(page);
  expect(firstSrc).toContain("/demo-media/gpt-image2/growth/");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("growth-record-card").first()).toBeVisible();
  await expectGrowthImage200(page);
});

test("M05 teacher growth scopes render images without leaking another class", async ({ page }, testInfo) => {
  await loginAs(page, "u-teacher", "/growth");
  await expect(page.getByTestId("growth-record-card").first()).toBeVisible();
  await expect(page.locator('[data-testid="growth-record-card"][data-child-id="c-1"]').first()).toBeVisible();
  const liSrc = await expectGrowthImage200(page);
  expect(liSrc).toContain("/demo-media/gpt-image2/growth/");

  await loginAs(page, "u-teacher2", "/growth");
  await expect(page.getByTestId("growth-record-card").first()).toBeVisible();
  expect(await page.locator('[data-testid="growth-record-card"][data-child-id="c-1"]').count()).toBe(0);
  expect(await page.locator('[data-testid="growth-record-card"][data-child-id="c-3"]').count()).toBeGreaterThan(0);
  const zhouSrc = await expectGrowthImage200(page);
  expect(zhouSrc).toContain("/demo-media/gpt-image2/growth/");

  await expectDataConsistency(testInfo);
});

test("M05 existing meal, health material, and storybook media remain intact", async ({ page }, testInfo) => {
  const director = await demoContext(testInfo, "u-admin");
  const materials = await expectOk<Array<{ parseResult?: { mediaRefs?: string[] } }>>(
    await director.get("/api/health-materials")
  );
  const healthSrc = materials
    .flatMap((material) => material.parseResult?.mediaRefs ?? [])
    .find((src) => src.includes("/demo-media/gpt-image2/health-materials/"));
  expect(healthSrc).toBeTruthy();
  expect((await page.request.get(healthSrc!)).status(), healthSrc!).toBe(200);

  await loginAs(page, "u-teacher", "/diet");
  await expect(page.locator('img[src*="/demo-media/gpt-image2/meals/"]').first()).toBeVisible();
  const mealSrc = await page.locator('img[src*="/demo-media/gpt-image2/meals/"]').first().getAttribute("src");
  expect(mealSrc).toBeTruthy();
  expect((await page.request.get(mealSrc!)).status(), mealSrc!).toBe(200);

  await loginAs(page, "u-parent", "/parent/storybook?child=c-4");
  await expect(page.locator('img[src*="/demo-media/gpt-image2/storybooks/"]').first()).toBeVisible();
  const storybookSrc = await page.locator('img[src*="/demo-media/gpt-image2/storybooks/"]').first().getAttribute("src");
  expect(storybookSrc).toBeTruthy();
  expect((await page.request.get(storybookSrc!)).status(), storybookSrc!).toBe(200);
});
