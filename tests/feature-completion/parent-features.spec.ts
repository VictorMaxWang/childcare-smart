import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  capture,
  demoContext,
  expectChildParam,
  expectFailure,
  expectOk,
  finalizeFeatureTest,
  loginAs,
  resetDemoStorage,
  waitForSharedDemoSeed,
} from "./helpers";

test.describe.configure({ mode: "serial" });

test.afterEach(async ({ page }, testInfo) => {
  await finalizeFeatureTest(page, testInfo);
});

test("D08 parent child query survives core routes and mobile viewport", async ({ page }) => {
  await resetDemoStorage(page);
  await loginAs(page, "u-parent", "/parent?child=c-1");
  await waitForSharedDemoSeed(page);

  const routes = [
    "/parent/agent?child=c-1#feedback",
    "/growth?child=c-1",
    "/health?child=c-1",
    "/diet?child=c-1",
    "/parent/reminders?child=c-1",
    "/parent/storybook?child=c-1",
  ];

  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator("body")).not.toHaveText("");
    await expectChildParam(page, "c-1");
  }

  await page.goto("/parent?child=c-2");
  expect(new URL(page.url()).searchParams.get("child")).toBe("c-2");
  await expect(page.locator("body")).toContainText(/授权|无权|没有该 childId|鎺堟潈|鏃犳潈/);
  await capture(page, "parent-01-invalid-child-no-fallback.png");

  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of routes.slice(0, 5)) {
    await page.goto(route);
    await expect(page.locator("body")).not.toHaveText("");
    await expectChildParam(page, "c-1");
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 2);
  }
  await capture(page, "parent-02-mobile-core-routes.png");
});

test("D08 parent storybook demoSeed stays isolated from real provider and remote state", async ({ page }, testInfo) => {
  const stamp = Date.now();
  const childId = "c-4";
  const storybookId = `storybook-r02-${stamp}`;
  const storybookTitle = `R02 local share storybook ${stamp}`;
  const statePutRequests: string[] = [];

  page.on("request", (request) => {
    if (request.url().includes("/api/state") && request.method() === "PUT") {
      statePutRequests.push(request.postData() ?? "");
    }
  });

  const parent = await demoContext(testInfo, "u-parent");
  const teacher = await demoContext(testInfo, "u-teacher");

  try {
    await resetDemoStorage(page);

    const demoSeedResponse = await parent.post("/api/ai/parent-storybook", {
      data: buildStorybookAiRequest({
        childId,
        requestSource: `parent-storybook-demo-seed:r02-${stamp}`,
        detail: `R02 demoSeed source stays local ${stamp}`,
      }),
    });
    expect(demoSeedResponse.status()).toBe(200);
    expect(demoSeedResponse.headers()["x-smartchildcare-storybook-demo-seed"]).toBe("isolated");
    const demoSeedBody = await demoSeedResponse.json();
    expect(demoSeedBody.childId).toBe(childId);
    expect(demoSeedBody.fallbackReason ?? demoSeedBody.providerMeta?.fallbackReason).toBe("demo-seed-isolated");
    expect(demoSeedBody.providerMeta?.transport).toBe("next-json-fallback");
    expect(demoSeedBody.providerMeta?.realProvider).toBe(false);

    await expectFailure(
      await teacher.post("/api/ai/parent-storybook", {
        data: buildStorybookAiRequest({
          childId,
          requestSource: `parent-storybook-demo-seed:r02-forbidden-${stamp}`,
          detail: "teacher must not call parent storybook AI",
        }),
      }),
      403,
      "forbidden_scope"
    );
    await expectFailure(
      await parent.post("/api/ai/parent-storybook", {
        data: buildStorybookAiRequest({
          childId: "c-3",
          className: "晨曦班",
          requestSource: `parent-storybook-demo-seed:r02-denied-${stamp}`,
          detail: "parent must not access another child",
        }),
      }),
      403,
      "forbidden_scope"
    );

    await seedStorybook(parent, storybookId, storybookTitle);
    const exported = await expectOk<{ kind: string; content: string; filename: string }>(
      await parent.get(`/api/storybooks/${storybookId}/export?format=markdown`)
    );
    expect(exported.kind).toBe("download");
    expect(exported.content).toContain(storybookTitle);
    expect(exported.filename).toContain(storybookId);

    const shared = await expectOk<{ kind: string; copyText?: string; externalService?: string }>(
      await parent.post(`/api/storybooks/${storybookId}/share`, { data: {} })
    );
    expect(shared.kind).toBe("share-text");
    expect(shared.copyText).toContain(storybookTitle);
    expect(shared.externalService).toBe("unavailable");

    await loginAs(page, "u-parent", `/parent/storybook?child=${childId}`);
    await expect(page.getByTestId("e10-storybook-export-markdown")).toBeEnabled({ timeout: 30_000 });
    await expect(page.locator("body")).toContainText(storybookTitle, { timeout: 30_000 });
    await page.getByTestId("e10-storybook-export-markdown").click();
    await expect(page.getByTestId("e10-storybook-action-status")).toContainText(/export|local|本地|瀵煎嚭/i);
    await page.getByTestId("e10-storybook-share-local").click();
    await expect(page.getByTestId("e10-storybook-action-status")).toContainText(/share|copy|local|分享|复制|本地|鍒嗕韩/i);
    await capture(page, "parent-03-storybook-demo-seed-isolated.png");

    expect(statePutRequests).toEqual([]);
  } finally {
    await parent.dispose();
    await teacher.dispose();
  }
});

function buildStorybookAiRequest(input: {
  childId: string;
  className?: string;
  requestSource: string;
  detail: string;
}) {
  return {
    childId: input.childId,
    storyMode: "storybook",
    generationMode: "child-personalized",
    pageCount: 4,
    requestSource: input.requestSource,
    snapshot: {
      child: {
        id: input.childId,
        name: input.childId === "c-1" ? "林小雨" : "陈思琪",
        className: input.className ?? "向阳班",
        specialNotes: "R02 validates child-scoped storybook generation.",
      },
      summary: {
        health: {
          abnormalCount: 0,
          handMouthEyeAbnormalCount: 0,
          moodKeywords: ["stable"],
        },
        meals: {
          recordCount: 1,
          hydrationAvg: 120,
          balancedRate: 90,
          monotonyDays: 0,
          allergyRiskCount: 0,
        },
        growth: {
          recordCount: 1,
          attentionCount: 0,
          pendingReviewCount: 0,
          topCategories: [{ category: "routine", count: 1 }],
        },
        feedback: {
          count: 1,
          statusCounts: { pending: 1 },
          keywords: ["routine"],
        },
      },
      recentDetails: {
        health: [],
        meals: [],
        growth: [],
        feedback: [],
      },
      ruleFallback: [],
    },
    highlightCandidates: [
      {
        kind: "todayGrowth",
        title: "R02 local highlight",
        detail: input.detail,
        priority: 1,
        source: "r02",
      },
    ],
  };
}

async function seedStorybook(api: APIRequestContext, storybookId: string, title: string, childId = "c-4") {
  return expectOk(
    await api.post("/api/storybooks", {
      data: {
        storybookId,
        childId,
        generatedAt: new Date().toISOString(),
        sourceRecordIds: [`growth-${storybookId}`],
        response: {
          storyId: storybookId,
          childId,
          title,
          summary: "R02 verifies local storybook export and share.",
          moral: "Local MVP actions stay explicit and scoped.",
          parentNote: "No external share provider is required for R02.",
          generatedAt: new Date().toISOString(),
          scenes: [
            {
              sceneIndex: 1,
              sceneTitle: "R02 local evidence",
              sceneText: "A parent opens a local storybook and keeps export/share local.",
              imageStatus: "ready",
              audioStatus: "preview-only",
              audioScript: "A parent opens a local storybook.",
              voiceStyle: "warm",
              imagePrompt: "child completing a routine",
              highlightSource: "growth",
            },
          ],
        },
      },
    }),
    201
  );
}
