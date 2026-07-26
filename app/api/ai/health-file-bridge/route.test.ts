import assert from "node:assert/strict";
import test from "node:test";

import { buildHealthFileBridgeResponse } from "@/lib/agent/health-file-bridge";
import type {
  HealthFileBridgeRequest,
  HealthFileBridgeResponse,
} from "@/lib/ai/types";
import { verifyAiResultAttestation } from "@/lib/ai/provenance-attestation";
import {
  maybeAugmentRemoteBridgeResponse,
  POST,
} from "./route.ts";

const PAYLOAD: HealthFileBridgeRequest = {
  childId: "child-health-bridge-test",
  sourceRole: "teacher",
  files: [
    {
      fileId: "health-text-test",
      name: "health-note.txt",
      mimeType: "text/plain",
      sizeBytes: 64,
      previewText: "体温 38.1℃，建议明早复查并继续观察。",
    },
  ],
  fileKind: "lab-report",
  requestSource: "route-test",
};

test("remote mock analysis is replaced with an explicit conservative fallback", async () => {
  const remoteMock = buildHealthFileBridgeResponse(PAYLOAD, {
    source: "backend-text-fallback",
    state: "mock",
    configured: false,
    live: false,
    fallback: true,
    mock: true,
    liveReadyButNotVerified: false,
    provider: "outdated-brain-mock",
    model: "outdated-brain-mock-v1",
  });
  const request = new Request(
    "http://localhost:3000/api/ai/health-file-bridge",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(PAYLOAD),
    }
  );
  const remoteResponse = new Response(JSON.stringify(remoteMock), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  const response = await maybeAugmentRemoteBridgeResponse(
    request,
    remoteResponse,
    null,
    null
  );
  const body = (await response.json()) as HealthFileBridgeResponse;

  assert.equal(response.status, 200);
  assert.equal(body.mock, false);
  assert.equal(body.fallback, true);
  assert.equal(body.state, "fallback");
  assert.equal(body.provider, "local-health-rule-parser");
  assert.equal(body.model, "local-health-rule-parser");
  assert.match(body.warnings?.join("\n") ?? "", /远端 Brain 返回了模拟结果/u);
  assert.ok(body.extractedFacts.length > 0);
  assert.ok(body.bridgeWriteback);
});

test("health file bridge route attests an accepted provider result", async () => {
  const originalFetch = globalThis.fetch;
  const previousBrainBaseUrl = process.env.BRAIN_API_BASE_URL;
  const payload: HealthFileBridgeRequest = {
    ...PAYLOAD,
    childId: "c-1",
  };
  const remoteLive = buildHealthFileBridgeResponse(payload, {
    source: "vivo-ocr-provider",
    state: "live",
    configured: true,
    live: true,
    fallback: false,
    mock: false,
    liveReadyButNotVerified: false,
    provider: "vivo",
    model: "qwen-plus",
  });

  process.env.BRAIN_API_BASE_URL = "http://brain.example.com";
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(remoteLive), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

  try {
    const response = await POST(
      new Request("http://localhost:3000/api/ai/health-file-bridge", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-demo-account-id": "u-teacher2",
        },
        body: JSON.stringify(payload),
      })
    );
    const body = (await response.json()) as HealthFileBridgeResponse;

    assert.equal(response.status, 200);
    assert.equal(
      verifyAiResultAttestation(body, {
        userId: "u-teacher2",
        institutionId: "inst-1",
        capability: "health-file-bridge",
        scopeId: "c-1",
      }),
      true
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (previousBrainBaseUrl === undefined) {
      delete process.env.BRAIN_API_BASE_URL;
    } else {
      process.env.BRAIN_API_BASE_URL = previousBrainBaseUrl;
    }
  }
});

test("health material route rejects oversized Content-Length before auth body inspection", async () => {
  const request = new Request(
    "http://localhost:3000/api/ai/health-file-bridge",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(8 * 1024 * 1024),
        "x-demo-account-id": "u-teacher",
      },
      body: "{}",
    }
  );

  const response = await POST(request);

  assert.equal(response.status, 413);
});

test("inline health material MIME must match decoded magic signature", async () => {
  const disguisedHtml = Buffer.from("<html>not a health image</html>", "utf8").toString("base64");
  const request = new Request(
    "http://localhost:3000/api/ai/health-file-bridge",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-demo-account-id": "u-teacher",
      },
      body: JSON.stringify({
        sourceRole: "teacher",
        requestSource: "upload-security-test",
        files: [
          {
            name: "health-note.png",
            mimeType: "image/png",
            sizeBytes: 32,
            previewText: "体温 38.1℃，需要复查。",
            imageBase64: disguisedHtml,
          },
        ],
      } satisfies HealthFileBridgeRequest),
    }
  );

  const response = await POST(request);

  assert.equal(response.status, 415);
});
