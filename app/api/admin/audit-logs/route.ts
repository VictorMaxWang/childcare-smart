import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type AuditLogRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  actor_id: string;
};

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
    institutionId: String(profile.institution_id ?? ""),
  };
}

export async function GET(request: Request) {
  try {
    const context = await getAdminProfile();
    if ("error" in context) return context.error;

    const { searchParams } = new URL(request.url);
    const limitRaw = Number(searchParams.get("limit") ?? "20");
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 20;

    const { data, error } = await context.supabase
      .from("master_data_audit_logs")
      .select("id,action,entity_type,entity_id,payload,created_at,actor_id")
      .eq("institution_id", context.institutionId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const logs = Array.isArray(data) ? (data as AuditLogRow[]) : [];
    const actorIds = Array.from(new Set(logs.map((item) => item.actor_id).filter(Boolean)));
    let actorNameMap: Record<string, string> = {};

    if (actorIds.length > 0) {
      const service = createSupabaseServiceClient();
      const { data: profiles } = await service
        .from("user_profiles")
        .select("id,name")
        .eq("institution_id", context.institutionId)
        .in("id", actorIds);

      actorNameMap = (profiles ?? []).reduce<Record<string, string>>((acc, profile) => {
        const id = String(profile.id ?? "");
        const name = String(profile.name ?? "").trim();
        if (id) {
          acc[id] = name || "未知用户";
        }
        return acc;
      }, {});
    }

    return NextResponse.json({
      logs: logs.map((item) => ({
        ...item,
        actor_name: actorNameMap[item.actor_id] ?? null,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "fetch audit logs failed" },
      { status: 500 }
    );
  }
}