import assert from "node:assert/strict";
import test from "node:test";

import {
  DashscopeChatProviderError,
  requestDashscopeChat,
} from "./dashscope-chat-provider.ts";

async function withDashscopeEnv(
  overrides: Record<string, string | undefined>,
  fn: () => void | Promise<void>
) {
  const keys = [
    "DASHSCOPE_API_KEY",
    "BAILIAN_ENDPOINT",
    "BAILIAN_MODEL",
    "BAILIAN_TIMEOUT_MS",
  ] as const;
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]])
  );

  for (const key of keys) {
    const value = overrides[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await fn();
  } finally {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("dashscope chat returns structured message text without exposing credentials", async () => {
  const originalFetch = globalThis.fetch;
  let capturedAuthorization = "";
  let capturedBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (_input, init) => {
    capturedAuthorization = new Headers(init?.headers).get("authorization") ?? "";
    capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        id: "chat-request-1",
        model: "qwen-test",
        choices: [
          {
            message: {
              content: JSON.stringify({ title: "A generated story" }),
            },
          },
        ],
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-request-id": "request-header-1",
        },
      }
    );
  }) as typeof fetch;

  try {
    await withDashscopeEnv(
      {
        DASHSCOPE_API_KEY: "test-secret",
        BAILIAN_ENDPOINT: "https://dashscope.example.test/chat",
        BAILIAN_MODEL: "qwen-test",
        BAILIAN_TIMEOUT_MS: "5000",
      },
      async () => {
        const result = await requestDashscopeChat({
          messages: [
            { role: "system", content: "Return JSON." },
            { role: "user", content: "Generate a story." },
          ],
          maxTokens: 900,
        });

        assert.equal(result.text, '{"title":"A generated story"}');
        assert.equal(result.model, "qwen-test");
        assert.equal(result.requestId, "request-header-1");
        assert.equal(capturedAuthorization, "Bearer test-secret");
        assert.equal(capturedBody?.model, "qwen-test");
        assert.equal(capturedBody?.max_tokens, 900);
        assert.deepEqual(capturedBody?.response_format, { type: "json_object" });
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("dashscope chat keeps provider response bodies out of typed errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response('{"error":"private upstream detail"}', {
      status: 429,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

  try {
    await withDashscopeEnv(
      {
        DASHSCOPE_API_KEY: "test-secret",
        BAILIAN_ENDPOINT: "https://dashscope.example.test/chat",
        BAILIAN_MODEL: "qwen-test",
        BAILIAN_TIMEOUT_MS: "5000",
      },
      async () => {
        await assert.rejects(
          requestDashscopeChat({
            messages: [{ role: "user", content: "Generate a story." }],
          }),
          (error: unknown) => {
            assert.ok(error instanceof DashscopeChatProviderError);
            assert.equal(error.failureKind, "rate-limited");
            assert.equal(error.httpStatus, 429);
            assert.doesNotMatch(error.message, /private upstream detail/u);
            return true;
          }
        );
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("dashscope chat deadline remains active while reading the response body", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    const signal = init?.signal;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const fallbackTimer = setTimeout(
          () => controller.error(new Error("dashscope body was not aborted")),
          1_000
        );
        const abort = () => {
          clearTimeout(fallbackTimer);
          controller.error(new DOMException("Aborted", "AbortError"));
        };
        if (signal?.aborted) {
          abort();
          return;
        }
        signal?.addEventListener("abort", abort, { once: true });
      },
    });
    return new Response(body, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await withDashscopeEnv(
      {
        DASHSCOPE_API_KEY: "test-secret",
        BAILIAN_ENDPOINT: "https://dashscope.example.test/chat",
        BAILIAN_MODEL: "qwen-test",
        BAILIAN_TIMEOUT_MS: "20",
      },
      async () => {
        await assert.rejects(
          requestDashscopeChat({
            messages: [{ role: "user", content: "Generate a story." }],
          }),
          (error: unknown) =>
            error instanceof DashscopeChatProviderError &&
            error.failureKind === "request-timeout"
        );
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("dashscope chat does not dispatch after caller cancellation or an exhausted deadline", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    throw new Error("fetch should not be called");
  }) as typeof fetch;

  try {
    await withDashscopeEnv(
      {
        DASHSCOPE_API_KEY: "test-secret",
        BAILIAN_ENDPOINT: "https://dashscope.example.test/chat",
        BAILIAN_MODEL: "qwen-test",
        BAILIAN_TIMEOUT_MS: "5000",
      },
      async () => {
        const controller = new AbortController();
        controller.abort();
        await assert.rejects(
          requestDashscopeChat({
            messages: [{ role: "user", content: "Generate a story." }],
            signal: controller.signal,
          }),
          (error: unknown) =>
            error instanceof DashscopeChatProviderError &&
            error.failureKind === "request-cancelled"
        );
        await assert.rejects(
          requestDashscopeChat({
            messages: [{ role: "user", content: "Generate a story." }],
            deadlineAtMs: Date.now() - 1,
          }),
          (error: unknown) =>
            error instanceof DashscopeChatProviderError &&
            error.failureKind === "request-timeout"
        );
        assert.equal(fetchCount, 0);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
