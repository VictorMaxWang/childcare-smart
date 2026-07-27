import assert from "node:assert/strict";
import test from "node:test";

import { vivoJsonRequest } from "./vivo-client.ts";
import { VivoProviderError } from "./vivo-errors.ts";

function responseWhoseBodyWaitsForAbort(signal: AbortSignal | null | undefined) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const abort = () =>
        controller.error(new DOMException("Aborted", "AbortError"));
      if (signal?.aborted) {
        abort();
        return;
      }
      signal?.addEventListener("abort", abort, { once: true });
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("vivo JSON response-body timeout remains a typed provider error", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) =>
    responseWhoseBodyWaitsForAbort(init?.signal)) as typeof fetch;

  try {
    await assert.rejects(
      vivoJsonRequest({
        capability: "ocr",
        baseUrl: "https://vivo.example.test",
        path: "/ocr",
        timeoutMs: 20,
      }),
      (error: unknown) =>
        error instanceof VivoProviderError &&
        error.failureKind === "request-timeout"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("vivo JSON response-body cancellation remains distinguishable from timeout", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  globalThis.fetch = (async (_input, init) =>
    responseWhoseBodyWaitsForAbort(init?.signal)) as typeof fetch;

  try {
    const pending = vivoJsonRequest({
      capability: "asr",
      baseUrl: "https://vivo.example.test",
      path: "/asr",
      timeoutMs: 5_000,
      signal: controller.signal,
    });
    controller.abort();
    await assert.rejects(
      pending,
      (error: unknown) =>
        error instanceof VivoProviderError &&
        error.failureKind === "request-cancelled"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("vivo HTTP authentication failures are not reported as missing environment", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "invalid credential" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

  try {
    await assert.rejects(
      vivoJsonRequest({
        capability: "chat",
        baseUrl: "https://vivo.example.test",
        path: "/chat",
        timeoutMs: 5_000,
      }),
      (error: unknown) =>
        error instanceof VivoProviderError &&
        error.status === "provider-unavailable" &&
        error.httpStatus === 401 &&
        error.failureKind === "authentication"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("vivo transport failures remain distinguishable from explicit provider responses", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new TypeError("socket reset");
  }) as typeof fetch;

  try {
    await assert.rejects(
      vivoJsonRequest({
        capability: "chat",
        baseUrl: "https://vivo.example.test",
        path: "/chat",
        timeoutMs: 5_000,
      }),
      (error: unknown) =>
        error instanceof VivoProviderError &&
        error.status === "provider-unavailable" &&
        error.httpStatus === undefined &&
        error.failureKind === "transport"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
