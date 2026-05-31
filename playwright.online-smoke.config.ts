import { defineConfig, devices } from "@playwright/test";

const onlineSmokeBaseUrl = process.env.ONLINE_SMOKE_BASE_URL;
if (!onlineSmokeBaseUrl) {
  throw new Error("ONLINE_SMOKE_BASE_URL is required. Use npm run online:smoke with ONLINE_SMOKE_ALLOW_WRITES=1.");
}
const baseURL = onlineSmokeBaseUrl.replace(/\/$/, "");

export default defineConfig({
  testDir: ".",
  timeout: 15 * 60 * 1000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  outputDir: "artifacts/online-smoke/playwright-output",
  reporter: [
    ["line"],
    [
      "html",
      {
        outputFolder: "artifacts/online-smoke/playwright-report",
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
});
