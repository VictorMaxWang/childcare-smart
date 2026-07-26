import { expect, test } from "@playwright/test";

import { tinyPngDataUrl } from "./helpers";

test("normal teacher stores the original health file before AI parsing", async ({
  page,
}) => {
  const demoLogin = await page.request.post("/api/auth/demo-login", {
    data: { accountId: "u-teacher2" },
  });
  expect(demoLogin.ok()).toBe(true);
  const sessionBody = await (await page.request.get("/api/auth/session")).json();
  const stateBody = await (await page.request.get("/api/state")).json();
  const normalUser = {
    ...sessionBody.user,
    accountKind: "normal",
  };
  const materialId = "hm-private-upload-test";
  const attachmentId = "attch-private-upload-test";
  const sequence: string[] = [];
  const capture: { aiPayload?: Record<string, unknown> } = {};

  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, user: normalUser }),
    });
  });
  await page.route("**/api/state", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...stateBody, isDemo: false }),
    });
  });
  await page.route("**/api/attachments?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: [] }),
    });
  });
  await page.route("**/api/health-materials/*/parse", async (route) => {
    sequence.push("material-status");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          materialId,
          childId: "c-1",
          filename: "health-note.png",
          fileType: "image/png",
          parseStatus: "processing",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }),
    });
  });
  await page.route("**/api/health-materials", async (route) => {
    sequence.push("material-created");
    const input = route.request().postDataJSON() as {
      childId?: string;
      filename?: string;
      fileType?: string;
    };
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          materialId,
          institutionId: normalUser.institutionId,
          childId: input.childId,
          filename: input.filename,
          fileType: input.fileType,
          parseStatus: "pending",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }),
    });
  });
  await page.route("**/api/attachments/upload", async (route) => {
    sequence.push("original-uploaded");
    expect(route.request().headerValue("content-type")).resolves.toContain(
      "multipart/form-data"
    );
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          attachmentId,
          institutionId: normalUser.institutionId,
          childId: "c-1",
          relatedType: "health-material",
          relatedId: materialId,
          kind: "image",
          fileName: "health-note.png",
          mimeType: "image/png",
          byteSize: 68,
          storageMode: "object_storage",
          uploadStatus: "uploaded",
          storageProvider: "vercel_blob",
          downloadUrl: `/api/attachments/${attachmentId}/content`,
          createdBy: normalUser.id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }),
    });
  });
  await page.route("**/api/ai/health-file-bridge", async (route) => {
    sequence.push("ai-requested");
    capture.aiPayload = route.request().postDataJSON() as Record<
      string,
      unknown
    >;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        code: "provider_unavailable",
        error: "test provider unavailable",
      }),
    });
  });

  await page.goto("/teacher/health-file-bridge");
  await page.getByTestId("d05-health-file-input").setInputFiles({
    name: "health-note.png",
    mimeType: "image/png",
    buffer: Buffer.from(tinyPngDataUrl().split(",")[1], "base64"),
  });
  await page
    .getByTestId("d05-health-preview-text")
    .fill("体温 38.1℃，建议明早复查。");
  await page.getByTestId("d05-start-parse").click();

  await expect.poll(() => sequence.includes("ai-requested")).toBe(true);
  expect(sequence.slice(0, 4)).toEqual([
    "material-created",
    "material-status",
    "original-uploaded",
    "ai-requested",
  ]);
  expect(
    (capture.aiPayload?.files as Array<Record<string, unknown>> | undefined)?.[0]
  ).toMatchObject({
    attachmentId,
    name: "health-note.png",
  });
  expect(
    (capture.aiPayload?.files as Array<Record<string, unknown>> | undefined)?.[0]
      ?.imageBase64
  ).toBeUndefined();
});

test("normal parent sees a structured health summary and authorized original-file link", async ({
  page,
}) => {
  const demoLogin = await page.request.post("/api/auth/demo-login", {
    data: { accountId: "u-parent" },
  });
  expect(demoLogin.ok()).toBe(true);
  const sessionBody = await (await page.request.get("/api/auth/session")).json();
  const stateBody = await (await page.request.get("/api/state")).json();
  const normalUser = {
    ...sessionBody.user,
    accountKind: "normal",
  };
  const materialId = "hm-parent-private-test";
  stateBody.snapshot.healthMaterials = [
    {
      materialId,
      institutionId: normalUser.institutionId,
      childId: "c-1",
      filename: "parent-visible-health-note.pdf",
      fileType: "application/pdf",
      parseStatus: "completed",
      parseResult: {
        summary: "体温偏高，建议持续观察。",
        riskItems: [
          { title: "体温", detail: "今日记录 38.1℃，需要复核。" },
        ],
        followUpHints: [
          { title: "复查", detail: "明早再次测量体温。" },
        ],
        rawResponse: { internal: "must-not-render-as-json" },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    ...(stateBody.snapshot.healthMaterials ?? []).filter(
      (item: { materialId?: string }) => item.materialId !== materialId
    ),
  ];

  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, user: normalUser }),
    });
  });
  await page.route("**/api/state", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...stateBody, isDemo: false }),
    });
  });
  await page.route("**/api/attachments?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: [
          {
            attachmentId: "attch-parent-private-test",
            institutionId: normalUser.institutionId,
            childId: "c-1",
            relatedType: "health-material",
            relatedId: materialId,
            kind: "pdf",
            fileName: "parent-visible-health-note.pdf",
            mimeType: "application/pdf",
            storageMode: "object_storage",
            uploadStatus: "uploaded",
            storageProvider: "vercel_blob",
            downloadUrl:
              "/api/attachments/attch-parent-private-test/content",
            createdBy: "normal-teacher",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      }),
    });
  });

  await page.goto("/health?child=c-1");
  await expect(
    page.getByTestId(`parent-health-material-${materialId}`)
  ).toContainText("体温偏高，建议持续观察。");
  await expect(page.getByTestId("parent-health-material-download")).toHaveAttribute(
    "href",
    /attch-parent-private-test\/content\?download=1$/
  );
  await expect(page.locator("body")).not.toContainText("rawResponse");
  await expect(page.locator("body")).not.toContainText(
    "must-not-render-as-json"
  );
});
