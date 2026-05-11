import { expect, test } from "@playwright/test";

import { assistantCommand, demoContext, expectFailure, expectOk, planExistingVoiceCommand } from "./e11-helpers";

test.describe.configure({ mode: "serial" });

test.describe("E11 director voice command regression", () => {
  test("director commands confirm writes and non-directors cannot execute them", async ({}, testInfo) => {
    const director = await demoContext(testInfo, "u-admin");
    const teacher = await demoContext(testInfo, "u-teacher");
    const parent = await demoContext(testInfo, "u-parent");

    try {
      const risk = assistantCommand("query_director_risk", "director", {});
      const riskResult = await expectOk<Record<string, unknown>>(
        await director.post("/api/voice-assistant/commands", {
          data: { action: "execute", command: risk, confirmed: true, context: { currentPath: "/admin" } },
        })
      );
      expect(String(riskResult.message)).toMatch(/风险|高风险|当前|异常|risk|楂橀/i);

      const weekly = assistantCommand("generate_weekly_report", "director", {
        scopeType: "institution",
        scopeId: "inst-1",
        title: `E11 voice weekly ${Date.now()}`,
      });
      await expectFailure(
        await director.post("/api/voice-assistant/commands", {
          data: { action: "execute", command: weekly, confirmed: false, context: { currentPath: "/admin" } },
        }),
        422,
        "needs_confirmation"
      );

      const plannedWeekly = await planExistingVoiceCommand(director, weekly, { currentPath: "/admin" });
      const executed = await expectOk<Record<string, unknown>>(
        await director.post("/api/voice-assistant/commands", {
          data: { action: "execute", command: plannedWeekly, confirmed: true, context: { currentPath: "/admin" } },
        })
      );
      expect(String(executed.message)).toMatch(/周报|鍛ㄦ姤|weekly/i);
      const reports = await expectOk<Array<{ reportId?: string }>>(await director.get("/api/weekly-reports"));
      expect(reports.length).toBeGreaterThan(0);

      await expectFailure(
        await parent.post("/api/voice-assistant/commands", {
          data: {
            action: "execute",
            command: assistantCommand("query_director_risk", "parent", {}),
            confirmed: true,
            context: { currentPath: "/parent" },
          },
        }),
        403,
        "forbidden_scope"
      );
      await expectFailure(
        await teacher.post("/api/voice-assistant/commands", {
          data: {
            action: "execute",
            command: assistantCommand("assign_task", "teacher", {
              childId: "c-4",
              teacherId: "u-teacher",
              description: "E11 forbidden director task",
            }),
            confirmed: true,
            context: { currentPath: "/teacher" },
          },
        }),
        403,
        "forbidden_scope"
      );
    } finally {
      await director.dispose();
      await teacher.dispose();
      await parent.dispose();
    }
  });
});
