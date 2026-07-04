import { expect, request as playwrightRequest, test, type APIRequestContext, type TestInfo } from "@playwright/test";

async function demoContext(testInfo: TestInfo, accountId: string) {
  const baseURL = testInfo.project.use.baseURL as string | undefined;
  const context = await playwrightRequest.newContext({ baseURL });
  const response = await context.post("/api/auth/demo-login", { data: { accountId } });
  expect(response.ok()).toBeTruthy();
  return context;
}

async function expectFailure(response: Awaited<ReturnType<APIRequestContext["get"]>>, status: number, code: string) {
  expect(response.status()).toBe(status);
  const body = await response.json();
  expect(body.ok).toBe(false);
  expect(body.code).toBe(code);
  expect(typeof body.error).toBe("string");
  expect(body.error.length).toBeGreaterThan(0);
  return body;
}

async function expectSuccess(response: Awaited<ReturnType<APIRequestContext["get"]>>, status = 200) {
  expect(response.status()).toBe(status);
  const body = await response.json();
  expect(body.ok).toBe(true);
  expect(body.data).toBeDefined();
  return body.data;
}

test.describe("E01 API scope foundation", () => {
  test("returns 401 with a uniform error envelope when no session is present", async ({ request }) => {
    const response = await request.get("/api/children");

    await expectFailure(response, 401, "unauthorized");
  });

  test("denies parent and cross-class teacher child access", async ({ request: _request }, testInfo) => {
    void _request;
    const parent = await demoContext(testInfo, "u-parent");
    const teacher2 = await demoContext(testInfo, "u-teacher2");

    try {
      await expectFailure(await parent.get("/api/children/c-3"), 403, "forbidden_scope");
      await expectFailure(await teacher2.get("/api/children/c-1"), 403, "forbidden_scope");
    } finally {
      await parent.dispose();
      await teacher2.dispose();
    }
  });

  test("allows director aggregate analytics", async ({ request: _request }, testInfo) => {
    void _request;
    const director = await demoContext(testInfo, "u-admin");

    try {
      const data = await expectSuccess(await director.get("/api/analytics/director-dashboard"));
      expect(data.childCount).toBeGreaterThanOrEqual(3);
      expect(data.teacherCount).toBeGreaterThanOrEqual(2);
    } finally {
      await director.dispose();
    }
  });

  test("creates, reads, updates and archives records without mutating denied writes", async ({ request: _request }, testInfo) => {
    void _request;
    const teacher = await demoContext(testInfo, "u-teacher");
    const teacher2 = await demoContext(testInfo, "u-teacher2");
    const token = `e01-api-${Date.now()}`;
    const deniedToken = `${token}-denied`;

    try {
      const createData = await expectSuccess(
        await teacher.post("/api/records", {
          data: {
            type: "health",
            childId: "c-1",
            date: "2026-05-02",
            temperature: 36.8,
            remark: token,
          },
        }),
        201
      );
      const recordId = createData.id;
      expect(recordId).toBeTruthy();

      const listed = await expectSuccess(await teacher.get("/api/records?type=health&childId=c-1&includeArchived=1"));
      expect(listed.some((record: { id: string; remark?: string }) => record.id === recordId && record.remark === token)).toBe(true);

      const updated = await expectSuccess(
        await teacher.patch(`/api/records/${recordId}`, {
          data: {
            type: "health",
            childId: "c-3",
            id: "client-forged-id",
            remark: `${token}-updated`,
          },
        })
      );
      expect(updated.id).toBe(recordId);
      expect(updated.childId).toBe("c-1");
      expect(updated.remark).toBe(`${token}-updated`);

      await expectFailure(
        await teacher2.post("/api/records", {
          data: {
            type: "health",
            childId: "c-1",
            remark: deniedToken,
          },
        }),
        403,
        "forbidden_scope"
      );

      const afterDenied = await expectSuccess(await teacher.get("/api/records?type=health&childId=c-1&includeArchived=1"));
      expect(afterDenied.some((record: { remark?: string }) => record.remark === deniedToken)).toBe(false);

      const archived = await expectSuccess(
        await teacher.post(`/api/records/${recordId}/archive`, {
          data: {
            type: "health",
            action: "archive",
          },
        })
      );
      expect(archived.archivedAt).toBeTruthy();

      const activeOnly = await expectSuccess(await teacher.get("/api/records?type=health&childId=c-1"));
      expect(activeOnly.some((record: { id: string }) => record.id === recordId)).toBe(false);

      const includeArchived = await expectSuccess(await teacher.get("/api/records?type=health&childId=c-1&includeArchived=1"));
      expect(includeArchived.some((record: { id: string; archivedAt?: string }) => record.id === recordId && record.archivedAt)).toBe(true);
    } finally {
      await teacher.dispose();
      await teacher2.dispose();
    }
  });
});
