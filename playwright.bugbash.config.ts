import { defineConfig, devices } from "@playwright/test";

const baseURL = (process.env.BUGBASH_BASE_URL ?? "http://127.0.0.1:3330").replace(/\/$/, "");
const useExistingServer = Boolean(process.env.BUGBASH_BASE_URL);

export default defineConfig({
  testDir: ".",
  timeout: 12 * 60 * 1000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  outputDir: "artifacts/bug-bash/B26/playwright-output",
  reporter: [
    ["line"],
    [
      "html",
      {
        outputFolder: "artifacts/bug-bash/B26/playwright-report",
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
        command: "npm run dev -- --hostname 127.0.0.1 --port 3330",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120 * 1000,
      },
});
