import { expect, test } from "@playwright/test";
import { loginAs } from "../feature-completion/helpers";

test("teacher confirms a voice draft into the canonical health record API", async ({
  page,
}) => {
  await loginAs(page, "u-teacher2", "/teacher/agent");

  await page.getByRole("button", { name: /健康观察/ }).click();
  const canonicalHealthDraft = page.locator(
    '[data-testid="teacher-draft-record"][data-category="HEALTH"]'
  ).first();
  await expect(canonicalHealthDraft).toBeVisible();

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/records") &&
      (response.request().method() === "POST" ||
        response.request().method() === "PATCH") &&
      response.ok()
  );
  await canonicalHealthDraft.getByTestId("teacher-draft-confirm").click();
  await responsePromise;
  await expect(canonicalHealthDraft).toContainText("已确认并保存");

  const childId = await canonicalHealthDraft
    .getAttribute("data-child-id")
    .catch(() => null);
  const records = await page.request.get(
    `/api/records?type=health&childId=${encodeURIComponent(childId || "c-1")}`
  );
  expect(records.status()).toBe(200);
  expect(await records.text()).toContain("37.6");
});
