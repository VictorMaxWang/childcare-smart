import { expect, test } from "@playwright/test";

import {
  CHILD_FORBIDDEN,
  CHILD_PARENT,
  CHILD_TEACHER,
  createWeeklyReport,
  demoContext,
  expectFailure,
  expectOk,
  tinyPngDataUrl,
} from "./e11-helpers";

test.describe.configure({ mode: "serial" });

test.describe("E11 API scope regression", () => {
  test("business routes keep uniform 401/403 envelopes and do not leak scoped data", async ({ request }, testInfo) => {
    const director = await demoContext(testInfo, "u-admin");
    const teacher = await demoContext(testInfo, "u-teacher");
    const teacher2 = await demoContext(testInfo, "u-teacher2");
    const parent = await demoContext(testInfo, "u-parent");
    const token = `e11-scope-${Date.now()}`;

    try {
      await expectFailure(await request.get("/api/children"), 401, "unauthorized");
      await expectFailure(await parent.get(`/api/children/${CHILD_FORBIDDEN}`), 403, "forbidden_scope");
      await expectFailure(await teacher2.get(`/api/records?type=health&childId=${CHILD_TEACHER}`), 403, "forbidden_scope");

      const report = await createWeeklyReport(director, `${token} weekly`);
      await expectFailure(await parent.get(`/api/weekly-reports/${report.reportId}`), 403, "forbidden_scope");
      await expectFailure(await teacher.get(`/api/weekly-reports/${report.reportId}/export?format=markdown`), 403, "forbidden_scope");

      const feedback = await expectOk<{ feedback: { feedbackId: string } }>(
        await parent.post("/api/feedback", {
          data: {
            childId: CHILD_PARENT,
            title: `${token} feedback`,
            content: `${token} feedback content`,
            sourceChannel: "e11-api-scope",
          },
        }),
        201
      );
      const attachment = await expectOk<{ attachmentId: string; childId: string }>(
        await parent.post("/api/attachments", {
          data: {
            childId: CHILD_PARENT,
            relatedType: "feedback",
            relatedId: feedback.feedback.feedbackId,
            kind: "image",
            fileName: `${token}.png`,
            mimeType: "image/png",
            byteSize: 68,
            localPreviewUrl: tinyPngDataUrl(),
          },
        }),
        201
      );
      expect(attachment.childId).toBe(CHILD_PARENT);
      await expectFailure(await teacher2.get(`/api/attachments/${attachment.attachmentId}`), 403, "forbidden_scope");
      await expectFailure(await teacher2.get(`/api/attachments/${attachment.attachmentId}/content`), 403, "forbidden_scope");

      const assignment = await expectOk<{ assignmentId: string; status: string }>(
        await director.post("/api/assignments", {
          data: {
            childId: CHILD_TEACHER,
            teacherId: "u-teacher",
            title: `${token} assignment`,
            description: `${token} assignment description`,
          },
        }),
        201
      );
      expect(assignment.status).toBe("pending");
      await expectFailure(await parent.get("/api/assignments"), 403, "forbidden_scope");
      await expectFailure(
        await teacher2.patch(`/api/assignments/${assignment.assignmentId}`, {
          data: { status: "resolved", completionSummary: `${token} forbidden` },
        }),
        403,
        "forbidden_scope"
      );

      const updated = await expectOk<{ status: string }>(
        await teacher.patch(`/api/assignments/${assignment.assignmentId}`, {
          data: { status: "resolved", completionSummary: `${token} completed` },
        })
      );
      expect(updated.status).toBe("completed");
    } finally {
      await director.dispose();
      await teacher.dispose();
      await teacher2.dispose();
      await parent.dispose();
    }
  });
});
