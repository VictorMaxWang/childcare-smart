import {
  resolveAdminVisibleText,
  sanitizeAdminVisibleText,
} from "./admin-display-text.ts";

export function sanitizeAdminWhyHighPriorityText(value: string | null | undefined) {
  return sanitizeAdminVisibleText(value);
}

export function resolveAdminWhyHighPriorityText(
  ...values: Array<string | null | undefined>
) {
  return resolveAdminVisibleText(...values);
}
