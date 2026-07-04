import type { ApiChildInput, ApiParentChildOnboardingInput } from "@/lib/api/types";

export const CHILD_ONBOARDING_CONSENT_KEYS = [
  "guardianAuthorization",
  "termsOfService",
  "childPrivacy",
] as const;

export type ChildOnboardingConsentKey = (typeof CHILD_ONBOARDING_CONSENT_KEYS)[number];
export type ChildOnboardingConsentState = Record<ChildOnboardingConsentKey, boolean>;

export interface ChildOnboardingFormValues {
  name: string;
  nickname?: string;
  birthDate?: string;
  ageMonth?: number | string;
  gender?: ApiChildInput["gender"] | "";
  consents: ChildOnboardingConsentState;
}

export type ChildOnboardingValidationResult =
  | { ok: true; payload: ApiParentChildOnboardingInput & { consentAccepted: true } }
  | { ok: false; error: string; field?: string };

const MAX_CHILD_AGE_MONTH = 216;

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function normalizeAgeMonth(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return { ok: true as const, value: undefined };
  }

  const ageMonth = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(ageMonth) || ageMonth < 0 || ageMonth > MAX_CHILD_AGE_MONTH) {
    return { ok: false as const, error: "儿童月龄需为 0 到 216 之间的整数。", field: "ageMonth" };
  }

  return { ok: true as const, value: ageMonth };
}

export function createEmptyChildOnboardingConsents(): ChildOnboardingConsentState {
  return {
    guardianAuthorization: false,
    termsOfService: false,
    childPrivacy: false,
  };
}

export function isChildOnboardingConsentComplete(consents: Partial<ChildOnboardingConsentState>) {
  return CHILD_ONBOARDING_CONSENT_KEYS.every((key) => consents[key] === true);
}

export function validateChildOnboardingInput(input: ApiParentChildOnboardingInput): ChildOnboardingValidationResult {
  const name = normalizeText(input.name) || normalizeText(input.nickname);
  const nickname = normalizeText(input.nickname);
  const birthDate = normalizeText(input.birthDate);
  const ageMonthResult = normalizeAgeMonth(input.ageMonth);

  if (!input.consentAccepted) {
    return { ok: false, error: "请先完成监护人确认与协议同意。", field: "consentAccepted" };
  }

  if (!name) {
    return { ok: false, error: "请填写孩子姓名或昵称。", field: "name" };
  }

  if (!ageMonthResult.ok) {
    return ageMonthResult;
  }

  if (birthDate && typeof ageMonthResult.value === "number") {
    return { ok: false, error: "出生日期和月龄只能填写一个。", field: "birthDate" };
  }

  if (!birthDate && typeof ageMonthResult.value !== "number") {
    return { ok: false, error: "请填写出生日期或月龄。", field: "birthDate" };
  }

  if (birthDate && !isValidDateKey(birthDate)) {
    return { ok: false, error: "出生日期格式无效。", field: "birthDate" };
  }

  const gender = input.gender === "男" || input.gender === "女" ? input.gender : undefined;
  return {
    ok: true,
    payload: {
      name,
      ...(nickname ? { nickname } : {}),
      ...(birthDate ? { birthDate } : { ageMonth: ageMonthResult.value }),
      ...(gender ? { gender } : {}),
      consentAccepted: true,
    },
  };
}

export function buildParentChildOnboardingPayload(
  form: ChildOnboardingFormValues
): ChildOnboardingValidationResult {
  const ageMonth =
    form.ageMonth === "" || typeof form.ageMonth === "undefined"
      ? undefined
      : typeof form.ageMonth === "number"
        ? form.ageMonth
        : Number(form.ageMonth);

  return validateChildOnboardingInput({
    name: form.name,
    nickname: form.nickname,
    birthDate: form.birthDate,
    ageMonth,
    gender: form.gender || undefined,
    consentAccepted: isChildOnboardingConsentComplete(form.consents),
  });
}
