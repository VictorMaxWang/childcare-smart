import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

import {
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

import { DEFENSE_CHILD_PROFILES, DEFENSE_CLASS } from "@/lib/demo-data/defense-scenario";
import { createDemoSeedSnapshot } from "@/lib/demo-data/seed";

type CheckStatus = "passed" | "failed" | "skipped";

type CheckCounts = Record<string, number>;
type CheckDiagnostics = Record<string, unknown>;

type DemoPreflightCheck = {
  id: string;
  title: string;
  accountId?: string;
  route?: string;
  api?: string;
  status: CheckStatus;
  durationMs: number;
  counts?: CheckCounts;
  missing?: string[];
  diagnostics?: CheckDiagnostics;
  error?: string;
  screenshot?: string;
};

type DemoPreflightReport = {
  ok: boolean;
  generatedAt: string;
  baseURL: string;
  durationMs: number;
  checks: DemoPreflightCheck[];
  summary: {
    passed: number;
    failed: number;
    skipped: number;
  };
  failures: Array<{
    id: string;
    title: string;
    route?: string;
    api?: string;
    accountId?: string;
    error: string;
    missing?: string[];
    screenshot?: string;
  }>;
  screenshots: string[];
};

type ApiSuccessEnvelope<T> = {
  ok: true;
  data: T;
};

type JsonResponseLike = {
  text(): Promise<string>;
  status(): number;
};

type OkJsonResponseLike = JsonResponseLike & {
  ok(): boolean;
};

const ARTIFACT_ROOT = path.join(process.cwd(), "artifacts", "demo-preflight");
const REPORT_PATH = path.join(process.cwd(), "artifacts", "demo-preflight-report.json");
const SCREENSHOT_ROOT = path.join(ARTIFACT_ROOT, "screenshots");
const FIXTURE_NOW = "2026-05-07T08:00:00.000Z";
const DEMO_CHILD_ID = "c-1";
const CAPTURE_SUCCESS_SCREENSHOTS = process.env.DEMO_PREFLIGHT_SCREENSHOTS === "1";

const FRAMEWORK_ERROR_PATTERNS = [
  "Application error",
  "Unhandled Runtime Error",
  "Runtime Error",
  "NEXT_NOT_FOUND",
  "NEXT_REDIRECT",
  "This page could not be found",
  "500 Internal Server Error",
];

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function getBaseURL(testInfo: TestInfo) {
  const use = testInfo.project.use as { baseURL?: string };
  return (use.baseURL ?? process.env.DEMO_PREFLIGHT_BASE_URL ?? "http://127.0.0.1:3330").replace(/\/$/, "");
}

function normalizeError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function artifactPath(filePath: string) {
  return path.relative(process.cwd(), filePath).replaceAll(path.sep, "/");
}

function slug(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function parseJsonResponse(response: JsonResponseLike, label: string): Promise<unknown> {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${label} returned non-JSON HTTP ${response.status()}: ${text.slice(0, 300)}`);
  }
}

async function readOkData<T>(response: OkJsonResponseLike, label: string): Promise<T> {
  const body = await parseJsonResponse(response, label);
  ensure(response.ok(), `${label} failed with HTTP ${response.status()}: ${JSON.stringify(body).slice(0, 500)}`);
  const envelope = body as Partial<ApiSuccessEnvelope<T>>;
  ensure(envelope?.ok === true && "data" in envelope, `${label} did not return { ok: true, data }`);
  return envelope.data as T;
}

async function demoContext(testInfo: TestInfo, accountId: string) {
  return playwrightRequest.newContext({
    baseURL: getBaseURL(testInfo),
    extraHTTPHeaders: {
      "x-demo-account-id": accountId,
    },
  });
}

async function loginAs(page: Page, accountId: string, route: string) {
  const login = await page.request.post("/api/auth/demo-login", { data: { accountId } });
  ensure(login.ok(), `Demo login failed for ${accountId}: HTTP ${login.status()} ${await login.text()}`);
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  await assertPageHealthy(page, route, response?.status() ?? 0);
}

async function assertPageHealthy(page: Page, route: string, httpStatus: number) {
  ensure(httpStatus >= 200 && httpStatus < 400, `${route} returned HTTP ${httpStatus}`);
  await page.locator("body").waitFor({ state: "visible", timeout: 30_000 });
  await waitForCondition(
    async () => {
      const bodyText = (await page.locator("body").innerText({ timeout: 5_000 })).trim();
      const frameworkError = FRAMEWORK_ERROR_PATTERNS.find((pattern) => bodyText.includes(pattern));
      ensure(!frameworkError, `${route} rendered framework error marker: ${frameworkError}`);
      return bodyText.length > 30;
    },
    45_000,
    `${route} rendered an empty or nearly empty page`
  );
}

async function captureScreenshot(page: Page, id: string) {
  await fs.mkdir(SCREENSHOT_ROOT, { recursive: true });
  const filePath = path.join(SCREENSHOT_ROOT, `${slug(id)}-${Date.now()}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return artifactPath(filePath);
}

async function waitForCondition(
  condition: () => Promise<boolean>,
  timeoutMs: number,
  failureMessage: string,
  intervalMs = 1_000
) {
  const startedAt = Date.now();
  let lastError = "";
  while (Date.now() - startedAt < timeoutMs) {
    try {
      if (await condition()) return;
    } catch (error) {
      lastError = normalizeError(error);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(lastError ? `${failureMessage}; last error: ${lastError}` : failureMessage);
}

function buildFallbackWeeklyReportPayload() {
  return {
    role: "admin",
    snapshot: {
      institutionName: "Childcare Smart Demo",
      periodLabel: "demo preflight",
      role: "admin",
      overview: {
        visibleChildren: 36,
        attendanceRate: 0.94,
        mealRecordCount: 1008,
        healthAbnormalCount: 3,
        growthAttentionCount: 6,
        pendingReviewCount: 2,
        feedbackCount: 8,
      },
      diet: {
        balancedRate: 0.82,
        hydrationAvg: 520,
        monotonyDays: 1,
        vegetableDays: 5,
        proteinDays: 6,
      },
      topAttentionChildren: [
        {
          childName: "c-1",
          attentionCount: 4,
          hydrationAvg: 480,
          vegetableDays: 3,
        },
      ],
      highlights: ["demo-preflight verifies fallback report generation"],
      risks: ["demo-preflight fallback route must remain readable"],
    },
  };
}

test.describe.configure({ mode: "serial" });

test("demo defense preflight main chain", async ({ page }, testInfo) => {
  test.setTimeout(12 * 60 * 1000);

  const startedAt = Date.now();
  const baseURL = getBaseURL(testInfo);
  const checks: DemoPreflightCheck[] = [];
  const screenshots: string[] = [];
  const contexts: APIRequestContext[] = [];

  async function createContext(accountId: string) {
    const context = await demoContext(testInfo, accountId);
    contexts.push(context);
    return context;
  }

  async function runCheck(
    metadata: Pick<DemoPreflightCheck, "id" | "title" | "accountId" | "route" | "api">,
    fn: () => Promise<Omit<Partial<DemoPreflightCheck>, "id" | "title" | "accountId" | "route" | "api" | "status">>
  ) {
    const checkStartedAt = Date.now();
    const result: DemoPreflightCheck = {
      ...metadata,
      status: "passed",
      durationMs: 0,
    };

    try {
      const details = await fn();
      Object.assign(result, details);
      result.status = "passed";
      if (CAPTURE_SUCCESS_SCREENSHOTS && metadata.route) {
        result.screenshot = await captureScreenshot(page, metadata.id);
        screenshots.push(result.screenshot);
      }
      console.log(`[PASS] ${metadata.id} ${metadata.title}`);
    } catch (error) {
      result.status = "failed";
      result.error = normalizeError(error);
      if (metadata.route) {
        try {
          result.screenshot = await captureScreenshot(page, metadata.id);
          screenshots.push(result.screenshot);
        } catch (screenshotError) {
          result.diagnostics = {
            ...result.diagnostics,
            screenshotError: normalizeError(screenshotError),
          };
        }
      }
      console.error(`[FAIL] ${metadata.id} ${metadata.title}: ${result.error}`);
    } finally {
      result.durationMs = Date.now() - checkStartedAt;
      checks.push(result);
    }
  }

  try {
    const defenseTeacher = await createContext(DEFENSE_CLASS.teacherId);
    const admin = await createContext("u-admin");
    const parent = await createContext("u-parent");

    await runCheck(
      {
        id: "teacher-route",
        title: "/teacher is accessible",
        accountId: "u-teacher",
        route: "/teacher",
      },
      async () => {
        await loginAs(page, "u-teacher", "/teacher");
        const bodyText = await page.locator("body").innerText();
        return {
          counts: { bodyTextLength: bodyText.trim().length },
          diagnostics: { finalUrl: page.url() },
        };
      }
    );

    await runCheck(
      {
        id: "teacher-weekly-summary",
        title: "teacher weekly summary agent generates non-empty result",
        accountId: "u-teacher",
        route: "/teacher/agent?action=weekly-summary",
        api: "/api/ai/teacher-agent",
      },
      async () => {
        const login = await page.request.post("/api/auth/demo-login", { data: { accountId: "u-teacher" } });
        ensure(login.ok(), `Demo login failed for u-teacher: HTTP ${login.status()} ${await login.text()}`);
        const responsePromise = page.waitForResponse(
          (response) =>
            response.url().includes("/api/ai/teacher-agent") &&
            response.request().method().toUpperCase() === "POST",
          { timeout: 75_000 }
        );
        const pageResponse = await page.goto("/teacher/agent?action=weekly-summary", {
          waitUntil: "domcontentloaded",
        });
        await assertPageHealthy(page, "/teacher/agent?action=weekly-summary", pageResponse?.status() ?? 0);
        const agentResponse = await responsePromise;
        const body = asRecord(await parseJsonResponse(agentResponse, "/api/ai/teacher-agent"));
        ensure(
          agentResponse.ok(),
          `/api/ai/teacher-agent failed with HTTP ${agentResponse.status()}: ${JSON.stringify(body).slice(0, 500)}`
        );

        const latestResult = page.getByTestId("teacher-agent-latest-result");
        await latestResult.waitFor({ state: "visible", timeout: 60_000 });
        const latestText = (await latestResult.innerText()).trim();
        const actionItems = asArray(body.actionItems);
        const missing = [
          stringValue(body.summary) ? "" : "summary",
          stringValue(body.targetLabel) ? "" : "target",
          actionItems.length > 0 ? "" : "actionItems",
          latestText.length > 30 ? "" : "teacher-agent-latest-result",
        ].filter(Boolean);
        ensure(missing.length === 0, `Weekly summary result is missing fields: ${missing.join(", ")}`);

        return {
          counts: {
            actionItems: actionItems.length,
            latestResultTextLength: latestText.length,
          },
          missing,
          diagnostics: {
            provider: body.provider ?? null,
            source: body.source ?? null,
            transport: body.transport ?? agentResponse.headers()["x-smartchildcare-transport"] ?? null,
            fallbackReason:
              body.fallbackReason ?? agentResponse.headers()["x-smartchildcare-fallback-reason"] ?? null,
          },
        };
      }
    );

    await runCheck(
      {
        id: "high-risk-consultation-evidence",
        title: "high-risk consultation includes evidenceItems",
        accountId: DEFENSE_CLASS.teacherId,
        route: "/teacher/high-risk-consultation",
        api: `/api/consultations?childId=${DEMO_CHILD_ID}`,
      },
      async () => {
        await loginAs(page, DEFENSE_CLASS.teacherId, `/teacher/high-risk-consultation?childId=${DEMO_CHILD_ID}`);
        const consultations = await readOkData<Array<Record<string, unknown>>>(
          await defenseTeacher.get(`/api/consultations?childId=${DEMO_CHILD_ID}`),
          `/api/consultations?childId=${DEMO_CHILD_ID}`
        );
        const withEvidence = consultations.filter((consultation) => asArray(consultation.evidenceItems).length > 0);
        const evidenceItemCount = withEvidence.reduce(
          (total, consultation) => total + asArray(consultation.evidenceItems).length,
          0
        );
        ensure(
          withEvidence.length > 0,
          `No consultation for ${DEMO_CHILD_ID} has evidenceItems; found consultation ids: ${consultations
            .map((item) => stringValue(item.consultationId) || stringValue(item.id))
            .filter(Boolean)
            .join(", ")}`
        );
        return {
          counts: {
            consultations: consultations.length,
            consultationsWithEvidence: withEvidence.length,
            evidenceItems: evidenceItemCount,
          },
        };
      }
    );

    await runCheck(
      {
        id: "admin-risk-priority",
        title: "admin has risk priority data",
        accountId: "u-admin",
        route: "/admin",
        api: "/api/consultations",
      },
      async () => {
        await loginAs(page, "u-admin", "/admin");
        const compact = page.getByTestId("admin-risk-priority-compact");
        await compact.waitFor({ state: "visible", timeout: 30_000 }).catch(() => undefined);
        const compactItemCount = await compact.locator("[data-testid^='admin-risk-item-']").count().catch(() => 0);
        const detailText = await page.locator("#admin-risk-priority-detail").innerText().catch(() => "");
        const consultations = await readOkData<Array<Record<string, unknown>>>(
          await admin.get("/api/consultations"),
          "/api/consultations"
        );
        const priorityItems = consultations.filter(
          (consultation) =>
            consultation.shouldEscalateToAdmin === true ||
            Boolean(consultation.directorDecisionCard) ||
            ["high", "medium"].includes(stringValue(consultation.riskLevel))
        );
        ensure(
          compactItemCount > 0 || priorityItems.length > 0 || detailText.trim().length > 80,
          "Admin risk priority data is missing: no compact risk item, no detail region, and no priority consultations"
        );
        return {
          counts: {
            compactRiskItems: compactItemCount,
            priorityConsultations: priorityItems.length,
            detailTextLength: detailText.trim().length,
          },
        };
      }
    );

    await runCheck(
      {
        id: "parent-tonight-action",
        title: "parent home has tonight action",
        accountId: "u-parent",
        route: `/parent?child=${DEMO_CHILD_ID}`,
        api: `/api/analytics/parent-home?childId=${DEMO_CHILD_ID}; /api/reminders?childId=${DEMO_CHILD_ID}`,
      },
      async () => {
        await loginAs(page, "u-parent", `/parent?child=${DEMO_CHILD_ID}`);
        const pageText = await page.locator("body").innerText();
        const parentHome = await readOkData<Record<string, unknown>>(
          await parent.get(`/api/analytics/parent-home?childId=${DEMO_CHILD_ID}`),
          `/api/analytics/parent-home?childId=${DEMO_CHILD_ID}`
        );
        const reminders = await readOkData<Array<Record<string, unknown>>>(
          await parent.get(`/api/reminders?childId=${DEMO_CHILD_ID}`),
          `/api/reminders?childId=${DEMO_CHILD_ID}`
        );
        const parentHomeText = JSON.stringify(parentHome);
        const familyTaskReminders = reminders.filter(
          (reminder) =>
            reminder.reminderType === "family-task" ||
            stringValue(reminder.reminderId).includes("tonight-action") ||
            JSON.stringify(reminder).toLowerCase().includes("tonight")
        );
        const hasTonightAction =
          familyTaskReminders.length > 0 ||
          parentHomeText.toLowerCase().includes("tonight") ||
          parentHomeText.includes("tonightHomeAction") ||
          pageText.toLowerCase().includes("tonight");
        ensure(
          hasTonightAction,
          `No tonight action/family task found for ${DEMO_CHILD_ID}; reminders=${reminders
            .map((item) => stringValue(item.reminderId))
            .filter(Boolean)
            .join(", ")}`
        );
        return {
          counts: {
            pageTextLength: pageText.trim().length,
            reminders: reminders.length,
            familyTaskReminders: familyTaskReminders.length,
          },
        };
      }
    );

    await runCheck(
      {
        id: "parent-storybook",
        title: "parent storybook has baseline pages/scenes",
        accountId: "u-parent",
        route: `/parent/storybook?child=${DEMO_CHILD_ID}`,
        api: `/api/storybooks?childId=${DEMO_CHILD_ID}`,
      },
      async () => {
        await loginAs(page, "u-parent", `/parent/storybook?child=${DEMO_CHILD_ID}`);
        const storybookRoot = page.getByTestId("lin-xiaoyu-fixed-storybook");
        await storybookRoot.waitFor({ state: "visible", timeout: 30_000 });
        const pageTextCount = await page.getByTestId("lin-xiaoyu-page-text").count();
        const storybooks = await readOkData<Array<Record<string, unknown>>>(
          await parent.get(`/api/storybooks?childId=${DEMO_CHILD_ID}`),
          `/api/storybooks?childId=${DEMO_CHILD_ID}`
        );
        const usableStorybooks = storybooks.filter((storybook) => {
          const pages = asArray(storybook.pages);
          const pageScenes = pages.flatMap((item) => asArray(asRecord(asRecord(item).response).scenes));
          return pages.length > 0 || pageScenes.length > 0;
        });
        ensure(pageTextCount > 0, "Storyboard page text test id lin-xiaoyu-page-text is missing");
        ensure(usableStorybooks.length > 0, `No storybook for ${DEMO_CHILD_ID} has pages/scenes in API data`);
        return {
          counts: {
            pageTextBlocks: pageTextCount,
            storybooks: storybooks.length,
            usableStorybooks: usableStorybooks.length,
          },
        };
      }
    );

    await runCheck(
      {
        id: "parent-feedback-submit",
        title: "parent agent can submit feedback",
        accountId: "u-parent",
        route: `/parent/agent?child=${DEMO_CHILD_ID}#feedback`,
        api: `/api/feedback?childId=${DEMO_CHILD_ID}`,
      },
      async () => {
        const note = `demo-preflight-${Date.now()}`;
        await loginAs(page, "u-parent", `/parent/agent?child=${DEMO_CHILD_ID}#feedback`);
        const section = page.getByTestId("r07-parent-agent-feedback-section").first();
        await section.waitFor({ state: "visible", timeout: 75_000 });
        await section.getByTestId("feedback-execution-completed").click({ timeout: 30_000 });
        await section.getByTestId("feedback-reaction-accepted-2").click({ timeout: 30_000 });
        await section.getByTestId("feedback-improvement-slight_improvement-3").click({ timeout: 30_000 });
        await section.locator("textarea").first().fill(note);
        await section.getByTestId("parent-submit-structured-feedback").click();

        let matchingFeedbackCount = 0;
        let totalFeedbackCount = 0;
        await waitForCondition(
          async () => {
            const feedback = await readOkData<Array<Record<string, unknown>>>(
              await parent.get(`/api/feedback?childId=${DEMO_CHILD_ID}`),
              `/api/feedback?childId=${DEMO_CHILD_ID}`
            );
            totalFeedbackCount = feedback.length;
            matchingFeedbackCount = feedback.filter((item) => JSON.stringify(item).includes(note)).length;
            return matchingFeedbackCount > 0;
          },
          30_000,
          `Submitted feedback marker ${note} did not appear in /api/feedback?childId=${DEMO_CHILD_ID}`
        );
        return {
          counts: {
            totalFeedback: totalFeedbackCount,
            matchingFeedback: matchingFeedbackCount,
          },
          diagnostics: {
            marker: note,
          },
        };
      }
    );

    await runCheck(
      {
        id: "provider-status",
        title: "AI provider status is readable",
        accountId: "u-admin",
        api: "/api/ai/provider-status",
      },
      async () => {
        const status = await readOkData<Record<string, unknown>>(
          await admin.get("/api/ai/provider-status"),
          "/api/ai/provider-status"
        );
        const missing = ["chat", "llm", "ocr", "asr", "tts", "storybookImage", "storybookAudio"].filter((capability) => {
          const capabilityStatus = asRecord(status[capability]);
          return !stringValue(capabilityStatus.status);
        });
        const capabilities = asRecord(status.capabilities);
        for (const capability of ["llm", "ocr", "asr", "tts", "storybookImage", "storybookAudio"]) {
          if (!asRecord(capabilities[capability]).providerName) missing.push(`capabilities.${capability}`);
        }
        if (!stringValue(status.fallbackText)) missing.push("fallbackText");
        ensure(missing.length === 0, `Provider status is missing readable fields: ${missing.join(", ")}`);
        return {
          missing,
          diagnostics: {
            chat: asRecord(status.chat).status ?? null,
            ocr: asRecord(status.ocr).status ?? null,
            asr: asRecord(status.asr).status ?? null,
            tts: asRecord(status.tts).status ?? null,
            storybookImage: asRecord(status.storybookImage).status ?? null,
            storybookAudio: asRecord(status.storybookAudio).status ?? null,
            fallbackText: status.fallbackText,
          },
        };
      }
    );

    await runCheck(
      {
        id: "admin-ai-provider-status-page",
        title: "Admin AI provider status page renders six capability cards",
        accountId: "u-admin",
        route: "/admin/ai-provider-status",
      },
      async () => {
        await loginAs(page, "u-admin", "/admin/ai-provider-status");
        await page.getByTestId("admin-ai-provider-status-page").waitFor({ state: "visible", timeout: 30_000 });
        await waitForCondition(
          async () => {
            const count = await page.locator("[data-testid^='admin-ai-provider-status-card-']").count();
            return count === 6;
          },
          30_000,
          "Admin provider-status page did not render six capability cards"
        );
        return {
          counts: {
            capabilityCards: await page.locator("[data-testid^='admin-ai-provider-status-card-']").count(),
          },
        };
      }
    );

    await runCheck(
      {
        id: "ai-fallback",
        title: "AI fallback route returns non-empty result",
        accountId: "u-admin",
        api: "/api/ai/weekly-report",
      },
      async () => {
        const response = await admin.post("/api/ai/weekly-report", {
          headers: { "x-ai-force-fallback": "1" },
          data: buildFallbackWeeklyReportPayload(),
        });
        const body = asRecord(await parseJsonResponse(response, "/api/ai/weekly-report"));
        ensure(
          response.ok(),
          `/api/ai/weekly-report fallback failed with HTTP ${response.status()}: ${JSON.stringify(body).slice(0, 500)}`
        );
        const missing = [
          stringValue(body.summary) ? "" : "summary",
          stringValue(body.provider) ? "" : "provider",
          body.fallbackReason ? "" : "fallbackReason",
          body.providerStatus ? "" : "providerStatus",
        ].filter(Boolean);
        ensure(missing.length === 0, `Fallback weekly report is missing fields: ${missing.join(", ")}`);
        ensure(
          body.provider === "local-rule-fallback" || body.source === "fallback",
          `Fallback weekly report did not use fallback provider/source: provider=${String(body.provider)} source=${String(
            body.source
          )}`
        );
        return {
          missing,
          counts: {
            summaryLength: stringValue(body.summary).length,
            sections: asArray(body.sections).length,
          },
          diagnostics: {
            provider: body.provider,
            source: body.source,
            fallbackReason: body.fallbackReason,
            providerStatus: body.providerStatus,
          },
        };
      }
    );

    await runCheck(
      {
        id: "demo-fixture",
        title: "demo fixture is complete",
        api: "createDemoSeedSnapshot(); DEFENSE_CHILD_PROFILES; public/demo-media/manifest.json",
      },
      async () => {
        const snapshot = createDemoSeedSnapshot(FIXTURE_NOW);
        const childIds = new Set(snapshot.children.map((child) => child.id));
        const missing = ["c-1", "c-2", "c-3"].filter((childId) => !childIds.has(childId));
        const defenseProfilesMissing = ["c-1", "c-2", "c-3"].filter((childId) => !(childId in DEFENSE_CHILD_PROFILES));
        missing.push(...defenseProfilesMissing.map((childId) => `DEFENSE_CHILD_PROFILES.${childId}`));

        const defenseChildren = snapshot.children.filter((child) => ["c-1", "c-2", "c-3"].includes(child.id));
        const wrongClass = defenseChildren.filter(
          (child) => child.classId !== DEFENSE_CLASS.classId || child.teacherId !== DEFENSE_CLASS.teacherId
        );
        missing.push(...wrongClass.map((child) => `${child.id}.defenseClass`));

        const c1EvidenceConsultation = snapshot.consultations.find(
          (consultation) => consultation.childId === DEMO_CHILD_ID && (consultation.evidenceItems?.length ?? 0) > 0
        );
        if (!c1EvidenceConsultation) missing.push("c-1 evidenceItems");

        const riskSampleIds = new Set(
          snapshot.consultations
            .filter((consultation) => consultation.shouldEscalateToAdmin)
            .map((consultation) => consultation.childId)
        );
        for (const childId of ["c-1", "c-2", "c-3"]) {
          if (!riskSampleIds.has(childId)) missing.push(`${childId} risk sample`);
        }

        if (!snapshot.reminders.some((reminder) => reminder.reminderId === "reminder-defense-c-1-tonight-action")) {
          missing.push("c-1 tonight action reminder");
        }
        if (!snapshot.feedback.some((feedback) => feedback.childId === DEMO_CHILD_ID)) {
          missing.push("c-1 feedback");
        }
        if (
          !snapshot.storybooks.some(
            (storybook) => storybook.childId === DEMO_CHILD_ID && storybook.pages.some((storybookPage) => storybookPage.title)
          )
        ) {
          missing.push("c-1 storybook baseline");
        }

        const manifestPath = path.join(process.cwd(), "public", "demo-media", "manifest.json");
        if (!existsSync(manifestPath)) {
          missing.push("public/demo-media/manifest.json");
        } else {
          const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
            fallbacks?: Record<string, string>;
            assets?: Array<{ path?: string; fallbackPath?: string }>;
          };
          const mediaPaths = [
            ...Object.values(manifest.fallbacks ?? {}),
            ...(manifest.assets ?? []).flatMap((asset) => [asset.path, asset.fallbackPath]),
          ].filter((assetPath): assetPath is string => Boolean(assetPath));
          if (mediaPaths.length === 0) missing.push("storybook/media manifest entries");
          for (const mediaPath of mediaPaths) {
            if (!mediaPath.startsWith("/demo-media/")) {
              missing.push(`invalid media path ${mediaPath}`);
              continue;
            }
            if (!existsSync(path.join(process.cwd(), "public", mediaPath))) {
              missing.push(`missing media file ${mediaPath}`);
            }
          }
        }

        ensure(missing.length === 0, `Demo fixture is missing required data: ${missing.join(", ")}`);
        return {
          missing,
          counts: {
            children: snapshot.children.length,
            defenseProfiles: Object.keys(DEFENSE_CHILD_PROFILES).length,
            consultations: snapshot.consultations.length,
            c1EvidenceItems: c1EvidenceConsultation?.evidenceItems.length ?? 0,
            reminders: snapshot.reminders.length,
            feedback: snapshot.feedback.length,
            storybooks: snapshot.storybooks.length,
          },
        };
      }
    );
  } finally {
    await Promise.all(contexts.map((context) => context.dispose()));
  }

  const failures = checks
    .filter((check) => check.status === "failed")
    .map((check) => ({
      id: check.id,
      title: check.title,
      route: check.route,
      api: check.api,
      accountId: check.accountId,
      error: check.error ?? "unknown failure",
      missing: check.missing,
      screenshot: check.screenshot,
    }));
  const report: DemoPreflightReport = {
    ok: failures.length === 0,
    generatedAt: new Date().toISOString(),
    baseURL,
    durationMs: Date.now() - startedAt,
    checks,
    summary: {
      passed: checks.filter((check) => check.status === "passed").length,
      failed: failures.length,
      skipped: checks.filter((check) => check.status === "skipped").length,
    },
    failures,
    screenshots,
  };

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (failures.length > 0) {
    throw new Error(
      [
        `Demo preflight failed (${failures.length}/${checks.length}). Report: ${artifactPath(REPORT_PATH)}`,
        ...failures.map(
          (failure) =>
            `- ${failure.id}${failure.route ? ` ${failure.route}` : ""}${failure.api ? ` ${failure.api}` : ""}: ${
              failure.error
            }`
        ),
      ].join("\n")
    );
  }

  console.log(`Report written to ${artifactPath(REPORT_PATH)}`);
  console.log("DEMO READY");
});
