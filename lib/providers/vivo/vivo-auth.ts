import "server-only";

import { getVivoEnv } from "./vivo-provider-status";

export function buildVivoAuthHeaders(extra?: HeadersInit) {
  const env = getVivoEnv();
  const headers = new Headers(extra);
  if (env.appKey) {
    headers.set("Authorization", `Bearer ${env.appKey}`);
  }
  return headers;
}

export function createRequestId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
