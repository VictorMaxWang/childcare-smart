import { expect, test } from "@playwright/test";

import {
  assistantCommand,
  CHILD_FORBIDDEN,
  CHILD_PARENT,
  demoContext,
  expectFailure,
  expectOk,
  seedStorybook,
} from "./e11-helpers";

test.describe.configure({ mode: "serial" });

test.describe("E11 parent voice command regression", () => {
  test("parent commands confirm writes, preserve child scope, and support local storybook export/share", async ({}, testInfo) => {
    const parent = await demoContext(testInfo, "u-parent");
    const teacher = await demoContext(testInfo, "u-teacher");
    const token = `E11-parent-${Date.now()}`;

    try {
      const context = {
        currentPath: `/parent?child=${CHILD_PARENT}`,
        currentQuery: { child: CHILD_PARENT },
        objects: { childId: CHILD_PARENT },
      };
      const message = assistantCommand("send_message", "parent", {
        childId: CHILD_PARENT,
        content: `${token} parent voice message`,
      });
      expect(message.intent).toBe("send_message");
      expect(message.status).toBe("needs_confirmation");
      await expectFailure(
        await parent.post("/api/voice-assistant/commands", {
          data: {
            action: "execute",
            command: message,
            confirmed: false,
            context,
          },
        }),
        422,
        "needs_confirmation"
      );
      await expectOk(
        await parent.post("/api/voice-assistant/commands", {
          data: { action: "execute", command: message, confirmed: true, context },
        })
      );
      const messages = await expectOk<Array<{ content?: string }>>(await teacher.get(`/api/messages?childId=${CHILD_PARENT}`));
      expect(messages.some((item) => item.content?.includes(token))).toBe(true);

      const storybookId = `storybook-e11-${Date.now()}`;
      await seedStorybook(parent, storybookId, CHILD_PARENT);
      const exported = await expectOk<Record<string, unknown>>(
        await parent.post("/api/voice-assistant/commands", {
          data: {
            action: "execute",
            command: assistantCommand("export_storybook", "parent", { childId: CHILD_PARENT, storybookId, format: "markdown" }),
            confirmed: true,
            context,
          },
        })
      );
      expect(JSON.stringify(exported)).toMatch(/download|storybook|绘本|缁樻湰/i);
      const shared = await expectOk<Record<string, unknown>>(
        await parent.post("/api/voice-assistant/commands", {
          data: {
            action: "execute",
            command: assistantCommand("share_storybook", "parent", { childId: CHILD_PARENT, storybookId }),
            confirmed: true,
            context,
          },
        })
      );
      expect(JSON.stringify(shared)).toMatch(/share|copy|分享|鍒嗕韩/i);

      await expectFailure(
        await parent.post("/api/voice-assistant/commands", {
          data: {
            action: "execute",
            command: assistantCommand("query_child_status", "parent", { childId: CHILD_FORBIDDEN }),
            confirmed: true,
            context: {
              currentPath: `/parent?child=${CHILD_FORBIDDEN}`,
              currentQuery: { child: CHILD_FORBIDDEN },
              objects: { childId: CHILD_FORBIDDEN },
            },
          },
        }),
        403,
        "forbidden_scope"
      );
    } finally {
      await parent.dispose();
      await teacher.dispose();
    }
  });
});
