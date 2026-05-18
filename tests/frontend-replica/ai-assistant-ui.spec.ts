import { expect, test } from "@playwright/test";

import { loginAs } from "../feature-completion/helpers";
import { CHILD_PARENT, demoContext, expectFailure, expectOk, planExistingVoiceCommand, assistantCommand } from "../product-completion/e11-helpers";

const ROLE_CASES = [
  { account: "u-admin", route: "/admin/agent", label: "园长端" },
  { account: "u-teacher", route: "/teacher/agent", label: "教师端" },
  { account: "u-parent", route: `/parent/agent?child=${CHILD_PARENT}`, label: "家长端" },
];

test.describe("R04 AI assistant UI replica", () => {
  for (const roleCase of ROLE_CASES) {
    test(`${roleCase.label} AI 助手可打开并显示 provider 状态`, async ({ page }) => {
      await loginAs(page, roleCase.account, roleCase.route);
      const workspace = page.getByTestId("r04-assistant-workspace").first();
      await expect(workspace).toBeVisible();
      await expect(workspace.getByTestId("r04-assistant-provider-status")).toContainText(/provider (ready|degraded|unavailable)|正在读取/u);
      await workspace.getByTestId("r04-assistant-input").scrollIntoViewIfNeeded();
      await expect(workspace.getByTestId("r04-assistant-input")).toBeVisible();
      await expect(workspace.getByTestId("r04-assistant-send")).toBeDisabled();
    });
  }

  test("快捷问题可点击，输入框和发送按钮状态正确", async ({ page }) => {
    await loginAs(page, "u-teacher", "/teacher/agent");
    const workspace = page.getByTestId("r04-assistant-workspace").first();
    await expect(workspace).toBeVisible();
    const chip = workspace.getByTestId("r04-prompt-chip").filter({ hasText: "本周观察总结" }).first();
    await chip.click();
    await expect(workspace.getByTestId("r04-assistant-conversation")).toBeVisible();
    await workspace.getByTestId("r04-assistant-input").fill("请总结今天班级待办");
    await expect(workspace.getByTestId("r04-assistant-send")).toBeEnabled({ timeout: 30_000 });
  });

  test("写入类操作需要确认，取消后不写入", async ({}, testInfo) => {
    const parent = await demoContext(testInfo, "u-parent");
    const context = {
      currentPath: `/parent?child=${CHILD_PARENT}`,
      currentQuery: { child: CHILD_PARENT },
      objects: { childId: CHILD_PARENT },
    };
    try {
      const command = assistantCommand("send_message", "parent", {
        childId: CHILD_PARENT,
        content: `R04 cancel ${Date.now()}`,
      });
      await expectFailure(
        await parent.post("/api/voice-assistant/commands", {
          data: { action: "execute", command, confirmed: false, context },
        }),
        422,
        "needs_confirmation"
      );
      const planned = await planExistingVoiceCommand(parent, command, context);
      expect(planned.confirmationToken).toBeTruthy();
      const messages = await expectOk<Array<{ content?: string }>>(await parent.get(`/api/messages?childId=${CHILD_PARENT}`));
      expect(messages.some((message) => message.content?.includes("R04 cancel"))).toBe(false);
    } finally {
      await parent.dispose();
    }
  });

  test("mobile 语音球和助手输入区不被底部导航遮挡", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, "u-parent", `/parent/agent?child=${CHILD_PARENT}`);
    const workspace = page.getByTestId("r04-assistant-workspace").first();
    await expect(workspace).toBeVisible();
    const composerBox = await workspace.getByTestId("r04-assistant-composer").boundingBox();
    expect(composerBox).not.toBeNull();
    expect(composerBox!.x).toBeGreaterThanOrEqual(0);
    expect(composerBox!.x + composerBox!.width).toBeLessThanOrEqual(390);

    const orb = page.getByTestId("voice-orb-button");
    await expect(orb).toBeVisible();
    const orbBox = await orb.boundingBox();
    expect(orbBox).not.toBeNull();
    expect(orbBox!.y + orbBox!.height).toBeLessThan(844 - 40);
  });
});
