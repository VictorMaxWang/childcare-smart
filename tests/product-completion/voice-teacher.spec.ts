import { expect, test } from "@playwright/test";

import { assistantCommand, CHILD_TEACHER, demoContext, expectFailure, expectOk } from "./e11-helpers";

test.describe.configure({ mode: "serial" });

test.describe("E11 teacher voice command regression", () => {
  test("teacher write commands require confirmation, persist and keep class scope", async ({}, testInfo) => {
    const teacher = await demoContext(testInfo, "u-teacher");
    const teacher2 = await demoContext(testInfo, "u-teacher2");
    const parent = await demoContext(testInfo, "u-parent");
    const token = `E11-teacher-${Date.now()}`;

    try {
      const command = assistantCommand("create_morning_check", "teacher", {
        childId: CHILD_TEACHER,
        temperature: 36.8,
        remark: token,
      });
      expect(command.intent).toBe("create_morning_check");
      expect(command.status).toBe("needs_confirmation");

      await expectFailure(
        await teacher.post("/api/voice-assistant/commands", {
          data: { action: "execute", command, confirmed: false, context: { currentPath: "/teacher" } },
        }),
        422,
        "needs_confirmation"
      );

      await expectOk(
        await teacher.post("/api/voice-assistant/commands", {
          data: { action: "execute", command, confirmed: true, context: { currentPath: "/teacher" } },
        })
      );
      const parentHealth = await expectOk<Array<{ childId?: string; remark?: string }>>(
        await parent.get(`/api/records?type=health&childId=${CHILD_TEACHER}&includeArchived=1`)
      );
      expect(parentHealth.some((record) => record.childId === CHILD_TEACHER && record.remark?.includes(token))).toBe(true);

      const forbidden = assistantCommand("create_morning_check", "teacher", {
        childId: CHILD_TEACHER,
        temperature: 36.8,
        remark: `${token}-denied`,
      });
      await expectFailure(
        await teacher2.post("/api/voice-assistant/commands", {
          data: { action: "execute", command: forbidden, confirmed: true, context: { currentPath: "/teacher" } },
        }),
        403,
        "forbidden_scope"
      );
      const teacherRecords = await expectOk<Array<{ remark?: string }>>(
        await teacher.get(`/api/records?type=health&childId=${CHILD_TEACHER}&includeArchived=1`)
      );
      expect(teacherRecords.some((record) => record.remark?.includes(`${token}-denied`))).toBe(false);
    } finally {
      await teacher.dispose();
      await teacher2.dispose();
      await parent.dispose();
    }
  });
});
