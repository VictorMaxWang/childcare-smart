import { expect, test } from "@playwright/test";

import { CHILD_TEACHER, demoContext, expectFailure, expectOk, tinyPngDataUrl } from "./e11-helpers";

test.describe("E11 OCR and ASR fallback regression", () => {
  test("OCR image input without text does not become fake health parse success", async ({}, testInfo) => {
    const teacher = await demoContext(testInfo, "u-teacher2");
    const token = `e11-ocr-${Date.now()}`;

    try {
      const response = await teacher.post("/api/ai/health-file-bridge", {
        data: {
          childId: CHILD_TEACHER,
          sourceRole: "teacher",
          requestSource: "e11-ocr-asr",
          files: [
            {
              name: `${token}.png`,
              mimeType: "image/png",
              imageBase64: tinyPngDataUrl().split(",")[1],
            },
          ],
        },
      });

      if (response.status() === 503) {
        const body = await response.json();
        expect(body.ok).toBe(false);
        expect(body.code).toBe("provider_unavailable");
      } else {
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.source).toBe("vivo-ocr-provider");
        expect(body.fallback).toBe(false);
      }
    } finally {
      await teacher.dispose();
    }
  });

  test("ASR audio-only fails closed but typed transcript fallback succeeds", async ({}, testInfo) => {
    const teacher = await demoContext(testInfo, "u-teacher2");
    const token = `e11-asr-${Date.now()}`;

    try {
      const audioOnly = await teacher.post("/api/ai/voice-asr", {
        multipart: {
          audio: {
            name: `${token}.webm`,
            mimeType: "audio/webm",
            buffer: Buffer.from("not-a-real-audio-file"),
          },
          scene: "e11-audio-only",
        },
      });
      if (audioOnly.status() === 503) {
        await expectFailure(audioOnly, 503, "provider_unavailable");
      } else {
        const body = await audioOnly.json();
        if (!body.ok) {
          expect(["provider_unavailable", "unsupported"]).toContain(body.code);
        } else {
          expect(body.data.status.isRealProvider).toBe(true);
        }
      }

      const typed = await expectOk<{
        transcript: string;
        source: string;
        fallback: boolean;
        status: { isRealProvider: boolean; status: string };
      }>(
        await teacher.post("/api/ai/voice-asr", {
          multipart: {
            transcript: `${token} typed transcript`,
            scene: "e11-typed-transcript",
          },
        })
      );
      expect(typed.transcript).toContain(token);
      expect(typed.source).toBe("provided_transcript");
      expect(typed.fallback).toBe(true);
      expect(["ready", "missing-env", "provider-unavailable", "unsupported"]).toContain(typed.status.status);

      const understand = await teacher.post("/api/ai/teacher-voice-understand", {
        data: {
          transcript: `${token} teacher note`,
          childId: CHILD_TEACHER,
          childName: "E11 child",
          scene: "e11-json-fallback",
        },
      });
      expect(understand.status()).toBe(200);
      const understandBody = await understand.json();
      expect(understandBody.transcript.text).toContain(token);
      expect(understandBody.transcript.fallback).toBe(true);
      expect(understandBody.source.asr).toBe("provided_transcript");
    } finally {
      await teacher.dispose();
    }
  });
});
