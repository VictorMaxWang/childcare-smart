import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const productPort =
  process.env.PRODUCT_PORT?.trim() ||
  process.env.FEATURE_PORT?.trim() ||
  process.env.BUGBASH_PORT?.trim() ||
  "3330";
const baseURL = (
  process.env.PRODUCT_BASE_URL ??
  process.env.FEATURE_BASE_URL ??
  process.env.BUGBASH_BASE_URL ??
  `http://127.0.0.1:${productPort}`
).replace(/\/$/, "");
const hasExplicitBaseURL = Boolean(
  process.env.PRODUCT_BASE_URL || process.env.FEATURE_BASE_URL || process.env.BUGBASH_BASE_URL
);
const skipWebServer =
  process.env.PRODUCT_SKIP_WEBSERVER === "1" ||
  process.env.FEATURE_SKIP_WEBSERVER === "1" ||
  process.env.BUGBASH_SKIP_WEBSERVER === "1";
const devLockExists = existsSync(".next/dev/lock");
const useExistingServer = hasExplicitBaseURL || skipWebServer || devLockExists;

export default defineConfig({
  testDir: ".",
  timeout: 12 * 60 * 1000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  outputDir: "artifacts/product-completion/E11/playwright-output",
  reporter: [
    ["line"],
    [
      "html",
      {
        outputFolder: "artifacts/product-completion/E11/playwright-report",
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
        command: `node ./node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${productPort}`,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120 * 1000,
      },
});
