import { expect, test } from "@playwright/test";

import { loginAs } from "../feature-completion/helpers";
import {
  assistantCommand,
  CHILD_FORBIDDEN,
  CHILD_PARENT,
  CHILD_TEACHER,
  demoContext,
  expectFailure,
  expectOk,
} from "../product-completion/e11-helpers";

function childSuggestionPayload(childId = CHILD_PARENT) {
  return {
    snapshot: {
      child: {
        id: childId,
        name: childId === CHILD_PARENT ? "林小雨" : "越权幼儿",
        className: "小一班",
        allergies: [],
      },
      summary: {
        health: { abnormalCount: 1, handMouthEyeAbnormalCount: 0, avgTemperature: 36.8, moodKeywords: ["稳定"] },
        meals: { recordCount: 3, hydrationAvg: 180, balancedRate: 76, monotonyDays: 0, allergyRiskCount: 0 },
        growth: { recordCount: 2, attentionCount: 0, pendingReviewCount: 0, topCategories: [] },
        feedback: { count: 1, statusCounts: { open: 1 }, keywords: ["配合"] },
      },
      recentDetails: {
        health: [],
        meals: [],
        growth: [],
        feedback: [],
      },
      ruleFallback: [{ title: "继续观察", description: "保持晨检和饮食记录连续。", level: "info" }],
    },
  };
}

test.describe("R04 vivo AI assistant provider boundary", () => {
  test("provider status exposes chat/ocr/asr/tts readiness without credentials", async ({}, testInfo) => {
    const parent = await demoContext(testInfo, "u-parent");
    try {
      const status = await expectOk<{
        chat: { status: string; requiredEnv?: string[] };
        ocr: { status: string };
        asr: { status: string };
        tts: { status: string };
      }>(await parent.get("/api/ai/provider-status"));
      for (const capability of [status.chat, status.ocr, status.asr, status.tts]) {
        expect(["ready", "missing-env", "unsupported", "provider-unavailable", "error"]).toContain(capability.status);
      }
      const serialized = JSON.stringify(status);
      expect(serialized).not.toMatch(/Bearer\s+[A-Za-z0-9._-]+/u);
      expect(serialized).not.toMatch(/appKey|appSecret|signature|NEXT_PUBLIC_VIVO/u);
    } finally {
      await parent.dispose();
    }
  });

  test("missing-env 不返回 fake success", async ({ page }, testInfo) => {
    await loginAs(page, "u-parent", `/parent/agent?child=${CHILD_PARENT}`);
    const parent = await demoContext(testInfo, "u-parent");
    try {
      const status = await expectOk<{ chat: { status: string } }>(await parent.get("/api/ai/provider-status"));
      if (status.chat.status === "ready") {
        test.skip(true, "vivo Chat is configured in this environment; missing-env branch is covered when env is absent.");
      }
      const response = await page.request.post("/api/ai/suggestions", { data: childSuggestionPayload() });
      const body = await expectFailure(response, 503, "provider_unavailable");
      expect(JSON.stringify(body)).not.toContain('"source":"fallback"');
      expect(JSON.stringify(body)).toContain("providerStatus");
    } finally {
      await parent.dispose();
    }
  });

  test("父母和教师越权请求被拒绝", async ({ page }, testInfo) => {
    await loginAs(page, "u-parent", `/parent/agent?child=${CHILD_PARENT}`);
    const teacher2 = await demoContext(testInfo, "u-teacher2");
    try {
      const parentForbidden = await page.request.post("/api/ai/suggestions", { data: childSuggestionPayload(CHILD_FORBIDDEN) });
      expect(parentForbidden.status()).toBe(403);
      expect(JSON.stringify(await parentForbidden.json())).toMatch(/forbidden|权限|无权/i);
      await expectFailure(
        await teacher2.post("/api/voice-assistant/commands", {
          data: {
            action: "execute",
            command: assistantCommand("create_morning_check", "teacher", {
              childId: CHILD_TEACHER,
              temperature: 36.8,
              remark: "R04 teacher forbidden write",
            }),
            confirmed: true,
            context: { currentPath: "/teacher" },
          },
        }),
        403,
        "forbidden_scope"
      );
    } finally {
      await teacher2.dispose();
    }
  });

  test("前端不直连 vivo 域名且不泄露密钥", async ({ page }) => {
    const remoteRequests: string[] = [];
    page.on("request", (request) => {
      if (/vivo\.com\.cn|api-ai\.vivo/u.test(request.url())) remoteRequests.push(request.url());
    });

    await loginAs(page, "u-parent", `/parent/agent?child=${CHILD_PARENT}`);
    const workspace = page.getByTestId("r04-assistant-workspace").first();
    await expect(workspace).toBeVisible();
    await workspace.getByTestId("r04-assistant-input").fill("请解释今日状态");
    await workspace.getByTestId("r04-assistant-send").click();
    await page.waitForTimeout(500);
    expect(remoteRequests).toEqual([]);
    expect(await page.locator("body").innerText()).not.toMatch(/VIVO_APP_KEY|Bearer\s+[A-Za-z0-9._-]+|signature=/u);
  });
});
