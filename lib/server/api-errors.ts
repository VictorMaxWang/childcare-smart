import { NextResponse } from "next/server";
import { API_ERROR_STATUS, buildApiFailure } from "@/lib/api/errors";
import type { ApiErrorCode, ApiSuccess } from "@/lib/api/types";

export class ApiRouteError extends Error {
  code: ApiErrorCode;
  status: number;

  constructor(code: ApiErrorCode, message: string, status = API_ERROR_STATUS[code]) {
    super(message);
    this.name = "ApiRouteError";
    this.code = code;
    this.status = status;
  }
}

export function apiOk<T>(data: T, init?: ResponseInit) {
  const body: ApiSuccess<T> = { ok: true, data };
  return NextResponse.json(body, { status: init?.status ?? 200, headers: init?.headers });
}

export function apiError(code: ApiErrorCode, error: string, init?: ResponseInit) {
  return NextResponse.json(buildApiFailure(code, error), {
    status: init?.status ?? API_ERROR_STATUS[code],
    headers: init?.headers,
  });
}

export function handleApiError(error: unknown) {
  if (error instanceof ApiRouteError) {
    return apiError(error.code, error.message, { status: error.status });
  }

  console.error("[API] Unhandled route error", error);
  return apiError("server_error", "服务端处理失败。");
}

export async function readJsonBody<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    const body = (await request.json()) as T;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiRouteError("invalid_request", "请求 JSON 必须是对象。");
    }
    return body;
  } catch (error) {
    if (error instanceof ApiRouteError) throw error;
    throw new ApiRouteError("invalid_request", "请求 JSON 无效。");
  }
}

export async function withApiErrors(handler: () => Promise<Response> | Response) {
  try {
    return await handler();
  } catch (error) {
    return handleApiError(error);
  }
}
