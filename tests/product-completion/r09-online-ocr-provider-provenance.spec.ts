import { expect, request as playwrightRequest, test, type APIRequestContext, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const BASE_URL = (
  process.env.R09_BASE_URL ??
  process.env.R05_BASE_URL ??
  process.env.PROD_BASE_URL ??
  process.env.PRODUCT_BASE_URL ??
  "https://www.smartchildcare.cn"
).replace(/\/+$/u, "");
const ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "product-completion", "R09");
const SAFE_TEXT = "线上 OCR 验收测试，请忽略";
const TEXT_MATERIAL = `${SAFE_TEXT}。体温正常，无异常。`;
const IMAGE_ASCII_TEXT = "ONLINE OCR ACCEPTANCE TEST IGNORE";
const HEALTH_CHILD_ID = "c-1";

type ErrorClassification =
  | "auth/signature"
  | "endpoint"
  | "model"
  | "permission"
  | "network"
  | "unsupported format"
  | "provider-unavailable"
  | "unknown";

type CapabilitySnapshot = {
  status: string;
  configured?: boolean;
  supported?: boolean;
  isRealProvider?: boolean;
  warnings?: string[];
};

type R09Evidence = {
  taskId: "R09";
  generatedAt: string;
  onlineBaseUrl: string;
  unauthenticatedProviderStatus: string;
  providerStatus: {
    chat: string;
    ocr: string;
    asr: string;
  };
  providerSnapshots: {
    chat?: CapabilitySnapshot;
    ocr?: CapabilitySnapshot;
    asr?: CapabilitySnapshot;
  };
  textMaterialProvenance: string;
  imageMaterialProvenance: string;
  imageOcrLiveConfirmed: boolean;
  healthMaterialSaveConfirmed: string;
  voiceOrbSmoke: Record<string, string>;
  commandApi: string;
  onlineErrors: Array<{ area: string; classification: ErrorClassification; httpStatus?: number; status?: string }>;
  artifacts: string[];
  blockingReasons: string[];
};

const evidence: R09Evidence = {
  taskId: "R09",
  generatedAt: new Date().toISOString(),
  onlineBaseUrl: BASE_URL,
  unauthenticatedProviderStatus: "not-run",
  providerStatus: {
    chat: "not-run",
    ocr: "not-run",
    asr: "not-run",
  },
  providerSnapshots: {},
  textMaterialProvenance: "not-run",
  imageMaterialProvenance: "not-run",
  imageOcrLiveConfirmed: false,
  healthMaterialSaveConfirmed: "not-run",
  voiceOrbSmoke: {},
  commandApi: "not-run",
  onlineErrors: [],
  artifacts: [],
  blockingReasons: [],
};

test.describe.configure({ mode: "serial" });
test.use({ trace: "off", screenshot: "off", video: "off" });

function liveUrl(pathname: string) {
  return `${BASE_URL}${pathname.startsWith("/") ? "" : "/"}${pathname}`;
}

function normalizeStatus(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "unknown";
}

function snapshotCapability(value: unknown): CapabilitySnapshot {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    status: normalizeStatus(record.status),
    configured: typeof record.configured === "boolean" ? record.configured : undefined,
    supported: typeof record.supported === "boolean" ? record.supported : undefined,
    isRealProvider: typeof record.isRealProvider === "boolean" ? record.isRealProvider : undefined,
    warnings: Array.isArray(record.warnings) ? record.warnings.filter((item): item is string => typeof item === "string") : undefined,
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
  const text = JSON.stringify(body ?? {}).toLowerCase();
  if (status === 401 || /signature|authorization|unauthorized|appkey|token|bearer/u.test(text)) return "auth/signature";
  if (status === 403 || /permission|forbidden|scope|denied/u.test(text)) return "permission";
  if (status === 404 || status === 405) return "endpoint";
  if (status === 415 || /unsupported|format|mime|image/u.test(text)) return "unsupported format";
  if (status === 503 || code === "provider_unavailable") return "provider-unavailable";
  if (/model/u.test(text)) return "model";
  if (/network|fetch failed|econn|enotfound|timeout|timed out/u.test(text)) return "network";
  return "unknown";
}

function pushError(area: string, classification: ErrorClassification, options: { httpStatus?: number; status?: string } = {}) {
  evidence.onlineErrors.push({ area, classification, ...options });
}

async function readJson(response: { json(): Promise<unknown> }) {
  return response.json().catch(() => null);
}

function dataFromApiOk<T>(body: unknown): T | null {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (record.ok === true) return record.data as T;
  return null;
}

async function liveContext(accountId: string) {
  const context = await playwrightRequest.newContext({ baseURL: BASE_URL });
  const login = await context.post("/api/auth/demo-login", { data: { accountId } });
  const body = await readJson(login);
  expect(login.status(), `${accountId} demo login should succeed`).toBe(200);
  if (login.status() !== 200) {
    pushError(`login:${accountId}`, classifyHttp(login.status(), body), { httpStatus: login.status() });
  }
  return context;
}

async function loginAs(page: Page, accountId: string, route: string) {
  const login = await page.request.post(liveUrl("/api/auth/demo-login"), { data: { accountId } });
  const body = await readJson(login);
  expect(login.status(), `${accountId} demo login should succeed`).toBe(200);
  if (login.status() !== 200) {
    pushError(`page-login:${accountId}`, classifyHttp(login.status(), body), { httpStatus: login.status() });
  }
  await page.goto(liveUrl(route));
  await page.waitForLoadState("domcontentloaded", { timeout: 30_000 });
}

async function capture(page: Page, fileName: string) {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  const absolutePath = path.join(ARTIFACT_DIR, fileName);
  await page.screenshot({ path: absolutePath, fullPage: true });
  evidence.artifacts.push(path.relative(process.cwd(), absolutePath).split(path.sep).join("/"));
}

async function writeEvidence() {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  const filePath = path.join(ARTIFACT_DIR, "r09-online-evidence.json");
  await fs.writeFile(filePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  if (!evidence.artifacts.includes(path.relative(process.cwd(), filePath).split(path.sep).join("/"))) {
    evidence.artifacts.push(path.relative(process.cwd(), filePath).split(path.sep).join("/"));
  }
}

async function createSafeOcrPng() {
  const svg = `
    <svg width="1200" height="520" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <text x="60" y="150" font-family="Arial, sans-serif" font-size="58" font-weight="700" fill="#111827">${IMAGE_ASCII_TEXT}</text>
      <text x="60" y="255" font-family="Arial, sans-serif" font-size="48" font-weight="700" fill="#111827">${SAFE_TEXT}</text>
      <text x="60" y="355" font-family="Arial, sans-serif" font-size="44" fill="#111827">Temperature normal. No abnormal signs.</text>
    </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function safeProviderStatus(value: unknown) {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    ocr: snapshotCapability(record.ocr),
    files: Array.isArray(record.files)
      ? record.files.map((item) => {
          const file = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
          return {
            provider: typeof file.provider === "string" ? file.provider : undefined,
            mode: typeof file.mode === "string" ? file.mode : undefined,
            source: typeof file.source === "string" ? file.source : undefined,
            isRealProvider: typeof file.isRealProvider === "boolean" ? file.isRealProvider : undefined,
            status: typeof file.status === "string" ? file.status : undefined,
          };
        })
      : [],
  };
}

function sanitizedBridgeResult(result: Record<string, unknown>) {
  return {
    summary: result.summary,
    source: result.source,
    fallback: result.fallback,
    mock: result.mock,
    provider: result.provider,
    model: result.model,
    providerStatus: safeProviderStatus(result.providerStatus),
    extractedTextPreview: typeof result.extractedText === "string" ? result.extractedText.slice(0, 200) : "",
    warnings: Array.isArray(result.warnings) ? result.warnings.filter((item): item is string => typeof item === "string") : [],
    generatedAt: result.generatedAt,
  };
}

async function checkProviderStatus(api: APIRequestContext) {
  const unauth = await playwrightRequest.newContext({ baseURL: BASE_URL });
  try {
    const response = await unauth.get("/api/ai/provider-status", { maxRedirects: 0 });
    evidence.unauthenticatedProviderStatus = String(response.status());
    expect([401, 307, 308, 302].includes(response.status()), "provider-status should be login-protected").toBe(true);
  } finally {
    await unauth.dispose();
  }

  const response = await api.get("/api/ai/provider-status");
  const body = await readJson(response);
  expect(response.status(), "logged-in provider-status should be available").toBe(200);
  const data = dataFromApiOk<Record<string, unknown>>(body);
  expect(data, "provider-status should use apiOk envelope").toBeTruthy();

  const chat = snapshotCapability(data?.chat);
  const ocr = snapshotCapability(data?.ocr);
  const asr = snapshotCapability(data?.asr);
  evidence.providerSnapshots = { chat, ocr, asr };
  evidence.providerStatus = { chat: chat.status, ocr: ocr.status, asr: asr.status };
}

async function parseHealthMaterial(api: APIRequestContext, payload: Record<string, unknown>, area: string) {
  const response = await api.post("/api/ai/health-file-bridge", { data: payload });
  const body = await readJson(response);
  if (response.status() !== 200) {
    pushError(area, classifyHttp(response.status(), body), { httpStatus: response.status() });
    return { status: response.status(), body: body as Record<string, unknown> | null };
  }
  return { status: response.status(), body: body as Record<string, unknown> };
}

async function saveHealthMaterial(api: APIRequestContext, parseResult: Record<string, unknown>, filename: string) {
  const created = await api.post("/api/health-materials", {
    data: {
      childId: HEALTH_CHILD_ID,
      filename,
      fileType: "image/png",
      description: `${SAFE_TEXT} R09 image OCR live provenance`,
    },
  });
  const createBody = await readJson(created);
  expect(created.status(), "health material task should be created").toBe(201);
  const material = dataFromApiOk<{ materialId: string }>(createBody);
  expect(material?.materialId, "created material should return materialId").toBeTruthy();

  const saved = await api.post(`/api/health-materials/${encodeURIComponent(material!.materialId)}/parse`, {
    data: {
      parseStatus: "completed",
      parseResult: {
        summary: parseResult.summary,
        sourceLabel: parseResult.provider === "vivo" ? "vivo OCR provider" : String(parseResult.source ?? "provider"),
        provenance: sanitizedBridgeResult(parseResult),
      },
    },
  });
  const saveBody = await readJson(saved);
  expect(saved.status(), "health material parse should be saved").toBe(200);
  const savedMaterial = dataFromApiOk<{ materialId: string; parseStatus?: string }>(saveBody);
  expect(savedMaterial?.parseStatus).toBe("completed");

  const refreshed = await api.get(`/api/health-materials?childId=${encodeURIComponent(HEALTH_CHILD_ID)}`);
  const refreshedBody = await readJson(refreshed);
  const materials = dataFromApiOk<Array<{ materialId: string; filename?: string; parseStatus?: string }>>(refreshedBody) ?? [];
  const found = materials.some((item) => item.materialId === material!.materialId && item.parseStatus === "completed");
  expect(found, "saved health material should be visible after refresh").toBe(true);
  evidence.healthMaterialSaveConfirmed = found ? `saved-and-refreshed:${material!.materialId}` : "missing-after-refresh";
  return material!.materialId;
}

async function checkVoiceOrb(page: Page) {
  const roles = [
    ["u-admin", "/admin", "director"],
    ["u-teacher", "/teacher", "teacher"],
    ["u-parent", "/parent?child=c-1", "parent"],
  ] as const;

  for (const [accountId, route, label] of roles) {
    await loginAs(page, accountId, route);
    const button = page.getByTestId("voice-orb-button");
    await expect(button, `${label} voice orb should be visible`).toBeVisible({ timeout: 30_000 });
    await button.click();
    await expect(page.getByTestId("voice-orb-panel")).toBeVisible({ timeout: 20_000 });
    const providerStatus = page.getByTestId("voice-orb-provider-status");
    await expect(providerStatus, `${label} provider status should finish loading`).not.toContainText("正在读取", {
      timeout: 30_000,
    });
    const providerText = await providerStatus.innerText({ timeout: 20_000 });
    evidence.voiceOrbSmoke[label] = providerText.replace(/\s+/gu, " ").trim();
    await capture(page, `voice-orb-${label}.png`);
  }
}

async function checkCommandApi(api: APIRequestContext) {
  const response = await api.post("/api/voice-assistant/commands", {
    data: {
      action: "plan",
      utterance: { text: "查看高风险儿童", inputMode: "text", transcriptSource: "r09-smoke" },
      context: { currentPath: "/admin" },
    },
  });
  const body = await readJson(response);
  if (response.status() !== 200) {
    pushError("voice-command-api", classifyHttp(response.status(), body), { httpStatus: response.status() });
  }
  expect(response.status(), "voice command API should not be 404 and should plan").toBe(200);
  evidence.commandApi = `status:${response.status()}`;
}

function finalizeGate() {
  const blocking: string[] = [];
  if (!isLiveCapable(evidence.providerSnapshots.chat)) {
    blocking.push(`Chat provider is not live-capable: ${evidence.providerStatus.chat}`);
  }
  if (!isLiveCapable(evidence.providerSnapshots.ocr)) {
    blocking.push(`OCR provider is not live-capable: ${evidence.providerStatus.ocr}`);
  }
  if (!isLiveCapable(evidence.providerSnapshots.asr)) {
    blocking.push(`ASR provider is not live-capable: ${evidence.providerStatus.asr}`);
  }
  if (!evidence.textMaterialProvenance.includes("fallback")) {
    blocking.push(`text material fallback provenance is not explicit: ${evidence.textMaterialProvenance}`);
  }
  if (!evidence.imageOcrLiveConfirmed) {
    blocking.push(`image OCR live was not confirmed: ${evidence.imageMaterialProvenance}`);
  }
  if (!evidence.healthMaterialSaveConfirmed.startsWith("saved-and-refreshed")) {
    blocking.push(`health material save was not confirmed: ${evidence.healthMaterialSaveConfirmed}`);
  }
  for (const [role, status] of Object.entries(evidence.voiceOrbSmoke)) {
    if (!status.toLowerCase().includes("ready")) blocking.push(`${role} voice orb provider is not ready: ${status}`);
  }
  if (Object.keys(evidence.voiceOrbSmoke).length !== 3) {
    blocking.push("voice orb smoke did not cover all required roles");
  }
  if (!evidence.commandApi.startsWith("status:200")) {
    blocking.push(`voice command API failed: ${evidence.commandApi}`);
  }
  evidence.blockingReasons = blocking;
}

test.afterAll(async () => {
  finalizeGate();
  await writeEvidence();
});

test("R09 online OCR provider provenance and R05 completion gap", async ({ page }) => {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  const teacher = await liveContext("u-teacher");
  const director = await liveContext("u-admin");

  try {
    await checkProviderStatus(teacher);

    const textResult = await parseHealthMaterial(
      teacher,
      {
        childId: HEALTH_CHILD_ID,
        sourceRole: "teacher",
        requestSource: "r09-text-material",
        files: [
          {
            name: "r09-text-material.txt",
            mimeType: "text/plain",
            previewText: TEXT_MATERIAL,
          },
        ],
      },
      "health-material:text"
    );
    expect(textResult.status, "text material should parse successfully").toBe(200);
    evidence.textMaterialProvenance = String(textResult.body?.source ?? "unknown");
    expect(evidence.textMaterialProvenance.toLowerCase()).toContain("fallback");

    const imageBuffer = await createSafeOcrPng();
    const imageBase64 = imageBuffer.toString("base64");
    const imageFilename = `r09-online-ocr-${Date.now()}.png`;
    const imagePath = path.join(ARTIFACT_DIR, imageFilename);
    await fs.writeFile(imagePath, imageBuffer);
    evidence.artifacts.push(path.relative(process.cwd(), imagePath).split(path.sep).join("/"));

    const imageResult = await parseHealthMaterial(
      teacher,
      {
        childId: HEALTH_CHILD_ID,
        sourceRole: "teacher",
        requestSource: "r09-image-ocr-live",
        files: [
          {
            name: imageFilename,
            mimeType: "image/png",
            imageBase64,
          },
        ],
      },
      "health-material:image"
    );
    expect(imageResult.status, "image material should parse through live OCR").toBe(200);
    const imageBody = imageResult.body ?? {};
    const imageProviderStatus = safeProviderStatus(imageBody.providerStatus);
    evidence.imageMaterialProvenance = [
      String(imageBody.source ?? "unknown"),
      String(imageBody.provider ?? "unknown"),
      imageProviderStatus.ocr.status,
      String(imageBody.fallback),
    ].join(";");
    evidence.imageOcrLiveConfirmed =
      imageBody.source === "vivo-ocr-provider" &&
      imageBody.provider === "vivo" &&
      imageBody.fallback === false &&
      imageProviderStatus.ocr.status === "ready" &&
      imageProviderStatus.files.some((file) => file.isRealProvider === true);
    expect(evidence.imageOcrLiveConfirmed, evidence.imageMaterialProvenance).toBe(true);

    const materialId = await saveHealthMaterial(teacher, imageBody, imageFilename);
    await loginAs(page, "u-teacher", "/teacher/health-file-bridge");
    await expect(page.getByTestId("d05-health-history")).toContainText(imageFilename, { timeout: 30_000 });
    await page.reload();
    await expect(page.getByTestId("d05-health-history")).toContainText(imageFilename, { timeout: 30_000 });
    await capture(page, "health-material-saved-refresh.png");
    evidence.healthMaterialSaveConfirmed = `saved-and-refreshed:${materialId}`;

    await checkVoiceOrb(page);
    await checkCommandApi(director);
  } finally {
    await teacher.dispose();
    await director.dispose();
  }

  finalizeGate();
  await writeEvidence();
  expect(evidence.blockingReasons, evidence.blockingReasons.join("\n")).toEqual([]);
});
