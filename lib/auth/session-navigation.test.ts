import assert from "node:assert/strict";
import test from "node:test";
import { navigateAfterSessionChange } from "./session-navigation";

test("session changes replace the entire document with a fresh request for each new role", () => {
  const targets: string[] = [];
  for (const [role, target] of [["机构管理员", "/admin"], ["教师", "/teacher"], ["家长", "/parent"], [null, "/login"]] as const) {
    assert.equal(navigateAfterSessionChange(role, null, value => targets.push(value)), target);
  }
  assert.deepEqual(targets, ["/admin", "/teacher", "/parent", "/login"]);
});
test("auth document navigation preserves permitted next paths and rejects foreign origins or other roles", () => {
  const targets: string[] = [], replace = (target: string) => targets.push(target);
  assert.equal(navigateAfterSessionChange("家长", "/parent/onboarding/child", replace), "/parent/onboarding/child");
  assert.equal(navigateAfterSessionChange("家长", "https://attacker.test/parent", replace), "/parent");
  assert.equal(navigateAfterSessionChange("家长", "//attacker.test/parent", replace), "/parent");
  assert.equal(navigateAfterSessionChange("家长", "/teacher", replace), "/parent?accessDenied=1");
  assert.equal(navigateAfterSessionChange("教师", "/parent/onboarding/child", replace), "/teacher?accessDenied=1");
  assert.equal(navigateAfterSessionChange(null, "/parent", replace), "/login");
});
test("default browser implementation uses location.replace instead of reusing the client router", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window"), targets: string[] = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { replace: (target: string) => targets.push(target) } } });
  try { navigateAfterSessionChange("家长", "/parent/onboarding/child"); assert.deepEqual(targets, ["/parent/onboarding/child"]); }
  finally { if (previous) Object.defineProperty(globalThis, "window", previous); else Reflect.deleteProperty(globalThis, "window"); }
});
