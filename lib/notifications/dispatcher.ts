import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createNotificationProvider } from "@/lib/notifications/provider";

type NotificationEventRow = {
  id: string;
  institution_id: string;
  child_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  status: "pending" | "processed" | "failed";
  retry_count: number;
  max_retries: number;
  next_retry_at: string | null;
};

type RecipientRow = {
  id: string;
  name: string;
  wechat_openid?: string | null;
};

export type DispatchSummary = {
  scanned: number;
  processed: number;
  failed: number;
  skipped: number;
  deadLettered: number;
};

function getNextRetryAt(retryCount: number) {
  const delayMinutes = Math.min(5 * 2 ** Math.max(retryCount - 1, 0), 120);
  const next = new Date(Date.now() + delayMinutes * 60 * 1000);
  return next.toISOString();
}

async function archiveDeadLetter(input: {
  event: NotificationEventRow;
  institutionId: string;
  errorMessage: string;
}) {
  const service = createSupabaseServiceClient();

  await service.from("notification_dead_letters").upsert(
    {
      event_id: input.event.id,
      institution_id: input.institutionId,
      child_id: input.event.child_id,
      event_type: input.event.event_type,
      reason: input.errorMessage,
      payload: input.event.payload ?? {},
      retry_count: input.event.retry_count,
      max_retries: input.event.max_retries,
    },
    { onConflict: "event_id" }
  );
}

async function markEventFailed(input: {
  event: NotificationEventRow;
  institutionId: string;
  providerName: string;
  errorMessage: string;
  recipients: number;
}) {
  const service = createSupabaseServiceClient();
  const nextRetryCount = (input.event.retry_count ?? 0) + 1;
  const maxRetries = Math.max(Number(input.event.max_retries ?? 3), 1);
  const exhausted = nextRetryCount >= maxRetries;

  await service
    .from("notification_events")
    .update({
      status: "failed",
      processed_at: new Date().toISOString(),
      retry_count: nextRetryCount,
      next_retry_at: exhausted ? null : getNextRetryAt(nextRetryCount),
      last_error: input.errorMessage,
      payload: {
        ...(input.event.payload ?? {}),
        dispatch: {
          provider: input.providerName,
          recipients: input.recipients,
          error: input.errorMessage,
          retry_count: nextRetryCount,
          max_retries: maxRetries,
          exhausted,
        },
      },
    })
    .eq("id", input.event.id)
    .eq("institution_id", input.institutionId);

  if (exhausted) {
    await archiveDeadLetter({
      event: {
        ...input.event,
        retry_count: nextRetryCount,
        max_retries: maxRetries,
      },
      institutionId: input.institutionId,
      errorMessage: input.errorMessage,
    });
  }

  return { exhausted };
}

function uniqueByUserId(items: RecipientRow[]) {
  const seen = new Set<string>();
  const next: RecipientRow[] = [];

  for (const item of items) {
    const id = String(item.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    next.push({
      id,
      name: String(item.name ?? "未命名用户"),
      wechat_openid: item.wechat_openid ? String(item.wechat_openid) : null,
    });
  }

  return next;
}

async function resolveRecipients(childId: string | null): Promise<RecipientRow[]> {
  if (!childId) return [];

  const service = createSupabaseServiceClient();

  const [{ data: child }, { data: parentLinks }] = await Promise.all([
    service.from("children").select("parent_user_id").eq("id", childId).single(),
    service.from("parent_children").select("parent_user_id").eq("child_id", childId),
  ]);

  const parentIdSet = new Set<string>();
  if (child?.parent_user_id) {
    parentIdSet.add(String(child.parent_user_id));
  }
  (parentLinks ?? []).forEach((item) => {
    if (item.parent_user_id) {
      parentIdSet.add(String(item.parent_user_id));
    }
  });

  const parentIds = Array.from(parentIdSet);
  if (parentIds.length === 0) return [];

  const { data: profiles } = await service
    .from("user_profiles")
    .select("id,name,wechat_openid")
    .in("id", parentIds)
    .eq("role", "家长");

  return uniqueByUserId(
    (profiles ?? []).map((item) => ({
      id: String(item.id),
      name: String(item.name ?? ""),
      wechat_openid: item.wechat_openid ? String(item.wechat_openid) : null,
    }))
  );
}

export async function dispatchPendingNotificationEvents(input: {
  institutionId: string;
  limit: number;
}) {
  const service = createSupabaseServiceClient();
  const provider = createNotificationProvider();
  const nowIso = new Date().toISOString();

  const { data: pendingEvents, error: pendingError } = await service
    .from("notification_events")
    .select("id,institution_id,child_id,event_type,payload,status,retry_count,max_retries,next_retry_at")
    .eq("institution_id", input.institutionId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(input.limit);

  if (pendingError) {
    throw new Error(pendingError.message);
  }

  const { data: failedEvents, error: failedError } = await service
    .from("notification_events")
    .select("id,institution_id,child_id,event_type,payload,status,retry_count,max_retries,next_retry_at")
    .eq("institution_id", input.institutionId)
    .eq("status", "failed")
    .lte("next_retry_at", nowIso)
    .order("next_retry_at", { ascending: true })
    .limit(input.limit * 2);

  if (failedError) {
    throw new Error(failedError.message);
  }

  const pendingRows = Array.isArray(pendingEvents) ? (pendingEvents as NotificationEventRow[]) : [];
  const retryRows = Array.isArray(failedEvents)
    ? (failedEvents as NotificationEventRow[]).filter(
        (item) => Number(item.retry_count ?? 0) < Number(item.max_retries ?? 3)
      )
    : [];

  const rows = [...pendingRows, ...retryRows]
    .sort((a, b) => {
      const aTime = a.next_retry_at ? new Date(a.next_retry_at).getTime() : 0;
      const bTime = b.next_retry_at ? new Date(b.next_retry_at).getTime() : 0;
      return aTime - bTime;
    })
    .slice(0, input.limit);

  const summary: DispatchSummary = {
    scanned: rows.length,
    processed: 0,
    failed: 0,
    skipped: 0,
    deadLettered: 0,
  };

  for (const event of rows) {
    const recipients = await resolveRecipients(event.child_id);

    if (recipients.length === 0) {
      summary.skipped += 1;
      const failedResult = await markEventFailed({
        event,
        institutionId: input.institutionId,
        providerName: provider.name,
        errorMessage: "no recipients",
        recipients: 0,
      });
      summary.failed += 1;
      if (failedResult.exhausted) {
        summary.deadLettered += 1;
      }
      continue;
    }

    const results = await Promise.all(
      recipients.map((recipient) =>
        provider.send({
          event: {
            id: event.id,
            eventType: event.event_type,
            childId: event.child_id,
            payload: event.payload ?? {},
          },
          recipient: {
            userId: recipient.id,
            name: recipient.name,
            wechatOpenId: recipient.wechat_openid ?? null,
          },
        })
      )
    );

    const failedResults = results.filter((item) => !item.ok);

    if (failedResults.length === 0) {
      await service
        .from("notification_events")
        .update({
          status: "processed",
          processed_at: new Date().toISOString(),
          retry_count: 0,
          next_retry_at: null,
          last_error: null,
          payload: {
            ...(event.payload ?? {}),
            dispatch: {
              provider: provider.name,
              recipients: recipients.length,
              failed: 0,
              messages: results.map((item) => ({
                ok: item.ok,
                message_id: item.messageId ?? null,
                error: item.error ?? null,
                provider: item.provider,
              })),
            },
          },
        })
        .eq("id", event.id)
        .eq("institution_id", input.institutionId);

      summary.processed += 1;
    } else {
      const firstError = failedResults[0]?.error ?? "notification provider send failed";
      const failedResult = await markEventFailed({
        event,
        institutionId: input.institutionId,
        providerName: provider.name,
        errorMessage: firstError,
        recipients: recipients.length,
      });
      summary.failed += 1;
      if (failedResult.exhausted) {
        summary.deadLettered += 1;
      }
    }
  }

  return summary;
}
