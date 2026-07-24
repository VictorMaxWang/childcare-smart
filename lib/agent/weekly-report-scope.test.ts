import assert from "node:assert/strict";
import test from "node:test";

import { resolveWeeklyReportScope } from "@/lib/agent/weekly-report-scope";

test("admin weekly reports use the institution scope", () => {
  assert.deepEqual(
    resolveWeeklyReportScope({
      role: "admin",
      institutionId: " inst-main ",
    }),
    { scopeType: "institution", scopeId: "inst-main" }
  );
});

test("teacher weekly reports prefer class scope and fall back to an accessible child", () => {
  assert.deepEqual(
    resolveWeeklyReportScope({
      role: "teacher",
      className: "\u8054\u8c03\u793a\u4f8b\u73ed",
      childId: "child-1",
    }),
    { scopeType: "class", scopeId: "\u8054\u8c03\u793a\u4f8b\u73ed" }
  );
  assert.deepEqual(
    resolveWeeklyReportScope({
      role: "teacher",
      childId: "child-1",
    }),
    { scopeType: "child", scopeId: "child-1" }
  );
});

test("parent weekly reports require a child scope", () => {
  assert.deepEqual(
    resolveWeeklyReportScope({
      role: "parent",
      childId: "child-1",
    }),
    { scopeType: "child", scopeId: "child-1" }
  );
  assert.equal(resolveWeeklyReportScope({ role: "parent" }), null);
});
