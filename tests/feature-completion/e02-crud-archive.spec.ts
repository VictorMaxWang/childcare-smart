import { expect, request as playwrightRequest, test, type APIResponse, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { loginAs } from "./helpers";

const E02_ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "product-completion", "E02");

async function demoContext(testInfo: TestInfo, accountId: string) {
  const baseURL = testInfo.project.use.baseURL as string | undefined;
  return playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: {
      "x-demo-account-id": accountId,
    },
  });
}

async function expectFailure(response: APIResponse, status: number, code: string) {
  expect(response.status()).toBe(status);
  const body = await response.json();
  expect(body.ok).toBe(false);
  expect(body.code).toBe(code);
  expect(typeof body.error).toBe("string");
  return body;
}

async function expectSuccess<T = Record<string, unknown>>(response: APIResponse, status = 200): Promise<T> {
  expect(response.status()).toBe(status);
  const body = await response.json();
  expect(body.ok).toBe(true);
  expect(body.data).toBeDefined();
  return body.data as T;
}

async function capture(page: Page, fileName: string) {
  await fs.mkdir(E02_ARTIFACT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(E02_ARTIFACT_DIR, fileName),
    fullPage: true,
  });
}

async function acceptNextDialog(page: Page) {
  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
}

test.describe.serial("E02 CRUD archive and scope", () => {
  test("API supports child and teacher CRUD, archive, restore and forbidden scope", async ({ request: _request }, testInfo) => {
    void _request;
    const director = await demoContext(testInfo, "u-admin");
    const teacher = await demoContext(testInfo, "u-teacher");
    const teacher2 = await demoContext(testInfo, "u-teacher2");
    const parent = await demoContext(testInfo, "u-parent");
    const token = `e02-api-${Date.now()}`;

    try {
      const createdChild = await expectSuccess<{ id: string; name: string }>(
        await director.post("/api/children", {
          data: {
            name: `${token}-child`,
            birthDate: "2023-03-04",
            gender: "女",
            allergies: ["牛奶"],
            heightCm: 94,
            weightKg: 13,
            guardians: [{ name: "E02妈妈", relation: "母亲", phone: "13800000000" }],
            className: "向阳班",
            specialNotes: "E02 API create",
            parentUserId: "u-parent",
          },
        }),
        201
      );

      await expectSuccess(await parent.get(`/api/children/${createdChild.id}`));
      await expectFailure(await parent.get("/api/children/c-3"), 403, "forbidden_scope");

      const updatedChild = await expectSuccess<{ id: string; name: string; className: string; archivedAt?: string }>(
        await director.patch(`/api/children/${createdChild.id}`, {
          data: {
            id: "client-forged-id",
            institutionId: "client-forged-inst",
            archivedAt: "client-forged-archive",
            name: `${token}-child-updated`,
            className: "晨曦班",
          },
        })
      );
      expect(updatedChild.id).toBe(createdChild.id);
      expect(updatedChild.name).toBe(`${token}-child-updated`);
      expect(updatedChild.className).toBe("晨曦班");
      expect(updatedChild.archivedAt).toBeFalsy();

      const archivedChild = await expectSuccess<{ archivedAt?: string; archivedBy?: string; archiveReason?: string }>(
        await director.post(`/api/children/${createdChild.id}/archive`, {
          data: { action: "archive", archiveReason: "E02 API archive" },
        })
      );
      expect(archivedChild.archivedAt).toBeTruthy();
      expect(archivedChild.archivedBy).toBe("u-admin");
      expect(archivedChild.archiveReason).toBe("E02 API archive");

      const activeChildren = await expectSuccess<Array<{ id: string }>>(await director.get("/api/children"));
      expect(activeChildren.some((child) => child.id === createdChild.id)).toBe(false);

      const archivedChildren = await expectSuccess<Array<{ id: string; archivedAt?: string }>>(
        await director.get("/api/children?includeArchived=1")
      );
      expect(archivedChildren.some((child) => child.id === createdChild.id && child.archivedAt)).toBe(true);

      const restoredChild = await expectSuccess<{ archivedAt?: string; restoredBy?: string }>(
        await director.post(`/api/children/${createdChild.id}/archive`, {
          data: { action: "restore" },
        })
      );
      expect(restoredChild.archivedAt).toBeFalsy();
      expect(restoredChild.restoredBy).toBe("u-admin");

      await expectFailure(await teacher.get("/api/teachers"), 403, "forbidden_scope");
      await expectFailure(await parent.get("/api/teachers"), 403, "forbidden_scope");

      const createdTeacher = await expectSuccess<{ teacherId: string; name: string }>(
        await director.post("/api/teachers", {
          data: {
            name: `${token}-teacher`,
            className: "向阳班",
          },
        }),
        201
      );

      const updatedTeacher = await expectSuccess<{ teacherId: string; name: string; className?: string; archivedAt?: string }>(
        await director.patch(`/api/teachers/${createdTeacher.teacherId}`, {
          data: {
            name: `${token}-teacher-updated`,
            className: "晨曦班",
            archivedAt: "client-forged-archive",
          },
        })
      );
      expect(updatedTeacher.teacherId).toBe(createdTeacher.teacherId);
      expect(updatedTeacher.name).toBe(`${token}-teacher-updated`);
      expect(updatedTeacher.className).toBe("晨曦班");
      expect(updatedTeacher.archivedAt).toBeFalsy();

      await expectFailure(
        await teacher2.patch(`/api/teachers/${createdTeacher.teacherId}`, {
          data: { name: "forbidden teacher update" },
        }),
        403,
        "forbidden_scope"
      );

      const archivedTeacher = await expectSuccess<{ archivedAt?: string; archivedBy?: string; archiveReason?: string }>(
        await director.post(`/api/teachers/${createdTeacher.teacherId}/archive`, {
          data: { action: "archive", archiveReason: "E02 API archive" },
        })
      );
      expect(archivedTeacher.archivedAt).toBeTruthy();
      expect(archivedTeacher.archivedBy).toBe("u-admin");
      expect(archivedTeacher.archiveReason).toBe("E02 API archive");

      const activeTeachers = await expectSuccess<Array<{ teacherId: string }>>(await director.get("/api/teachers"));
      expect(activeTeachers.some((item) => item.teacherId === createdTeacher.teacherId)).toBe(false);

      const archivedTeachers = await expectSuccess<Array<{ teacherId: string; archivedAt?: string }>>(
        await director.get("/api/teachers?includeArchived=1")
      );
      expect(archivedTeachers.some((item) => item.teacherId === createdTeacher.teacherId && item.archivedAt)).toBe(true);

      const restoredTeacher = await expectSuccess<{ archivedAt?: string; restoredBy?: string }>(
        await director.post(`/api/teachers/${createdTeacher.teacherId}/archive`, {
          data: { action: "restore" },
        })
      );
      expect(restoredTeacher.archivedAt).toBeFalsy();
      expect(restoredTeacher.restoredBy).toBe("u-admin");

      await fs.mkdir(E02_ARTIFACT_DIR, { recursive: true });
      await fs.writeFile(
        path.join(E02_ARTIFACT_DIR, "api-crud-archive-restore-permission.json"),
        `${JSON.stringify({ ok: true, token, childId: createdChild.id, teacherId: createdTeacher.teacherId }, null, 2)}\n`,
        "utf8"
      );
    } finally {
      await director.dispose();
      await teacher.dispose();
      await teacher2.dispose();
      await parent.dispose();
    }
  });

  test("UI supports director child CRUD archive and restore", async ({ page }) => {
    const token = `E02 UI Child ${Date.now()}`;
    await loginAs(page, "u-admin", "/children");
    await page.getByTestId("e02-open-add-child").click();
    await page.getByTestId("e02-child-name").fill(token);
    await page.getByTestId("e02-child-guardian").fill("E02家长");
    await page.getByTestId("e02-child-class").fill("向阳班");
    await page.getByTestId("e02-child-notes").fill("E02 UI create");
    await page.getByTestId("e02-save-child").click();
    await expect(page.locator("tbody tr", { hasText: token })).toBeVisible();

    await page.reload();
    await expect(page.locator("tbody tr", { hasText: token })).toBeVisible();

    let row = page.locator("tr", { hasText: token });
    await row.locator('[data-testid^="e02-edit-child-"]').click();
    await page.getByTestId("e02-child-nickname").fill("E02昵称");
    await page.getByTestId("e02-child-notes").fill("E02 UI updated");
    await page.getByTestId("e02-save-child").click();
    await expect(page.locator("tbody tr", { hasText: token }).getByText("E02昵称")).toBeVisible();
    await capture(page, "01-admin-child-created-edited.png");

    row = page.locator("tr", { hasText: token });
    await acceptNextDialog(page);
    await row.locator('[data-testid^="e02-archive-child-"]').click();
    await expect(page.locator("tbody tr", { hasText: token })).toHaveCount(0);

    await page.getByTestId("e02-toggle-archived-children").click();
    await expect(page.locator("tbody tr", { hasText: token })).toBeVisible();
    await capture(page, "02-admin-child-archived.png");

    row = page.locator("tr", { hasText: token });
    await acceptNextDialog(page);
    await row.locator('[data-testid^="e02-restore-child-"]').click();
    await page.getByTestId("e02-toggle-archived-children").click();
    await expect(page.locator("tbody tr", { hasText: token })).toBeVisible();
    await capture(page, "03-admin-child-restored.png");
  });

  test("UI supports director teacher CRUD archive and restore", async ({ page }) => {
    const token = `E02 UI Teacher ${Date.now()}`;
    await loginAs(page, "u-admin", "/admin/teachers");
    await page.getByTestId("e02-open-add-teacher").click();
    await page.getByTestId("e02-teacher-name").fill(token);
    await page.getByTestId("e02-teacher-class").fill("向阳班");
    await page.getByTestId("e02-save-teacher").click();
    await expect(page.locator("tbody tr", { hasText: token })).toBeVisible();

    await page.reload();
    await expect(page.locator("tbody tr", { hasText: token })).toBeVisible();

    let row = page.locator("tr", { hasText: token });
    await row.locator('[data-testid^="e02-edit-teacher-"]').click();
    await page.getByTestId("e02-teacher-class").fill("晨曦班");
    await page.getByTestId("e02-save-teacher").click();
    await expect(page.locator("tr", { hasText: token }).getByText("晨曦班")).toBeVisible();
    await capture(page, "04-admin-teacher-created-edited.png");

    row = page.locator("tr", { hasText: token });
    await acceptNextDialog(page);
    await row.locator('[data-testid^="e02-archive-teacher-"]').click();
    await expect(page.locator("tbody tr", { hasText: token })).toHaveCount(0);

    await page.getByTestId("e02-toggle-archived-teachers").click();
    await expect(page.locator("tbody tr", { hasText: token })).toBeVisible();
    await capture(page, "05-admin-teacher-archived.png");

    row = page.locator("tr", { hasText: token });
    await acceptNextDialog(page);
    await row.locator('[data-testid^="e02-restore-teacher-"]').click();
    await page.getByTestId("e02-toggle-archived-teachers").click();
    await expect(page.locator("tbody tr", { hasText: token })).toBeVisible();
    await capture(page, "06-admin-teacher-restored.png");
  });

  test("teacher account cannot access teacher management UI", async ({ page }) => {
    await loginAs(page, "u-teacher", "/admin/teachers");
    await expect(page).toHaveURL(/\/teacher/);
    await capture(page, "07-teacher-management-forbidden.png");
  });
});
