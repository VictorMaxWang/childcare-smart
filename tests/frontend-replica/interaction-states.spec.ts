import { expect, test } from "@playwright/test";
import { loginAs } from "../feature-completion/helpers";
import { assistantCommand, CHILD_PARENT, demoContext, expectFailure, planExistingVoiceCommand } from "../product-completion/e11-helpers";
import {
  expectChartTooltip,
  expectLocatorCenterIsTopmost,
  expectNoHorizontalOverflow,
} from "./r08-helpers";

test.describe("FRONTEND-REPLICA-R08 interaction states", () => {
  test("shared visual states expose loading, empty, error, and permission semantics", async ({ page }) => {
    await loginAs(page, "u-admin", "/visual-parity/states?state=loading");
    await expect(page.locator(".skeleton-pulse").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const expectedText = {
      empty: "没有找到匹配记录",
      error: "数据暂时不可用",
      permission: "当前无权查看健康信息",
    } as const;
    for (const state of ["empty", "error", "permission"] as const) {
      await page.goto(`/visual-parity/states?state=${state}`);
      await expect(page.locator("body")).toContainText(expectedText[state]);
      if (state !== "empty") await expect(page.getByRole("alert").filter({ hasText: expectedText[state] })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });

  test("AI assistant provider, voice panel, unknown intent, cancel, and forbidden scope are explicit", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, "u-parent", `/parent/agent?child=${CHILD_PARENT}`);

    await expect(page.getByTestId("r04-assistant-provider-status").first()).toContainText(/provider (ready|degraded|unavailable)|正在读取/i);
    await page.getByTestId("r04-assistant-voice").first().click();
    await expect(page.getByTestId("voice-orb-panel")).toBeVisible();
    await expect(page.getByTestId("voice-orb-button")).toHaveAttribute("aria-expanded", "true");
    await expectLocatorCenterIsTopmost(page.getByTestId("voice-orb-submit"));

    const api = await demoContext(testInfo, "u-parent");
    try {
      const context = {
        currentPath: `/parent?child=${CHILD_PARENT}`,
        currentQuery: { child: CHILD_PARENT },
        objects: { childId: CHILD_PARENT },
      };
      const command = assistantCommand("send_message", "parent", {
        childId: CHILD_PARENT,
        content: `R08 cancel ${Date.now()}`,
      });
      const planned = await planExistingVoiceCommand(api, command, context);
      expect(planned.confirmationToken).toBeTruthy();
      await expectFailure(
        await api.post("/api/voice-assistant/commands", {
          data: { action: "execute", command, confirmed: false, context },
        }),
        422,
        "needs_confirmation"
      );

      const forbiddenResponse = await api.post("/api/voice-assistant/commands", {
          data: {
            action: "plan",
            utterance: { text: "delete another child outside my scope", inputMode: "text", transcriptSource: "r08" },
            context: { ...context, objects: { childId: "c-3" } },
          },
        });
      expect([200, 403, 422]).toContain(forbiddenResponse.status());
      const forbiddenBody = await forbiddenResponse.json();
      expect(JSON.stringify(forbiddenBody)).toMatch(/forbidden|scope|权限|unauthorized|danger|unsupported/i);
    } finally {
      await api.dispose();
    }
  });

  test("chart hover, focus, and mobile bottom nav active state are accessible", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, "u-admin", "/admin");

    await expectChartTooltip(page, "r03-admin-closure-combo");
    const chart = page.getByTestId("r03-admin-closure-combo");
    await chart.focus();
    await expect(chart).toBeFocused();
    await expect(page.getByTestId("r02-mobile-bottom-nav").locator("[aria-current='page']")).toHaveCount(1);
    await expectNoHorizontalOverflow(page);
  });
});
