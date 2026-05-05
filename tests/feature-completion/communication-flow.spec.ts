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

test("D08 parent teacher communication round trip persists across roles", async ({ page }, testInfo) => {
  const stamp = Date.now();
  const parentToken = `R02-parent-message-${stamp}`;
  const teacherToken = `R02-teacher-reply-${stamp}`;
  const childId = "c-1";

  const parent = await demoContext(testInfo, "u-parent");
  const teacher = await demoContext(testInfo, "u-teacher");
  const teacher2 = await demoContext(testInfo, "u-teacher2");
  const director = await demoContext(testInfo, "u-admin");

  try {
    await resetDemoStorage(page);

    const sent = await expectOk<{
      messageId: string;
      conversationId: string;
      childId: string;
      senderRole: string;
      content: string;
    }>(
      await parent.post("/api/messages", {
        data: {
          childId,
          content: parentToken,
        },
      }),
      201
    );
    expect(sent).toMatchObject({ childId, senderRole: "parent", content: parentToken });

    const teacherMessages = await expectOk<Array<{ messageId: string; content?: string; childId?: string }>>(
      await teacher.get(`/api/messages?childId=${childId}`)
    );
    expect(teacherMessages.some((message) => message.messageId === sent.messageId && message.content === parentToken)).toBe(true);
    await expectFailure(await teacher2.get(`/api/messages?childId=${childId}`), 403, "forbidden_scope");

    const reply = await expectOk<{ childId: string; senderRole: string; content: string }>(
      await teacher.post(`/api/messages/${sent.messageId}/reply`, {
        data: {
          conversationId: sent.conversationId,
          content: teacherToken,
        },
      }),
      201
    );
    expect(reply).toMatchObject({ childId, senderRole: "teacher", content: teacherToken });

    const parentMessages = await expectOk<Array<{ content?: string; senderRole?: string }>>(
      await parent.get(`/api/messages?childId=${childId}`)
    );
    expect(parentMessages.some((message) => message.senderRole === "teacher" && message.content === teacherToken)).toBe(true);

    await loginAs(page, "u-parent", `/parent/agent?child=${childId}#feedback`);
    await expect(page.getByTestId("parent-message-list")).toContainText(parentToken, { timeout: 20_000 });
    await expect(page.getByTestId("parent-message-list")).toContainText(teacherToken, { timeout: 20_000 });
    await page.reload();
    await expect(page.getByTestId("parent-message-list")).toContainText(teacherToken, { timeout: 20_000 });
    await capture(page, "communication-01-parent-api-round-trip.png");

    await loginAs(page, "u-teacher", "/teacher/agent?action=communication");
    await expect(page.getByTestId("communication-thread-card").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("body")).toContainText(/待回复|沟通记录|寰呭洖澶|娌熼€氳褰?/);
    await capture(page, "communication-02-teacher-communication-ui-current.png");

    await loginAs(page, "u-teacher2", "/teacher/agent?action=communication");
    await expect(page.getByText(parentToken)).toHaveCount(0);
    await expect(page.getByText(teacherToken)).toHaveCount(0);
    await capture(page, "communication-03-class-scope-blocks-teacher2.png");

    const directorMessages = await expectOk<Array<{ content?: string }>>(
      await director.get(`/api/messages?childId=${childId}`)
    );
    expect(directorMessages.some((message) => message.content === parentToken)).toBe(true);
    expect(directorMessages.some((message) => message.content === teacherToken)).toBe(true);

    await loginAs(page, "u-admin", "/admin");
    const adminSummary = page.getByTestId("admin-communication-summary");
    await expect(adminSummary).toBeVisible({ timeout: 20_000 });
    await capture(page, "communication-04-director-sees-thread-status.png");
  } finally {
    await parent.dispose();
    await teacher.dispose();
    await teacher2.dispose();
    await director.dispose();
  }
});
