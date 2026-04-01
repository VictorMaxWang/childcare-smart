import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/account-server";
import { getServerSupabaseClient } from "@/lib/supabase/server";

type ChildRow = {
  id: string | number;
  institution_id?: string | null;
  class_name?: string | null;
};

type TaskCheckinRow = {
  child_id: string | number | null;
};

type NotificationEventRow = {
  id: string | number;
  retry_count?: number | null;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

async function getAdminProfile() {
  const user = await getCurrentSessionUser();
  if (!user) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  if (user.role !== "机构管理员") {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }

  if (!user.institutionId) {
    return { error: NextResponse.json({ error: "institution not found" }, { status: 403 }) };
  }

  const supabase = getServerSupabaseClient();
  if (!supabase) {
    return { error: NextResponse.json({ error: "supabase is not configured" }, { status: 503 }) };
  }

  return {
    supabase,
    actorId: user.id,
    institutionId: user.institutionId,
  };
}

export async function GET(request: Request) {
  try {
    const context = await getAdminProfile();
    if ("error" in context) return context.error;

    const { searchParams } = new URL(request.url);
    const limitRaw = Number(searchParams.get("limit") ?? "30");
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 30;

    const { data, error } = await context.supabase
      .from("notification_events")
      .select(
        "id,institution_id,child_id,event_type,source,created_by,payload,status,retry_count,max_retries,next_retry_at,last_error,processed_at,created_at"
      )
      .eq("institution_id", context.institutionId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[NOTIFICATION_EVENTS] Failed to fetch events", error);
      return NextResponse.json({ error: "获取通知事件失败" }, { status: 500 });
    }

    return NextResponse.json({ events: data ?? [] });
  } catch (error) {
    console.error("[NOTIFICATION_EVENTS] Unexpected GET error", error);
    return NextResponse.json(
      { error: "获取通知事件失败" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const context = await getAdminProfile();
    if ("error" in context) return context.error;

    const payload = (await request.json()) as { date?: string; className?: string };
    const targetDate = String(payload.date ?? "").trim();
    const className = String(payload.className ?? "").trim();

    if (!targetDate) {
      return NextResponse.json({ error: "date is required, format: YYYY-MM-DD" }, { status: 400 });
    }

    if (!DATE_PATTERN.test(targetDate)) {
      return NextResponse.json({ error: "date format is invalid, expected YYYY-MM-DD" }, { status: 400 });
    }

    let childrenQuery = context.supabase
      .from("children")
      .select("id,institution_id,class_name")
      .eq("institution_id", context.institutionId);

    if (className) {
      childrenQuery = childrenQuery.eq("class_name", className);
    }

    const { data: children, error: childrenError } = await childrenQuery;
    if (childrenError) {
      console.error("[NOTIFICATION_EVENTS] Failed to load children", childrenError);
      return NextResponse.json({ error: "查询幼儿列表失败" }, { status: 500 });
    }

    if (!children || children.length === 0) {
      return NextResponse.json({ inserted: 0, events: [] });
    }

    const childRows = children as ChildRow[];
    const childIds = childRows.map((item: ChildRow) => item.id);

    const { data: checkins, error: checkinError } = await context.supabase
      .from("task_checkins")
      .select("child_id")
      .in("child_id", childIds)
      .eq("date", targetDate);

    if (checkinError) {
      console.error("[NOTIFICATION_EVENTS] Failed to load checkins", checkinError);
      return NextResponse.json({ error: "查询任务签到失败" }, { status: 500 });
    }

    const checkedChildIdSet = new Set(
      ((checkins ?? []) as TaskCheckinRow[]).map((item: TaskCheckinRow) => String(item.child_id))
    );
    const pendingChildren = childRows.filter((item: ChildRow) => !checkedChildIdSet.has(String(item.id)));

    if (pendingChildren.length === 0) {
      return NextResponse.json({ inserted: 0, events: [] });
    }

    const rows = pendingChildren.map((item: ChildRow) => ({
      institution_id: context.institutionId,
      child_id: String(item.id),
      event_type: "task_checkin_pending",
      source: "admin_manual_enqueue",
      created_by: context.actorId,
      payload: { date: targetDate, class_name: String(item.class_name ?? "") },
    }));

    const { data: inserted, error: insertError } = await context.supabase
      .from("notification_events")
      .insert(rows)
      .select("id,institution_id,child_id,event_type,source,created_by,payload,status,processed_at,created_at");

    if (insertError) {
      console.error("[NOTIFICATION_EVENTS] Failed to insert events", insertError);
      return NextResponse.json({ error: "创建通知事件失败" }, { status: 500 });
    }

    return NextResponse.json({ inserted: inserted?.length ?? 0, events: inserted ?? [] }, { status: 201 });
  } catch (error) {
    console.error("[NOTIFICATION_EVENTS] Unexpected POST error", error);
    return NextResponse.json(
      { error: "创建通知事件失败" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await getAdminProfile();
    if ("error" in context) return context.error;

    const payload = (await request.json()) as { limit?: number };
    const limitRaw = Number(payload.limit ?? 30);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 30;

    const { data: pendingEvents, error: fetchError } = await context.supabase
      .from("notification_events")
      .select("id,retry_count")
      .eq("institution_id", context.institutionId)
      .in("status", ["pending", "queued"])
      .order("created_at", { ascending: true })
      .limit(limit);

    if (fetchError) {
      console.error("[NOTIFICATION_EVENTS] Failed to fetch pending events", fetchError);
      return NextResponse.json({ error: "拉取待处理事件失败" }, { status: 500 });
    }

    const eventRows = (pendingEvents ?? []) as NotificationEventRow[];
    if (eventRows.length === 0) {
      return NextResponse.json({ summary: { fetched: 0, processed: 0, failed: 0 } });
    }

    const now = new Date().toISOString();
    let processed = 0;

    for (const event of eventRows) {
      const { error: updateError } = await context.supabase
        .from("notification_events")
        .update({
          status: "processed",
          processed_at: now,
          retry_count: Number(event.retry_count ?? 0),
          last_error: null,
        })
        .eq("id", event.id);

      if (!updateError) {
        processed += 1;
      }
    }

    const summary = {
      fetched: eventRows.length,
      processed,
      failed: eventRows.length - processed,
    };

    return NextResponse.json({ summary });
  } catch (error) {
    console.error("[NOTIFICATION_EVENTS] Unexpected PATCH error", error);
    return NextResponse.json(
      { error: "处理通知事件失败" },
      { status: 500 }
    );
  }
}
