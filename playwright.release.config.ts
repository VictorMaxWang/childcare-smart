import { defineConfig } from "@playwright/test";

import productConfig from "./playwright.product.config";

const releasePort = process.env.RELEASE_BROWSER_PORT?.trim() || "3341";
// Chromium 与 Playwright APIRequestContext 都把 localhost 视为安全本地域，
// 可在 HTTP 构建验收中共享 production 的 Secure 会话 Cookie。
const releaseBaseURL = `http://localhost:${releasePort}`;

/**
 * 发布门禁只验证已经构建完成的产物，避免 dev 路由缓存漂移掩盖真实 404。
 * 独占端口并禁止复用现有服务，确保测试命中的就是当前仓库当前构建。
 */
export default defineConfig(productConfig, {
  timeout: 3 * 60 * 1_000,
  use: {
    ...productConfig.use,
    baseURL: releaseBaseURL,
  },
  webServer: {
    command: `node ./node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${releasePort}`,
    env: {
      SMARTCHILDCARE_LOCAL_RELEASE_BROWSER: "1",
    },
    url: releaseBaseURL,
    reuseExistingServer: false,
    timeout: 120 * 1_000,
  },
});
