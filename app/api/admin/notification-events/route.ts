import { NextResponse } from "next/server";
import type { SessionUser } from "@/lib/auth/accounts";
import type { AdminDispatchCreatePayload, AdminDispatchEvent, AdminDispatchUpdatePayload } from "@/lib/agent/admin-types";
import { AUTH_SESSION_SECRET_CONFIG_ERROR_MESSAGE, MissingAuthSessionSecretError } from "@/lib/auth/session-config";
import { DatabaseConfigError } from "@/lib/db/server";
import {
  createNotificationEvent,
  listNotificationEventsByInstitution,
  updateNotificationEvent,
} from "@/lib/db/notification-events";
import { AppDataService } from "@/lib/server/app-data-service";
import { DefaultAppDataRepository } from "@/lib/server/app-data-repository";
import { ApiRouteError } from "@/lib/server/api-errors";
import { resolveRequestSession } from "@/lib/server/session";
import {
  ADMIN_NOTIFICATION_EVENTS_AUTH_UNAVAILABLE_REASON_CODE,
  ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_MESSAGE,
  ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_REASON_CODE,
  buildUnavailableResponse,
} from "./contract";

export const runtime = "nodejs";

const ROLE_ADMIN = "\u673a\u6784\u7ba1\u7406\u5458";

async function getAdminContext(request: Request) {
  try {
    const session = await resolveRequestSession(request);
    if (!session) {
      return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
    }

    if (session.user.role !== ROLE_ADMIN) {
      return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
    }

    if (!session.user.institutionId) {
      return { error: NextResponse.json({ error: "institution not found" }, { status: 403 }) };
    }

    return {
      actorId: session.user.id,
      institutionId: session.user.institutionId,
      user: session.user,
      service: new AppDataService(session.user, new DefaultAppDataRepository()),
    };
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

    console.error("[NOTIFICATION_EVENTS] Failed to resolve admin context", error);
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

  if (typeof payload.completionSummary !== "undefined" && typeof payload.completionSummary !== "string") {
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

function sortEvents(events: AdminDispatchEvent[]) {
  const statusRank: Record<AdminDispatchEvent["status"], number> = {
    pending: 0,
    in_progress: 1,
    completed: 2,
  };
  return [...events].sort((left, right) => {
    const statusDiff = statusRank[left.status] - statusRank[right.status];
    if (statusDiff !== 0) return statusDiff;
    if (right.priorityScore !== left.priorityScore) return right.priorityScore - left.priorityScore;
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function decorateLegacyEvent(event: AdminDispatchEvent): AdminDispatchEvent {
  return {
    ...event,
    sourceType: event.source?.sourceType,
    sourceId: event.source?.sourceId ?? event.id,
    assigneeRole: event.recommendedOwnerRole,
    assigneeName: event.recommendedOwnerName,
    assignmentId: event.source?.sourceType === "admin_dispatch" ? event.id : undefined,
    taskId: event.source?.taskId,
  };
}

function mergeCanonicalAndLegacyEvents(canonicalEvents: AdminDispatchEvent[], legacyEvents: AdminDispatchEvent[]) {
  const byId = new Map<string, AdminDispatchEvent>();
  for (const event of legacyEvents.map(decorateLegacyEvent)) {
    byId.set(event.id, event);
  }
  for (const event of canonicalEvents) {
    byId.set(event.id, event);
  }
  return sortEvents(Array.from(byId.values()));
}

function serviceErrorResponse(error: unknown) {
  if (error instanceof ApiRouteError) {
    if (error.code === "provider_unavailable") {
      return buildUnavailableResponse(
        ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_MESSAGE,
        ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_REASON_CODE
      );
    }
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof DatabaseConfigError) {
    return buildUnavailableResponse(
      ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_MESSAGE,
      ADMIN_NOTIFICATION_EVENTS_UNAVAILABLE_REASON_CODE
    );
  }
  console.error("[NOTIFICATION_EVENTS] Unexpected canonical dispatch error", error);
  return NextResponse.json({ error: "failed to process notification events" }, { status: 500 });
}

async function listLegacyEvents(user: SessionUser, institutionId: string) {
  if (user.accountKind === "demo") {
    return { items: [] as AdminDispatchEvent[], mirrorAvailable: false };
  }

  try {
    return {
      items: await listNotificationEventsByInstitution(institutionId),
      mirrorAvailable: true,
    };
  } catch (error) {
    if (error instanceof DatabaseConfigError) {
      return { items: [] as AdminDispatchEvent[], mirrorAvailable: false };
    }
    throw error;
  }
}

async function mirrorCreatedEvent(params: {
  user: SessionUser;
  institutionId: string;
  actorId: string;
  event: AdminDispatchEvent;
  payload: AdminDispatchCreatePayload;
}) {
  if (params.user.accountKind === "demo") return false;
  const eventSource = params.event.source ?? {};
  try {
    await createNotificationEvent({
      id: params.event.id,
      institutionId: params.institutionId,
      actorId: params.actorId,
      payload: {
        ...params.payload,
        source: {
          ...params.payload.source,
          relatedChildIds: eventSource.relatedChildIds ?? params.payload.source.relatedChildIds,
          relatedClassNames: eventSource.relatedClassNames ?? params.payload.source.relatedClassNames,
          consultationId: eventSource.consultationId ?? params.payload.source.consultationId,
          relatedConsultationIds: eventSource.relatedConsultationIds ?? params.payload.source.relatedConsultationIds,
          taskId: eventSource.taskId ?? params.payload.source.taskId,
          sourceType: eventSource.sourceType ?? params.payload.source.sourceType,
          sourceId: eventSource.sourceId ?? params.payload.source.sourceId,
          relatedTaskIds: eventSource.relatedTaskIds ?? params.payload.source.relatedTaskIds,
          escalation: eventSource.escalation ?? params.payload.source.escalation,
        },
      },
    });
    return true;
  } catch (error) {
    if (error instanceof DatabaseConfigError) return false;
    console.error("[NOTIFICATION_EVENTS] Failed to mirror canonical dispatch create", error);
    return false;
  }
}

async function mirrorUpdatedEvent(params: {
  user: SessionUser;
  institutionId: string;
  actorId: string;
  payload: AdminDispatchUpdatePayload;
}) {
  if (params.user.accountKind === "demo") return false;
  try {
    await updateNotificationEvent({
      institutionId: params.institutionId,
      actorId: params.actorId,
      payload: params.payload,
    });
    return true;
  } catch (error) {
    if (error instanceof DatabaseConfigError) return false;
    console.error("[NOTIFICATION_EVENTS] Failed to mirror canonical dispatch update", error);
    return false;
  }
}

export async function GET(request: Request) {
  const context = await getAdminContext(request);
  if ("error" in context) return context.error;

  try {
    const canonicalEvents = await context.service.listAdminDispatchEvents();
    const legacy = await listLegacyEvents(context.user, context.institutionId);
    return NextResponse.json(
      {
        items: mergeCanonicalAndLegacyEvents(canonicalEvents, legacy.items),
        available: true,
        source: "canonical_task",
        mirrorAvailable: legacy.mirrorAvailable,
      },
      { status: 200 }
    );
  } catch (error) {
    return serviceErrorResponse(error);
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

  const context = await getAdminContext(request);
  if ("error" in context) return context.error;

  try {
    const item = await context.service.createAdminDispatch(payload);
    const mirrorAvailable = await mirrorCreatedEvent({
      user: context.user,
      institutionId: context.institutionId,
      actorId: context.actorId,
      event: item,
      payload,
    });

    return NextResponse.json(
      { item, available: true, source: "canonical_task", mirrorAvailable },
      { status: 201 }
    );
  } catch (error) {
    return serviceErrorResponse(error);
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

  const context = await getAdminContext(request);
  if ("error" in context) return context.error;

  try {
    const item = await context.service.updateAdminDispatchStatus(payload.id, payload);
    const mirrorAvailable = await mirrorUpdatedEvent({
      user: context.user,
      institutionId: context.institutionId,
      actorId: context.actorId,
      payload,
    });

    return NextResponse.json(
      { item, available: true, source: "canonical_task", mirrorAvailable },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof ApiRouteError && error.code === "not_found" && context.user.accountKind !== "demo") {
      try {
        const item = await updateNotificationEvent({
          institutionId: context.institutionId,
          actorId: context.actorId,
          payload,
        });
        if (item) return NextResponse.json({ item: decorateLegacyEvent(item), available: true, source: "legacy_db" }, { status: 200 });
      } catch (legacyError) {
        if (!(legacyError instanceof DatabaseConfigError)) {
          console.error("[NOTIFICATION_EVENTS] Legacy PATCH fallback failed", legacyError);
        }
      }
    }
    return serviceErrorResponse(error);
  }
}
