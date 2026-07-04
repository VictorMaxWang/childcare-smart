import { expect, test, type Page } from "@playwright/test";

import type { AccountRole } from "@/lib/auth/accounts";

const REGISTER_USER = {
  id: "u-register-ui",
  username: "+8613800000000",
  name: "测试教师",
  role: "教师" as AccountRole,
  avatar: "👩‍🏫",
  institutionId: "inst-register-ui",
  className: "新注册班",
  childIds: [],
  accountKind: "normal",
};

async function mockAnonymousSession(page: Page) {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, user: null }),
    });
  });
}

async function fillRegistrationForm(page: Page, options?: { confirmPassword?: string; role?: "机构管理员" | "教师" | "家长" }) {
  await page.getByTestId("register-phone").fill("13800000000");
  await page.getByTestId("register-display-name").fill("测试用户");
  await page.getByTestId("register-password").fill("secret123");
  await page.getByTestId("register-confirm-password").fill(options?.confirmPassword ?? "secret123");
  await page.getByRole("button", { name: new RegExp(options?.role ?? "家长") }).click();
}

test.describe("phone registration page", () => {
  test("opens /register and login page links to it", async ({ page }) => {
    await mockAnonymousSession(page);

    await page.goto("/register");
    await expect(page.getByRole("heading", { name: "创建慧育童行账号" })).toBeVisible();

    await page.goto("/auth/register");
    await expect(page).toHaveURL(/\/register$/);

    await page.goto("/login");
    const registerLink = page.getByRole("link", { name: /立即注册/ }).last();
    await expect(registerLink).toHaveAttribute("href", "/register");
    await registerLink.click();
    await expect(page).toHaveURL(/\/register$/);
  });

  test("blocks mismatched passwords before submitting", async ({ page }) => {
    let registerCalls = 0;
    await mockAnonymousSession(page);
    await page.route("**/api/auth/register", async (route) => {
      registerCalls += 1;
      await route.fulfill({ status: 500, body: "should not be called" });
    });

    await page.goto("/register");
    await fillRegistrationForm(page, { confirmPassword: "different" });
    await page.getByRole("button", { name: "注册并进入系统" }).click();

    await expect(page.getByText("两次密码必须一致。")).toBeVisible();
    expect(registerCalls).toBe(0);
  });

  test("shows server-side confirmPassword errors", async ({ page }) => {
    await mockAnonymousSession(page);
    await page.route("**/api/auth/register", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: "两次输入的密码不一致。" }),
      });
    });

    await page.goto("/register");
    await fillRegistrationForm(page, { role: "机构管理员" });
    await page.getByRole("button", { name: "注册并进入系统" }).click();

    await expect(page.getByRole("region", { name: "手机号注册" }).getByRole("alert")).toContainText("两次密码不一致");
  });

  test("submits phone payload and follows API redirectPath", async ({ page }) => {
    let registered = false;
    let requestBody: Record<string, unknown> | null = null;
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: registered ? 200 : 401,
        contentType: "application/json",
        body: JSON.stringify(registered ? { ok: true, user: REGISTER_USER } : { ok: false, user: null }),
      });
    });
    await page.route("**/api/state", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, snapshot: null, isDemo: false }),
      });
    });
    await page.route("**/api/auth/register", async (route) => {
      requestBody = route.request().postDataJSON() as Record<string, unknown>;
      registered = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, user: REGISTER_USER, redirectPath: "/teacher" }),
      });
    });
    await page.goto("/register");
    await fillRegistrationForm(page, { role: "教师" });
    await page.getByRole("button", { name: "注册并进入系统" }).click();

    await expect(page).toHaveURL(/\/login\?next=%2Fteacher/);
    expect(new URL(page.url()).searchParams.get("next")).toBe("/teacher");
    expect(requestBody).toMatchObject({
      phone: "13800000000",
      username: "13800000000",
      password: "secret123",
      confirmPassword: "secret123",
      role: "teacher",
      displayName: "测试用户",
    });
  });
});
