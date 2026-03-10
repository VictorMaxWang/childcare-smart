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
    supabase,
    actorId: user.id,
    institutionId: String(profile.institution_id ?? ""),
  };
}

export async function GET() {
  try {
    const context = await getAdminProfile();
    if ("error" in context) return context.error;

    const service = createSupabaseServiceClient();
    const { data, error } = await service
      .from("children")
      .select("id,name,class_name")
      .eq("institution_id", context.institutionId)
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ children: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "fetch children failed" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await getAdminProfile();
    if ("error" in context) return context.error;

    const payload = (await request.json()) as { childId?: string; targetClassName?: string };
    const childId = String(payload.childId ?? "").trim();
    const targetClassName = String(payload.targetClassName ?? "").trim();

    if (!childId || !targetClassName) {
      return NextResponse.json({ error: "childId and targetClassName are required" }, { status: 400 });
    }

    const service = createSupabaseServiceClient();

    const [{ data: child }, { data: classItem }] = await Promise.all([
      service
        .from("children")
        .select("id")
        .eq("id", childId)
        .eq("institution_id", context.institutionId)
        .single(),
      service
        .from("institution_classes")
        .select("id")
        .eq("institution_id", context.institutionId)
        .eq("class_name", targetClassName)
        .single(),
    ]);

    if (!child) {
      return NextResponse.json({ error: "child not found" }, { status: 404 });
    }

    if (!classItem) {
      return NextResponse.json({ error: "target class not found" }, { status: 404 });
    }

    const { data, error } = await service
      .from("children")
      .update({ class_name: targetClassName })
      .eq("id", childId)
      .eq("institution_id", context.institutionId)
      .select("id,name,class_name")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await context.supabase.from("master_data_audit_logs").insert({
      institution_id: context.institutionId,
      actor_id: context.actorId,
      action: "child_class_reassigned",
      entity_type: "child",
      entity_id: childId,
      payload: { target_class_name: targetClassName },
    });

    return NextResponse.json({ child: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "reassign child failed" },
      { status: 500 }
    );
  }
}