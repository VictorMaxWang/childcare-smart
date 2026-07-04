import {
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type APIResponse,
  type Page,
  type TestInfo,
} from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

export const ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "product-completion", "R02");
export const SHARED_NAMESPACE = "demo:v5-d01-shared-demo:institution:inst-1";
export const BUCKETS = {
  children: `childcare.${SHARED_NAMESPACE}.children.v3`,
  attendance: `childcare.${SHARED_NAMESPACE}.attendance.v3`,
  health: `childcare.${SHARED_NAMESPACE}.health.v3`,
  meals: `childcare.${SHARED_NAMESPACE}.meals.v3`,
  growth: `childcare.${SHARED_NAMESPACE}.growth.v3`,
  feedback: `childcare.${SHARED_NAMESPACE}.feedback.v3`,
  messages: `childcare.${SHARED_NAMESPACE}.messages.v1`,
  conversations: `childcare.${SHARED_NAMESPACE}.conversations.v1`,
  consultations: `childcare.${SHARED_NAMESPACE}.consultations.v1`,
  healthMaterials: `childcare.${SHARED_NAMESPACE}.health-materials.v1`,
  mobileDrafts: `childcare.${SHARED_NAMESPACE}.mobile-drafts.v1`,
  reminders: `childcare.${SHARED_NAMESPACE}.reminders.v1`,
  storybooks: `childcare.${SHARED_NAMESPACE}.storybooks.v1`,
} as const;

export type BucketName = keyof typeof BUCKETS;

export async function loginAs(page: Page, accountId: string, route: string) {
  const response = await page.request.post("/api/auth/demo-login", {
    data: { accountId },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto(route);
  await expect(page.locator("body")).not.toHaveText("");
}

export async function demoContext(testInfo: TestInfo, accountId?: string) {
  const baseURL = testInfo.project.use.baseURL as string | undefined;
  const context = await playwrightRequest.newContext({ baseURL });
  if (accountId) {
    const response = await context.post("/api/auth/demo-login", { data: { accountId } });
    expect(response.ok()).toBeTruthy();
  }
  return context;
}

export async function expectOk<T = unknown>(response: APIResponse, status = 200): Promise<T> {
  expect(response.status()).toBe(status);
  const body = await response.json();
  expect(body.ok).toBe(true);
  expect(body.data).toBeDefined();
  return body.data as T;
}

export async function expectFailure(response: APIResponse, status: number, code?: string) {
  expect(response.status()).toBe(status);
  const body = await response.json();
  expect(body.ok).toBe(false);
  if (code) expect(body.code).toBe(code);
  expect(typeof body.error).toBe("string");
  expect(body.error.length).toBeGreaterThan(0);
  return body as { ok: false; code: string; error: string };
}

export async function planVoiceCommand(
  api: APIRequestContext,
  text: string,
  context: Record<string, unknown> = {}
) {
  const data = await expectOk<{ command: Record<string, unknown> }>(
    await api.post("/api/voice-assistant/commands", {
      data: {
        action: "plan",
        utterance: { text, inputMode: "text", transcriptSource: "playwright-r02" },
        context,
      },
    })
  );
  return data.command;
}

export async function executeVoiceCommand(
  api: APIRequestContext,
  text: string,
  context: Record<string, unknown> = {}
) {
  const command = await planVoiceCommand(api, text, context);
  return expectOk<Record<string, unknown>>(
    await api.post("/api/voice-assistant/commands", {
      data: {
        action: "execute",
        command,
        confirmed: true,
        context,
      },
    })
  );
}

export async function resetDemoStorage(page: Page) {
  await page.goto("/login");
  await page.evaluate(() => window.localStorage.clear());
}

export async function waitForSharedDemoSeed(page: Page) {
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), BUCKETS.children))
    .not.toBeNull();
}

export async function readBucket<T = unknown[]>(page: Page, bucket: BucketName): Promise<T> {
  return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "[]"), BUCKETS[bucket]) as Promise<T>;
}

export async function writeBucket(page: Page, bucket: BucketName, value: unknown) {
  await page.evaluate(
    ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
    { key: BUCKETS[bucket], value }
  );
}

export async function bucketIncludes(page: Page, bucket: BucketName, token: string) {
  return page.evaluate(
    ({ key, token }) => window.localStorage.getItem(key)?.includes(token) ?? false,
    { key: BUCKETS[bucket], token }
  );
}

export async function expectBucketIncludes(page: Page, bucket: BucketName, token: string) {
  await expect.poll(() => bucketIncludes(page, bucket, token)).toBe(true);
}

export async function capture(page: Page, fileName: string) {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, fileName),
    fullPage: true,
  });
}

export async function finalizeFeatureTest(page: Page, testInfo: TestInfo, details: Record<string, unknown> = {}) {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  const slug = slugify(testInfo.title);
  const failed = testInfo.status !== testInfo.expectedStatus;
  let failureScreenshot: string | null = null;

  if (failed) {
    const fileName = `failure-${slug}-${Date.now()}.png`;
    const absolutePath = path.join(ARTIFACT_DIR, fileName);
    await page.screenshot({ path: absolutePath, fullPage: true }).catch(() => undefined);
    failureScreenshot = toPosix(path.relative(process.cwd(), absolutePath));
  }

  const report = {
    title: testInfo.title,
    status: testInfo.status,
    expectedStatus: testInfo.expectedStatus,
    ok: !failed,
    retry: testInfo.retry,
    durationMs: testInfo.duration,
    error: testInfo.error?.message ?? null,
    failureScreenshot,
    details,
  };

  await fs.writeFile(path.join(ARTIFACT_DIR, `${slug}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

export async function expectChildParam(page: Page, childId = "c-1") {
  expect(new URL(page.url()).searchParams.get("child")).toBe(childId);
}

export async function expectNoRemoteStatePut(page: Page, action: () => Promise<void>) {
  const remoteStatePutBodies: unknown[] = [];
  page.on("request", async (request) => {
    if (!request.url().includes("/api/state") || request.method() !== "PUT") return;
    try {
      remoteStatePutBodies.push(await request.postDataJSON());
    } catch {
      remoteStatePutBodies.push(request.postData());
    }
  });
  await action();
  await page.waitForTimeout(500);
  expect(remoteStatePutBodies).toEqual([]);
}

export function slugify(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "feature-test";
}

export function tinyPngDataUrl() {
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
}

function toPosix(value: string) {
  return value.split(path.sep).join("/");
}
