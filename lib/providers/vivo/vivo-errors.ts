import "server-only";

import type { VivoCapability, VivoProviderStatus } from "./types";

export class VivoProviderError extends Error {
  capability: VivoCapability;
  status: VivoProviderStatus["status"];
  httpStatus?: number;
  raw?: unknown;
  failureKind?:
    | "authentication"
    | "provider-response"
    | "rate-limited"
    | "request-cancelled"
    | "request-timeout"
    | "transport";

  constructor(message: string, options: {
    capability: VivoCapability;
    status: VivoProviderStatus["status"];
    httpStatus?: number;
    raw?: unknown;
    failureKind?:
      | "authentication"
      | "provider-response"
      | "rate-limited"
      | "request-cancelled"
      | "request-timeout"
      | "transport";
  }) {
    super(message);
    this.name = "VivoProviderError";
    this.capability = options.capability;
    this.status = options.status;
    this.httpStatus = options.httpStatus;
    this.raw = options.raw;
    this.failureKind = options.failureKind;
  }
}

export function redactVivoSecret(value: string) {
  if (!value) return "";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
