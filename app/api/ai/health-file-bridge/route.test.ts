import assert from "node:assert/strict";
import test from "node:test";

import { buildHealthFileBridgeResponse } from "@/lib/agent/health-file-bridge";
import type {
  HealthFileBridgeRequest,
  HealthFileBridgeResponse,
} from "@/lib/ai/types";
import { maybeAugmentRemoteBridgeResponse } from "./route.ts";

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
