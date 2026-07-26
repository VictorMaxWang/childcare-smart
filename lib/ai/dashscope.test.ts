import assert from "node:assert/strict";
import test from "node:test";

import * as dashscope from "./dashscope.ts";

type BailianEnvKey =
  | "AI_ASR_MODEL"
  | "AI_MODEL"
  | "AI_OCR_MODEL"
  | "AI_VISION_MODEL"
  | "BAILIAN_ENDPOINT"
  | "BAILIAN_MODEL"
  | "BAILIAN_TIMEOUT_MS"
  | "DASHSCOPE_API_KEY";

async function withEnv(
  overrides: Partial<Record<BailianEnvKey, string | undefined>>,
  fn: () => void | Promise<void>
) {
  const previous: Partial<Record<BailianEnvKey, string | undefined>> = {};

  for (const [key, value] of Object.entries(overrides) as Array<
    [BailianEnvKey, string | undefined]
  >) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await fn();
  } finally {
    for (const [key, value] of Object.entries(previous) as Array<
      [BailianEnvKey, string | undefined]
    >) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function getRuntimeConfig() {
  const internals = (
    dashscope as typeof dashscope & {
      dashscopeInternals?: {
        resolveRuntimeConfig?: () => {
          endpoint: string;
          model: string;
          timeoutMs: number;
        };
      };
    }
  ).dashscopeInternals;

  assert.equal(typeof internals?.resolveRuntimeConfig, "function");
  return internals!.resolveRuntimeConfig!();
}

test("Bailian runtime config prefers canonical env names and uses a supported default model", async () => {
  await withEnv(
    {
      AI_MODEL: "legacy-model",
      BAILIAN_ENDPOINT: " https://bailian.example.com/v1/chat/completions ",
      BAILIAN_MODEL: " qwen-plus ",
      BAILIAN_TIMEOUT_MS: "25000",
    },
    () => {
      assert.deepEqual(getRuntimeConfig(), {
        endpoint: "https://bailian.example.com/v1/chat/completions",
        model: "qwen-plus",
        timeoutMs: 25000,
      });
    }
  );

  await withEnv(
    {
      AI_MODEL: "legacy-model",
      BAILIAN_ENDPOINT: undefined,
      BAILIAN_MODEL: undefined,
      BAILIAN_TIMEOUT_MS: undefined,
    },
    () => {
      assert.equal(getRuntimeConfig().model, "legacy-model");
    }
  );

  await withEnv(
    {
      AI_MODEL: undefined,
      BAILIAN_ENDPOINT: undefined,
      BAILIAN_MODEL: undefined,
      BAILIAN_TIMEOUT_MS: undefined,
    },
    () => {
      const config = getRuntimeConfig();
      assert.equal(config.model, "qwen3.7-plus");
      assert.notEqual(config.model, "qwen-turbo");
      assert.equal(config.timeoutMs, 60000);
    }
  );
});

test("Bailian timeout rejects unusably small values and caps oversized values", async () => {
  await withEnv({ BAILIAN_TIMEOUT_MS: "0.4" }, () => {
    assert.equal(getRuntimeConfig().timeoutMs, 250);
  });

  await withEnv({ BAILIAN_TIMEOUT_MS: "999999" }, () => {
    assert.equal(getRuntimeConfig().timeoutMs, 120000);
  });
});

test("Bailian request honors configured endpoint and model without exposing the API key", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; authorization: string | null; body: Record<string, unknown> }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      authorization: new Headers(init?.headers).get("authorization"),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    });

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                riskLevel: "low",
                summary: "Stable week.",
                highlights: ["Hydration improved."],
                concerns: ["Continue observation."],
                actions: ["Review tomorrow."],
                disclaimer: "Not medical advice.",
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    await withEnv(
      {
        AI_MODEL: "legacy-model",
        BAILIAN_ENDPOINT: "https://bailian.example.com/v1/chat/completions",
        BAILIAN_MODEL: "qwen-plus",
        BAILIAN_TIMEOUT_MS: "25000",
        DASHSCOPE_API_KEY: "test-secret-that-must-not-appear-in-results",
      },
      async () => {
        const result = await dashscope.requestDashscopeSuggestion({
          child: { id: "child-1", name: "Ava" },
          summary: {
            health: { abnormalCount: 0, handMouthEyeAbnormalCount: 0, moodKeywords: [] },
            meals: {
              recordCount: 1,
              hydrationAvg: 300,
              balancedRate: 80,
              monotonyDays: 0,
              allergyRiskCount: 0,
            },
            growth: {
              recordCount: 1,
              attentionCount: 0,
              pendingReviewCount: 0,
              topCategories: [],
            },
            feedback: { count: 0, statusCounts: {}, keywords: [] },
          },
          recentDetails: { health: [], meals: [], growth: [], feedback: [] },
          ruleFallback: [],
        });

        assert.ok(result);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, "https://bailian.example.com/v1/chat/completions");
        assert.equal(calls[0].body.model, "qwen-plus");
        assert.equal(calls[0].body.enable_thinking, false);
        assert.match(calls[0].authorization ?? "", /^Bearer /);
        assert.doesNotMatch(JSON.stringify(result), /test-secret-that-must-not-appear-in-results/);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Bailian vision uses the current supported model and disables thinking for JSON output", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<Record<string, unknown>> = [];

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                foods: [{ name: "西兰花", category: "蔬果", amount: "1 份" }],
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    await withEnv(
      {
        AI_VISION_MODEL: undefined,
        BAILIAN_MODEL: undefined,
        AI_MODEL: undefined,
        DASHSCOPE_API_KEY: "test-vision-key",
      },
      async () => {
        const result = await dashscope.requestDashscopeMealVision(
          "data:image/jpeg;base64,dGVzdA=="
        );

        assert.deepEqual(result, [{ name: "西兰花", category: "蔬果", amount: "1 份" }]);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].model, "qwen3.7-plus");
        assert.equal(calls[0].enable_thinking, false);
        assert.deepEqual(calls[0].response_format, { type: "json_object" });
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Bailian health OCR transcribes image text without exposing credentials", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{
    authorization: string | null;
    body: Record<string, unknown>;
  }> = [];

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      authorization: new Headers(init?.headers).get("authorization"),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    });
    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: "体温 38.1℃\n复查日期 2026-07-26",
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    await withEnv(
      {
        AI_OCR_MODEL: "qwen3.5-ocr",
        AI_VISION_MODEL: "qwen3.7-plus",
        DASHSCOPE_API_KEY: "health-ocr-secret",
      },
      async () => {
        const result = await dashscope.requestDashscopeHealthOcr(
          "data:image/jpeg;base64,dGVzdA=="
        );

        assert.equal(result?.extractedText, "体温 38.1℃\n复查日期 2026-07-26");
        assert.equal(result?.confidence, null);
        assert.equal(result?.model, "qwen3.5-ocr");
        assert.deepEqual(result?.warnings, []);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].body.model, "qwen3.5-ocr");
        assert.equal(calls[0].body.enable_thinking, undefined);
        assert.equal(calls[0].body.response_format, undefined);
        assert.match(calls[0].authorization ?? "", /^Bearer /);
        assert.doesNotMatch(JSON.stringify(result), /health-ocr-secret/);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Bailian health OCR fails closed when the provider truncates its response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "length",
            message: { content: "未完整输出的健康材料" },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    )) as typeof fetch;

  try {
    await withEnv(
      {
        AI_OCR_MODEL: "qwen3.5-ocr",
        DASHSCOPE_API_KEY: "health-ocr-secret",
      },
      async () => {
        const result = await dashscope.requestDashscopeHealthOcr(
          "data:image/jpeg;base64,dGVzdA=="
        );
        assert.equal(result, null);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Bailian ASR sends a private base64 audio payload through the official protocol", async () => {
  const requestAsr = (
    dashscope as typeof dashscope & {
      requestDashscopeAsr?: (input: {
        audioBytes: Buffer;
        mimeType: string;
      }) => Promise<{
        transcript: string;
        model: string;
        language?: string;
      } | null>;
    }
  ).requestDashscopeAsr;
  assert.equal(typeof requestAsr, "function");
  if (!requestAsr) return;

  const originalFetch = globalThis.fetch;
  const calls: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: "小明今天喝水二百毫升。",
              annotations: [
                { type: "audio_info", language: "zh", emotion: "neutral" },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    await withEnv(
      {
        AI_ASR_MODEL: "qwen3-asr-flash",
        DASHSCOPE_API_KEY: "asr-secret",
      },
      async () => {
        const result = await requestAsr({
          audioBytes: Buffer.from("test-audio"),
          mimeType: "audio/wav",
        });

        assert.equal(result?.transcript, "小明今天喝水二百毫升。");
        assert.equal(result?.model, "qwen3-asr-flash");
        assert.equal(result?.language, "zh");
        assert.equal(calls.length, 1);
        assert.equal(calls[0].model, "qwen3-asr-flash");
        assert.deepEqual(calls[0].asr_options, {
          language: "zh",
          enable_itn: true,
        });
        const bodyText = JSON.stringify(calls[0]);
        assert.match(bodyText, /data:audio\/wav;base64,/);
        assert.doesNotMatch(JSON.stringify(result), /asr-secret|test-audio/);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
