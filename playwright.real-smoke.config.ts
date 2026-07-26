import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.REAL_SMOKE_BASE_URL?.trim().replace(/\/$/, "");
if (!baseURL) {
  throw new Error("REAL_SMOKE_BASE_URL is required.");
}

export default defineConfig({
  testDir: ".",
  timeout: 15 * 60 * 1000,
  expect: {
    timeout: 20_000,
  },
  fullyParallel: false,
  workers: 1,
  outputDir: "artifacts/real-smoke/playwright-output",
  reporter: "line",
  use: {
    baseURL,
    locale: "zh-CN",
    screenshot: "only-on-failure",
    trace: "off",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        browserName: "chromium",
      },
    },
  ],
});
