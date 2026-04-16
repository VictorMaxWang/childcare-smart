const WHY_HIGH_PRIORITY_SERIALIZATION_HINTS = [
  "鏈€杩戜笂涓嬫枃",
  '{"snapshot":',
  '"snapshot":',
  '"child":',
  '"summary":',
  '"recordCount":',
  '"pendingReviewCount":',
  '"moodKeywords":',
  '"allergies":',
] as const;

function looksLikeSerializedWhyHighPriority(text: string) {
  const compact = text.trim().replace(/\s+/g, " ");
  if (!compact) return false;

  if (WHY_HIGH_PRIORITY_SERIALIZATION_HINTS.some((hint) => compact.includes(hint))) {
    return true;
  }

  const hasStructuredJsonShape =
    (compact.startsWith("{") || compact.startsWith("[")) &&
    compact.includes('":') &&
    /[{[\]}]/.test(compact);

  if (hasStructuredJsonShape && compact.length > 120) {
    return true;
  }

  const punctuationDensity =
    (compact.match(/[{}[\]":,]/g)?.length ?? 0) / Math.max(compact.length, 1);
  const naturalSentenceLike = /[銆傦紒锛燂紱]/.test(compact);

  return compact.length > 180 && punctuationDensity > 0.12 && !naturalSentenceLike;
}

export function sanitizeAdminWhyHighPriorityText(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) return null;
  return looksLikeSerializedWhyHighPriority(normalized) ? null : normalized;
}

export function resolveAdminWhyHighPriorityText(
  ...values: Array<string | null | undefined>
) {
  for (const value of values) {
    const sanitized = sanitizeAdminWhyHighPriorityText(value);
    if (sanitized) return sanitized;
  }

  return "寰呰ˉ鍏呰鏄?";
}
