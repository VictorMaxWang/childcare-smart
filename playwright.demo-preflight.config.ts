import { defineConfig, devices } from "@playwright/test";

const preflightPort =
  process.env.DEMO_PREFLIGHT_PORT?.trim() ||
  process.env.PRODUCT_PORT?.trim() ||
  process.env.FEATURE_PORT?.trim() ||
  "3330";
const baseURL = (
  process.env.DEMO_PREFLIGHT_BASE_URL ??
  process.env.PRODUCT_BASE_URL ??
  process.env.FEATURE_BASE_URL ??
  `http://127.0.0.1:${preflightPort}`
).replace(/\/$/, "");
const useExistingServer = Boolean(
  process.env.DEMO_PREFLIGHT_BASE_URL ||
    process.env.PRODUCT_BASE_URL ||
    process.env.FEATURE_BASE_URL ||
    process.env.DEMO_PREFLIGHT_SKIP_WEBSERVER === "1" ||
    process.env.PRODUCT_SKIP_WEBSERVER === "1" ||
    process.env.FEATURE_SKIP_WEBSERVER === "1"
);

export default defineConfig({
  testDir: ".",
  timeout: 12 * 60 * 1000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  outputDir: "artifacts/demo-preflight/playwright-output",
  reporter: [
    ["line"],
    [
      "html",
      {
        outputFolder: "artifacts/demo-preflight/playwright-report",
        open: "never",
      },
    ],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    locale: "zh-CN",
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
  webServer: useExistingServer
    ? undefined
    : {
        command: `node ./node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${preflightPort}`,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120 * 1000,
      },
});
