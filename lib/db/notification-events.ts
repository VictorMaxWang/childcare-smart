import "server-only";

import type { ResultSetHeader } from "mysql2/promise";
import type {
  AdminDispatchCreatePayload,
  AdminDispatchEvent,
  AdminDispatchUpdatePayload,
} from "@/lib/agent/admin-types";
import {
  dbQuery,
  decodeDatabaseJson,
  encodeDatabaseJson,
  withDbTransaction,
} from "@/lib/db/server";
import { normalizeAdminNotificationSource } from "@/lib/db/notification-event-source";

type NotificationEventRow = {
  id: string;
  institution_id: string;
  event_type: string;
  status: AdminDispatchEvent["status"];
  priority_item_id: string | null;
  title: string;
  summary: string;
  target_type: AdminDispatchEvent["targetType"];
  target_id: string;
  target_name: string;
  priority_level: AdminDispatchEvent["priorityLevel"];
  priority_score: number;
  recommended_owner_role: AdminDispatchEvent["recommendedOwnerRole"];
  recommended_owner_name: string | null;
  recommended_action: string;
  recommended_deadline: string;
  reason_text: string;
  evidence_json: unknown;
  source_json: unknown;
  created_by: string;
  updated_by: string;
  created_at: Date | string;
  updated_at: Date | string;
  completed_at: Date | string | null;
};

function createId(prefix: string) {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}`;
}

function formatDateValue(value: Date | string | null) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function mapRowToEvent(row: NotificationEventRow): AdminDispatchEvent {
  return {
    id: row.id,
    institutionId: row.institution_id,
    eventType: row.event_type,
    status: row.status,
    priorityItemId: row.priority_item_id ?? undefined,
    title: row.title,
    summary: row.summary,
    targetType: row.target_type,
    targetId: row.target_id,
    targetName: row.target_name,
    priorityLevel: row.priority_level,
    priorityScore: Number(row.priority_score ?? 0),
    recommendedOwnerRole: row.recommended_owner_role,
    recommendedOwnerName: row.recommended_owner_name ?? undefined,
    recommendedAction: row.recommended_action,
    recommendedDeadline: row.recommended_deadline,
    reasonText: row.reason_text,
    evidence: decodeDatabaseJson(row.evidence_json) ?? [],
    source: normalizeAdminNotificationSource(decodeDatabaseJson(row.source_json)),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: formatDateValue(row.created_at) ?? new Date().toISOString(),
    updatedAt: formatDateValue(row.updated_at) ?? new Date().toISOString(),
    completedAt: formatDateValue(row.completed_at),
  };
}

async function getNotificationEventById(institutionId: string, id: string) {
  const { rows } = await dbQuery<NotificationEventRow>(
    `
      select
        id,
        institution_id,
        event_type,
        status,
        priority_item_id,
        title,
        summary,
        target_type,
        target_id,
        target_name,
        priority_level,
        priority_score,
        recommended_owner_role,
        recommended_owner_name,
        recommended_action,
        recommended_deadline,
        reason_text,
        evidence_json,
        source_json,
        created_by,
        updated_by,
        created_at,
        updated_at,
        completed_at
      from admin_notification_events
      where institution_id = ? and id = ?
      limit 1
    `,
    [institutionId, id]
  );

  return rows[0] ? mapRowToEvent(rows[0]) : null;
}

export async function listNotificationEventsByInstitution(institutionId: string) {
  const { rows } = await dbQuery<NotificationEventRow>(
    `
      select
        id,
        institution_id,
        event_type,
        status,
        priority_item_id,
        title,
        summary,
        target_type,
        target_id,
        target_name,
        priority_level,
        priority_score,
        recommended_owner_role,
        recommended_owner_name,
        recommended_action,
        recommended_deadline,
        reason_text,
        evidence_json,
        source_json,
        created_by,
        updated_by,
        created_at,
        updated_at,
        completed_at
      from admin_notification_events
      where institution_id = ?
      order by
        case status
          when 'pending' then 0
          when 'in_progress' then 1
          else 2
        end asc,
        priority_score desc,
        updated_at desc
    `,
    [institutionId]
  );

  return rows.map(mapRowToEvent);
}

export async function createNotificationEvent(params: {
  id?: string;
  institutionId: string;
  actorId: string;
  payload: AdminDispatchCreatePayload;
}) {
  const id = params.id ?? createId("evt");

  await withDbTransaction(async (connection) => {
    await connection.execute<ResultSetHeader>(
      `
        insert into admin_notification_events (
          id,
          institution_id,
          event_type,
          status,
          priority_item_id,
          title,
          summary,
          target_type,
          target_id,
          target_name,
          priority_level,
          priority_score,
          recommended_owner_role,
          recommended_owner_name,
          recommended_action,
          recommended_deadline,
          reason_text,
          evidence_json,
          source_json,
          created_by,
          updated_by
        )
        values (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        params.institutionId,
        params.payload.eventType,
        params.payload.priorityItemId,
        params.payload.title,
        params.payload.summary,
        params.payload.targetType,
        params.payload.targetId,
        params.payload.targetName,
        params.payload.priorityLevel,
        params.payload.priorityScore,
        params.payload.recommendedOwnerRole,
        params.payload.recommendedOwnerName ?? null,
        params.payload.recommendedAction,
        params.payload.recommendedDeadline,
        params.payload.reasonText,
        encodeDatabaseJson(params.payload.evidence),
        encodeDatabaseJson(params.payload.source),
        params.actorId,
        params.actorId,
      ]
    );
  });

  return getNotificationEventById(params.institutionId, id);
}

export async function updateNotificationEvent(params: {
  institutionId: string;
  actorId: string;
  payload: AdminDispatchUpdatePayload;
}) {
  const updates: string[] = ["updated_by = ?"];
  const values: Array<string | null> = [params.actorId];

  if (params.payload.status) {
    updates.push("status = ?");
    values.push(params.payload.status);

    if (params.payload.status === "completed" && typeof params.payload.completedAt === "undefined") {
      updates.push("completed_at = current_timestamp");
    }
  }

  if (typeof params.payload.recommendedOwnerName !== "undefined") {
    updates.push("recommended_owner_name = ?");
    values.push(params.payload.recommendedOwnerName || null);
  }

  if (typeof params.payload.summary !== "undefined") {
    updates.push("summary = ?");
    values.push(params.payload.summary);
  }

  if (typeof params.payload.completedAt !== "undefined") {
    if (params.payload.completedAt === null) {
      updates.push("completed_at = null");
    } else {
      updates.push("completed_at = ?");
      values.push(params.payload.completedAt);
    }
  }

  if (updates.length === 1) {
    return getNotificationEventById(params.institutionId, params.payload.id);
  }

  values.push(params.institutionId, params.payload.id);

  await withDbTransaction(async (connection) => {
    await connection.execute<ResultSetHeader>(
      `
        update admin_notification_events
        set ${updates.join(", ")}
        where institution_id = ? and id = ?
      `,
      values
    );
  });

  return getNotificationEventById(params.institutionId, params.payload.id);
}
