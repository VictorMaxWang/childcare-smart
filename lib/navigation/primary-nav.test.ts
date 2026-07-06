import assert from "node:assert/strict";
import test from "node:test";

import { getDemoAccountById, type AccountRole } from "../auth/accounts.ts";
import { buildPrimaryNavItems, resolvePrimaryNavChildId } from "./primary-nav.ts";

const PARENT_ROLE = "\u5bb6\u957f" as AccountRole;

test("admin nav keeps root overview and institution home as separate entries", () => {
  const navItems = buildPrimaryNavItems(getDemoAccountById("u-admin")!.role);

  assert.equal(navItems[0]?.href, "/admin");
  assert.equal(navItems[0]?.label, "园所首页");
  assert.equal(navItems.at(-1)?.href, "/");
  assert.equal(navItems.at(-1)?.label, "数据总览");
  assert.equal(navItems.filter((item) => item.href === "/").length, 1);
  assert.equal(navItems.filter((item) => item.href === "/admin").length, 1);
  assert.equal(navItems.some((item) => item.href === "/teacher"), false);
});

test("teacher nav points workbench home to /teacher and hides institution-only entries", () => {
  const navItems = buildPrimaryNavItems(getDemoAccountById("u-teacher")!.role);

  assert.equal(navItems[0]?.href, "/teacher");
  assert.equal(navItems[0]?.label, "教师工作台");
  assert.equal(navItems.some((item) => item.href === "/admin"), false);
  assert.equal(navItems.some((item) => item.href === "/"), false);
});

test("parent nav exposes parent tools without institution or teacher entries", () => {
  const navItems = buildPrimaryNavItems(getDemoAccountById("u-parent")!.role);

  assert.equal(navItems[0]?.href, "/parent");
  assert.equal(navItems[0]?.label, "家长首页");
  assert.equal(navItems.some((item) => item.href === "/"), false);
  assert.equal(navItems.some((item) => item.href === "/teacher"), false);
  assert.equal(navItems.some((item) => item.href.startsWith("/admin")), false);
});

test("resolvePrimaryNavChildId prefers session childIds", () => {
  assert.equal(resolvePrimaryNavChildId(["c-session"], [{ id: "c-visible" }]), "c-session");
});

test("resolvePrimaryNavChildId falls back to visible children after parent onboarding", () => {
  assert.equal(resolvePrimaryNavChildId([], [{ id: "c-owned" }]), "c-owned");
});

test("parent primary navigation carries the resolved child scope", () => {
  const childId = resolvePrimaryNavChildId([], [{ id: "c-owned" }]);
  const links = buildPrimaryNavItems(PARENT_ROLE, { childId }).map((item) => item.href);

  assert.equal(links.length > 0, true);
  assert.equal(links.every((href) => href.includes("child=c-owned")), true);
});
