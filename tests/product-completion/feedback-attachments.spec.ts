import { expect, test } from "@playwright/test";

import { CHILD_PARENT, demoContext, expectFailure, expectOk, tinyPngDataUrl } from "./e11-helpers";

test.describe.configure({ mode: "serial" });

test.describe("E11 feedback and attachment regression", () => {
  test("feedback details include scoped image/audio attachments and enforce metadata limits", async ({}, testInfo) => {
    const parent = await demoContext(testInfo, "u-parent");
    const teacher = await demoContext(testInfo, "u-teacher");
    const teacher2 = await demoContext(testInfo, "u-teacher2");
    const director = await demoContext(testInfo, "u-admin");
    const token = `e11-feedback-${Date.now()}`;

    try {
      const feedback = await expectOk<{ feedback: { feedbackId: string } }>(
        await parent.post("/api/feedback", {
          data: {
            childId: CHILD_PARENT,
            title: `${token} title`,
            content: `${token} content`,
            sourceChannel: "e11-feedback",
          },
        }),
        201
      );
      const feedbackId = feedback.feedback.feedbackId;

      const image = await expectOk<{ attachmentId: string; kind: string }>(
        await parent.post("/api/attachments", {
          data: {
            childId: CHILD_PARENT,
            relatedType: "feedback",
            relatedId: feedbackId,
            kind: "image",
            fileName: `${token}.png`,
            mimeType: "image/png",
            byteSize: 68,
            localPreviewUrl: tinyPngDataUrl(),
          },
        }),
        201
      );
      expect(image.kind).toBe("image");

      const audio = await expectOk<{ attachmentId: string; kind: string }>(
        await teacher.post("/api/attachments", {
          data: {
            childId: CHILD_PARENT,
            relatedType: "feedback",
            relatedId: feedbackId,
            kind: "audio",
            fileName: `${token}.wav`,
            mimeType: "audio/wav",
            byteSize: 44,
            durationMs: 1000,
            localPreviewUrl: "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=",
          },
        }),
        201
      );
      expect(audio.kind).toBe("audio");

      const detail = await expectOk<{ feedback: { feedbackId: string }; attachments: Array<{ attachmentId: string }> }>(
        await director.get(`/api/feedback/${feedbackId}`)
      );
      expect(detail.feedback.feedbackId).toBe(feedbackId);
      expect(detail.attachments.some((item) => item.attachmentId === image.attachmentId)).toBe(true);
      expect(detail.attachments.some((item) => item.attachmentId === audio.attachmentId)).toBe(true);

      const content = await parent.get(`/api/attachments/${image.attachmentId}/content`);
      expect(content.status()).toBe(200);
      expect(content.headers()["content-type"]).toContain("image/png");

      await expectFailure(await teacher2.get(`/api/feedback/${feedbackId}`), 403, "forbidden_scope");
      await expectFailure(await teacher2.get(`/api/attachments/${image.attachmentId}/content`), 403, "forbidden_scope");

      await expectOk(
        await parent.post("/api/attachments", {
          data: {
            childId: CHILD_PARENT,
            relatedType: "feedback",
            relatedId: feedbackId,
            kind: "image",
            fileName: `${token}-third.png`,
            mimeType: "image/png",
            byteSize: 68,
          },
        }),
        201
      );
      await expectFailure(
        await parent.post("/api/attachments", {
          data: {
            childId: CHILD_PARENT,
            relatedType: "feedback",
            relatedId: feedbackId,
            kind: "image",
            fileName: `${token}-fourth.png`,
            mimeType: "image/png",
            byteSize: 68,
          },
        }),
        400,
        "invalid_request"
      );
      await expectFailure(
        await parent.post("/api/attachments", {
          data: {
            childId: CHILD_PARENT,
            kind: "image",
            fileName: `${token}-large.png`,
            mimeType: "image/png",
            byteSize: 5 * 1024 * 1024 + 1,
          },
        }),
        400,
        "invalid_request"
      );
    } finally {
      await parent.dispose();
      await teacher.dispose();
      await teacher2.dispose();
      await director.dispose();
    }
  });
});
