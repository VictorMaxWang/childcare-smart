import { expect, test } from "@playwright/test";

const normalAdmin = {
  id: "u-session-resilience",
  name: "会话恢复园长",
  role: "机构管理员",
  avatar: "",
  institutionId: "inst-session-resilience",
  childIds: [],
  accountKind: "normal",
};

test("temporary session failure shows retry state without redirecting to login", async ({
  page,
}) => {
  const loginResponse = await page.request.post("/api/auth/demo-login", {
    data: { accountId: "u-admin" },
  });
  expect(loginResponse.ok()).toBe(true);
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        user: null,
        error: "会话服务暂时不可用。",
      }),
    });
  });

  await page.goto("/admin");

  await expect(page.getByText("暂时无法校验登录状态")).toBeVisible();
  await expect(page.getByRole("button", { name: "重新连接" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/admin");
});

test("state failure is surfaced instead of looking like an empty institution", async ({
  page,
}) => {
  const loginResponse = await page.request.post("/api/auth/demo-login", {
    data: { accountId: "u-admin" },
  });
  expect(loginResponse.ok()).toBe(true);
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, user: normalAdmin }),
    });
  });
  await page.route("**/api/state", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: "机构数据服务暂时不可用。",
      }),
    });
  });

  await page.goto("/admin");

  await expect(page.getByTestId("state-sync-error")).toContainText(
    "机构数据服务暂时不可用"
  );
  await expect(
    page.getByTestId("state-sync-error").getByRole("button", { name: "重试" })
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/admin");
});
