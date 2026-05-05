import assert from "node:assert/strict";
import test from "node:test";

import { DEMO_ACCOUNTS, type SessionUser } from "@/lib/auth/accounts";
import { createDemoSeedSnapshot } from "@/lib/demo-data/seed";
import { ApiRouteError } from "@/lib/server/api-errors";
import { normalizeExtendedSnapshot } from "@/lib/server/app-data-model";
import {
  canAccessClass,
  canManageDirectorResource,
  requireChildAccess,
  requireClassAccess,
} from "@/lib/server/scope";

function demoUser(id: string) {
  const user = DEMO_ACCOUNTS.find((account) => account.id === id);
  assert.ok(user, `Missing demo account ${id}`);
  return user;
}

function assertForbidden(error: unknown) {
  assert.ok(error instanceof ApiRouteError);
  assert.equal(error.code, "forbidden_scope");
  assert.equal(error.status, 403);
  return true;
}

function buildSnapshot(session: SessionUser) {
  return normalizeExtendedSnapshot(createDemoSeedSnapshot("2026-05-02T00:00:00.000Z"), session);
}

test("parent cannot access another child", () => {
  const parent = demoUser("u-parent");
  const snapshot = buildSnapshot(parent);

  assert.throws(() => requireChildAccess(parent, snapshot, "c-3"), assertForbidden);
});

test("teacher cannot access a child from another class", () => {
  const teacher2 = demoUser("u-teacher2");
  const snapshot = buildSnapshot(teacher2);

  assert.throws(() => requireChildAccess(teacher2, snapshot, "c-1"), assertForbidden);
});

test("director can access institution children and class scope", () => {
  const director = demoUser("u-admin");
  const snapshot = buildSnapshot(director);
  const child = requireChildAccess(director, snapshot, "c-1");

  assert.equal(child.id, "c-1");
  assert.equal(canManageDirectorResource(director), true);
  assert.doesNotThrow(() => requireClassAccess(director, snapshot, child.className));
});

test("parent child ownership does not grant class-level scope", () => {
  const parent = demoUser("u-parent");
  const snapshot = buildSnapshot(parent);
  const ownChild = requireChildAccess(parent, snapshot, "c-1");

  assert.equal(canAccessClass(parent, snapshot, ownChild.className), false);
});

test("parent can access server-owned child even when explicit childIds exist", () => {
  const parent = demoUser("u-parent");
  const snapshot = buildSnapshot(parent);
  snapshot.children = [
    {
      ...snapshot.children[0],
      id: "c-parent-owned",
      name: "Parent Owned",
      parentUserId: parent.id,
    },
    ...snapshot.children,
  ];

  const child = requireChildAccess(parent, snapshot, "c-parent-owned");
  assert.equal(child.id, "c-parent-owned");
});
