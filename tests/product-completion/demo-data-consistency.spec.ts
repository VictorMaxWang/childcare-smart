import { expect, test } from "@playwright/test";

import { DEFENSE_CHILD_PROFILES, DEFENSE_CLASS } from "@/lib/demo-data/defense-scenario";
import { demoContext, expectFailure, expectOk } from "./e11-helpers";

type DemoChild = {
  id: string;
  name?: string;
  classId?: string;
  className?: string;
  teacherId?: string;
  parentId?: string;
  parentUserId?: string;
};

test("D-SEED login page starts empty and demo account buttons still work", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/login");

  await expect(page.getByTestId("login-phone")).toBeVisible();
  await expect(page.getByTestId("login-password")).toBeVisible();
  await expect(page.getByTestId("login-phone")).toHaveValue("");
  await expect(page.getByTestId("login-password")).toHaveValue("");
  await expect(page.getByTestId("login-password")).toHaveAttribute("type", "password");

  await page.getByTestId("demo-account-u-parent").click();
  await expect(page).toHaveURL(/\/parent/);
});

test("D-SEED child ownership counts are consistent across director and teachers", async ({}, testInfo) => {
  const director = await demoContext(testInfo, "u-admin");
  const teacherLi = await demoContext(testInfo, "u-teacher");
  const teacherZhou = await demoContext(testInfo, "u-teacher2");

  const directorChildren = await expectOk<DemoChild[]>(await director.get("/api/children"));
  const liChildren = await expectOk<DemoChild[]>(await teacherLi.get("/api/children"));
  const zhouChildren = await expectOk<DemoChild[]>(await teacherZhou.get("/api/children"));

  expect(directorChildren).toHaveLength(36);
  expect(liChildren).toHaveLength(18);
  expect(zhouChildren).toHaveLength(18);
  expect(liChildren.length + zhouChildren.length).toBe(directorChildren.length);
  expect(new Set(directorChildren.map((child) => child.id)).size).toBe(36);
  expect(liChildren.every((child) => child.classId === "class-sunrise" && child.teacherId === "u-teacher")).toBe(true);
  expect(zhouChildren.every((child) => child.classId === "class-morning" && child.teacherId === "u-teacher2")).toBe(true);
  expect(directorChildren.every((child) => child.classId && child.className && child.teacherId && child.parentId)).toBe(true);

  for (const [childId, profile] of Object.entries(DEFENSE_CHILD_PROFILES)) {
    const child = directorChildren.find((item) => item.id === childId);
    expect(child?.name).toBe(profile.name);
    expect(child?.classId).toBe(DEFENSE_CLASS.classId);
    expect(child?.teacherId).toBe(DEFENSE_CLASS.teacherId);
  }
});

test("D-SEED records, materials, assignments and weekly reports are not empty", async ({}, testInfo) => {
  const director = await demoContext(testInfo, "u-admin");
  const teacherLi = await demoContext(testInfo, "u-teacher");
  const teacherZhou = await demoContext(testInfo, "u-teacher2");

  const growth = await expectOk<Array<{ childId: string }>>(await director.get("/api/records?type=growth"));
  const meals = await expectOk<Array<{ childId: string; mediaRefs?: string[]; photoUrls?: string[] }>>(
    await director.get("/api/records?type=meal")
  );
  const health = await expectOk<Array<{ childId: string }>>(await director.get("/api/records?type=health"));
  const materials = await expectOk<Array<{ childId: string; parseResult?: { mediaRefs?: string[] } }>>(
    await director.get("/api/health-materials")
  );
  const storybooks = await expectOk<Array<{ childId: string }>>(await director.get("/api/storybooks"));
  const weeklyReports = await expectOk<Array<{ reportId: string }>>(await director.get("/api/weekly-reports"));
  const directorAssignments = await expectOk<Array<{ teacherId: string; status: string }>>(
    await director.get("/api/assignments")
  );
  const liAssignments = await expectOk<Array<{ teacherId: string; status: string }>>(
    await teacherLi.get("/api/assignments")
  );
  const zhouAssignments = await expectOk<Array<{ teacherId: string; status: string }>>(
    await teacherZhou.get("/api/assignments")
  );

  expect(growth.length).toBeGreaterThanOrEqual(36 * 6);
  expect(meals.length).toBeGreaterThanOrEqual(36 * 7);
  expect(health.length).toBeGreaterThanOrEqual(36 * 7);
  expect(materials).toHaveLength(36);
  expect(storybooks).toHaveLength(36);
  expect(weeklyReports.length).toBeGreaterThanOrEqual(4);
  expect(directorAssignments.length).toBeGreaterThanOrEqual(24);
  expect(liAssignments.length).toBeGreaterThanOrEqual(12);
  expect(zhouAssignments.length).toBeGreaterThanOrEqual(12);
  expect(liAssignments.some((assignment) => assignment.status === "completed")).toBe(true);
  expect(liAssignments.some((assignment) => assignment.status === "in_progress")).toBe(true);
  expect(zhouAssignments.some((assignment) => assignment.status === "completed")).toBe(true);
  expect(zhouAssignments.some((assignment) => assignment.status === "in_progress")).toBe(true);
  expect(meals.every((record) => record.mediaRefs?.[0] || record.photoUrls?.[0])).toBe(true);
  expect(materials.every((material) => material.parseResult?.mediaRefs?.[0])).toBe(true);
});

test("D-SEED defense fixture exposes risk, weekly summary, parent action and feedback data", async ({ page, context }, testInfo) => {
  await context.clearCookies();
  const director = await demoContext(testInfo, "u-admin");
  const parent = await demoContext(testInfo, "u-parent");

  const consultations = await expectOk<Array<{ childId: string; shouldEscalateToAdmin: boolean; riskLevel: string }>>(
    await director.get("/api/consultations")
  );
  const priorityItems = consultations.filter((item) => item.shouldEscalateToAdmin);
  expect(priorityItems.length).toBeGreaterThanOrEqual(3);
  expect(priorityItems.some((item) => item.childId === "c-1")).toBe(true);
  expect(priorityItems.some((item) => item.childId === "c-2")).toBe(true);
  expect(priorityItems.some((item) => item.childId === "c-3")).toBe(true);

  const feedback = await expectOk<Array<{ childId: string; content: string }>>(
    await parent.get("/api/feedback?childId=c-1")
  );
  expect(feedback.some((item) => item.content.includes("孩子能复述故事"))).toBe(true);

  const loginResponse = await page.request.post("/api/auth/demo-login", { data: { accountId: "u-parent" } });
  expect(loginResponse.ok()).toBeTruthy();

  await page.goto("/parent?child=c-1");
  await expect(page.locator("body")).toContainText("林小雨");
  await expect(page.locator("body")).toContainText(/今晚|小步尝试|成长故事/);

  await page.goto("/parent/storybook?child=c-1");
  await expect(page.getByText("林小雨的一小步勇敢").first()).toBeVisible();

  await page.goto("/parent/agent?child=c-1");
  await expect(page.locator("body")).toContainText("林小雨");
  await expect(page.locator("body")).toContainText(/反馈|小步尝试|我害怕/);
});

test("D-SEED parent storybooks are scoped and refreshable", async ({ page, context }, testInfo) => {
  await context.clearCookies();
  const parent = await demoContext(testInfo, "u-parent");
  const c1Storybooks = await expectOk<Array<{ storybookId: string; childId: string }>>(
    await parent.get("/api/storybooks?childId=c-1")
  );
  const c4Storybooks = await expectOk<Array<{ storybookId: string; childId: string }>>(
    await parent.get("/api/storybooks?childId=c-4")
  );
  await expectFailure(await parent.get("/api/storybooks?childId=c-3"), 403, "forbidden_scope");

  expect(c1Storybooks.length).toBeGreaterThan(0);
  expect(c4Storybooks.length).toBeGreaterThan(0);
  expect(c1Storybooks.every((storybook) => storybook.childId === "c-1")).toBe(true);
  expect(c4Storybooks.every((storybook) => storybook.childId === "c-4")).toBe(true);

  let liveStorybookCalls = 0;
  await page.route("**/api/ai/parent-storybook", async (route) => {
    liveStorybookCalls += 1;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "D-SEED should restore saved storybook first" }),
    });
  });

  const loginResponse = await page.request.post("/api/auth/demo-login", { data: { accountId: "u-parent" } });
  expect(loginResponse.ok()).toBeTruthy();
  await page.goto("/parent/storybook?child=c-1");
  await expect(page.getByText("成长绘本 / 成长故事").first()).toBeVisible();
  await expect(page.locator('img[src*="demo-media"]').first()).toBeVisible();
  expect(await page.locator('img[src*="demo-media"]').count()).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator('img[src*="demo-media"]').first()).toBeVisible();
  expect(await page.locator('img[src*="demo-media"]').count()).toBeGreaterThan(0);
  await page.goto("/parent/storybook?child=c-3");
  await expect(page.locator("body")).not.toHaveText("");
  await page.waitForTimeout(300);
  expect(liveStorybookCalls).toBe(0);
});
