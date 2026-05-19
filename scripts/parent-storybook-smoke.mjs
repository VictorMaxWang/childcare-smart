#!/usr/bin/env node

import { readFileSync } from "node:fs";

const baseUrl = String(process.env.AI_SMOKE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const endpoint = `${baseUrl}/api/ai/parent-storybook`;
const loginEndpoint = `${baseUrl}/api/auth/demo-login`;
const demoAccountId = process.env.STORYBOOK_SMOKE_DEMO_ACCOUNT_ID || "u-parent";
const timeoutMs = Number(process.env.STORYBOOK_SMOKE_TIMEOUT_MS || 20000);
const pollIntervalMs = Number(process.env.STORYBOOK_SMOKE_POLL_INTERVAL_MS || 2000);
const maxPollAttempts = Number(process.env.STORYBOOK_SMOKE_MAX_POLLS || 18);
const fixturePath = new URL(
  process.env.STORYBOOK_SMOKE_FIXTURE || "../backend/tests/fixtures/parent_storybook/page-recording-c1-bedtime.json",
  import.meta.url
);

const payload = JSON.parse(readFileSync(fixturePath, "utf8"));
const pageUrl = `${baseUrl}/parent/storybook?child=${encodeURIComponent(payload.childId || "c-1")}`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  console.log(`\n=== ${label} ===`);
  console.log(`status: ${details.status}`);
  console.log(`transport header: ${transportHeader}`);
  console.log(`fallback header: ${fallbackReasonHeader}`);
  console.log(`body transport: ${providerMeta.transport || "(missing)"}`);
  console.log(`imageDelivery: ${providerMeta.imageDelivery || "(missing)"}`);
  console.log(`audioDelivery: ${providerMeta.audioDelivery || "(missing)"}`);
  console.log(`scenes: ${scenes.length}`);
  console.log(
    `image job: ${providerMeta.diagnostics?.image?.jobStatus || "(missing)"}`
  );
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

  assert(headerTransport !== "next-json-fallback", `${label}: header transport regressed to next-json-fallback`);
  assert(bodyTransport === "remote-brain-proxy", `${label}: body transport should be remote-brain-proxy, got ${bodyTransport}`);
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

    if (isWarmEnough(first)) {
      console.log("\n[OK] Storybook smoke passed on first request.");
      return;
    }

    if (isLocalDemoSeedFallback(first)) {
      console.log("\n[OK] Storybook smoke passed with local demo-seed fallback.");
      return;
    }

    assertRemoteProxy(first, "first request");

    for (let attempt = 1; attempt <= maxPollAttempts; attempt += 1) {
      await sleep(pollIntervalMs);
      const polled = await postStory(cookie, {
        "x-smartchildcare-cache-bypass": "1",
      });
      printStorySummary(`Poll ${attempt}`, polled);
      assertStorybookResponse(`poll ${attempt}`, polled);

      if (isWarmEnough(polled)) {
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
      `storybook smoke did not reach mixed/real within ${maxPollAttempts} polls`
    );
  } catch (error) {
    console.error("\n[FAIL] Storybook smoke failed.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
