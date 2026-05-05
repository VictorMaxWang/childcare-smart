import { expect, test } from "@playwright/test";
import {
  capture,
  demoContext,
  expectFailure,
  expectOk,
  finalizeFeatureTest,
  loginAs,
  resetDemoStorage,
} from "./helpers";

test.describe.configure({ mode: "serial" });

test.afterEach(async ({ page }, testInfo) => {
  await finalizeFeatureTest(page, testInfo);
});

test("D08 teacher records persist after refresh and are visible to parent", async ({ page }, testInfo) => {
  const suffix = Date.now();
  const childId = "c-1";
  const healthToken = `R02-HEALTH-${suffix}`;
  const dietToken = `R02-FOOD-${suffix}`;
  const growthToken = `R02-GROWTH-${suffix}`;
  const deniedToken = `R02-DENIED-${suffix}`;

  const teacher = await demoContext(testInfo, "u-teacher");
  const teacher2 = await demoContext(testInfo, "u-teacher2");
  const parent = await demoContext(testInfo, "u-parent");

  try {
    await resetDemoStorage(page);

    const health = await expectOk<{ id: string; childId: string; temperature?: number; remark?: string }>(
      await teacher.post("/api/records", {
        data: {
          type: "health",
          childId,
          date: "2026-05-03",
          temperature: 37.6,
          mood: "stable",
          remark: healthToken,
        },
      }),
      201
    );
    expect(health).toMatchObject({ childId, temperature: 37.6, remark: healthToken });

    const meal = await expectOk<{ id: string; childId: string; foods?: string[]; meal?: string }>(
      await teacher.post("/api/records", {
        data: {
          type: "meal",
          childId,
          date: "2026-05-03",
          meal: "lunch",
          foods: [{ id: `food-${suffix}`, name: dietToken, category: "主食", amount: "1 serving" }],
          intakeLevel: "good",
          waterMl: 160,
        },
      }),
      201
    );
    expect(meal.childId).toBe(childId);
    expect(JSON.stringify(meal)).toContain(dietToken);

    const growth = await expectOk<{ id: string; childId: string; description?: string }>(
      await teacher.post("/api/records", {
        data: {
          type: "growth",
          childId,
          category: "routine",
          tags: ["R02", "persistence"],
          description: growthToken,
        },
      }),
      201
    );
    expect(growth).toMatchObject({ childId, description: growthToken });

    await expectFailure(
      await teacher2.post("/api/records", {
        data: {
          type: "health",
          childId,
          remark: deniedToken,
        },
      }),
      403,
      "forbidden_scope"
    );

    const teacherHealth = await expectOk<Array<{ id: string; remark?: string; temperature?: number }>>(
      await teacher.get(`/api/records?type=health&childId=${childId}&includeArchived=1`)
    );
    expect(teacherHealth.some((record) => record.id === health.id && record.remark === healthToken)).toBe(true);
    expect(teacherHealth.some((record) => record.remark === deniedToken)).toBe(false);

    const parentHealth = await expectOk<Array<{ id: string; remark?: string; temperature?: number }>>(
      await parent.get(`/api/records?type=health&childId=${childId}&includeArchived=1`)
    );
    expect(parentHealth.some((record) => record.id === health.id && record.temperature === 37.6)).toBe(true);

    const parentMeals = await expectOk<Array<{ id: string; foods?: string[] }>>(
      await parent.get(`/api/records?type=meal&childId=${childId}&includeArchived=1`)
    );
    expect(parentMeals.some((record) => record.id === meal.id && JSON.stringify(record).includes(dietToken))).toBe(true);

    const parentGrowth = await expectOk<Array<{ id: string; description?: string }>>(
      await parent.get(`/api/records?type=growth&childId=${childId}&includeArchived=1`)
    );
    expect(parentGrowth.some((record) => record.id === growth.id && record.description === growthToken)).toBe(true);

    await expectFailure(await teacher2.get(`/api/records?type=health&childId=${childId}&includeArchived=1`), 403, "forbidden_scope");

    await loginAs(page, "u-teacher", "/teacher");
    await expect(page.locator("body")).not.toHaveText("");
    await capture(page, "records-01-teacher-records-api-persisted.png");
  } finally {
    await teacher.dispose();
    await teacher2.dispose();
    await parent.dispose();
  }
});
