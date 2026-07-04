import assert from "node:assert/strict";
import test from "node:test";

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
