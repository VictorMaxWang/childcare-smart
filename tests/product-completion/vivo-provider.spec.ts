import { expect, test } from "@playwright/test";

import { CHILD_TEACHER, demoContext, expectFailure, expectOk } from "./e11-helpers";

type CapabilityStatus = {
  providerName: string;
  configured: boolean;
  supported: boolean;
  isRealProvider: boolean;
  status: string;
  requiredEnv?: string[];
  warnings: string[];
};

test.describe("E11 vivo provider status regression", () => {
  test("provider status is authenticated, redacted and explicit about fallback state", async ({ request }, testInfo) => {
    const parent = await demoContext(testInfo, "u-parent");

    try {
      await expectFailure(await request.get("/api/ai/provider-status"), 401, "unauthorized");

      const status = await expectOk<{
        chat: CapabilityStatus;
        asr: CapabilityStatus;
        fallbackText: string;
      }>(await parent.get("/api/ai/provider-status"));

      for (const capability of [status.chat, status.asr]) {
        expect(capability.providerName).toBe("vivo");
        expect(capability.supported).toBe(true);
        expect(["ready", "missing-env", "unsupported", "provider-unavailable", "error"]).toContain(capability.status);
        expect(Array.isArray(capability.requiredEnv)).toBe(true);
        expect(JSON.stringify(capability)).not.toMatch(/secret|token|VIVO_APP_KEY=.*|Bearer\s+\S+/i);
        if (capability.status === "ready") {
          expect(capability.configured).toBe(true);
          expect(capability.isRealProvider).toBe(true);
        } else {
          expect(capability.configured).toBe(false);
          expect(capability.isRealProvider).toBe(false);
        }
      }

      if (status.chat.status !== "ready" || status.asr.status !== "ready") {
        expect(status.fallbackText).toMatch(/fallback|本地|文本|local/i);
      }
    } finally {
      await parent.dispose();
    }
  });

  test("health parser reports OCR provider state without exposing credentials", async ({}, testInfo) => {
    const teacher = await demoContext(testInfo, "u-teacher2");
    const token = `e11-vivo-${Date.now()}`;

    try {
      const response = await teacher.post("/api/ai/health-file-bridge", {
        data: {
          childId: CHILD_TEACHER,
          sourceRole: "teacher",
          requestSource: "e11-vivo-provider",
          files: [
            {
              name: `${token}.txt`,
              mimeType: "text/plain",
              previewText: `${token} temperature 38.8 follow up required`,
            },
          ],
        },
      });
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.source).toMatch(/fallback|vivo-ocr-provider|local/i);
      if (body.source !== "vivo-ocr-provider") {
        expect(body.fallback).toBe(true);
        expect(body.providerStatus?.ocr?.status).toMatch(/ready|missing-env|provider-unavailable|unsupported/);
        if (body.providerStatus?.ocr?.status === "ready") {
          expect(body.providerStatus?.ocr?.isRealProvider).toBe(true);
        }
      }
      expect(JSON.stringify(body)).toContain(token);
      expect(JSON.stringify(body)).not.toMatch(/Bearer\s+\S+/i);
    } finally {
      await teacher.dispose();
    }
  });
});
