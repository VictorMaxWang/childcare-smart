import { NextResponse } from "next/server";

export const ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_MESSAGE = "通知派单暂不可用";
export const ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_REASON_CODE =
  "notification_store_unavailable";
export const ADMIN_NOTIFICATION_EVENTS_AUTH_UNAVAILABLE_REASON_CODE =
  "auth_session_secret_config_error";

interface AdminNotificationEventsUnavailableBody {
  available: false;
  reasonCode: string;
  message: string;
  error: string;
}

export function buildUnavailableResponse(message: string, reasonCode: string) {
  const body: AdminNotificationEventsUnavailableBody = {
    available: false,
    reasonCode,
    message,
    error: message,
  };

  return NextResponse.json(body, { status: 503 });
}
