import assert from "node:assert/strict";
import test from "node:test";

import { verifyAiResultAttestation } from "@/lib/ai/provenance-attestation";
import type { SessionUser } from "@/lib/auth/accounts";
import type { BrainForwardResult } from "@/lib/server/brain-client";
import {
  handleVisionMealRequest,
  type VisionMealRouteDependencies,
} from "./route.ts";

const NORMAL_TEACHER: SessionUser = {
  id: "normal-teacher-vision",
  username: "13900000001",
  name: "识别测试教师",
  role: "教师",
  avatar: "",
  institutionId: "inst-vision-test",
  classId: "class-vision-test",
  className: "视觉测试班",
  accountKind: "normal",
};

const DEMO_TEACHER: SessionUser = {
  ...NORMAL_TEACHER,
  id: "demo-teacher-vision",
  accountKind: "demo",
};

const NO_BRAIN_RESPONSE: BrainForwardResult = {
  response: null,
  targetPath: "/api/v1/multimodal/vision-meal",
  upstreamHost: null,
  fallbackReason: "brain-unavailable",
  statusCode: null,
  retryStrategy: "none",
  elapsedMs: null,
  timeoutMs: 20_000,
};

function buildDependencies(
  user: SessionUser,
  requestVision: VisionMealRouteDependencies["requestVision"]
): VisionMealRouteDependencies {
  return {
    async authorize() {
      return { session: { user, source: "cookie" } };
    },
    async forwardBrain() {
      return NO_BRAIN_RESPONSE;
    },
    async acceptRemoteResponse() {
      return true;
    },
    requestVision,
  };
}

function buildRequest(
  imageDataUrl = "data:image/png;base64,iVBORw0KGgo=",
  declaredContentLength?: number,
  childId = "child-vision-test"
) {
  const request = new Request("http://localhost:3000/api/ai/vision-meal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ imageDataUrl, childId }),
  });
  if (declaredContentLength !== undefined) {
    request.headers.set("content-length", String(declaredContentLength));
  }
  return request;
}

test("normal account receives an explicit unavailable response instead of fabricated foods", async () => {
  const response = await handleVisionMealRequest(
    buildRequest(),
    buildDependencies(NORMAL_TEACHER, async () => null)
  );
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 503);
  assert.equal(body.source, "unavailable");
  assert.equal(body.code, "provider_unavailable");
  assert.deepEqual(body.foods, []);
  assert.doesNotMatch(JSON.stringify(body), /米饭|青菜|鸡肉/u);
});

test("demo account keeps an explicit rule fallback when the provider is unavailable", async () => {
  const response = await handleVisionMealRequest(
    buildRequest(),
    buildDependencies(DEMO_TEACHER, async () => null)
  );
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.source, "fallback");
  assert.equal(body.model, "vision-rule-fallback");
  assert.deepEqual(
    (body.foods as Array<Record<string, unknown>>).map((item) => item.name),
    ["米饭", "青菜", "鸡肉"]
  );
});

test("provider foods are returned as real AI results", async () => {
  const response = await handleVisionMealRequest(
    buildRequest(),
    buildDependencies(NORMAL_TEACHER, async () => [
      { name: "番茄炒蛋", category: "蛋白", amount: "80g" },
    ])
  );
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.source, "ai");
  assert.equal(body.provider, "dashscope");
  assert.equal(body.live, true);
  assert.equal(body.fallback, false);
  assert.equal(body.realProvider, true);
  assert.equal(
    verifyAiResultAttestation(body, {
      userId: NORMAL_TEACHER.id,
      institutionId: NORMAL_TEACHER.institutionId,
      capability: "vision-meal",
      scopeId: "child-vision-test",
    }),
    true
  );
  const foods = body.foods as Array<Record<string, unknown>>;
  assert.equal(foods.length, 1);
  assert.equal(foods[0].name, "番茄炒蛋");
  assert.equal(foods[0].model, body.model);
  assert.equal(
    verifyAiResultAttestation(foods[0], {
      userId: NORMAL_TEACHER.id,
      institutionId: NORMAL_TEACHER.institutionId,
      capability: "vision-meal",
      scopeId: "child-vision-test",
    }),
    true
  );
});

test("bulk provider foods are attested to the account and institution with null scope", async () => {
  const request = new Request(
    "http://localhost:3000/api/ai/vision-meal",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imageDataUrl: "data:image/png;base64,iVBORw0KGgo=",
      }),
    }
  );
  const response = await handleVisionMealRequest(
    request,
    buildDependencies(NORMAL_TEACHER, async () => [
      { name: "Tomato egg", category: "蛋白", amount: "80g" },
    ])
  );
  const body = (await response.json()) as Record<string, unknown>;
  const bulkContext = {
    userId: NORMAL_TEACHER.id,
    institutionId: NORMAL_TEACHER.institutionId,
    capability: "vision-meal",
    scopeId: null,
  };

  assert.equal(verifyAiResultAttestation(body, bulkContext), true);
  assert.equal(
    verifyAiResultAttestation(
      (body.foods as Array<Record<string, unknown>>)[0],
      bulkContext
    ),
    true
  );
  assert.equal(
    verifyAiResultAttestation(body, {
      ...bulkContext,
      userId: "another-user",
    }),
    false
  );
  assert.equal(
    verifyAiResultAttestation(body, {
      ...bulkContext,
      institutionId: "another-institution",
    }),
    false
  );
});

test("unsupported image MIME types are rejected before provider invocation", async () => {
  let providerCalls = 0;
  let brainCalls = 0;
  const dependencies = buildDependencies(NORMAL_TEACHER, async () => {
    providerCalls += 1;
    return [];
  });
  dependencies.forwardBrain = async () => {
    brainCalls += 1;
    return NO_BRAIN_RESPONSE;
  };
  const response = await handleVisionMealRequest(
    buildRequest("data:image/gif;base64,R0lGODlhAQABAIAAAAUEBA=="),
    dependencies
  );

  assert.equal(response.status, 415);
  assert.equal(providerCalls, 0);
  assert.equal(brainCalls, 0);
});

test("oversized Content-Length is rejected before authorization or body parsing", async () => {
  let authorizeCalls = 0;
  let providerCalls = 0;
  const dependencies = buildDependencies(NORMAL_TEACHER, async () => {
    providerCalls += 1;
    return [];
  });
  dependencies.authorize = async () => {
    authorizeCalls += 1;
    return {
      session: { user: NORMAL_TEACHER, source: "cookie" },
    };
  };
  const response = await handleVisionMealRequest(
    buildRequest(undefined, 5 * 1024 * 1024),
    dependencies
  );

  assert.equal(response.status, 413);
  assert.equal(authorizeCalls, 0);
  assert.equal(providerCalls, 0);
});

test("image data URL MIME must match its decoded magic signature", async () => {
  let providerCalls = 0;
  let brainCalls = 0;
  const dependencies = buildDependencies(NORMAL_TEACHER, async () => {
    providerCalls += 1;
    return [];
  });
  dependencies.forwardBrain = async () => {
    brainCalls += 1;
    return NO_BRAIN_RESPONSE;
  };
  const disguisedHtml = Buffer.from("<html>not a png</html>", "utf8").toString("base64");
  const response = await handleVisionMealRequest(
    buildRequest(`data:image/png;base64,${disguisedHtml}`),
    dependencies
  );

  assert.equal(response.status, 415);
  assert.equal(providerCalls, 0);
  assert.equal(brainCalls, 0);
});

test("images larger than 3 MB are rejected before provider invocation", async () => {
  let providerCalls = 0;
  let brainCalls = 0;
  const oversizedBase64 = "A".repeat(4 * 1024 * 1024 + 8);
  const dependencies = buildDependencies(NORMAL_TEACHER, async () => {
    providerCalls += 1;
    return [];
  });
  dependencies.forwardBrain = async () => {
    brainCalls += 1;
    return NO_BRAIN_RESPONSE;
  };
  const response = await handleVisionMealRequest(
    buildRequest(`data:image/jpeg;base64,${oversizedBase64}`),
    dependencies
  );

  assert.equal(response.status, 413);
  assert.equal(providerCalls, 0);
  assert.equal(brainCalls, 0);
});
