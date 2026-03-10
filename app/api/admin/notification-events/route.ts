import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { dispatchPendingNotificationEvents } from "@/lib/notifications/dispatcher";

async function getAdminProfile() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("role,institution_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return { error: NextResponse.json({ error: "profile not found" }, { status: 403 }) };
  }

  if (profile.role !== "机构管理员") {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }

  return {
    supabase,
    actorId: user.id,
    institutionId: String(profile.institution_id ?? ""),
  };
}

export async function GET(request: Request) {
  try {
    const context = await getAdminProfile();
    if ("error" in context) return context.error;

    const { searchParams } = new URL(request.url);
    const limitRaw = Number(searchParams.get("limit") ?? "30");
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 30;

    const service = createSupabaseServiceClient();
    const { data, error } = await service
      .from("notification_events")
      .select(
        "id,institution_id,child_id,event_type,source,created_by,payload,status,retry_count,max_retries,next_retry_at,last_error,processed_at,created_at"
      )
      .eq("institution_id", context.institutionId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ events: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "fetch notification events failed" },
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

    const service = createSupabaseServiceClient();

    let childrenQuery = service
      .from("children")
      .select("id,institution_id,class_name")
      .eq("institution_id", context.institutionId);

    if (className) {
      childrenQuery = childrenQuery.eq("class_name", className);
    }

    const { data: children, error: childrenError } = await childrenQuery;
    if (childrenError) {
      return NextResponse.json({ error: childrenError.message }, { status: 500 });
    }

    if (!children || children.length === 0) {
      return NextResponse.json({ inserted: 0, events: [] });
    }

    const childIds = children.map((item) => item.id);

    const { data: checkins, error: checkinError } = await service
      .from("task_checkins")
      .select("child_id")
      .in("child_id", childIds)
      .eq("date", targetDate);

    if (checkinError) {
      return NextResponse.json({ error: checkinError.message }, { status: 500 });
    }

    const checkedChildIdSet = new Set((checkins ?? []).map((item) => String(item.child_id)));
    const pendingChildren = children.filter((item) => !checkedChildIdSet.has(String(item.id)));

    if (pendingChildren.length === 0) {
      return NextResponse.json({ inserted: 0, events: [] });
    }

    const rows = pendingChildren.map((item) => ({
      institution_id: context.institutionId,
      child_id: String(item.id),
      event_type: "task_checkin_pending",
      source: "admin_manual_enqueue",
      created_by: context.actorId,
      payload: { date: targetDate, class_name: String(item.class_name ?? "") },
    }));

    const { data: inserted, error: insertError } = await service
      .from("notification_events")
      .insert(rows)
      .select("id,institution_id,child_id,event_type,source,created_by,payload,status,processed_at,created_at");

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ inserted: inserted?.length ?? 0, events: inserted ?? [] }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "enqueue notification events failed" },
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

    const summary = await dispatchPendingNotificationEvents({
      institutionId: context.institutionId,
      limit,
    });

    return NextResponse.json({ summary });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "dispatch notification events failed" },
      { status: 500 }
    );
  }
}
