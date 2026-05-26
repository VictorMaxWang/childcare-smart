#!/usr/bin/env node

import { readFileSync } from "node:fs";

const baseUrl = String(process.env.AI_SMOKE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const endpoint = `${baseUrl}/api/ai/parent-storybook`;
const mediaStatusEndpoint = `${baseUrl}/api/ai/parent-storybook/media-status`;
const loginEndpoint = `${baseUrl}/api/auth/demo-login`;
const demoAccountId = process.env.STORYBOOK_SMOKE_DEMO_ACCOUNT_ID || "u-parent";
const timeoutMs = Number(process.env.STORYBOOK_SMOKE_TIMEOUT_MS || 20000);
const pollIntervalMs = Number(process.env.STORYBOOK_SMOKE_POLL_INTERVAL_MS || 2000);
const maxPollDelayMs = Number(process.env.STORYBOOK_SMOKE_MAX_POLL_DELAY_MS || 90000);
const maxPollAttempts = Number(process.env.STORYBOOK_SMOKE_MAX_POLLS || 18);
const fixturePath = new URL(
  process.env.STORYBOOK_SMOKE_FIXTURE || "../backend/tests/fixtures/parent_storybook/page-recording-c1-bedtime.json",
  import.meta.url
);

const fixturePayload = JSON.parse(readFileSync(fixturePath, "utf8"));
const payload = {
  ...fixturePayload,
  childId: fixturePayload.childId || fixturePayload.snapshot?.child?.id || "c-1",
  requestSource: process.env.STORYBOOK_SMOKE_REQUEST_SOURCE || `storybook-smoke-real-${Date.now()}`,
  generationMode: process.env.STORYBOOK_SMOKE_GENERATION_MODE || "manual-theme",
  manualTheme: process.env.STORYBOOK_SMOKE_THEME || "表达情绪",
  manualPrompt:
    process.env.STORYBOOK_SMOKE_MANUAL_PROMPT ||
    "请生成一套帮助孩子识别、表达和安放情绪的成长绘本。",
  pageCount: Number(process.env.STORYBOOK_SMOKE_PAGE_COUNT || fixturePayload.pageCount || 6),
  goalKeywords: (process.env.STORYBOOK_SMOKE_GOAL_KEYWORDS || "表达情绪,情绪命名,温柔沟通")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
};
const pageUrl = `${baseUrl}/parent/storybook?child=${encodeURIComponent(payload.childId || "c-1")}`;
const requireRealText = process.env.STORYBOOK_SMOKE_REQUIRE_REAL_TEXT !== "0";
const requireRealImages = process.env.STORYBOOK_SMOKE_REQUIRE_REAL_IMAGES === "1";
const minRealImageRatio = Number(
  process.env.STORYBOOK_SMOKE_MIN_REAL_IMAGE_RATIO || (requireRealImages ? 1 : 0)
);
const realTextProviderPattern = /(?:vivo|qwen|dashscope|llm|ai)/i;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveMediaPollDelayMs(story) {
  const retryAt = Number(story?.providerMeta?.diagnostics?.image?.nextRetryAtMs);
  if (Number.isFinite(retryAt) && retryAt > Date.now()) {
    return Math.min(
      Math.max(maxPollDelayMs, pollIntervalMs),
      Math.max(pollIntervalMs, retryAt - Date.now() + 500)
    );
  }
  return pollIntervalMs;
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

function printStorySummary(label, details) {
  const transportHeader = details.headers.get("x-smartchildcare-transport") || "(missing)";
  const fallbackReasonHeader =
    details.headers.get("x-smartchildcare-fallback-reason") || "(missing)";
  const providerMeta = details.json?.providerMeta || {};
  const scenes = Array.isArray(details.json?.scenes) ? details.json.scenes : [];
  const realImageScenes = scenes.filter((scene) => isRealImageScene(scene));

  console.log(`\n=== ${label} ===`);
  console.log(`status: ${details.status}`);
  console.log(`transport header: ${transportHeader}`);
  console.log(`fallback header: ${fallbackReasonHeader}`);
  console.log(`body transport: ${providerMeta.transport || "(missing)"}`);
  console.log(`textProvider: ${providerMeta.textProvider || providerMeta.provider || "(missing)"}`);
  console.log(`textDelivery: ${providerMeta.textDelivery || "(missing)"}`);
  console.log(`body fallbackReason: ${details.json?.fallbackReason ?? providerMeta.fallbackReason ?? "(none)"}`);
  console.log(`imageDelivery: ${providerMeta.imageDelivery || "(missing)"}`);
  console.log(`audioDelivery: ${providerMeta.audioDelivery || "(missing)"}`);
  console.log(`scenes: ${scenes.length}`);
  console.log(`real image scenes: ${realImageScenes.length}/${scenes.length}`);
  console.log(`image scenes: ${summarizeSceneImages(scenes)}`);
  console.log(`title: ${compactSnippet(details.json?.title, 120)}`);
  console.log(`first scene: ${compactSnippet(scenes[0]?.sceneText, 160)}`);
  console.log(`brain diagnostics: ${JSON.stringify(providerMeta.diagnostics?.brain || null)}`);
  console.log(`image diagnostics: ${JSON.stringify(providerMeta.diagnostics?.image || null)}`);
  console.log(`audio diagnostics: ${JSON.stringify(providerMeta.diagnostics?.audio || null)}`);
  console.log(
    `image job: ${providerMeta.diagnostics?.image?.jobStatus || "(missing)"}`
  );
}

function isRealImageScene(scene) {
  const sourceKind = scene?.imageSourceKind || "";
  const status = scene?.imageStatus || "";
  const imageUrl = String(scene?.imageUrl || "");
  return sourceKind === "real" && status === "ready" && /^https?:\/\//i.test(imageUrl);
}

function summarizeSceneImages(scenes) {
  if (!scenes.length) return "(none)";
  return scenes
    .map((scene) => {
      const index = scene?.sceneIndex ?? "?";
      const kind = scene?.imageSourceKind || "(missing)";
      const status = scene?.imageStatus || "(missing)";
      const url = String(scene?.imageUrl || "");
      const urlKind = /^https?:\/\//i.test(url)
        ? "url"
        : url.startsWith("/api/ai/parent-storybook/media/")
          ? "media"
          : url.startsWith("data:image/")
            ? "data"
            : url
              ? "local"
              : "none";
      return `${index}:${kind}/${status}/${urlKind}`;
    })
    .join(", ");
}

async function loginAndGetCookie() {
  const response = await fetchWithTimeout(loginEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId: demoAccountId }),
  });
  const details = await readResponseDetails(response);

  if (!details.ok) {
    throw new Error(`demo login failed: ${details.status}. ${compactSnippet(details.text)}`);
  }

  if (!details.json || details.json.ok !== true) {
    throw new Error(`demo login contract regression: ${compactSnippet(details.text)}`);
  }

  const cookie = response.headers.get("set-cookie");
  if (!cookie) {
    throw new Error("demo login succeeded but set-cookie header is missing");
  }

  return cookie.split(";")[0];
}

async function openStoryPage(cookie) {
  const response = await fetchWithTimeout(pageUrl, {
    method: "GET",
    headers: { Cookie: cookie },
  });
  const details = await readResponseDetails(response);

  assert(details.ok, `storybook page failed: ${details.status}`);
  assert(
    looksLikeHtml(details.contentType, details.text),
    `storybook page should return HTML, got ${details.contentType || "unknown"}`
  );
}

async function postStory(cookie, headers = {}) {
  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      ...headers,
    },
    body: JSON.stringify(payload),
  });
  return readResponseDetails(response);
}

async function postMediaStatus(cookie, story, prioritySceneIndices = [1, 2]) {
  const response = await fetchWithTimeout(mediaStatusEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({
      childId: story.childId,
      storyId: story.storyId,
      prioritySceneIndices,
      retryFailed: true,
      story,
    }),
  });
  return readResponseDetails(response);
}

function assertStorybookResponse(label, details) {
  if (!details.ok) {
    if (details.status === 503) {
      throw new Error(
        `${label}: brain unavailable (${details.headers.get("x-smartchildcare-fallback-reason") || "unknown"}). ${compactSnippet(details.text)}`
      );
    }
    throw new Error(`${label}: request failed (${details.status}). ${compactSnippet(details.text)}`);
  }

  if (!details.json) {
    throw new Error(`${label}: non-JSON response. ${compactSnippet(details.text)}`);
  }

  if (looksLikeHtml(details.contentType, details.text)) {
    throw new Error(`${label}: API returned HTML instead of JSON.`);
  }
}

function assertRemoteProxy(details, label) {
  const headerTransport = details.headers.get("x-smartchildcare-transport");
  const bodyTransport = details.json?.providerMeta?.transport;

  assert(
    headerTransport === "remote-brain-proxy" || headerTransport === "next-json-fallback",
    `${label}: header transport should be a known storybook path, got ${headerTransport}`
  );
  assert(
    bodyTransport === "remote-brain-proxy" || bodyTransport === "next-json-fallback",
    `${label}: body transport should be a known storybook path, got ${bodyTransport}`
  );
}

function getStoryFallbackReason(details) {
  return (
    details.headers.get("x-smartchildcare-fallback-reason") ||
    details.json?.fallbackReason ||
    details.json?.providerMeta?.fallbackReason ||
    details.json?.providerMeta?.diagnostics?.brain?.fallbackReason ||
    null
  );
}

function assertRealTextGeneration(details, label) {
  assertRemoteProxy(details, label);

  const providerMeta = details.json?.providerMeta || {};
  const textProvider = providerMeta.textProvider || providerMeta.provider || "";
  const fallbackReason = getStoryFallbackReason(details);

  assert(
    providerMeta.textDelivery === "real",
    `${label}: textDelivery should be real, got ${providerMeta.textDelivery || "(missing)"}`
  );
  assert(
    realTextProviderPattern.test(textProvider),
    `${label}: textProvider should be a real provider, got ${textProvider || "(missing)"}`
  );
  assert(!fallbackReason, `${label}: fallbackReason should be empty, got ${fallbackReason}`);
  assert(!isFixedDemoStory(details), `${label}: direct generation returned the fixed demo story`);
}

function hasRequiredRealImages(details) {
  const scenes = Array.isArray(details.json?.scenes) ? details.json.scenes : [];
  if (!scenes.length) return false;
  const realImageScenes = scenes.filter((scene) => isRealImageScene(scene)).length;
  const ratio = realImageScenes / scenes.length;
  return (
    details.json?.providerMeta?.imageDelivery === "real" &&
    ratio >= minRealImageRatio &&
    realImageScenes === scenes.length
  );
}

function assertRealImageGeneration(details, label) {
  const scenes = Array.isArray(details.json?.scenes) ? details.json.scenes : [];
  const realImageScenes = scenes.filter((scene) => isRealImageScene(scene)).length;
  const ratio = scenes.length ? realImageScenes / scenes.length : 0;
  const imageDelivery = details.json?.providerMeta?.imageDelivery;
  const diagnostics = details.json?.providerMeta?.diagnostics?.image;

  assert(scenes.length > 0, `${label}: scenes are missing`);
  assert(
    imageDelivery === "real",
    `${label}: imageDelivery should be real, got ${imageDelivery || "(missing)"}; scenes=${summarizeSceneImages(scenes)}; diagnostics=${JSON.stringify(diagnostics || null)}`
  );
  assert(
    ratio >= minRealImageRatio && realImageScenes === scenes.length,
    `${label}: expected all scenes to have real image URLs, got ${realImageScenes}/${scenes.length}; scenes=${summarizeSceneImages(scenes)}`
  );
}

function isFixedDemoStory(details) {
  const bodyText = JSON.stringify(details.json || {});
  return (
    bodyText.includes("林小雨的一小步勇敢") ||
    bodyText.includes("lin-xiaoyu-one-small-brave-step")
  );
}

function hasStoryContent(details) {
  const scenes = details.json?.scenes;
  return (
    typeof details.json?.storyId === "string" &&
    details.json.storyId.trim().length > 0 &&
    typeof details.json?.title === "string" &&
    details.json.title.trim().length > 0 &&
    Array.isArray(scenes) &&
    scenes.length > 0 &&
    scenes.every(
      (scene) =>
        typeof scene?.sceneTitle === "string" &&
        scene.sceneTitle.trim().length > 0 &&
        typeof scene?.sceneText === "string" &&
        scene.sceneText.trim().length > 0
    )
  );
}

function isLocalDemoSeedFallback(details) {
  const headerTransport = details.headers.get("x-smartchildcare-transport");
  const fallbackReason =
    details.headers.get("x-smartchildcare-fallback-reason") ||
    details.json?.fallbackReason ||
    details.json?.providerMeta?.fallbackReason;
  const providerMeta = details.json?.providerMeta || {};
  const imageDelivery = providerMeta.imageDelivery;
  const audioDelivery = providerMeta.audioDelivery;

  return (
    headerTransport === "next-json-fallback" &&
    providerMeta.transport === "next-json-fallback" &&
    fallbackReason === "demo-seed-isolated" &&
    hasStoryContent(details) &&
    ["dynamic-fallback", "demo-art", "svg-fallback", "mixed", "real"].includes(imageDelivery) &&
    ["preview-only", "mixed", "real"].includes(audioDelivery)
  );
}

function isWarmEnough(details) {
  const providerMeta = details.json?.providerMeta;
  return (
    hasStoryContent(details) &&
    providerMeta?.transport === "remote-brain-proxy" &&
    (providerMeta?.imageDelivery === "mixed" || providerMeta?.imageDelivery === "real")
  );
}

async function main() {
  console.log(`Storybook smoke target: ${endpoint}`);
  console.log(`Storybook media-status target: ${mediaStatusEndpoint}`);
  console.log(`Storybook smoke page: ${pageUrl}`);
  console.log(`Storybook smoke fixture: ${fixturePath.pathname}`);
  console.log(`Storybook smoke demo account: ${demoAccountId}`);

  try {
    const cookie = await loginAndGetCookie();
    await openStoryPage(cookie);

    const first = await postStory(cookie, {
      "x-smartchildcare-cache-bypass": "1",
    });
    printStorySummary("First request", first);
    assertStorybookResponse("first request", first);

    if (requireRealText) {
      assertRealTextGeneration(first, "first request");
      if (!requireRealImages) {
        console.log("\n[OK] Storybook smoke passed with real AI text generation.");
        return;
      }
      if (hasRequiredRealImages(first)) {
        assertRealImageGeneration(first, "first request");
        console.log("\n[OK] Storybook smoke passed with real AI text and real images.");
        return;
      }
    }

    if (!requireRealImages && isWarmEnough(first)) {
      console.log("\n[OK] Storybook smoke passed on first request.");
      return;
    }

    if (isLocalDemoSeedFallback(first)) {
      console.log("\n[OK] Storybook smoke passed with local demo-seed fallback.");
      return;
    }

    assertRemoteProxy(first, "first request");

    let latestStory = first.json;
    for (let attempt = 1; attempt <= maxPollAttempts; attempt += 1) {
      await sleep(resolveMediaPollDelayMs(latestStory));
      const polled = await postMediaStatus(cookie, latestStory, [1, 2, 3]);
      printStorySummary(`Poll ${attempt}`, polled);
      assertStorybookResponse(`poll ${attempt}`, polled);
      latestStory = polled.json;

      if (requireRealText) {
        assertRealTextGeneration(polled, `poll ${attempt}`);
        if (!requireRealImages) {
          console.log("\n[OK] Storybook smoke reached real AI text generation.");
          return;
        }
        if (hasRequiredRealImages(polled)) {
          assertRealImageGeneration(polled, `poll ${attempt}`);
          console.log("\n[OK] Storybook smoke reached real AI text and real images.");
          return;
        }
      }

      if (!requireRealImages && isWarmEnough(polled)) {
        console.log("\n[OK] Storybook smoke reached mixed/real.");
        return;
      }

      if (isLocalDemoSeedFallback(polled)) {
        console.log("\n[OK] Storybook smoke passed with local demo-seed fallback.");
        return;
      }

      assertRemoteProxy(polled, `poll ${attempt}`);
    }

    throw new Error(
      requireRealImages
        ? `storybook smoke did not reach real images within ${maxPollAttempts} polls`
        : `storybook smoke did not reach mixed/real within ${maxPollAttempts} polls`
    );
  } catch (error) {
    console.error("\n[FAIL] Storybook smoke failed.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
