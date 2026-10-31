import assert from "node:assert/strict";
import test from "node:test";
import type { ApiParentChildOnboardingInput } from "@/lib/api/types";

import {
  buildParentChildOnboardingPayload,
  createEmptyChildOnboardingConsents,
  validateChildOnboardingInput,
} from "@/lib/parent/child-onboarding";

test("child onboarding form rejects unchecked consent", () => {
  const result = buildParentChildOnboardingPayload({
    name: "小雨",
    birthDate: "2022-05-10",
    gender: "女",
    consents: createEmptyChildOnboardingConsents(),
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.field, "consentAccepted");
  }
});

test("onboarding rejects malformed JSON values and truthy non-boolean consent before writes", () => {
  for (const input of [null, [], "child", { name: "小雨", ageMonth: 24, consentAccepted: "false" }, { name: "小雨", ageMonth: 24, consentAccepted: 1 }]) {
    assert.equal(validateChildOnboardingInput(input as unknown as ApiParentChildOnboardingInput).ok, false);
  }
});

test("child onboarding validation requires birthDate or ageMonth, but not both", () => {
  const missingAge = validateChildOnboardingInput({
    name: "小雨",
    consentAccepted: true,
  });
  const duplicateAge = validateChildOnboardingInput({
    name: "小雨",
    birthDate: "2022-05-10",
    ageMonth: 12,
    consentAccepted: true,
  });

  assert.equal(missingAge.ok, false);
  assert.equal(duplicateAge.ok, false);
  if (!missingAge.ok) assert.equal(missingAge.field, "birthDate");
  if (!duplicateAge.ok) assert.equal(duplicateAge.field, "birthDate");
});

test("child onboarding form returns minimal API payload when consent is complete", () => {
  const result = buildParentChildOnboardingPayload({
    name: " 小雨 ",
    nickname: " 雨雨 ",
    birthDate: "2022-05-10",
    gender: "女",
    consents: {
      guardianAuthorization: true,
      termsOfService: true,
      childPrivacy: true,
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.payload, {
      name: "小雨",
      nickname: "雨雨",
      birthDate: "2022-05-10",
      gender: "女",
      consentAccepted: true,
    });
  }
});

test("child onboarding API accepts ageMonth fallback", () => {
  const result = validateChildOnboardingInput({
    name: "小雨",
    ageMonth: 24,
    consentAccepted: true,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.payload.ageMonth, 24);
    assert.equal(result.payload.birthDate, undefined);
  }
});

test("child onboarding rejects future and over-age birthdays without narrowing the existing age range", () => {
  const now = new Date("2026-10-31T08:00:00Z");
  const future = validateChildOnboardingInput({ name: "小雨", birthDate: "2026-11-01", consentAccepted: true }, now);
  const tooOld = validateChildOnboardingInput({ name: "小雨", birthDate: "2008-10-30", consentAccepted: true }, now);
  const boundary = validateChildOnboardingInput({ name: "小雨", birthDate: "2008-10-31", consentAccepted: true }, now);
  assert.equal(future.ok, false); assert.equal(tooOld.ok, false); assert.equal(boundary.ok, true);
});

test("child onboarding accepts only bounded request identifiers and preserves them", () => {
  const valid = validateChildOnboardingInput({ name: "小雨", ageMonth: 24, consentAccepted: true, requestId: "parent-request-20261031" });
  assert.equal(valid.ok, true);
  if (valid.ok) assert.equal(valid.payload.requestId, "parent-request-20261031");
  assert.equal(validateChildOnboardingInput({ name: "小雨", ageMonth: 24, consentAccepted: true, requestId: "invalid!" }).ok, false);
});
