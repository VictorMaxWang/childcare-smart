import { expect, test } from "@playwright/test";

import { loginAs } from "../feature-completion/helpers";
import { CHILD_FORBIDDEN, CHILD_PARENT, CHILD_TEACHER, demoContext, expectFailure, expectOk } from "./e11-helpers";

function buildParentSuggestionPayload(childId: string, className = "向阳班") {
  return {
    snapshot: {
      child: {
        id: childId,
        name: "E11 child",
        className,
        allergies: [],
        specialNotes: "E11 suggestion scope regression",
      },
      summary: {
        health: {
          abnormalCount: 0,
          handMouthEyeAbnormalCount: 0,
          moodKeywords: [],
        },
        meals: {
          recordCount: 0,
          hydrationAvg: 0,
          balancedRate: 0,
          monotonyDays: 0,
          allergyRiskCount: 0,
        },
        growth: {
          recordCount: 0,
          attentionCount: 0,
          pendingReviewCount: 0,
          topCategories: [],
        },
        feedback: {
          count: 0,
          statusCounts: {},
          keywords: [],
        },
      },
      recentDetails: {
        health: [],
        meals: [],
        growth: [],
        feedback: [],
      },
      ruleFallback: [
        {
          title: "E11 parent suggestion fallback",
          description: "Authorized child-scoped parent suggestion should not be treated as class scope.",
          level: "info",
          tags: ["E11", "scope"],
        },
      ],
    },
  };
}

test.describe("E11 /api/ai auth regression", () => {
  test("AI routes return uniform 401/403 envelopes for missing session, wrong role and forbidden scope", async ({
    request,
  }, testInfo) => {
    const director = await demoContext(testInfo, "u-admin");
    const teacher = await demoContext(testInfo, "u-teacher");
    const parent = await demoContext(testInfo, "u-parent");

    try {
      await expectFailure(await request.post("/api/ai/admin-agent", { data: {} }), 401, "unauthorized");
      await expectFailure(await request.get("/api/ai/provider-status"), 401, "unauthorized");

      await expectFailure(await parent.post("/api/ai/admin-agent", { data: {} }), 403, "forbidden_scope");
      await expectFailure(await parent.post("/api/ai/admin-quality-metrics", { data: {} }), 403, "forbidden_scope");
      await expectFailure(
        await parent.post("/api/ai/high-risk-consultation/stream", {
          data: { childId: CHILD_PARENT, observations: [] },
        }),
        403,
        "forbidden_scope"
      );
      await expectFailure(
        await parent.post("/api/ai/health-file-bridge", {
          data: {
            childId: CHILD_PARENT,
            sourceRole: "parent",
            files: [{ name: "e11.txt", mimeType: "text/plain", previewText: "e11" }],
          },
        }),
        403,
        "forbidden_scope"
      );
      await expectFailure(
        await parent.post("/api/ai/weekly-report", {
          data: {
            role: "admin",
            snapshot: {
              role: "admin",
              institutionName: "E11",
              periodLabel: "2026-04-27 - 2026-05-03",
              overview: {
                visibleChildren: 1,
                attendanceRate: 100,
                mealRecordCount: 0,
                healthAbnormalCount: 0,
                pendingReviewCount: 0,
                feedbackCount: 0,
              },
              diet: { balancedRate: 0, vegetableDays: 0, proteinDays: 0, hydrationAvg: 0 },
              topAttentionChildren: [],
              highlights: [],
              risks: [],
              nextWeekActions: [],
            },
          },
        }),
        403,
        "forbidden_scope"
      );

      await expectFailure(
        await teacher.post("/api/ai/parent-storybook", {
          data: { childId: CHILD_TEACHER, records: [], childProfile: { id: CHILD_TEACHER } },
        }),
        403,
        "forbidden_scope"
      );
      await expectFailure(
        await teacher.post("/api/ai/suggestions", { data: { childId: CHILD_PARENT, messages: [] } }),
        403,
        "forbidden_scope"
      );
      await expectFailure(
        await teacher.post("/api/ai/health-file-bridge", {
          data: {
            childId: CHILD_FORBIDDEN,
            sourceRole: "teacher",
            files: [{ name: "e11.txt", mimeType: "text/plain", previewText: "e11" }],
          },
        }),
        403,
        "forbidden_scope"
      );

      await expectFailure(
        await parent.post("/api/ai/parent-trend-query", {
          data: { childId: CHILD_FORBIDDEN, question: "status" },
        }),
        403,
        "forbidden_scope"
      );
      await expectOk(await director.get("/api/ai/provider-status"));
    } finally {
      await director.dispose();
      await teacher.dispose();
      await parent.dispose();
    }
  });

  test("parent suggestions allow own child snapshots with className but still deny forged child scope", async ({ page }) => {
    await loginAs(page, "u-parent", "/parent?child=c-1");

    const allowed = await page.request.post("/api/ai/suggestions", {
      data: buildParentSuggestionPayload(CHILD_PARENT),
      headers: { "x-ai-force-fallback": "1" },
    });
    expect(allowed.status()).toBe(200);
    const allowedBody = await allowed.json();
    expect(allowedBody.source).toBeTruthy();
    expect(allowedBody.riskLevel).toBeTruthy();

    await expectFailure(
      await page.request.post("/api/ai/suggestions", {
        data: {
          childId: CHILD_FORBIDDEN,
          ...buildParentSuggestionPayload(CHILD_FORBIDDEN, "晨曦班"),
        },
        headers: { "x-ai-force-fallback": "1" },
      }),
      403,
      "forbidden_scope"
    );
  });
});
