import { expect, test } from "@playwright/test";
import {
  capture,
  demoContext,
  expectOk,
  finalizeFeatureTest,
  loginAs,
  resetDemoStorage,
  tinyPngDataUrl,
} from "./helpers";

test.describe.configure({ mode: "serial" });

test.afterEach(async ({ page }, testInfo) => {
  await finalizeFeatureTest(page, testInfo);
});

test("D08 health material parse and consultation persist across teacher director parent", async ({ page }, testInfo) => {
  const stamp = Date.now();
  const childId = "c-1";
  const filename = `r02-health-note-${stamp}.txt`;
  const materialToken = `R02-MATERIAL-${stamp}`;
  const noteToken = `R02-NOTE-${stamp}`;

  const teacher = await demoContext(testInfo, "u-teacher");
  const director = await demoContext(testInfo, "u-admin");
  const parent = await demoContext(testInfo, "u-parent");

  try {
    await resetDemoStorage(page);

    const parseResponse = await teacher.post("/api/ai/health-file-bridge", {
      data: {
        childId,
        sourceRole: "teacher",
        requestSource: "r02-health-consultation",
        files: [
          {
            name: filename,
            mimeType: "text/plain",
            previewText: `${materialToken} temperature 39.0 high risk follow up tomorrow`,
          },
        ],
      },
    });
    expect(parseResponse.status()).toBe(200);
    const parseBody = await parseResponse.json();
    expect(parseBody.source).toMatch(/fallback|vivo-ocr-provider|local/i);
    if (parseBody.source !== "vivo-ocr-provider") {
      expect(parseBody.fallback).toBe(true);
      expect(parseBody.providerStatus?.ocr?.status).toMatch(/missing-env|provider-unavailable|unsupported/);
    }
    expect(JSON.stringify(parseBody)).toContain(materialToken);

    const binaryOnly = await teacher.post("/api/ai/health-file-bridge", {
      data: {
        childId,
        sourceRole: "teacher",
        requestSource: "r02-health-binary-provider",
        files: [
          {
            name: `${materialToken}.png`,
            mimeType: "image/png",
            imageBase64: tinyPngDataUrl().split(",")[1],
          },
        ],
      },
    });
    if (binaryOnly.status() === 503) {
      const body = await binaryOnly.json();
      expect(body.ok).toBe(false);
      expect(body.code).toBe("provider_unavailable");
    } else {
      expect(binaryOnly.status()).toBe(200);
      const body = await binaryOnly.json();
      expect(body.source).toBe("vivo-ocr-provider");
      expect(body.fallback).toBe(false);
    }

    const material = await expectOk<{
      materialId: string;
      childId: string;
      filename: string;
      parseStatus: string;
      parseResult?: unknown;
    }>(
      await teacher.post("/api/health-materials", {
        data: {
          childId,
          filename,
          fileType: "text/plain",
          description: materialToken,
          parseResult: parseBody,
        },
      }),
      201
    );
    expect(material).toMatchObject({ childId, filename, parseStatus: "completed" });

    const consultation = await expectOk<{
      consultationId: string;
      childId: string;
      workflowStatus: string;
      sourceMaterialId?: string;
      directorDecisionCard?: { status?: string };
    }>(
      await teacher.post("/api/consultations", {
        data: {
          childId,
          sourceMaterialId: material.materialId,
          riskLevel: "high",
          summary: `${noteToken} high risk consultation`,
          notes: noteToken,
        },
      }),
      201
    );
    expect(consultation).toMatchObject({
      childId,
      workflowStatus: "pending",
      sourceMaterialId: material.materialId,
      directorDecisionCard: { status: "pending" },
    });

    await expectOk(
      await teacher.post(`/api/consultations/${consultation.consultationId}/notes`, {
        data: { note: `${noteToken} teacher follow-up` },
      }),
      201
    );
    const resolved = await expectOk<{ workflowStatus: string; directorDecisionCard?: { status?: string } }>(
      await teacher.patch(`/api/consultations/${consultation.consultationId}/status`, {
        data: { status: "resolved" },
      })
    );
    expect(resolved.workflowStatus).toBe("resolved");
    expect(resolved.directorDecisionCard?.status).toBe("completed");

    const directorConsultations = await expectOk<Array<{ consultationId?: string; workflowStatus?: string }>>(
      await director.get(`/api/consultations?childId=${childId}`)
    );
    expect(
      directorConsultations.some(
        (item) => item.consultationId === consultation.consultationId && item.workflowStatus === "resolved"
      )
    ).toBe(true);

    const parentMaterials = await expectOk<Array<{ materialId?: string; filename?: string }>>(
      await parent.get(`/api/health-materials?childId=${childId}`)
    );
    expect(parentMaterials.some((item) => item.materialId === material.materialId && item.filename === filename)).toBe(true);

    await loginAs(page, "u-teacher", "/teacher/health-file-bridge");
    await expect(page.getByTestId("d05-health-history")).toContainText(filename, { timeout: 20_000 });
    await capture(page, "health-01-api-parse-save-consultation.png");

    await loginAs(page, "u-admin", "/admin");
    await expect(page.locator("body")).toContainText(filename, { timeout: 20_000 });
    await capture(page, "health-02-director-visible.png");

    await loginAs(page, "u-parent", `/parent?child=${childId}`);
    await expect(page.locator("body")).toContainText(/health|健康|鍋ュ悍|R02/i);
    await capture(page, "health-03-parent-scope-visible.png");
  } finally {
    await teacher.dispose();
    await director.dispose();
    await parent.dispose();
  }
});
