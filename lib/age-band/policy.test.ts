import assert from "node:assert/strict";
import test from "node:test";

import {
  AGE_BAND_POLICIES,
  getCareFocusForAgeBand,
  normalizeAgeBand,
  resolveAgeBandContext,
  resolveAgeBandPolicy,
} from "./policy.ts";

test("age-band policy defines all three care stages with required fields", () => {
  assert.deepEqual(Object.keys(AGE_BAND_POLICIES), ["0-12m", "12-24m", "24-36m"]);

  for (const [ageBand, policy] of Object.entries(AGE_BAND_POLICIES)) {
    assert.equal(policy.ageBand, ageBand);
    assert.ok(policy.careFocus.length > 0);
    assert.ok(policy.teacherObservationFocus.length > 0);
    assert.ok(policy.parentActionTone.length > 0);
    assert.ok(policy.weeklyReportFocus.length > 0);
    assert.ok(policy.defaultInterventionFocus.length > 0);
    assert.ok(policy.doNotOverstateSignals.length > 0);
  }
});

test("age-band policy normalizes legacy labels into three-bucket policy ids", () => {
  assert.equal(normalizeAgeBand("0–6个月"), "0-12m");
  assert.equal(normalizeAgeBand("6–12个月"), "0-12m");
  assert.equal(normalizeAgeBand("12–24个月"), "12-24m");
  assert.equal(normalizeAgeBand("2–3岁"), "24-36m");
});

test("age-band policy prefers birthDate over a conflicting legacy ageBand", () => {
  const context = resolveAgeBandContext({
    birthDate: "2025-06-01",
    ageBand: "1–3岁",
    asOfDate: "2026-04-12",
  });

  assert.equal(context.source, "birthDate");
  assert.equal(context.ageMonths, 10);
  assert.equal(context.normalizedAgeBand, "0-12m");
  assert.equal(context.policy?.ageBand, "0-12m");
});

test("age-band policy keeps broad legacy 1–3岁 unresolved when birthDate is absent", () => {
  const context = resolveAgeBandContext({
    ageBand: "1–3岁",
  });

  assert.equal(context.source, "ageBand");
  assert.equal(context.normalizedAgeBand, null);
  assert.equal(context.policy ?? null, null);
});

test("age-band care focus helper returns child-scoped focus from normalized input", () => {
  assert.deepEqual(getCareFocusForAgeBand("24-36m"), AGE_BAND_POLICIES["24-36m"].careFocus);
  assert.equal(resolveAgeBandPolicy("12–24个月")?.ageBand, "12-24m");
});
