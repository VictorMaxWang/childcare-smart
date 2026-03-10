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

    const { data, error } = await context.supabase
      .from("institution_classes")
      .select("id,institution_id,class_name,created_at")
      .eq("institution_id", context.institutionId)
      .order("class_name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ classes: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "fetch classes failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const context = await getAdminProfile();
    if ("error" in context) return context.error;

    const payload = (await request.json()) as { className?: string };
    const className = String(payload.className ?? "").trim();

    if (!className) {
      return NextResponse.json({ error: "className is required" }, { status: 400 });
    }

    const { data, error } = await context.supabase
      .from("institution_classes")
      .insert({ institution_id: context.institutionId, class_name: className })
      .select("id,institution_id,class_name,created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await context.supabase.from("master_data_audit_logs").insert({
      institution_id: context.institutionId,
      actor_id: context.actorId,
      action: "class_created",
      entity_type: "class",
      entity_id: String(data.id ?? ""),
      payload: { class_name: className },
    });

    return NextResponse.json({ classItem: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "create class failed" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await getAdminProfile();
    if ("error" in context) return context.error;

    const payload = (await request.json()) as { id?: string; className?: string };
    const id = String(payload.id ?? "").trim();
    const className = String(payload.className ?? "").trim();

    if (!id || !className) {
      return NextResponse.json({ error: "id and className are required" }, { status: 400 });
    }

    const { data: currentClass, error: currentError } = await context.supabase
      .from("institution_classes")
      .select("id,class_name")
      .eq("id", id)
      .eq("institution_id", context.institutionId)
      .single();

    if (currentError || !currentClass) {
      return NextResponse.json({ error: "class not found" }, { status: 404 });
    }

    const oldClassName = String(currentClass.class_name ?? "");

    const { data, error } = await context.supabase
      .from("institution_classes")
      .update({ class_name: className })
      .eq("id", id)
      .eq("institution_id", context.institutionId)
      .select("id,institution_id,class_name,created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Keep dependent data in sync when class name changes.
    if (oldClassName && oldClassName !== className) {
      const service = createSupabaseServiceClient();

      await Promise.all([
        service
          .from("children")
          .update({ class_name: className })
          .eq("institution_id", context.institutionId)
          .eq("class_name", oldClassName),
        service
          .from("user_profiles")
          .update({ class_name: className })
          .eq("institution_id", context.institutionId)
          .eq("role", "教师")
          .eq("class_name", oldClassName),
      ]);
    }

    await context.supabase.from("master_data_audit_logs").insert({
      institution_id: context.institutionId,
      actor_id: context.actorId,
      action: "class_renamed",
      entity_type: "class",
      entity_id: id,
      payload: { old_class_name: oldClassName, new_class_name: className },
    });

    return NextResponse.json({ classItem: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "update class failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await getAdminProfile();
    if ("error" in context) return context.error;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id")?.trim() ?? "";

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const service = createSupabaseServiceClient();
    const { data: classItem } = await context.supabase
      .from("institution_classes")
      .select("class_name")
      .eq("id", id)
      .eq("institution_id", context.institutionId)
      .single();

    if (!classItem) {
      return NextResponse.json({ error: "class not found" }, { status: 404 });
    }

    const className = String(classItem.class_name ?? "");

    const [{ count: childCount }, { count: teacherCount }] = await Promise.all([
      service
        .from("children")
        .select("id", { count: "exact", head: true })
        .eq("institution_id", context.institutionId)
        .eq("class_name", className),
      service
        .from("user_profiles")
        .select("id", { count: "exact", head: true })
        .eq("institution_id", context.institutionId)
        .eq("role", "教师")
        .eq("class_name", className),
    ]);

    if ((childCount ?? 0) > 0 || (teacherCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error: "class is in use by children or teachers; please reassign them before deletion",
          childCount: childCount ?? 0,
          teacherCount: teacherCount ?? 0,
        },
        { status: 409 }
      );
    }

    const { error } = await context.supabase
      .from("institution_classes")
      .delete()
      .eq("id", id)
      .eq("institution_id", context.institutionId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await context.supabase.from("master_data_audit_logs").insert({
      institution_id: context.institutionId,
      actor_id: context.actorId,
      action: "class_deleted",
      entity_type: "class",
      entity_id: id,
      payload: { class_name: className },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "delete class failed" },
      { status: 500 }
    );
  }
}