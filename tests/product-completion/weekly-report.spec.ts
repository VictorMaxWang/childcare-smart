import { expect, test } from "@playwright/test";

import { createWeeklyReport, demoContext, expectFailure, expectOk } from "./e11-helpers";

test.describe.configure({ mode: "serial" });

test.describe("E11 weekly report regression", () => {
  test("director can generate, archive, export and share reports while other roles are scoped out", async ({}, testInfo) => {
    const director = await demoContext(testInfo, "u-admin");
    const teacher = await demoContext(testInfo, "u-teacher");
    const parent = await demoContext(testInfo, "u-parent");
    const token = `e11-weekly-${Date.now()}`;

    try {
      const created = await createWeeklyReport(director, token);
      expect(created.status).toBe("draft");

      const detail = await expectOk<{ reportId: string; title: string; payload?: unknown }>(
        await director.get(`/api/weekly-reports/${created.reportId}`)
      );
      expect(detail.reportId).toBe(created.reportId);
      expect(detail.title).toBe(token);
      expect(detail.payload).toBeDefined();

      const exported = await expectOk<{ content: string; format: string }>(
        await director.get(`/api/weekly-reports/${created.reportId}/export?format=markdown`)
      );
      expect(exported.format).toBe("markdown");
      expect(exported.content).toContain(token);

      const shared = await expectOk<{ status: string; share?: { localText?: string } }>(
        await director.post(`/api/weekly-reports/${created.reportId}/share`, { data: {} })
      );
      expect(shared.status).toBe("shared");
      expect(shared.share?.localText).toContain(created.reportId);

      const patched = await expectOk<{ reportId: string; title: string; scopeId: string }>(
        await director.patch(`/api/weekly-reports/${created.reportId}`, {
          data: { title: `${token} updated`, scopeId: "forged-scope" },
        })
      );
      expect(patched.reportId).toBe(created.reportId);
      expect(patched.title).toBe(`${token} updated`);
      expect(patched.scopeId).toBe("inst-1");

      await expectFailure(await parent.get(`/api/weekly-reports/${created.reportId}`), 403, "forbidden_scope");
      await expectFailure(await teacher.get(`/api/weekly-reports/${created.reportId}/export?format=json`), 403, "forbidden_scope");

      const archived = await expectOk<{ status: string }>(
        await director.post(`/api/weekly-reports/${created.reportId}/archive`, { data: { action: "archive" } })
      );
      expect(archived.status).toBe("archived");
      const restored = await expectOk<{ status: string }>(
        await director.post(`/api/weekly-reports/${created.reportId}/archive`, { data: { action: "restore" } })
      );
      expect(restored.status).not.toBe("archived");
    } finally {
      await director.dispose();
      await teacher.dispose();
      await parent.dispose();
    }
  });
});
