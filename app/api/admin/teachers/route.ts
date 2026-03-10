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
      .from("user_profiles")
      .select("id,name,class_name")
      .eq("institution_id", context.institutionId)
      .eq("role", "教师")
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ teachers: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "fetch teachers failed" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await getAdminProfile();
    if ("error" in context) return context.error;

    const payload = (await request.json()) as { teacherId?: string; targetClassName?: string };
    const teacherId = String(payload.teacherId ?? "").trim();
    const targetClassName = String(payload.targetClassName ?? "").trim();

    if (!teacherId || !targetClassName) {
      return NextResponse.json({ error: "teacherId and targetClassName are required" }, { status: 400 });
    }

    const service = createSupabaseServiceClient();

    const [{ data: teacher }, { data: classItem }] = await Promise.all([
      service
        .from("user_profiles")
        .select("id")
        .eq("id", teacherId)
        .eq("institution_id", context.institutionId)
        .eq("role", "教师")
        .single(),
      service
        .from("institution_classes")
        .select("id")
        .eq("institution_id", context.institutionId)
        .eq("class_name", targetClassName)
        .single(),
    ]);

    if (!teacher) {
      return NextResponse.json({ error: "teacher not found" }, { status: 404 });
    }

    if (!classItem) {
      return NextResponse.json({ error: "target class not found" }, { status: 404 });
    }

    const { data, error } = await service
      .from("user_profiles")
      .update({ class_name: targetClassName })
      .eq("id", teacherId)
      .eq("institution_id", context.institutionId)
      .eq("role", "教师")
      .select("id,name,class_name")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await context.supabase.from("master_data_audit_logs").insert({
      institution_id: context.institutionId,
      actor_id: context.actorId,
      action: "teacher_class_reassigned",
      entity_type: "teacher",
      entity_id: teacherId,
      payload: { target_class_name: targetClassName },
    });

    return NextResponse.json({ teacher: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "reassign teacher failed" },
      { status: 500 }
    );
  }
}