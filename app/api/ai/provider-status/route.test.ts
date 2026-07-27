import assert from "node:assert/strict";
import test from "node:test";

import { getUnifiedAiProviderStatus } from "@/lib/server/ai-provider-status";
import { GET } from "./route.ts";

type EnvKey =
  | "AI_ASR_MODEL"
  | "AI_OCR_MODEL"
  | "AI_VISION_MODEL"
  | "BAILIAN_MODEL"
  | "DASHSCOPE_API_KEY"
  | "DATABASE_URL"
  | "NEXT_STORYBOOK_IMAGE_PROVIDER"
  | "NODE_ENV"
  | "STORYBOOK_DASHSCOPE_IMAGE_MODEL"
  | "STORYBOOK_IMAGE_PROVIDER"
  | "VIVO_APP_ID"
  | "VIVO_APP_KEY"
  | "VIVO_BASE_URL"
  | "VIVO_LLM_MODEL";

function withEnv(overrides: Partial<Record<EnvKey, string | undefined>>, fn: () => void | Promise<void>) {
  // 图片提供方选择必须由当前用例决定，不能继承运行测试机器上的生产配置。
  const effectiveOverrides = {
    DATABASE_URL: undefined,
    NEXT_STORYBOOK_IMAGE_PROVIDER: undefined,
    STORYBOOK_IMAGE_PROVIDER: undefined,
    ...overrides,
  };
  const previous: Record<EnvKey, string | undefined> = {
    AI_ASR_MODEL: process.env.AI_ASR_MODEL,
    AI_OCR_MODEL: process.env.AI_OCR_MODEL,
    AI_VISION_MODEL: process.env.AI_VISION_MODEL,
    BAILIAN_MODEL: process.env.BAILIAN_MODEL,
    DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    NEXT_STORYBOOK_IMAGE_PROVIDER:
      process.env.NEXT_STORYBOOK_IMAGE_PROVIDER,
    NODE_ENV: process.env.NODE_ENV,
    STORYBOOK_DASHSCOPE_IMAGE_MODEL:
      process.env.STORYBOOK_DASHSCOPE_IMAGE_MODEL,
    STORYBOOK_IMAGE_PROVIDER: process.env.STORYBOOK_IMAGE_PROVIDER,
    VIVO_APP_ID: process.env.VIVO_APP_ID,
    VIVO_APP_KEY: process.env.VIVO_APP_KEY,
    VIVO_BASE_URL: process.env.VIVO_BASE_URL,
    VIVO_LLM_MODEL: process.env.VIVO_LLM_MODEL,
  };

  for (const [key, value] of Object.entries(effectiveOverrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return Promise.resolve(fn()).finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

test("provider-status exposes unified redacted capability statuses", async () => {
  await withEnv(
    {
      VIVO_APP_ID: "demo-app-id-secret-value",
      VIVO_APP_KEY: "demo-app-key-secret-value",
      VIVO_BASE_URL: "https://api-ai.vivo.com.cn",
      VIVO_LLM_MODEL: "vivo-test-model",
    },
    async () => {
      const response = await GET(
        new Request("http://localhost:3000/api/ai/provider-status", {
          headers: {
            "x-demo-account-id": "u-admin",
          },
        })
      );
      const envelope = (await response.json()) as Record<string, unknown>;
      const data = envelope.data as Record<string, unknown>;
      const capabilities = data.capabilities as Record<string, Record<string, unknown>>;

      assert.equal(response.status, 200);
      assert.equal(envelope.ok, true);
      for (const key of ["llm", "ocr", "asr", "tts", "storybookImage", "storybookAudio"]) {
        assert.ok(data[key], `${key} status should exist`);
        assert.ok(capabilities[key], `${key} capability row should exist`);
        assert.equal(typeof capabilities[key].configured, "boolean");
        assert.equal(typeof capabilities[key].live, "boolean");
        assert.equal(typeof capabilities[key].fallback, "boolean");
        assert.equal(typeof capabilities[key].mock, "boolean");
        assert.equal(typeof capabilities[key].providerName, "string");
      }

      const text = JSON.stringify(envelope);
      assert.doesNotMatch(text, /demo-app-id-secret-value|demo-app-key-secret-value|Bearer|Authorization/i);
      assert.match(text, /VIVO_APP_ID|VIVO_APP_KEY/);
    }
  );
});

test("provider-status reports Bailian as the effective chat and vision provider", async () => {
  await withEnv(
    {
      DASHSCOPE_API_KEY: "dashscope-secret-value",
      BAILIAN_MODEL: "qwen3.7-plus",
      AI_ASR_MODEL: undefined,
      AI_OCR_MODEL: undefined,
      AI_VISION_MODEL: undefined,
      VIVO_APP_ID: undefined,
      VIVO_APP_KEY: undefined,
      VIVO_BASE_URL: undefined,
      VIVO_LLM_MODEL: undefined,
    },
    async () => {
      const response = await GET(
        new Request("http://localhost:3000/api/ai/provider-status", {
          headers: {
            "x-demo-account-id": "u-admin",
          },
        })
      );
      const envelope = (await response.json()) as Record<string, unknown>;
      const data = envelope.data as Record<string, unknown>;
      const chat = data.chat as Record<string, unknown>;
      const vision = data.vision as Record<string, unknown>;
      const ocr = data.ocr as Record<string, unknown>;
      const asr = data.asr as Record<string, unknown>;

      assert.equal(response.status, 200);
      assert.equal(chat.providerName, "dashscope");
      assert.equal(chat.configured, true);
      assert.equal(chat.status, "ready");
      assert.equal(chat.model, "qwen3.7-plus");
      assert.equal(vision.providerName, "dashscope");
      assert.equal(vision.configured, true);
      assert.equal(vision.model, "qwen3.7-plus");
      assert.equal(ocr.providerName, "dashscope");
      assert.equal(ocr.configured, true);
      assert.equal(ocr.model, "qwen3.5-ocr");
      assert.equal(asr.providerName, "dashscope");
      assert.equal(asr.configured, true);
      assert.equal(asr.model, "qwen3-asr-flash");
      assert.doesNotMatch(JSON.stringify(envelope), /dashscope-secret-value/);
    }
  );
});

test("provider-status reports selected DashScope Qwen-Image for storybooks", async () => {
  await withEnv(
    {
      DASHSCOPE_API_KEY: "dashscope-secret-value",
      DATABASE_URL: "mysql://redacted:test@db.example.com:3306/app",
      NEXT_STORYBOOK_IMAGE_PROVIDER: "dashscope",
      STORYBOOK_DASHSCOPE_IMAGE_MODEL: undefined,
      STORYBOOK_IMAGE_PROVIDER: "mock",
      VIVO_APP_ID: "vivo-app-id",
      VIVO_APP_KEY: "vivo-app-key",
      VIVO_BASE_URL: "https://api-ai.vivo.com.cn",
    },
    async () => {
      const response = await GET(
        new Request("http://localhost:3000/api/ai/provider-status", {
          headers: {
            "x-demo-account-id": "u-admin",
          },
        })
      );
      const envelope = (await response.json()) as Record<string, unknown>;
      const data = envelope.data as Record<string, unknown>;
      const storybookImage = data.storybookImage as Record<string, unknown>;

      assert.equal(response.status, 200);
      assert.equal(
        storybookImage.providerName,
        "dashscope-qwen-image"
      );
      assert.equal(storybookImage.configured, true);
      assert.equal(storybookImage.model, "qwen-image-plus");
      assert.deepEqual(storybookImage.requiredEnv, [
        "NEXT_STORYBOOK_IMAGE_PROVIDER",
        "DASHSCOPE_API_KEY",
        "DATABASE_URL",
      ]);
      assert.doesNotMatch(
        JSON.stringify(envelope),
        /dashscope-secret-value|vivo-app-key/u
      );
    }
  );
});

test("production provider status fails closed to DashScope when the selector is missing", async () => {
  await withEnv(
    {
      DASHSCOPE_API_KEY: "dashscope-secret-value",
      DATABASE_URL: "mysql://redacted:test@db.example.com:3306/app",
      NEXT_STORYBOOK_IMAGE_PROVIDER: undefined,
      NODE_ENV: "production",
      VIVO_APP_ID: "vivo-app-id",
      VIVO_APP_KEY: "vivo-app-key",
      VIVO_BASE_URL: "https://api-ai.vivo.com.cn",
    },
    async () => {
      const status = getUnifiedAiProviderStatus();
      const storybookImage = status.storybookImage;
      assert.ok(storybookImage);

      assert.equal(
        storybookImage.providerName,
        "storybook-dynamic-fallback"
      );
      assert.equal(storybookImage.configured, false);
      assert.match(
        storybookImage.reason ?? "",
        /dashscope-qwen-image.*NEXT_STORYBOOK_IMAGE_PROVIDER/u
      );
    }
  );
});
