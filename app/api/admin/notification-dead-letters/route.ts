import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

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
    institutionId: String(profile.institution_id ?? ""),
  };
}

export async function GET(request: Request) {
  try {
    const context = await getAdminProfile();
    if ("error" in context) return context.error;

    const { searchParams } = new URL(request.url);
    const limitRaw = Number(searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 50;

    const service = createSupabaseServiceClient();
    const { data, error } = await service
      .from("notification_dead_letters")
      .select(
        "id,event_id,institution_id,child_id,event_type,reason,payload,retry_count,max_retries,resolved,resolved_at,created_at"
      )
      .eq("institution_id", context.institutionId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ deadLetters: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "fetch dead letters failed" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await getAdminProfile();
    if ("error" in context) return context.error;

    const payload = (await request.json()) as {
      action?: "requeue" | "resolve";
      ids?: string[];
      maxRetries?: number;
    };

    const action = payload.action;
    const ids = Array.isArray(payload.ids) ? payload.ids.map((id) => String(id).trim()).filter(Boolean) : [];

    if (!action || ids.length === 0) {
      return NextResponse.json({ error: "action and ids are required" }, { status: 400 });
    }

    const service = createSupabaseServiceClient();

    const { data: rows, error: listError } = await service
      .from("notification_dead_letters")
      .select("id,event_id,max_retries")
      .eq("institution_id", context.institutionId)
      .in("id", ids);

    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    const targets = rows ?? [];
    if (targets.length === 0) {
      return NextResponse.json({ updated: 0 });
    }

    if (action === "resolve") {
      const nowIso = new Date().toISOString();
      const { error: resolveError } = await service
        .from("notification_dead_letters")
        .update({ resolved: true, resolved_at: nowIso })
        .eq("institution_id", context.institutionId)
        .in("id", targets.map((item) => item.id));

      if (resolveError) {
        return NextResponse.json({ error: resolveError.message }, { status: 500 });
      }

      return NextResponse.json({ updated: targets.length, action: "resolve" });
    }

    const eventIds = targets.map((item) => String(item.event_id));
    const nowIso = new Date().toISOString();
    const retryValue = Number.isFinite(Number(payload.maxRetries))
      ? Math.max(1, Math.min(20, Math.floor(Number(payload.maxRetries))))
      : null;

    const eventPatch: Record<string, unknown> = {
      status: "pending",
      retry_count: 0,
      next_retry_at: nowIso,
      last_error: null,
      processed_at: null,
    };

    if (retryValue) {
      eventPatch.max_retries = retryValue;
    }

    const { error: eventError } = await service
      .from("notification_events")
      .update(eventPatch)
      .eq("institution_id", context.institutionId)
      .in("id", eventIds);

    if (eventError) {
      return NextResponse.json({ error: eventError.message }, { status: 500 });
    }

    const { error: dlError } = await service
      .from("notification_dead_letters")
      .update({ resolved: true, resolved_at: nowIso })
      .eq("institution_id", context.institutionId)
      .in("id", targets.map((item) => item.id));

    if (dlError) {
      return NextResponse.json({ error: dlError.message }, { status: 500 });
    }

    return NextResponse.json({ updated: targets.length, action: "requeue" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "update dead letters failed" },
      { status: 500 }
    );
  }
}
