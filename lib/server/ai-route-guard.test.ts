import assert from "node:assert/strict";
import test from "node:test";

import { DEMO_ACCOUNTS, type SessionUser } from "@/lib/auth/accounts";
import { createDemoSeedSnapshot } from "@/lib/demo-data/seed";
import type { ApiExtendedSnapshot } from "@/lib/api/types";
import { normalizeExtendedSnapshot } from "@/lib/server/app-data-model";
import type { AppDataRepository } from "@/lib/server/app-data-repository";
import { authorizeAiRoute } from "@/lib/server/ai-route-guard";
import type { RequestSession } from "@/lib/server/session";

class MemoryRepository implements AppDataRepository {
  constructor(private readonly snapshot: ApiExtendedSnapshot) {}

  async load() {
    return this.snapshot;
  }

  async save() {
    return;
  }
}

function demoUser(id: string) {
  const user = DEMO_ACCOUNTS.find((account) => account.id === id);
  assert.ok(user, `Missing demo account ${id}`);
  return user;
}

const snapshot = normalizeExtendedSnapshot(
  createDemoSeedSnapshot("2026-05-02T00:00:00.000Z"),
  demoUser("u-admin")
);
const repository = new MemoryRepository(snapshot);

function session(user: SessionUser): RequestSession {
  return { user, source: user.accountKind === "demo" ? "demo-header" : "cookie" };
}

function normalUser(overrides: Partial<SessionUser>): SessionUser {
  return {
    id: "normal-user",
    name: "Normal User",
    role: "家长",
    avatar: "N",
    institutionId: "inst-1",
    childIds: [],
    accountKind: "normal",
    ...overrides,
  };
}

function requestWithJson(payload: unknown) {
  return new Request("http://localhost/api/ai/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function readLimited(response: Response) {
  return (await response.json()) as {
    ok: false;
    code: string;
    limited: true;
    reason: string;
    requiredRole: string | null;
    demoAvailable: boolean;
  };
}

test("demo session can still use child-scoped AI routes", async () => {
  const result = await authorizeAiRoute(requestWithJson({ childId: "c-1" }), {
    requiredRole: "parent",
    repository,
    session: session(demoUser("u-parent")),
  });

  assert.equal(result, null);
});

test("normal parent can access own child but not another child", async () => {
  const parent = normalUser({
    id: "normal-parent",
    role: "家长",
    childIds: ["c-1"],
  });

  const allowed = await authorizeAiRoute(requestWithJson({ childId: "c-1" }), {
    requiredRole: "parent",
    repository,
    session: session(parent),
  });
  assert.equal(allowed, null);

  const denied = await authorizeAiRoute(requestWithJson({ childId: "c-20" }), {
    requiredRole: "parent",
    repository,
    session: session(parent),
  });
  assert.ok(denied instanceof Response);
  assert.equal(denied.status, 403);
  assert.equal((await readLimited(denied)).reason, "forbidden_child");
});

test("normal teacher can access own class child and class scope but not other classes", async () => {
  const teacher = normalUser({
    id: "normal-teacher",
    role: "教师",
    className: "晨曦班",
  });

  const ownChild = await authorizeAiRoute(requestWithJson({ childId: "c-1" }), {
    requiredRole: "staff",
    repository,
    session: session(teacher),
  });
  assert.equal(ownChild, null);

  const ownClass = await authorizeAiRoute(requestWithJson({ scopeType: "class", scopeId: "晨曦班" }), {
    requiredRole: "staff",
    repository,
    session: session(teacher),
  });
  assert.equal(ownClass, null);

  const deniedChild = await authorizeAiRoute(requestWithJson({ childId: "c-20" }), {
    requiredRole: "staff",
    repository,
    session: session(teacher),
  });
  assert.ok(deniedChild instanceof Response);
  assert.equal(deniedChild.status, 403);
  assert.equal((await readLimited(deniedChild)).reason, "forbidden_child");

  const deniedClass = await authorizeAiRoute(requestWithJson({ scopeType: "class", scopeId: "向阳班" }), {
    requiredRole: "staff",
    repository,
    session: session(teacher),
  });
  assert.ok(deniedClass instanceof Response);
  assert.equal(deniedClass.status, 403);
  assert.equal((await readLimited(deniedClass)).reason, "forbidden_class");
});

test("role mismatch and missing session return explicit limited envelopes", async () => {
  const parent = normalUser({
    id: "normal-parent",
    role: "家长",
    childIds: ["c-1"],
  });

  const roleDenied = await authorizeAiRoute(requestWithJson({ childId: "c-1" }), {
    requiredRole: "staff",
    repository,
    session: session(parent),
  });
  assert.ok(roleDenied instanceof Response);
  assert.equal(roleDenied.status, 403);
  const roleDeniedBody = await readLimited(roleDenied);
  assert.equal(roleDeniedBody.reason, "role_mismatch");
  assert.equal(roleDeniedBody.requiredRole, "staff");

  const unauthenticated = await authorizeAiRoute(requestWithJson({ childId: "c-1" }), {
    requiredRole: "parent",
    repository,
    session: null,
  });
  assert.ok(unauthenticated instanceof Response);
  assert.equal(unauthenticated.status, 401);
  const unauthenticatedBody = await readLimited(unauthenticated);
  assert.equal(unauthenticatedBody.reason, "login_required");
  assert.equal(unauthenticatedBody.requiredRole, "parent");
});

test("normal accounts get explicit limited responses for demo-only AI routes", async () => {
  const teacher = normalUser({
    id: "normal-teacher",
    role: "教师",
    className: "晨曦班",
  });

  const denied = await authorizeAiRoute(requestWithJson({}), {
    allowUnscoped: true,
    normalAccountAccess: "demo-only",
    session: session(teacher),
  });

  assert.ok(denied instanceof Response);
  assert.equal(denied.status, 423);
  const body = await readLimited(denied);
  assert.equal(body.code, "limited");
  assert.equal(body.reason, "normal_session_not_enabled");
});

test("normal scoped-only AI routes return business limited when scope is missing", async () => {
  const parent = normalUser({
    id: "normal-parent",
    role: "家长",
    childIds: ["c-1"],
  });

  const denied = await authorizeAiRoute(requestWithJson({ question: "missing child" }), {
    requiredRole: "parent",
    requireScopedNormalSession: true,
    repository,
    session: session(parent),
  });

  assert.ok(denied instanceof Response);
  assert.equal(denied.status, 423);
  const body = await readLimited(denied);
  assert.equal(body.code, "limited");
  assert.equal(body.reason, "scope_required");
});
