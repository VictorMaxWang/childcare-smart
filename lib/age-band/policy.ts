import type { AgeBandPolicy, AgeBandPolicyId, ResolvedAgeBandContext } from "@/lib/ai/types";
import policySource from "@/shared/age-band-care-policy.json";

type ResolveAgeBandInput =
  | AgeBandPolicyId
  | ResolvedAgeBandContext
  | {
      birthDate?: string | null;
      ageBand?: string | null;
      normalizedAgeBand?: AgeBandPolicyId | null;
      asOfDate?: string | Date | null;
    }
  | null
  | undefined;

type AgeBandPolicySource = {
  policyVersion: string;
  policies: Record<AgeBandPolicyId, AgeBandPolicy>;
};

const POLICY_SOURCE = policySource as AgeBandPolicySource;

export const AGE_BAND_POLICY_VERSION = POLICY_SOURCE.policyVersion;
export const AGE_BAND_POLICIES = POLICY_SOURCE.policies;

const AGE_BAND_LABELS: Record<AgeBandPolicyId, string> = {
  "0-12m": "0-12月",
  "12-24m": "12-24月",
  "24-36m": "24-36月",
};

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[—–]/g, "-").replace(/\s+/g, "");
}

function coerceDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function monthsBetween(birthDate: Date, asOfDate: Date): number {
  let months =
    (asOfDate.getUTCFullYear() - birthDate.getUTCFullYear()) * 12 +
    (asOfDate.getUTCMonth() - birthDate.getUTCMonth());

  if (asOfDate.getUTCDate() < birthDate.getUTCDate()) {
    months -= 1;
  }

  return months;
}

function normalizeAgeBandFromBirthDate(
  birthDate?: string | null,
  asOfDate?: string | Date | null
): { ageMonths: number; normalizedAgeBand: AgeBandPolicyId | null } | null {
  const birth = coerceDate(birthDate);
  if (!birth) return null;

  const resolvedAsOfDate = coerceDate(asOfDate) ?? new Date();
  const ageMonths = monthsBetween(birth, resolvedAsOfDate);
  if (ageMonths < 0) return null;

  return {
    ageMonths,
    normalizedAgeBand:
      ageMonths < 12 ? "0-12m" : ageMonths < 24 ? "12-24m" : ageMonths < 36 ? "24-36m" : null,
  };
}

export function normalizeAgeBand(rawAgeBand?: string | null): AgeBandPolicyId | null {
  const normalized = normalizeToken(rawAgeBand ?? "");
  if (!normalized) return null;

  if (normalized === "1-3岁" || normalized === "1至3岁" || normalized === "1~3岁") {
    return null;
  }

  if (
    [
      "0-12m",
      "0-12month",
      "0-12months",
      "0-12月",
      "0-12个月",
      "0-12個月",
      "0-6个月",
      "0-6個月",
      "6-12个月",
      "6-12個月",
    ].includes(normalized)
  ) {
    return "0-12m";
  }

  if (
    [
      "12-24m",
      "12-24month",
      "12-24months",
      "12-24月",
      "12-24个月",
      "12-24個月",
      "1-2岁",
      "1至2岁",
      "1~2岁",
    ].includes(normalized)
  ) {
    return "12-24m";
  }

  if (
    [
      "24-36m",
      "24-36month",
      "24-36months",
      "24-36月",
      "24-36个月",
      "24-36個月",
      "2-3岁",
      "2至3岁",
      "2~3岁",
    ].includes(normalized)
  ) {
    return "24-36m";
  }

  return null;
}

export function resolveAgeBandContext(
  input: {
    birthDate?: string | null;
    ageBand?: string | null;
    normalizedAgeBand?: AgeBandPolicyId | null;
    asOfDate?: string | Date | null;
  } = {}
): ResolvedAgeBandContext {
  const rawAgeBand = typeof input.ageBand === "string" ? input.ageBand.trim() || null : null;
  const birthDate = typeof input.birthDate === "string" ? input.birthDate.trim() || null : null;
  const birthResolved = normalizeAgeBandFromBirthDate(birthDate, input.asOfDate);

  if (birthResolved) {
    const normalizedAgeBand = birthResolved.normalizedAgeBand;
    return {
      policyVersion: AGE_BAND_POLICY_VERSION,
      birthDate,
      rawAgeBand,
      normalizedAgeBand,
      ageMonths: birthResolved.ageMonths,
      source: "birthDate",
      policy: normalizedAgeBand ? AGE_BAND_POLICIES[normalizedAgeBand] : null,
    };
  }

  const normalizedAgeBand = input.normalizedAgeBand ?? normalizeAgeBand(rawAgeBand);
  return {
    policyVersion: AGE_BAND_POLICY_VERSION,
    birthDate,
    rawAgeBand,
    normalizedAgeBand,
    ageMonths: null,
    source: rawAgeBand ? "ageBand" : "unknown",
    policy: normalizedAgeBand ? AGE_BAND_POLICIES[normalizedAgeBand] : null,
  };
}

export function resolveAgeBandPolicy(input: ResolveAgeBandInput): AgeBandPolicy | null {
  if (!input) return null;

  if (typeof input === "string") {
    const normalized = (input in AGE_BAND_POLICIES ? input : normalizeAgeBand(input)) as
      | AgeBandPolicyId
      | null;
    return normalized ? AGE_BAND_POLICIES[normalized] : null;
  }

  if ("policy" in input && input.policy) {
    return input.policy;
  }

  if ("normalizedAgeBand" in input && input.normalizedAgeBand) {
    return AGE_BAND_POLICIES[input.normalizedAgeBand];
  }

  return resolveAgeBandContext(input).policy ?? null;
}

export function getCareFocusForAgeBand(input: ResolveAgeBandInput): string[] {
  return resolveAgeBandPolicy(input)?.careFocus ?? [];
}

export function getAgeBandLabel(input: ResolveAgeBandInput): string | null {
  const policy = resolveAgeBandPolicy(input);
  return policy ? AGE_BAND_LABELS[policy.ageBand] : null;
}

export function describeAgeBandActionGuidance(input: ResolveAgeBandInput): {
  label: string;
  careFocusText: string;
  careFocus: string[];
  teacherObservationText: string;
  teacherObservationFocus: string[];
  defaultInterventionText: string;
  defaultInterventionFocus: string[];
  cautionText: string;
  parentActionTone: string;
} | null {
  const policy = resolveAgeBandPolicy(input);
  if (!policy) return null;

  return {
    label: AGE_BAND_LABELS[policy.ageBand],
    careFocusText: policy.careFocus.slice(0, 2).join("、"),
    careFocus: [...policy.careFocus],
    teacherObservationText: policy.teacherObservationFocus.slice(0, 2).join("；"),
    teacherObservationFocus: [...policy.teacherObservationFocus],
    defaultInterventionText: policy.defaultInterventionFocus.slice(0, 2).join("；"),
    defaultInterventionFocus: [...policy.defaultInterventionFocus],
    cautionText: policy.doNotOverstateSignals[0] ?? "",
    parentActionTone: policy.parentActionTone,
  };
}

export function describeAgeBandWeeklyGuidance(input: ResolveAgeBandInput): {
  label: string;
  focusText: string;
  actionText: string;
  cautionText: string;
  parentActionTone: string;
} | null {
  const policy = resolveAgeBandPolicy(input);
  if (!policy) return null;

  return {
    label: AGE_BAND_LABELS[policy.ageBand],
    focusText: policy.weeklyReportFocus.slice(0, 2).join("、"),
    actionText: policy.defaultInterventionFocus[0] ?? policy.weeklyReportFocus[0] ?? policy.careFocus[0],
    cautionText: policy.doNotOverstateSignals[0] ?? "",
    parentActionTone: policy.parentActionTone,
  };
}
