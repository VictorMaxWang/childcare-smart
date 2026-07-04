import assert from "node:assert/strict";
import test from "node:test";

import type { ApiChild, ApiParentChildOnboardingInput } from "@/lib/api/types";
import type { SessionUser } from "@/lib/auth/accounts";
import { ApiRouteError } from "@/lib/server/api-errors";
import type { ParentChildOnboardingRequestMeta } from "@/lib/server/parent-child-onboarding";
import { handleParentChildrenRequest, type ParentChildrenRouteDependencies } from "./route.ts";

function jsonRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/parent/children", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "route-test-agent",
      "x-forwarded-for": "203.0.113.8, 10.0.0.2",
    },
    body: JSON.stringify(body),
  });
}

const parentUser = {
  id: "u-parent",
  username: "+8613800000000",
  name: "测试家长",
  role: "家长",
  avatar: "👩",
  institutionId: "inst-family",
  childIds: [],
  accountKind: "normal",
} satisfies SessionUser;

test("parent children route returns 201 child envelope and forwards request metadata", async () => {
  const calls: Array<{
    session: SessionUser;
    input: ApiParentChildOnboardingInput;
    meta: ParentChildOnboardingRequestMeta;
  }> = [];
  const child = {
    id: "c-created",
    name: "小雨",
    birthDate: "2022-05-10",
    gender: "女",
    allergies: [],
    heightCm: 0,
    weightKg: 0,
    guardians: [],
    institutionId: "inst-family",
    className: "待分班",
    specialNotes: "",
    avatar: "👧",
    parentUserId: "u-parent",
  } satisfies ApiChild;
  const dependencies: ParentChildrenRouteDependencies = {
    async resolveSession() {
      return { user: parentUser, source: "cookie" };
    },
    async createChild(session, input, meta) {
      calls.push({ session, input, meta });
      return child;
    },
  };

  const response = await handleParentChildrenRequest(
    jsonRequest({
      name: "小雨",
      birthDate: "2022-05-10",
      gender: "女",
      consentAccepted: true,
    }),
    dependencies
  );
  const body = (await response.json()) as { ok: boolean; data?: ApiChild };

  assert.equal(response.status, 201);
  assert.equal(body.ok, true);
  assert.equal(body.data?.id, "c-created");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].session.id, "u-parent");
  assert.equal(calls[0].input.consentAccepted, true);
  assert.deepEqual(calls[0].meta, {
    ip: "203.0.113.8",
    userAgent: "route-test-agent",
  });
});

test("parent children route surfaces service validation failures", async () => {
  const dependencies: ParentChildrenRouteDependencies = {
    async resolveSession() {
      return { user: parentUser, source: "cookie" };
    },
    async createChild() {
      throw new ApiRouteError("invalid_request", "consent required", 400);
    },
  };

  const response = await handleParentChildrenRequest(
    jsonRequest({
      name: "小雨",
      birthDate: "2022-05-10",
      consentAccepted: false,
    }),
    dependencies
  );
  const body = (await response.json()) as { ok: boolean; code?: string; error?: string };

  assert.equal(response.status, 400);
  assert.equal(body.ok, false);
  assert.equal(body.code, "invalid_request");
  assert.equal(body.error, "consent required");
});
