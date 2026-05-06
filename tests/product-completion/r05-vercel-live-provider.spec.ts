import { expect, request as playwrightRequest, test, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const BASE_URL = (
  process.env.R05_BASE_URL ??
  process.env.PROD_BASE_URL ??
  process.env.PRODUCT_BASE_URL ??
  "https://www.smartchildcare.cn"
).replace(/\/+$/u, "");
const ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "product-completion", "R05");
const SAFE_TEXT = "\u7ebf\u4e0a\u9a8c\u6536\u6d4b\u8bd5\uff0c\u8bf7\u5ffd\u7565";
const HEALTH_TEXT = `${SAFE_TEXT}\u3002\u513f\u7ae5\u4eca\u65e5\u4f53\u6e29\u6b63\u5e38\uff0c\u65e0\u660e\u663e\u5f02\u5e38\u3002`;
const PARENT_MESSAGE_TEXT = `${SAFE_TEXT}\u3002`;
const PARENT_REPLY_TEXT = "\u7ebf\u4e0a\u9a8c\u6536\u6d4b\u8bd5\u56de\u590d\uff0c\u8bf7\u5ffd\u7565\u3002";

type ErrorClassification =
  | "vercel-env-missing"
  | "vercel-not-redeployed"
  | "auth/signature"
  | "endpoint"
  | "model"
  | "permission"
  | "network"
  | "unsupported format"
  | "login-required"
  | "scope-403"
  | "provider-unavailable"
  | "unknown";

type CapabilitySnapshot = {
  status: string;
  configured?: boolean;
  isRealProvider?: boolean;
  supported?: boolean;
};

type R05Evidence = {
  taskId: "R05";
  generatedAt: string;
  baseUrl: string;
  loginProtectedProviderStatus: boolean;
  unauthenticatedProviderStatus: string;
  unauthenticatedProviderRedirect: string;
  loggedInProviderStatus: {
    chat: string;
    ocr: string;
    asr: string;
  };
  providerSnapshots: {
    chat?: CapabilitySnapshot;
    ocr?: CapabilitySnapshot;
    asr?: CapabilitySnapshot;
  };
  roleProviderChecks: Record<string, { chat: string; asr: string; ok: boolean }>;
  healthMaterialOnline: string;
  healthMaterialSource: string;
  healthMaterialSaved: boolean;
  voiceOrbOnline: string;
  voiceOrbRoles: Record<string, string>;
  directorCommands: Record<string, string>;
  parentTeacherMessage: string;
  fakeSuccess: string;
  secretExposureCheck: string;
  secretExposure: {
    highRiskFound: boolean;
    highRiskMatches: string[];
    genericFrontendTerms: string[];
    browserRequestLeak: boolean;
    externalProviderBrowserRequests: string[];
    nextPublicVivoRuntimeUse: boolean;
    nextPublicVivoAssignment: boolean;
    nextPublicVivoGuardOnlyReferences: number;
  };
  browserUseEvidence: string[];
  onlineErrors: Array<{ area: string; classification: ErrorClassification; httpStatus?: number; status?: string }>;
  network: {
    sameOriginAiRequests: string[];
    browserProviderLeakFound: boolean;
    externalProviderHosts: string[];
  };
  releaseGate: "passed" | "blocked";
  blockingReasons: string[];
};

const evidence: R05Evidence = {
  taskId: "R05",
  generatedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  loginProtectedProviderStatus: false,
  unauthenticatedProviderStatus: "not-run",
  unauthenticatedProviderRedirect: "",
  loggedInProviderStatus: {
    chat: "not-run",
    ocr: "not-run",
    asr: "not-run",
  },
  providerSnapshots: {},
  roleProviderChecks: {},
  healthMaterialOnline: "not-run",
  healthMaterialSource: "not-run",
  healthMaterialSaved: false,
  voiceOrbOnline: "not-run",
  voiceOrbRoles: {},
  directorCommands: {},
  parentTeacherMessage: "not-run",
  fakeSuccess: "not-run",
  secretExposureCheck: "not-run",
  secretExposure: {
    highRiskFound: false,
    highRiskMatches: [],
    genericFrontendTerms: [],
    browserRequestLeak: false,
    externalProviderBrowserRequests: [],
    nextPublicVivoRuntimeUse: false,
    nextPublicVivoAssignment: false,
    nextPublicVivoGuardOnlyReferences: 0,
  },
  browserUseEvidence: [],
  onlineErrors: [],
  network: {
    sameOriginAiRequests: [],
    browserProviderLeakFound: false,
    externalProviderHosts: [],
  },
  releaseGate: "blocked",
  blockingReasons: [],
};

test.describe.configure({ mode: "serial" });
test.use({ trace: "off", screenshot: "off", video: "off" });

function liveUrl(pathname: string) {
  return pathname.startsWith("http") ? pathname : `${BASE_URL}${pathname.startsWith("/") ? "" : "/"}${pathname}`;
}

function toPathOnly(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function pushError(area: string, classification: ErrorClassification, options: { httpStatus?: number; status?: string } = {}) {
  evidence.onlineErrors.push({ area, classification, ...options });
}

function normalizeStatus(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "unknown";
}

function snapshotCapability(value: unknown): CapabilitySnapshot {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    status: normalizeStatus(record.status),
    configured: typeof record.configured === "boolean" ? record.configured : undefined,
    isRealProvider: typeof record.isRealProvider === "boolean" ? record.isRealProvider : undefined,
    supported: typeof record.supported === "boolean" ? record.supported : undefined,
  };
}

function isLiveCapable(snapshot: CapabilitySnapshot | undefined) {
  if (!snapshot) return false;
  if (["ready", "configured", "live-capable", "live", "live-pass"].includes(snapshot.status)) return true;
  return snapshot.configured === true && snapshot.isRealProvider === true && snapshot.supported !== false;
}

function classifyHttp(status: number, body: unknown): ErrorClassification {
  const code =
    body && typeof body === "object" && "code" in body
      ? String((body as { code?: unknown }).code ?? "")
      : "";
  if (status === 401 || status === 307 || status === 308) return "login-required";
  if (status === 403 || code === "forbidden_scope") return "scope-403";
  if (status === 404 || status === 405) return "endpoint";
  if (status === 415) return "unsupported format";
  if (status === 503 || code === "provider_unavailable") return "provider-unavailable";
  if (status >= 500) return "provider-unavailable";
  return "unknown";
}

function classifyAreaHttp(area: string, status: number, body: unknown): ErrorClassification {
  if (
    status === 404 &&
    /provider-status|voice:|director:|parent-message|teacher-reply|asr:/u.test(area)
  ) {
    return "vercel-not-redeployed";
  }
  return classifyHttp(status, body);
}

async function readJson(response: APIResponse) {
  return response.json().catch(() => null) as Promise<unknown>;
}

async function readOkData<T>(response: APIResponse, area: string): Promise<T | null> {
  const body = await readJson(response);
  if (response.status() !== 200) {
    pushError(area, classifyAreaHttp(area, response.status(), body), { httpStatus: response.status() });
    return null;
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (record.ok !== true) {
    pushError(area, "unknown", { httpStatus: response.status() });
    return null;
  }
  return record.data as T;
}

async function liveContext(accountId?: string) {
  const context = await playwrightRequest.newContext({
    baseURL: BASE_URL,
  });
  if (accountId) {
    const response = await context.post("/api/auth/demo-login", {
      data: { accountId },
    });
    const body = await readJson(response);
    if (response.status() !== 200) {
      pushError(`api-login:${accountId}`, classifyHttp(response.status(), body), { httpStatus: response.status() });
    }
    expect(response.status(), `${accountId} API demo login should work`).toBe(200);
  }
  return context;
}

async function loginAs(page: Page, accountId: string, route: string) {
  const response = await page.request.post(liveUrl("/api/auth/demo-login"), {
    data: { accountId },
  });
  const body = await readJson(response);
  if (response.status() !== 200) {
    pushError(`login:${accountId}`, classifyHttp(response.status(), body), { httpStatus: response.status() });
  }
  expect(response.status(), `${accountId} demo login should work`).toBe(200);
  await page.goto(liveUrl(route));
  await page.waitForLoadState("domcontentloaded", { timeout: 30_000 });
  await expect(page.locator("body")).not.toHaveText("");
}

async function capture(page: Page, fileName: string) {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  const absolutePath = path.join(ARTIFACT_DIR, fileName);
  await page.screenshot({ path: absolutePath, fullPage: true });
  evidence.browserUseEvidence.push(path.relative(process.cwd(), absolutePath).split(path.sep).join("/"));
}

async function writeEvidence() {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  await fs.writeFile(
    path.join(ARTIFACT_DIR, "r05-online-evidence.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8"
  );
}

async function checkUnauthenticatedProvider(request: APIRequestContext) {
  const response = await request.get(liveUrl("/api/ai/provider-status"), { maxRedirects: 0 });
  const location = response.headers().location ?? "";
  evidence.unauthenticatedProviderStatus = String(response.status());
  evidence.unauthenticatedProviderRedirect = location ? toPathOnly(location) : "";
  evidence.loginProtectedProviderStatus =
    [301, 302, 303, 307, 308, 401].includes(response.status()) &&
    (response.status() === 401 || evidence.unauthenticatedProviderRedirect.includes("/login"));
  if (!evidence.loginProtectedProviderStatus) {
    pushError("provider-status:anonymous", "unknown", { httpStatus: response.status() });
  }
}

async function checkLoggedInProviderStatus() {
  const roles = [
    ["u-admin", "\u9648\u56ed\u957f"],
    ["u-teacher", "\u674e\u8001\u5e08"],
    ["u-parent", "\u6797\u5988\u5988"],
  ] as const;

  for (const [accountId, label] of roles) {
    const api = await liveContext(accountId);
    try {
      const data = await readOkData<{
        chat?: unknown;
        asr?: unknown;
      }>(await api.get("/api/ai/provider-status"), `provider-status:${accountId}`);
      const chat = snapshotCapability(data?.chat);
      const asr = snapshotCapability(data?.asr);
      evidence.roleProviderChecks[label] = {
        chat: chat.status,
        asr: asr.status,
        ok: isLiveCapable(chat) && isLiveCapable(asr),
      };
      if (accountId === "u-admin") {
        evidence.providerSnapshots.chat = chat;
        evidence.providerSnapshots.asr = asr;
        evidence.loggedInProviderStatus.chat = chat.status;
        evidence.loggedInProviderStatus.asr = asr.status;
      }
      if (chat.status === "missing-env") {
        pushError(`provider-status:${accountId}:chat`, "vercel-env-missing", { status: chat.status });
      }
      if (asr.status === "missing-env") {
        pushError(`provider-status:${accountId}:asr`, "vercel-env-missing", { status: asr.status });
      }
    } finally {
      await api.dispose();
    }
  }
}

async function checkHealthMaterial(page: Page) {
  const teacher = await liveContext("u-teacher");
  try {
    const token = `R05-health-${Date.now()}`;
    const response = await teacher.post("/api/ai/health-file-bridge", {
      data: {
        childId: "c-4",
        sourceRole: "teacher",
        requestSource: "r05-vercel-live-provider",
        files: [
          {
            name: `${token}.txt`,
            mimeType: "text/plain",
            previewText: `${SAFE_TEXT}. ${token}. temperature normal.`,
          },
        ],
      },
    });
    const body = await readJson(response);
    if (response.status() !== 200) {
      pushError("health-material:api", classifyHttp(response.status(), body), { httpStatus: response.status() });
      evidence.healthMaterialOnline = `api-failed:${response.status()}`;
    } else {
      const result = body as Record<string, unknown>;
      const ocr = snapshotCapability(
        result.providerStatus &&
          typeof result.providerStatus === "object" &&
          "ocr" in result.providerStatus
          ? (result.providerStatus as { ocr?: unknown }).ocr
          : undefined
      );
      evidence.providerSnapshots.ocr = ocr;
      evidence.loggedInProviderStatus.ocr = ocr.status;
      evidence.healthMaterialSource = normalizeStatus(result.source);
      evidence.healthMaterialOnline = `api-parsed:${evidence.healthMaterialSource}`;
      if (ocr.status === "missing-env") {
        pushError("health-material:ocr", "vercel-env-missing", { status: ocr.status });
      }
      if (result.source !== "vivo-ocr-provider" && result.fallback !== true) {
        pushError("health-material:provenance", "unknown", { status: evidence.healthMaterialSource });
      }
    }
  } finally {
    await teacher.dispose();
  }

  await loginAs(page, "u-teacher", "/teacher/health-file-bridge");
  await expect(page.getByTestId("d05-health-preview-text")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("d05-health-preview-text").fill(HEALTH_TEXT);
  await page.getByTestId("d05-start-parse").click();
  await expect(page.getByTestId("d05-parse-result")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId("d05-parse-result")).not.toHaveText("");
  await capture(page, "teacher-health-material-parsed.png");

  const saveButton = page.getByTestId("d05-save-parse");
  await expect(saveButton).toBeVisible({ timeout: 10_000 });
  if (await saveButton.isEnabled()) {
    await saveButton.click();
    await expect(page.getByTestId("d05-save-parse")).toBeDisabled({ timeout: 20_000 });
    evidence.healthMaterialSaved = true;
    evidence.healthMaterialOnline = `${evidence.healthMaterialOnline};ui-saved`;
  }
  await page.reload();
  await expect(page.getByTestId("d05-health-history")).toBeVisible({ timeout: 30_000 });
  await capture(page, "teacher-health-material-after-refresh.png");
}

async function planVoice(api: APIRequestContext, text: string, context: Record<string, unknown> = {}) {
  const response = await api.post("/api/voice-assistant/commands", {
    data: {
      action: "plan",
      utterance: { text, inputMode: "text", transcriptSource: "playwright-r05" },
      context,
    },
  });
  return readOkData<{ command: Record<string, unknown>; providerStatus?: Record<string, unknown> }>(
    response,
    "voice:plan"
  );
}

async function executeVoice(
  api: APIRequestContext,
  command: Record<string, unknown>,
  confirmed: boolean,
  context: Record<string, unknown> = {}
) {
  const response = await api.post("/api/voice-assistant/commands", {
    data: {
      action: "execute",
      command,
      confirmed,
      context,
    },
  });
  const body = await readJson(response);
  return { response, body };
}

async function checkVoiceApis() {
  const director = await liveContext("u-admin");
  const teacher = await liveContext("u-teacher");
  const parent = await liveContext("u-parent");
  try {
    const risk = await planVoice(director, "\u67e5\u770b\u9ad8\u98ce\u9669\u513f\u7ae5", {
      currentPath: "/admin",
    });
    if (risk?.command?.status === "ready") {
      const executed = await executeVoice(director, risk.command, true, { currentPath: "/admin" });
      evidence.directorCommands.risk = executed.response.status() === 200 ? "executed-preview-query" : `failed:${executed.response.status()}`;
      if (executed.response.status() !== 200) {
        pushError("director:risk", classifyAreaHttp("director:risk", executed.response.status(), executed.body), { httpStatus: executed.response.status() });
      }
    } else if (risk) {
      evidence.directorCommands.risk = `plan:${String(risk?.command?.status ?? "missing")}`;
      pushError("director:risk", "unknown", { status: evidence.directorCommands.risk });
    } else {
      evidence.directorCommands.risk = "not-verifiable:voice-endpoint";
    }

    const weekly = await planVoice(director, "\u751f\u6210\u672c\u5468\u5468\u62a5", {
      currentPath: "/admin",
    });
    evidence.directorCommands.weekly = weekly ? String(weekly.command?.status ?? "missing") : "not-verifiable:voice-endpoint";
    const weeklyBlocked = weekly?.command
      ? await executeVoice(director, weekly.command, false, { currentPath: "/admin" })
      : null;
    if (weekly && weeklyBlocked?.response.status() !== 422) {
      pushError("director:weekly-confirmation", "unknown", { httpStatus: weeklyBlocked?.response.status() });
    } else if (weekly) {
      evidence.directorCommands.weekly = "needs-confirmation-not-written";
    }

    const assignment = await planVoice(
      director,
      `\u7ed9\u674e\u8001\u5e08\u6d3e\u5355\uff0c${SAFE_TEXT}`,
      { currentPath: "/admin" }
    );
    evidence.directorCommands.assignment = assignment ? String(assignment.command?.status ?? "missing") : "not-verifiable:voice-endpoint";
    const assignmentBlocked = assignment?.command
      ? await executeVoice(director, assignment.command, false, { currentPath: "/admin" })
      : null;
    if (assignment && assignmentBlocked?.response.status() !== 422) {
      pushError("director:assignment-confirmation", "unknown", { httpStatus: assignmentBlocked?.response.status() });
    } else if (assignment) {
      evidence.directorCommands.assignment = "needs-confirmation-not-written";
    }

    const unknown = await planVoice(parent, "\u7ebf\u4e0a\u9a8c\u6536\u672a\u77e5\u6307\u4ee4\uff0c\u8bf7\u5ffd\u7565", {
      currentPath: "/parent?child=c-1",
      currentQuery: { child: "c-1" },
      objects: { childId: "c-1" },
    });
    if (unknown && unknown.command?.status !== "unknown") {
      pushError("voice:unknown-command", "unknown", { status: String(unknown?.command?.status ?? "missing") });
    }

    const message = await planVoice(parent, `\u7ed9\u8001\u5e08\u7559\u8a00\uff0c${PARENT_MESSAGE_TEXT}`, {
      currentPath: "/parent?child=c-1",
      currentQuery: { child: "c-1" },
      objects: { childId: "c-1" },
    });
    if (message && message.command?.status !== "needs_confirmation") {
      pushError("parent-message:confirmation", "unknown", { status: String(message?.command?.status ?? "missing") });
    }
    const messageBlocked = message?.command
      ? await executeVoice(parent, message.command, false, {
          currentPath: "/parent?child=c-1",
          currentQuery: { child: "c-1" },
          objects: { childId: "c-1" },
        })
      : null;
    if (message && messageBlocked?.response.status() !== 422) {
      pushError("parent-message:cancelled-write", "unknown", { httpStatus: messageBlocked?.response.status() });
    }

    const messages = await readOkData<Array<{ content?: string }>>(
      await teacher.get("/api/messages?childId=c-1"),
      "teacher:messages-after-cancel"
    );
    const cancelledWriteFound = messages?.some((item) => item.content?.includes(PARENT_MESSAGE_TEXT)) ?? false;
    if (cancelledWriteFound) {
      pushError("parent-message:cancelled-write", "unknown", { status: "unexpected-write" });
    }

    const teacherReply = await planVoice(teacher, `\u56de\u590d\u6797\u5988\u5988\uff0c${PARENT_REPLY_TEXT}`, {
      currentPath: "/teacher/agent?action=communication",
      objects: { childId: "c-1" },
    });
    const teacherReplyBlocked = teacherReply?.command
      ? await executeVoice(teacher, teacherReply.command, false, {
          currentPath: "/teacher/agent?action=communication",
          objects: { childId: "c-1" },
        })
      : null;
    if (teacherReply && teacherReplyBlocked?.response.status() !== 422) {
      pushError("teacher-reply:confirmation", "unknown", { httpStatus: teacherReplyBlocked?.response.status() });
    }

    evidence.parentTeacherMessage = cancelledWriteFound
      ? "cancel-confirmation-failed"
      : message || teacherReply
        ? "preview-and-cancel-only;no-write"
        : "not-verifiable:voice-endpoint";
    evidence.fakeSuccess = cancelledWriteFound ? "risk-detected" : "not-detected";
  } finally {
    await director.dispose();
    await teacher.dispose();
    await parent.dispose();
  }
}

async function checkVoiceOrbUi(page: Page) {
  const roles = [
    ["u-admin", "/admin", "\u9648\u56ed\u957f", "director-voice-orb-open.png"],
    ["u-teacher", "/teacher", "\u674e\u8001\u5e08", "teacher-voice-orb-open.png"],
    ["u-teacher2", "/teacher", "\u5468\u8001\u5e08", "teacher-zhou-voice-orb-open.png"],
    ["u-parent", "/parent?child=c-1", "\u6797\u5988\u5988", "parent-voice-orb-open.png"],
  ] as const;

  for (const [accountId, route, label, fileName] of roles) {
    await loginAs(page, accountId, route);
    const orb = page.getByTestId("voice-orb-button");
    const visible = await orb.isVisible({ timeout: 30_000 }).catch(() => false);
    if (!visible) {
      evidence.voiceOrbRoles[label] = "missing";
      pushError(`voice-orb:${accountId}`, "vercel-not-redeployed", { status: "missing-ui" });
      await capture(page, fileName);
      continue;
    }
    await orb.click();
    await expect(page.getByTestId("voice-orb-panel")).toBeVisible({ timeout: 20_000 });
    const providerText = await page.getByTestId("voice-orb-provider-status").innerText({ timeout: 20_000 });
    evidence.voiceOrbRoles[label] = providerText.replace(/\s+/gu, " ").trim();
    await capture(page, fileName);
  }

  await loginAs(page, "u-parent", "/parent?child=c-1");
  const parentOrb = page.getByTestId("voice-orb-button");
  if (await parentOrb.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await parentOrb.click();
    await page.getByTestId("voice-orb-input").fill("\u7ebf\u4e0a\u9a8c\u6536\u672a\u77e5\u6307\u4ee4\uff0c\u8bf7\u5ffd\u7565");
    await page.getByTestId("voice-orb-submit").click();
    await expect
      .poll(async () => {
        const result = await page.getByTestId("voice-orb-result").isVisible().catch(() => false);
        const error = await page.getByTestId("voice-orb-error").isVisible().catch(() => false);
        return result || error;
      }, { timeout: 30_000 })
      .toBe(true);
    await capture(page, "parent-voice-orb-unknown-command.png");
  }

  evidence.voiceOrbOnline =
    Object.values(evidence.voiceOrbRoles).filter((status) => status !== "missing").length === 4 && evidence.fakeSuccess !== "risk-detected"
      ? "open-for-director-teachers-parent;text-fallback-and-fail-closed-ok"
      : "incomplete";
}

async function checkAsrFallback() {
  const teacher = await liveContext("u-teacher");
  try {
    const typed = await readOkData<{
      transcript: string;
      source: string;
      fallback: boolean;
      status: CapabilitySnapshot;
    }>(
      await teacher.post("/api/ai/voice-asr", {
        multipart: {
          transcript: `${SAFE_TEXT} typed transcript`,
          scene: "r05-typed-transcript",
        },
      }),
      "asr:typed-fallback"
    );
    if (!typed?.transcript?.includes(SAFE_TEXT) || typed.fallback !== true) {
      pushError("asr:typed-fallback", "unknown", { status: typed?.source ?? "missing" });
    }
  } finally {
    await teacher.dispose();
  }
}

function hasCredentialLeak(text: string) {
  const patterns = [
    ["VIVO_APP_KEY", /\bVIVO_APP_KEY\b/u],
    ["sk-xuanji", /sk-xuanji/iu],
    ["NEXT_PUBLIC_VIVO", /\bNEXT_PUBLIC_VIVO_/u],
    ["AppKEY", /\bAppKEY\b/u],
    ["vivo-secret-context", /VIVO[A-Z0-9_]{0,40}(?:SECRET|TOKEN|SIGNATURE|APP_KEY)/iu],
    ["authorization-bearer", /Authorization\s*[:=]\s*["']?Bearer\s+[A-Za-z0-9._-]{12,}/iu],
  ] as const;
  return patterns.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}

function genericFrontendTerms(text: string) {
  const terms = [
    ["secret", /\bsecret\b/iu],
    ["token", /\btoken\b/iu],
    ["signature", /\bsignature\b/iu],
  ] as const;
  return terms.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}

async function fetchText(url: string) {
  const response = await fetch(url, { redirect: "follow" });
  return response.text();
}

async function checkFrontendSecretExposure() {
  const urls = new Set<string>([liveUrl("/login"), liveUrl("/")]);
  const html = await fetchText(liveUrl("/login"));
  const scriptPattern = /<script[^>]+src=["']([^"']+\.js[^"']*)["']/giu;
  for (const match of html.matchAll(scriptPattern)) {
    const src = match[1];
    if (!src) continue;
    urls.add(src.startsWith("http") ? src : liveUrl(src));
  }

  const highRiskMatches = new Set<string>();
  const genericTerms = new Set<string>();
  let baseUrlInFrontend = false;

  for (const url of Array.from(urls).slice(0, 80)) {
    const text = await fetchText(url).catch(() => "");
    for (const match of hasCredentialLeak(text)) highRiskMatches.add(match);
    for (const match of genericFrontendTerms(text)) genericTerms.add(match);
    if (/\bVIVO_BASE_URL\b/u.test(text)) baseUrlInFrontend = true;
  }

  const tracked = await listTrackedFiles();
  let guardOnly = 0;
  let runtimeUse = false;
  let assignment = false;
  for (const file of tracked) {
    const content = await fs.readFile(path.join(process.cwd(), file), "utf8").catch(() => "");
    if (!content.includes("NEXT_PUBLIC_VIVO_")) continue;
    guardOnly += 1;
    if (/process\.env\.NEXT_PUBLIC_VIVO_/u.test(content)) runtimeUse = true;
    if (/NEXT_PUBLIC_VIVO_[A-Z0-9_]*\s*=/u.test(content)) assignment = true;
  }

  evidence.secretExposure.highRiskMatches = Array.from(highRiskMatches).sort();
  evidence.secretExposure.genericFrontendTerms = Array.from(genericTerms).sort();
  evidence.secretExposure.highRiskFound = highRiskMatches.size > 0;
  evidence.secretExposure.nextPublicVivoRuntimeUse = runtimeUse;
  evidence.secretExposure.nextPublicVivoAssignment = assignment;
  evidence.secretExposure.nextPublicVivoGuardOnlyReferences = guardOnly;
  if (baseUrlInFrontend) {
    evidence.secretExposure.genericFrontendTerms.push("VIVO_BASE_URL-name");
  }
  evidence.secretExposureCheck =
    evidence.secretExposure.highRiskFound || runtimeUse || assignment || evidence.secretExposure.browserRequestLeak
      ? "failed"
      : "passed";
}

async function listTrackedFiles() {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  const { stdout } = await execFileAsync("git", ["ls-files"], {
    cwd: process.cwd(),
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function trackBrowserNetwork(page: Page) {
  const aiRequests = new Set<string>();
  const externalProviderHosts = new Set<string>();
  page.on("request", (request) => {
    const url = request.url();
    const parsed = new URL(url);
    const postData = request.postData() ?? "";
    const inspected = `${url}\n${postData}`;
    if (parsed.origin === BASE_URL && parsed.pathname.startsWith("/api/ai/")) {
      aiRequests.add(`${request.method()} ${parsed.pathname}`);
    }
    if (/api-ai\.vivo\.com\.cn|aigc\.vivo\.com\.cn/iu.test(url)) {
      externalProviderHosts.add(parsed.hostname);
    }
    if (hasCredentialLeak(inspected).length > 0) {
      evidence.network.browserProviderLeakFound = true;
      evidence.secretExposure.browserRequestLeak = true;
    }
  });
  return () => {
    evidence.network.sameOriginAiRequests = Array.from(aiRequests).sort();
    evidence.network.externalProviderHosts = Array.from(externalProviderHosts).sort();
    evidence.secretExposure.externalProviderBrowserRequests = evidence.network.externalProviderHosts;
  };
}

function finalizeGate() {
  const blocking: string[] = [];
  if (!evidence.loginProtectedProviderStatus) {
    blocking.push("unauthenticated provider-status is not login-protected");
  }
  if (!isLiveCapable(evidence.providerSnapshots.chat)) {
    blocking.push(`Chat provider is not live-capable: ${evidence.loggedInProviderStatus.chat}`);
  }
  if (!isLiveCapable(evidence.providerSnapshots.ocr)) {
    blocking.push(`OCR provider is not live-capable: ${evidence.loggedInProviderStatus.ocr}`);
  }
  if (!isLiveCapable(evidence.providerSnapshots.asr)) {
    blocking.push(`ASR provider is not live-capable: ${evidence.loggedInProviderStatus.asr}`);
  }
  if (!evidence.healthMaterialSaved) {
    blocking.push("health material parse was not saved through UI");
  }
  if (!evidence.voiceOrbOnline.includes("open-for-director-teachers-parent")) {
    blocking.push("voice orb online validation incomplete");
  }
  if (evidence.fakeSuccess !== "not-detected") {
    blocking.push("fake-success risk detected");
  }
  if (
    evidence.secretExposure.highRiskFound ||
    evidence.secretExposure.browserRequestLeak ||
    evidence.secretExposure.nextPublicVivoRuntimeUse ||
    evidence.secretExposure.nextPublicVivoAssignment
  ) {
    blocking.push("secret exposure risk detected");
  }
  evidence.blockingReasons = blocking;
  evidence.releaseGate = blocking.length > 0 ? "blocked" : "passed";
}

test.afterAll(async () => {
  finalizeGate();
  await writeEvidence();
});

test("online Vercel login-state AI provider acceptance", async ({ page, request }) => {
  const flushNetwork = trackBrowserNetwork(page);

  await checkUnauthenticatedProvider(request);
  await checkLoggedInProviderStatus();
  await checkHealthMaterial(page);
  await checkVoiceApis();
  await checkVoiceOrbUi(page);
  await checkAsrFallback();
  flushNetwork();
  await checkFrontendSecretExposure();
  finalizeGate();
  await writeEvidence();

  expect(evidence.blockingReasons, evidence.blockingReasons.join("\n")).toEqual([]);
});
