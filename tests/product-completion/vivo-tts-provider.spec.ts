import { expect, test, type APIResponse } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { demoContext } from "./e11-helpers";

const STATIC_AUDIO = path.join(process.cwd(), "public/demo-media/storybooks/lin-xiaoyu/audio/page-01.mp3");
const TTS_ROUTE = "/api/storybooks/lin-xiaoyu/tts?childId=c-1&page=1";

async function readJson(response: APIResponse) {
  return (await response.json()) as { ok?: boolean; errorKind?: string; error?: string };
}

test("TTS route requires authentication", async ({ request }) => {
  const response = await request.get(TTS_ROUTE);
  expect(response.status()).toBe(401);
  const body = await readJson(response);
  expect(body.ok).toBe(false);
  expect(body.errorKind).toBe("auth/signature");
});

test("authorized static audio is preferred when present", async ({}, testInfo) => {
  const parent = await demoContext(testInfo, "u-parent");
  const response = await parent.get(TTS_ROUTE);
  if (fs.existsSync(STATIC_AUDIO)) {
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("audio/mpeg");
    expect(response.headers()["x-smartchildcare-tts-source"]).toBe("static");
  } else {
    expect([200, 503]).toContain(response.status());
  }
});

test("bypassing static audio never fakes success when vivo is unavailable", async ({}, testInfo) => {
  const parent = await demoContext(testInfo, "u-parent");
  const response = await parent.get(`${TTS_ROUTE}&bypassStatic=1`);
  const contentType = response.headers()["content-type"] ?? "";
  if (response.status() === 200) {
    expect(contentType).toMatch(/audio\/wav|audio\/mpeg/u);
    expect(Number(response.headers()["content-length"] ?? "0")).toBeGreaterThan(44);
    expect(response.headers()["x-smartchildcare-tts-source"]).toBe("vivo-runtime");
    return;
  }

  expect(response.status()).toBeGreaterThanOrEqual(500);
  const body = await readJson(response);
  expect(body.ok).toBe(false);
  expect([
    "missing-env",
    "provider-unavailable",
    "auth/signature",
    "endpoint",
    "network",
    "unsupported-format",
    "unknown",
  ]).toContain(body.errorKind);
});

test("TTS route enforces child scope for parent, teacher, and director", async ({}, testInfo) => {
  const parent = await demoContext(testInfo, "u-parent");
  const teacherLi = await demoContext(testInfo, "u-teacher");
  const teacherZhou = await demoContext(testInfo, "u-teacher2");
  const admin = await demoContext(testInfo, "u-admin");

  expect((await parent.get("/api/storybooks/lin-xiaoyu/tts?childId=c-3&page=1")).status()).toBe(403);
  expect((await teacherLi.get(TTS_ROUTE)).status()).toBe(403);
  expect([200, 503]).toContain((await teacherZhou.get(TTS_ROUTE)).status());
  expect([200, 503]).toContain((await admin.get(TTS_ROUTE)).status());
});
