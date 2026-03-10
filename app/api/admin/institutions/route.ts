import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

export async function GET() {
  try {
    const context = await getAdminProfile();
    if ("error" in context) return context.error;

    const { data, error } = await context.supabase
      .from("institutions")
      .select("id,name,created_at")
      .eq("id", context.institutionId)
      .order("id", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ institutions: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "fetch institutions failed" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await getAdminProfile();
    if ("error" in context) return context.error;

    const payload = (await request.json()) as { name?: string };
    const name = String(payload.name ?? "").trim();

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const { data, error } = await context.supabase
      .from("institutions")
      .update({ name })
      .eq("id", context.institutionId)
      .select("id,name,created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await context.supabase.from("master_data_audit_logs").insert({
      institution_id: context.institutionId,
      actor_id: context.actorId,
      action: "institution_name_updated",
      entity_type: "institution",
      entity_id: context.institutionId,
      payload: { name },
    });

    return NextResponse.json({ institution: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "update institution failed" },
      { status: 500 }
    );
  }
}