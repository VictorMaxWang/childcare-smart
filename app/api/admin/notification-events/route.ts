import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "../../../../lib/auth/account-server";
import type { AdminDispatchCreatePayload, AdminDispatchUpdatePayload } from "../../../../lib/agent/admin-types";
import { AUTH_SESSION_SECRET_CONFIG_ERROR_MESSAGE, MissingAuthSessionSecretError } from "../../../../lib/auth/session-config";
import { DatabaseConfigError } from "../../../../lib/db/server";
import {
  createNotificationEvent,
  listNotificationEventsByInstitution,
  updateNotificationEvent,
} from "../../../../lib/db/notification-events";
import {
  ADMIN_NOTIFICATION_EVENTS_AUTH_UNAVAILABLE_REASON_CODE,
  ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_MESSAGE,
  ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_REASON_CODE,
  buildUnavailableResponse,
} from "./contract";

export const runtime = "nodejs";

const ROLE_ADMIN = "\u673a\u6784\u7ba1\u7406\u5458";

async function getAdminProfile() {
  try {
    const user = await getCurrentSessionUser();
    if (!user) {
      return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
    }

    if (user.role !== ROLE_ADMIN) {
      return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
    }

    if (!user.institutionId) {
      return { error: NextResponse.json({ error: "institution not found" }, { status: 403 }) };
    }

    return { actorId: user.id, institutionId: user.institutionId };
  } catch (error) {
    if (error instanceof MissingAuthSessionSecretError) {
      return {
        error: buildUnavailableResponse(
          AUTH_SESSION_SECRET_CONFIG_ERROR_MESSAGE,
          ADMIN_NOTIFICATION_EVENTS_AUTH_UNAVAILABLE_REASON_CODE
        ),
      };
    }

    if (error instanceof DatabaseConfigError) {
      return {
        error: buildUnavailableResponse(
          ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_MESSAGE,
          ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_REASON_CODE
        ),
      };
    }

    console.error("[NOTIFICATION_EVENTS] Failed to resolve admin profile", error);
    return { error: NextResponse.json({ error: "failed to load session" }, { status: 500 }) };
  }
}

function isCreatePayload(value: unknown): value is AdminDispatchCreatePayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;

  return (
    typeof payload.eventType === "string" &&
    typeof payload.priorityItemId === "string" &&
    typeof payload.title === "string" &&
    typeof payload.summary === "string" &&
    (payload.targetType === "child" ||
      payload.targetType === "class" ||
      payload.targetType === "issue" ||
      payload.targetType === "family") &&
    typeof payload.targetId === "string" &&
    typeof payload.targetName === "string" &&
    (payload.priorityLevel === "P1" || payload.priorityLevel === "P2" || payload.priorityLevel === "P3") &&
    typeof payload.priorityScore === "number" &&
    (payload.recommendedOwnerRole === "teacher" ||
      payload.recommendedOwnerRole === "parent" ||
      payload.recommendedOwnerRole === "admin") &&
    typeof payload.recommendedAction === "string" &&
    typeof payload.recommendedDeadline === "string" &&
    typeof payload.reasonText === "string" &&
    Array.isArray(payload.evidence) &&
    payload.source !== null &&
    typeof payload.source === "object"
  );
}

function isUpdatePayload(value: unknown): value is AdminDispatchUpdatePayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;

  if (typeof payload.id !== "string") return false;
  if (
    typeof payload.status !== "undefined" &&
    payload.status !== "pending" &&
    payload.status !== "in_progress" &&
    payload.status !== "completed"
  ) {
    return false;
  }

  if (typeof payload.recommendedOwnerName !== "undefined" && typeof payload.recommendedOwnerName !== "string") {
    return false;
  }

  if (typeof payload.summary !== "undefined" && typeof payload.summary !== "string") {
    return false;
  }

  if (
    typeof payload.completedAt !== "undefined" &&
    payload.completedAt !== null &&
    typeof payload.completedAt !== "string"
  ) {
    return false;
  }

  return true;
}

export async function GET() {
  try {
    const context = await getAdminProfile();
    if ("error" in context) return context.error;
    const items = await listNotificationEventsByInstitution(context.institutionId);
    return NextResponse.json({ items, available: true }, { status: 200 });
  } catch (error) {
    if (error instanceof DatabaseConfigError) {
      return buildUnavailableResponse(
        ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_MESSAGE,
        ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_REASON_CODE
      );
    }

    console.error("[NOTIFICATION_EVENTS] Unexpected GET error", error);
    return NextResponse.json({ error: "failed to load notification events" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let payload: AdminDispatchCreatePayload | null = null;

  try {
    payload = (await request.json()) as AdminDispatchCreatePayload;
  } catch (error) {
    console.error("[NOTIFICATION_EVENTS] Invalid POST payload", error);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isCreatePayload(payload)) {
    return NextResponse.json({ error: "Invalid notification event payload" }, { status: 400 });
  }

  try {
    const context = await getAdminProfile();
    if ("error" in context) return context.error;

    const item = await createNotificationEvent({
      institutionId: context.institutionId,
      actorId: context.actorId,
      payload,
    });

    if (!item) {
      return NextResponse.json({ error: "failed to create notification event" }, { status: 500 });
    }

    return NextResponse.json({ item, available: true }, { status: 201 });
  } catch (error) {
    if (error instanceof DatabaseConfigError) {
      return buildUnavailableResponse(
        ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_MESSAGE,
        ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_REASON_CODE
      );
    }

    console.error("[NOTIFICATION_EVENTS] Unexpected POST error", error);
    return NextResponse.json({ error: "failed to create notification event" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  let payload: AdminDispatchUpdatePayload | null = null;

  try {
    payload = (await request.json()) as AdminDispatchUpdatePayload;
  } catch (error) {
    console.error("[NOTIFICATION_EVENTS] Invalid PATCH payload", error);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isUpdatePayload(payload)) {
    return NextResponse.json({ error: "Invalid notification event payload" }, { status: 400 });
  }

  try {
    const context = await getAdminProfile();
    if ("error" in context) return context.error;

    const item = await updateNotificationEvent({
      institutionId: context.institutionId,
      actorId: context.actorId,
      payload,
    });

    if (!item) {
      return NextResponse.json({ error: "notification event not found" }, { status: 404 });
    }

    return NextResponse.json({ item, available: true }, { status: 200 });
  } catch (error) {
    if (error instanceof DatabaseConfigError) {
      return buildUnavailableResponse(
        ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_MESSAGE,
        ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_REASON_CODE
      );
    }

    console.error("[NOTIFICATION_EVENTS] Unexpected PATCH error", error);
    return NextResponse.json({ error: "failed to update notification event" }, { status: 500 });
  }
}
