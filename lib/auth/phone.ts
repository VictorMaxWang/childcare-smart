const MAINLAND_PHONE_ERROR = "仅支持中国大陆 11 位手机号。";

export function normalizePhone(input: string): string {
  const compact = input.trim().replace(/[\s-]+/g, "");
  const nationalNumber =
    compact.startsWith("+86")
      ? compact.slice(3)
      : compact.startsWith("86") && compact.length === 13
        ? compact.slice(2)
        : compact;

  if (!/^1\d{10}$/.test(nationalNumber)) {
    throw new Error(MAINLAND_PHONE_ERROR);
  }

  return `+86${nationalNumber}`;
}

export function isPhoneLikeInput(input: string) {
  const compact = input.trim().replace(/[\s-]+/g, "");
  return /^(\+?86)?1\d*$/.test(compact);
}
