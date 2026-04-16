#!/usr/bin/env node

const baseUrl = String(process.env.AI_SMOKE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const endpoint = `${baseUrl}/api/ai/parent-trend-query`;
const loginEndpoint = `${baseUrl}/api/auth/demo-login`;
const loginPageUrl = `${baseUrl}/login`;
const smokeCase = String(process.env.TREND_SMOKE_CASE || "both").toLowerCase();
const timeoutMs = Number(process.env.TREND_SMOKE_TIMEOUT_MS || 15000);
const demoAccountId = process.env.TREND_SMOKE_DEMO_ACCOUNT_ID || "u-parent";
const successChildId = process.env.TREND_SMOKE_CHILD_ID || "c-1";
const fallbackChildId = process.env.TREND_SMOKE_FALLBACK_CHILD_ID || "c-11";
const ERROR_TAGS = {
  sessionFailed: "[session_failed|会话失败]",
  loginRedirect: "[login_redirect|被登录守卫重定向]",
  brainUnavailable: "[brain_unavailable|FastAPI brain 未接通]",
  contractRegression: "[contract_regression|contract 回归]",
};
const BRAIN_UNAVAILABLE_TOKENS = [
  "requires the fastapi brain",
  "趋势服务暂时未接通",
  "后端趋势服务未接通",
  "brain-base-url-missing",
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function compactSnippet(value, length = 180) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, length);
}

function getContentType(headers) {
  return String(headers.get("content-type") || "").toLowerCase();
}

function looksLikeHtml(contentType, bodyText) {
  return (
    contentType.includes("text/html") ||
    /^\s*<!doctype html/i.test(bodyText) ||
    /^\s*<html/i.test(bodyText)
  );
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      redirect: "manual",
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readResponseDetails(response) {
  const text = await response.text();
  let json = null;

  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  return {
    status: response.status,
    ok: response.ok,
    headers: response.headers,
    contentType: getContentType(response.headers),
    location: response.headers.get("location") || "",
    text,
    json,
  };
}

function printResponseSummary(label, details) {
  const contentType = details.contentType || "(missing)";
  const locationSuffix = details.location ? ` location=${details.location}` : "";
  console.log(`[preflight] ${label}: ${details.status} ${contentType}${locationSuffix}`);
}

function classifyApiFailure(label, details) {
  const preview = compactSnippet(details.text);
  const apiError = typeof details.json?.error === "string" ? details.json.error : preview;
  const fallbackReason = String(details.headers?.get?.("x-smartchildcare-fallback-reason") || "").toLowerCase();

  if (details.status === 401) {
    throw new Error(`${label}: ${ERROR_TAGS.sessionFailed} (401). ${apiError}`);
  }

  if ([302, 303, 307, 308].includes(details.status)) {
    throw new Error(
      `${label}: ${ERROR_TAGS.loginRedirect} (${details.status}). ${details.location || "missing Location header"}`
    );
  }

  if (details.status === 503) {
    if (
      BRAIN_UNAVAILABLE_TOKENS.some((token) => apiError.toLowerCase().includes(token)) ||
      fallbackReason.startsWith("brain-")
    ) {
      throw new Error(`${label}: ${ERROR_TAGS.brainUnavailable} (503). ${apiError}`);
    }
    throw new Error(`${label}: ${ERROR_TAGS.contractRegression} or upstream failure (503). ${apiError}`);
  }

  if (looksLikeHtml(details.contentType, details.text)) {
    throw new Error(`${label}: ${ERROR_TAGS.contractRegression}. API returned HTML instead of JSON. ${preview}`);
  }

  if (!details.json) {
    throw new Error(
      `${label}: ${ERROR_TAGS.contractRegression}. API returned non-JSON (${details.contentType || "unknown"}). ${preview}`
    );
  }
}

function ensureJsonSuccess(label, details) {
  if (!details.ok || !details.json) {
    classifyApiFailure(label, details);
  }
}

async function preflightBaseUrl() {
  const response = await fetchWithTimeout(loginPageUrl, { method: "GET" });
  const details = await readResponseDetails(response);
  printResponseSummary("base login page", details);

  if (!details.ok) {
    throw new Error(`base URL check failed: /login returned ${details.status}`);
  }

  if (!looksLikeHtml(details.contentType, details.text)) {
    throw new Error(
      `base URL check failed: /login should return HTML, got ${details.contentType || "unknown"}`
    );
  }
}

async function loginAndGetCookie() {
  const response = await fetchWithTimeout(loginEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId: demoAccountId }),
  });
  const details = await readResponseDetails(response);
  printResponseSummary("demo login", details);

  if (!details.ok) {
    if (details.status === 401) {
      throw new Error(`demo login: ${ERROR_TAGS.sessionFailed} (401). ${compactSnippet(details.text)}`);
    }
    if (looksLikeHtml(details.contentType, details.text)) {
      throw new Error(`demo login: ${ERROR_TAGS.sessionFailed}. Returned HTML. ${compactSnippet(details.text)}`);
    }
    throw new Error(`demo login failed: ${details.status}. ${compactSnippet(details.text)}`);
  }

  if (!details.json || details.json.ok !== true) {
    throw new Error(
      `demo login: ${ERROR_TAGS.contractRegression}. Expected JSON { ok: true }. ${compactSnippet(details.text)}`
    );
  }

  const cookie = response.headers.get("set-cookie");
  if (!cookie) {
    throw new Error("demo login succeeded but set-cookie header is missing");
  }

  return cookie.split(";")[0];
}

async function postTrend(cookie, payload) {
  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify(payload),
  });
  const details = await readResponseDetails(response);
  return details;
}

async function preflightTrendRoute(cookie) {
  const details = await postTrend(cookie, buildFallbackPayload());
  printResponseSummary("parent trend route", details);
  ensureJsonSuccess("parent trend route", details);
}

function assertCoreFields(result, label) {
  assert(Array.isArray(result.json?.series), `${label}: missing series`);
  assert(typeof result.json?.trendLabel === "string", `${label}: missing trendLabel`);
  assert(typeof result.json?.explanation === "string", `${label}: missing explanation`);
  assert(result.json?.dataQuality && typeof result.json.dataQuality === "object", `${label}: missing dataQuality`);
  assert(Array.isArray(result.json?.warnings), `${label}: missing warnings`);
}

function printTrendSummary(label, result) {
  console.log(`\n=== ${label} ===`);
  console.log(`status: ${result.status}`);
  console.log(`source: ${result.json?.source ?? "(missing)"}`);
  console.log(`fallback: ${String(result.json?.fallback ?? "(missing)")}`);
  console.log(`trendLabel: ${result.json?.trendLabel ?? "(missing)"}`);
  console.log(`observedDays: ${result.json?.dataQuality?.observedDays ?? "(missing)"} / ${result.json?.windowDays ?? "(missing)"}`);
  console.log(`warnings: ${Array.isArray(result.json?.warnings) ? result.json.warnings.length : 0}`);
}

function buildSuccessPayload() {
  return {
    question: "最近一个月分离焦虑缓解了吗？",
    childId: successChildId,
    appSnapshot: {
      children: [
        {
          id: successChildId,
          name: "安安",
          nickname: "安宝",
          institutionId: "inst-test",
          className: "小一班",
        },
      ],
      attendance: [],
      meals: [],
      growth: [
        {
          id: "growth-1",
          childId: successChildId,
          createdAt: "2026-03-06T09:00:00+08:00",
          category: "social-emotional",
          tags: ["分离焦虑", "哭闹", "安抚"],
          selectedIndicators: ["daily-observation"],
          description: "入园时明显哭闹，需要安抚，分离焦虑仍然比较明显。",
          needsAttention: true,
          followUpAction: "continue observation",
        },
        {
          id: "growth-2",
          childId: successChildId,
          createdAt: "2026-03-09T09:00:00+08:00",
          category: "social-emotional",
          tags: ["分离焦虑", "哭闹", "安抚"],
          selectedIndicators: ["daily-observation"],
          description: "入园时明显哭闹，需要安抚，分离焦虑仍然比较明显。",
          needsAttention: true,
          followUpAction: "continue observation",
        },
        {
          id: "growth-3",
          childId: successChildId,
          createdAt: "2026-03-12T09:00:00+08:00",
          category: "social-emotional",
          tags: ["分离焦虑", "哭闹", "安抚"],
          selectedIndicators: ["daily-observation"],
          description: "入园时明显哭闹，需要安抚，分离焦虑仍然比较明显。",
          needsAttention: true,
          followUpAction: "continue observation",
        },
        {
          id: "growth-4",
          childId: successChildId,
          createdAt: "2026-03-15T09:00:00+08:00",
          category: "social-emotional",
          tags: ["分离焦虑", "哭闹", "安抚"],
          selectedIndicators: ["daily-observation"],
          description: "入园时明显哭闹，需要安抚，分离焦虑仍然比较明显。",
          needsAttention: true,
          followUpAction: "continue observation",
        },
        {
          id: "growth-5",
          childId: successChildId,
          createdAt: "2026-03-19T09:00:00+08:00",
          category: "social-emotional",
          tags: ["分离焦虑", "哭闹", "安抚"],
          selectedIndicators: ["daily-observation"],
          description: "入园时明显哭闹，需要安抚，分离焦虑仍然比较明显。",
          needsAttention: true,
          followUpAction: "continue observation",
        },
        {
          id: "growth-6",
          childId: successChildId,
          createdAt: "2026-03-22T09:00:00+08:00",
          category: "social-emotional",
          tags: ["分离焦虑", "哭闹", "安抚"],
          selectedIndicators: ["daily-observation"],
          description: "入园时明显哭闹，需要安抚，分离焦虑仍然比较明显。",
          needsAttention: true,
          followUpAction: "continue observation",
        },
        {
          id: "growth-7",
          childId: successChildId,
          createdAt: "2026-03-25T09:00:00+08:00",
          category: "social-emotional",
          tags: ["平静", "稳定", "主动"],
          selectedIndicators: ["daily-observation"],
          description: "今天入园更平静，情绪稳定，能主动跟老师进班。",
          needsAttention: false,
          followUpAction: "continue observation",
        },
        {
          id: "growth-8",
          childId: successChildId,
          createdAt: "2026-03-27T09:00:00+08:00",
          category: "social-emotional",
          tags: ["平静", "稳定", "主动"],
          selectedIndicators: ["daily-observation"],
          description: "今天入园更平静，情绪稳定，能主动跟老师进班。",
          needsAttention: false,
          followUpAction: "continue observation",
        },
        {
          id: "growth-9",
          childId: successChildId,
          createdAt: "2026-03-29T09:00:00+08:00",
          category: "social-emotional",
          tags: ["平静", "稳定", "主动"],
          selectedIndicators: ["daily-observation"],
          description: "今天入园更平静，情绪稳定，能主动跟老师进班。",
          needsAttention: false,
          followUpAction: "continue observation",
        },
        {
          id: "growth-10",
          childId: successChildId,
          createdAt: "2026-03-31T09:00:00+08:00",
          category: "social-emotional",
          tags: ["平静", "稳定", "主动"],
          selectedIndicators: ["daily-observation"],
          description: "今天入园更平静，情绪稳定，能主动跟老师进班。",
          needsAttention: false,
          followUpAction: "continue observation",
        },
        {
          id: "growth-11",
          childId: successChildId,
          createdAt: "2026-04-02T09:00:00+08:00",
          category: "social-emotional",
          tags: ["平静", "稳定", "主动"],
          selectedIndicators: ["daily-observation"],
          description: "今天入园更平静，情绪稳定，能主动跟老师进班。",
          needsAttention: false,
          followUpAction: "continue observation",
        },
        {
          id: "growth-12",
          childId: successChildId,
          createdAt: "2026-04-04T09:00:00+08:00",
          category: "social-emotional",
          tags: ["平静", "稳定", "主动"],
          selectedIndicators: ["daily-observation"],
          description: "今天入园更平静，情绪稳定，能主动跟老师进班。",
          needsAttention: false,
          followUpAction: "continue observation",
        },
      ],
      feedback: [],
      health: [],
      taskCheckIns: [],
      interventionCards: [],
      consultations: [],
      mobileDrafts: [],
      reminders: [],
      updatedAt: "2026-04-04T00:00:00Z",
    },
  };
}

function buildFallbackPayload() {
  return {
    question: "最近两周睡眠情况稳定吗？",
    childId: fallbackChildId,
  };
}

async function runSuccessCase(cookie) {
  const result = await postTrend(cookie, buildSuccessPayload());
  ensureJsonSuccess("success case", result);
  printTrendSummary("Trend success", result);

  assert(result.status === 200, `success case returned ${result.status}`);
  assertCoreFields(result, "success case");
  assert(result.json.source === "request_snapshot", "success case: source should be request_snapshot");
  assert(result.json.fallback === false, "success case: fallback should be false");
  assert(result.json.dataQuality.fallbackUsed === false, "success case: fallbackUsed should be false");
}

async function runFallbackCase(cookie) {
  const result = await postTrend(cookie, buildFallbackPayload());
  ensureJsonSuccess("fallback case", result);
  printTrendSummary("Trend fallback", result);

  assert(result.status === 200, `fallback case returned ${result.status}`);
  assertCoreFields(result, "fallback case");
  assert(result.json.source === "demo_snapshot", "fallback case: source should be demo_snapshot");
  assert(result.json.fallback === true, "fallback case: fallback should be true");
  assert(result.json.dataQuality.fallbackUsed === true, "fallback case: fallbackUsed should be true");
  assert(result.json.dataQuality.source === "demo_snapshot", "fallback case: dataQuality.source should be demo_snapshot");
  assert(result.json.warnings.length > 0, "fallback case: warnings should be present");
  const trendLabel = String(result.json.trendLabel || "").trim();
  const comparisonDirection = String(result.json.comparison?.direction || "").trim();
  const pretendsImproving = trendLabel === "改善" || trendLabel.toLowerCase() === "improving" || comparisonDirection === "up";
  assert(pretendsImproving === false, "fallback case: should not pretend to be a high-quality improving trend");
}

async function main() {
  console.log(`Trend smoke target: ${endpoint}`);
  console.log(`Trend smoke mode: ${smokeCase}`);
  console.log(`Trend smoke demo account: ${demoAccountId}`);
  console.log(`Trend smoke success child: ${successChildId}`);
  console.log(`Trend smoke fallback child: ${fallbackChildId}`);

  try {
    await preflightBaseUrl();
    const cookie = await loginAndGetCookie();
    await preflightTrendRoute(cookie);

    if (smokeCase === "success" || smokeCase === "both") {
      await runSuccessCase(cookie);
    }

    if (smokeCase === "fallback" || smokeCase === "both") {
      await runFallbackCase(cookie);
    }

    console.log("\n[OK] Parent trend smoke passed.");
  } catch (error) {
    console.error("\n[FAIL] Parent trend smoke failed.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
