import type { ApiErrorCode, ApiFailure } from "@/lib/api/types";

export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden_scope: 403,
  not_found: 404,
  conflict: 409,
  needs_confirmation: 422,
  limited: 423,
  provider_unavailable: 503,
  server_error: 500,
};

export function buildApiFailure(code: ApiErrorCode, error: string): ApiFailure {
  return {
    ok: false,
    code,
    error,
  };
}

export class ApiClientError extends Error {
  code: ApiErrorCode;
  status: number;

  constructor(message: string, code: ApiErrorCode, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
  }
}
