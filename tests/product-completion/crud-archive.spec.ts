import { expect, test } from "@playwright/test";

import { CHILD_TEACHER, demoContext, expectFailure, expectOk } from "./e11-helpers";

type RecordType = "attendance" | "health" | "meal" | "growth";

const recordInputs: Record<RecordType, Record<string, unknown>> = {
  attendance: { isPresent: true, checkInAt: "08:05" },
  health: { temperature: 36.7, mood: "stable", remark: "E11 health" },
  meal: { meal: "lunch", foods: ["rice", "egg"], intakeLevel: "good", waterMl: 120 },
  growth: { category: "routine", description: "E11 growth" },
};

test.describe.configure({ mode: "serial" });

test.describe("E11 CRUD and archive regression", () => {
  test("children and teachers support create/update/archive/restore through API", async ({}, testInfo) => {
    const director = await demoContext(testInfo, "u-admin");
    const teacher = await demoContext(testInfo, "u-teacher");
    const token = `e11-crud-${Date.now()}`;

    try {
      const child = await expectOk<{ id: string; name: string }>(
        await director.post("/api/children", {
          data: {
            name: `${token}-child`,
            className: "E11 Class",
            guardians: [{ name: "E11 Guardian", relation: "parent", phone: "13800000000" }],
            parentUserId: "u-parent",
          },
        }),
        201
      );
      const updatedChild = await expectOk<{ id: string; name: string; archivedAt?: string }>(
        await director.patch(`/api/children/${child.id}`, {
          data: { id: "forged-id", name: `${token}-child-updated`, archivedAt: "forged-archive" },
        })
      );
      expect(updatedChild.id).toBe(child.id);
      expect(updatedChild.name).toBe(`${token}-child-updated`);
      expect(updatedChild.archivedAt).toBeFalsy();
      expect((await expectOk<{ archivedAt?: string }>(
        await director.post(`/api/children/${child.id}/archive`, { data: { action: "archive" } })
      )).archivedAt).toBeTruthy();
      expect((await expectOk<{ archivedAt?: string }>(
        await director.post(`/api/children/${child.id}/archive`, { data: { action: "restore" } })
      )).archivedAt).toBeFalsy();

      await expectFailure(await teacher.get("/api/teachers"), 403, "forbidden_scope");
      const createdTeacher = await expectOk<{ teacherId: string; name: string }>(
        await director.post("/api/teachers", {
          data: { name: `${token}-teacher`, className: "E11 Class" },
        }),
        201
      );
      const updatedTeacher = await expectOk<{ teacherId: string; className?: string; archivedAt?: string }>(
        await director.patch(`/api/teachers/${createdTeacher.teacherId}`, {
          data: { className: "E11 Updated Class", archivedAt: "forged-archive" },
        })
      );
      expect(updatedTeacher.teacherId).toBe(createdTeacher.teacherId);
      expect(updatedTeacher.className).toBe("E11 Updated Class");
      expect(updatedTeacher.archivedAt).toBeFalsy();
      expect((await expectOk<{ archivedAt?: string }>(
        await director.post(`/api/teachers/${createdTeacher.teacherId}/archive`, { data: { action: "archive" } })
      )).archivedAt).toBeTruthy();
      expect((await expectOk<{ archivedAt?: string }>(
        await director.post(`/api/teachers/${createdTeacher.teacherId}/archive`, { data: { action: "restore" } })
      )).archivedAt).toBeFalsy();
    } finally {
      await director.dispose();
      await teacher.dispose();
    }
  });

  for (const type of Object.keys(recordInputs) as RecordType[]) {
    test(`${type} records reject forged scope and support archive/restore`, async ({}, testInfo) => {
      const teacher = await demoContext(testInfo, "u-teacher");
      const teacher2 = await demoContext(testInfo, "u-teacher2");
      const token = `e11-${type}-${Date.now()}`;

      try {
        const created = await expectOk<{ id: string; childId: string; archivedAt?: string }>(
          await teacher.post("/api/records", {
            data: {
              type,
              childId: CHILD_TEACHER,
              date: "2026-05-03",
              ...recordInputs[type],
              remark: token,
              description: token,
            },
          }),
          201
        );
        expect(created.childId).toBe(CHILD_TEACHER);

        const updated = await expectOk<{ id: string; childId: string; archivedAt?: string }>(
          await teacher.patch(`/api/records/${created.id}`, {
            data: { type, childId: "c-3", id: "forged-record-id", archivedAt: "forged", remark: `${token}-updated` },
          })
        );
        expect(updated.id).toBe(created.id);
        expect(updated.childId).toBe(CHILD_TEACHER);
        expect(updated.archivedAt).toBeFalsy();

        await expectFailure(
          await teacher2.post("/api/records", {
            data: { type, childId: CHILD_TEACHER, remark: `${token}-denied` },
          }),
          403,
          "forbidden_scope"
        );

        const archived = await expectOk<{ archivedAt?: string }>(
          await teacher.post(`/api/records/${created.id}/archive`, { data: { type, action: "archive" } })
        );
        expect(archived.archivedAt).toBeTruthy();
        const activeOnly = await expectOk<Array<{ id: string }>>(
          await teacher.get(`/api/records?type=${type}&childId=${CHILD_TEACHER}`)
        );
        expect(activeOnly.some((record) => record.id === created.id)).toBe(false);
        const restored = await expectOk<{ archivedAt?: string }>(
          await teacher.post(`/api/records/${created.id}/archive`, { data: { type, action: "restore" } })
        );
        expect(restored.archivedAt).toBeFalsy();
      } finally {
        await teacher.dispose();
        await teacher2.dispose();
      }
    });
  }
});
