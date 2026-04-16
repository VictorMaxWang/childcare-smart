import assert from "node:assert/strict";
import test from "node:test";

import {
  brainClientInternals,
  forwardBrainRequest,
  getBrainBaseUrl,
} from "./brain-client.ts";

function withEnv(
  overrides: Partial<
    Record<
      "APP_PORT" | "BRAIN_API_BASE_URL" | "NEXT_PUBLIC_BACKEND_BASE_URL" | "NODE_ENV",
      string | undefined
    >
  >,
  fn: () => void | Promise<void>
) {
  const previous = {
    APP_PORT: process.env.APP_PORT,
    BRAIN_API_BASE_URL: process.env.BRAIN_API_BASE_URL,
    NEXT_PUBLIC_BACKEND_BASE_URL: process.env.NEXT_PUBLIC_BACKEND_BASE_URL,
    NODE_ENV: process.env.NODE_ENV,
  };

  for (const [key, value] of Object.entries(overrides)) {
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

function buildStorybookRequest() {
  return new Request("http://localhost:3000/api/ai/parent-storybook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ok: true }),
  });
}

test("brain client normalizes configured base URLs that include /api/v1", async () => {
  await withEnv(
    {
      BRAIN_API_BASE_URL: "http://brain.example.com/api/v1/",
      NEXT_PUBLIC_BACKEND_BASE_URL: undefined,
      NODE_ENV: "development",
    },
    () => {
      const details = brainClientInternals.resolveBrainBaseUrlDetails();

      assert.equal(getBrainBaseUrl(), "http://brain.example.com");
      assert.equal(details.rawBaseUrl, "http://brain.example.com/api/v1");
      assert.equal(details.normalizedBaseUrl, "http://brain.example.com");
      assert.equal(details.hadApiV1Suffix, true);
      assert.equal(details.implicitDefault, false);
      assert.deepEqual(details.localDevCandidateBaseUrls, []);
    }
  );
});

test("brain client retries a 404 once with a normalized base URL", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);

    if (calls.length === 1) {
      return new Response("not found", { status: 404 });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await withEnv(
      {
        BRAIN_API_BASE_URL: "http://brain.example.com/api/v1",
        NEXT_PUBLIC_BACKEND_BASE_URL: undefined,
        NODE_ENV: "development",
      },
      async () => {
        const result = await forwardBrainRequest(
          buildStorybookRequest(),
          "/api/v1/agents/parent/storybook"
        );

        assert.equal(calls[0], "http://brain.example.com/api/v1/api/v1/agents/parent/storybook");
        assert.equal(calls[1], "http://brain.example.com/api/v1/agents/parent/storybook");
        assert.equal(result.response?.status, 200);
        assert.equal(result.fallbackReason, null);
        assert.equal(result.statusCode, null);
        assert.equal(result.retryStrategy, "normalized-base-retry");
        assert.equal(result.upstreamHost, "brain.example.com");
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("brain client retries local dev candidates before failing", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);

    if (url.startsWith("http://127.0.0.1:8010")) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    throw new TypeError("fetch failed");
  }) as typeof fetch;

  try {
    await withEnv(
      {
        APP_PORT: "8000",
        BRAIN_API_BASE_URL: undefined,
        NEXT_PUBLIC_BACKEND_BASE_URL: undefined,
        NODE_ENV: "development",
      },
      async () => {
        const details = brainClientInternals.resolveBrainBaseUrlDetails();
        const result = await forwardBrainRequest(
          buildStorybookRequest(),
          "/api/v1/agents/parent/storybook"
        );

        assert.deepEqual(details.localDevCandidateBaseUrls, [
          "http://127.0.0.1:8000",
          "http://127.0.0.1:8010",
        ]);
        assert.deepEqual(calls, [
          "http://127.0.0.1:8000/api/v1/agents/parent/storybook",
          "http://127.0.0.1:8010/api/v1/agents/parent/storybook",
        ]);
        assert.equal(result.response?.status, 200);
        assert.equal(result.fallbackReason, null);
        assert.equal(result.upstreamHost, "127.0.0.1:8010");
        assert.equal(result.retryStrategy, "none");
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("brain client returns fallback diagnostics after normalized retry still fails", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    return new Response("missing", { status: 404 });
  }) as typeof fetch;

  try {
    await withEnv(
      {
        BRAIN_API_BASE_URL: "http://brain.example.com/api/v1/",
        NEXT_PUBLIC_BACKEND_BASE_URL: undefined,
        NODE_ENV: "development",
      },
      async () => {
        const result = await forwardBrainRequest(
          buildStorybookRequest(),
          "/api/v1/agents/parent/storybook"
        );

        assert.equal(calls.length, 2);
        assert.equal(result.response, null);
        assert.equal(result.fallbackReason, "brain-status-404");
        assert.equal(result.statusCode, 404);
        assert.equal(result.retryStrategy, "normalized-base-retry");
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("brain client fails closed in production when BRAIN_API_BASE_URL is missing", async () => {
  await withEnv(
    {
      APP_PORT: "8010",
      BRAIN_API_BASE_URL: undefined,
      NEXT_PUBLIC_BACKEND_BASE_URL: undefined,
      NODE_ENV: "production",
    },
    async () => {
      const details = brainClientInternals.resolveBrainBaseUrlDetails();
      const result = await forwardBrainRequest(
        buildStorybookRequest(),
        "/api/v1/agents/parent/storybook"
      );

      assert.equal(getBrainBaseUrl(), null);
      assert.equal(details.rawBaseUrl, null);
      assert.equal(details.implicitDefault, false);
      assert.deepEqual(details.localDevCandidateBaseUrls, []);
      assert.equal(result.response, null);
      assert.equal(result.fallbackReason, "brain-base-url-missing");
      assert.equal(result.upstreamHost, null);
      assert.equal(result.retryStrategy, "none");
    }
  );
});

test("brain client surfaces timeout override and elapsed timing on abort", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;

  globalThis.setTimeout = (((callback: TimerHandler) =>
    originalSetTimeout(callback, 0)) as unknown) as typeof globalThis.setTimeout;
  globalThis.fetch = (((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error("missing abort signal"));
        return;
      }
      signal.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      });
    })) as unknown) as typeof fetch;

  try {
    await withEnv(
      {
        BRAIN_API_BASE_URL: "http://brain.example.com",
        NEXT_PUBLIC_BACKEND_BASE_URL: undefined,
        NODE_ENV: "development",
      },
      async () => {
        const result = await forwardBrainRequest(
          buildStorybookRequest(),
          "/api/v1/agents/parent/storybook",
          { timeoutMs: 25 }
        );

        assert.equal(result.response, null);
        assert.equal(result.fallbackReason, "brain-proxy-timeout");
        assert.equal(result.timeoutMs, 25);
        assert.equal(typeof result.elapsedMs, "number");
        assert.ok((result.elapsedMs ?? -1) >= 0);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});
