import "server-only";

type SecurityLogLevel = "info" | "warn" | "error";

const SENSITIVE_KEY_PATTERN =
  /authorization|bearer|cookie|set-cookie|api[_-]?key|app[_-]?key|secret|token|session|signature|hmac|password|credential|child|guardian|feedback|message|content|notes|payload|body|headers|phone|name/i;

const SAFE_STRING_PATTERN = /^[a-z0-9._:/-]{1,160}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function summarizeSecurityError(error: unknown) {
  if (!error) return undefined;
  if (error instanceof Error) {
    const details: Record<string, string | number> = { name: error.name || "Error" };
    const maybeCode = (error as { code?: unknown }).code;
    const maybeStatus = (error as { status?: unknown }).status;
    if (typeof maybeCode === "string" && SAFE_STRING_PATTERN.test(maybeCode)) details.code = maybeCode;
    if (typeof maybeStatus === "number" && Number.isFinite(maybeStatus)) details.status = maybeStatus;
    return details;
  }
  if (isRecord(error)) {
    const details: Record<string, string | number> = { name: "Object" };
    const maybeCode = error.code;
    const maybeStatus = error.status;
    if (typeof maybeCode === "string" && SAFE_STRING_PATTERN.test(maybeCode)) details.code = maybeCode;
    if (typeof maybeStatus === "number" && Number.isFinite(maybeStatus)) details.status = maybeStatus;
    return details;
  }
  return { name: typeof error };
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (typeof value === "undefined" || value === null) return value;
  if (key === "error") return summarizeSecurityError(value);
  if (value instanceof Error) return summarizeSecurityError(value);
  if (typeof value === "number" || typeof value === "boolean") return value;

  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return "[redacted]";
  }

  if (typeof value === "string") {
    return SAFE_STRING_PATTERN.test(value) ? value : "[redacted]";
  }

  if (isRecord(value)) {
    const safe: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      safe[childKey] = sanitizeValue(childKey, childValue);
    }
    return safe;
  }

  return "[redacted]";
}

export function buildSafeLogDetails(details?: Record<string, unknown>) {
  if (!details) return undefined;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    safe[key] = sanitizeValue(key, value);
  }
  return safe;
}

export function logSecurityEvent(
  level: SecurityLogLevel,
  event: string,
  details?: Record<string, unknown>
) {
  const safeDetails = buildSafeLogDetails(details);
  const message = `[SECURITY] ${event}`;
  if (safeDetails && Object.keys(safeDetails).length > 0) {
    console[level](message, safeDetails);
  } else {
    console[level](message);
  }
}
