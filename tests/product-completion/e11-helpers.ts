import { expect, request as playwrightRequest, type APIRequestContext, type APIResponse, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

export const E11_ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "product-completion", "E11");
export const CHILD_PARENT = "c-1";
export const CHILD_TEACHER = "c-4";
export const CHILD_FORBIDDEN = "c-3";

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
  return body as { ok: false; code: string; error: string; limited?: boolean; reason?: string };
}

export async function captureE11(page: Page, fileName: string) {
  await fs.mkdir(E11_ARTIFACT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(E11_ARTIFACT_DIR, fileName), fullPage: true });
}

export function tinyPngDataUrl() {
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
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
        utterance: { text, inputMode: "text", transcriptSource: "playwright-e11" },
        context,
      },
    })
  );
  return data.command;
}

export async function planExistingVoiceCommand(
  api: APIRequestContext,
  command: Record<string, unknown>,
  context: Record<string, unknown> = {}
) {
  const data = await expectOk<{ command: Record<string, unknown> }>(
    await api.post("/api/voice-assistant/commands", {
      data: {
        action: "plan",
        command,
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

export function assistantCommand(intent: string, role: "director" | "teacher" | "parent", params: Record<string, unknown> = {}) {
  const requiredConfirmation = !["navigate", "query_director_risk", "query_child_status", "query_today_tasks"].includes(intent);
  return {
    id: `e11-${intent}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    intent,
    confidence: 1,
    role,
    requiredConfirmation,
    params,
    missingParams: [],
    safetyLevel: requiredConfirmation ? "write" : "safe",
    previewText: `E11 ${intent}`,
    execute: `e11.${intent}`,
    status: requiredConfirmation ? "needs_confirmation" : "ready",
  };
}

export async function createWeeklyReport(api: APIRequestContext, title: string) {
  return expectOk<{ reportId: string; title: string; status: string }>(
    await api.post("/api/weekly-reports", {
      data: {
        scopeType: "institution",
        scopeId: "inst-1",
        title,
        periodStart: "2026-04-27",
        periodEnd: "2026-05-03",
      },
    }),
    201
  );
}

export async function seedStorybook(api: APIRequestContext, storybookId: string, childId = CHILD_PARENT) {
  return expectOk(
    await api.post("/api/storybooks", {
      data: {
        storybookId,
        childId,
        generatedAt: new Date().toISOString(),
        sourceRecordIds: [`growth-${storybookId}`],
        response: {
          storyId: storybookId,
          childId,
          title: `E11 storybook ${storybookId}`,
          summary: "E11 verifies local storybook export and share.",
          moral: "Visible records should remain scoped.",
          parentNote: "Local export/share fallback is expected.",
          generatedAt: new Date().toISOString(),
          scenes: [
            {
              sceneIndex: 1,
              sceneTitle: "E11 scoped scene",
              sceneText: "The child completes a classroom routine.",
              imageStatus: "ready",
              audioStatus: "preview-only",
              audioScript: "The child completes a classroom routine.",
              voiceStyle: "warm",
              imagePrompt: "child completing a classroom routine",
              highlightSource: "growth",
            },
          ],
        },
      },
    }),
    201
  );
}
