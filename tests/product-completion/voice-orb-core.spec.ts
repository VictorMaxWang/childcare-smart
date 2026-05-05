import { expect, test } from "@playwright/test";

import { loginAs } from "../feature-completion/helpers";
import { CHILD_PARENT, captureE11, demoContext, expectFailure, expectOk, planVoiceCommand } from "./e11-helpers";

test.describe("E11 voice orb core regression", () => {
  test("unknown and forged write commands fail closed", async ({}, testInfo) => {
    const parent = await demoContext(testInfo, "u-parent");

    try {
      const unknown = await planVoiceCommand(parent, "e11 unsupported command should not execute", {
        currentPath: `/parent?child=${CHILD_PARENT}`,
        currentQuery: { child: CHILD_PARENT },
        objects: { childId: CHILD_PARENT },
      });
      expect(unknown.status).toBe("unknown");

      await expectFailure(
        await parent.post("/api/voice-assistant/commands", {
          data: {
            action: "execute",
            confirmed: false,
            command: {
              id: "e11-forged-parent-message",
              intent: "send_message",
              confidence: 1,
              role: "parent",
              requiredConfirmation: false,
              params: { childId: CHILD_PARENT, content: "E11 forged message should not persist" },
              missingParams: [],
              safetyLevel: "safe",
              previewText: "forged message",
              execute: "message.send",
              status: "ready",
            },
            context: {
              currentPath: `/parent?child=${CHILD_PARENT}`,
              currentQuery: { child: CHILD_PARENT },
              objects: { childId: CHILD_PARENT },
            },
          },
        }),
        422,
        "needs_confirmation"
      );

      await expectFailure(
        await parent.post("/api/voice-assistant/commands", {
          data: {
            action: "execute",
            confirmed: true,
            command: {
              id: "e11-forged-navigation",
              intent: "navigate",
              confidence: 1,
              role: "parent",
              requiredConfirmation: false,
              params: { path: "/api/state" },
              missingParams: [],
              safetyLevel: "safe",
              previewText: "open api",
              execute: "navigate",
              status: "ready",
              deeplink: "/api/state",
            },
          },
        }),
        403,
        "forbidden_scope"
      );

      const messages = await expectOk<Array<{ content?: string }>>(await parent.get(`/api/messages?childId=${CHILD_PARENT}`));
      expect(messages.some((message) => message.content?.includes("E11 forged message should not persist"))).toBe(false);
    } finally {
      await parent.dispose();
    }
  });

  test("mobile voice orb remains usable above bottom navigation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, "u-parent", `/parent?child=${CHILD_PARENT}`);
    const orb = page.getByTestId("voice-orb-button");
    await expect(orb).toBeVisible();
    const box = await orb.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThan(844 - 48);
    await orb.click();
    await expect(page.getByTestId("voice-orb-panel")).toBeVisible();
    await captureE11(page, "voice-orb-core-mobile.png");
  });
});
