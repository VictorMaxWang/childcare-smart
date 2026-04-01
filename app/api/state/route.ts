import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/account-server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { isAppStateSnapshot, type AppStateSnapshot } from "@/lib/persistence/snapshot";

export async function GET() {
  const user = await getCurrentSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
  }

  if (user.accountKind === "demo") {
    return NextResponse.json({ ok: true, snapshot: null, isDemo: true });
  }

  const supabase = getServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "未配置 Supabase" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("app_state_snapshots")
    .select("snapshot")
    .eq("institution_id", user.institutionId)
    .maybeSingle();

  if (error) {
    console.error("[STATE] Failed to load snapshot", error);
    return NextResponse.json({ ok: false, error: "远端状态读取失败" }, { status: 500 });
  }

  const snapshot = data?.snapshot;
  if (!snapshot) {
    return NextResponse.json({ ok: true, snapshot: null });
  }

  if (!isAppStateSnapshot(snapshot)) {
    return NextResponse.json({ ok: false, error: "远端快照结构无效" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, snapshot });
}

export async function PUT(request: Request) {
  const user = await getCurrentSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
  }

  if (user.accountKind === "demo") {
    return NextResponse.json({ ok: false, error: "示例账号不写入远端快照" }, { status: 403 });
  }

  const supabase = getServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "未配置 Supabase" }, { status: 503 });
  }

  const body = (await request.json()) as { snapshot?: AppStateSnapshot };
  if (!body?.snapshot || !isAppStateSnapshot(body.snapshot)) {
    return NextResponse.json({ ok: false, error: "快照格式错误" }, { status: 400 });
  }

  const payload = {
    institution_id: user.institutionId,
    snapshot: body.snapshot,
    updated_by: user.id,
  };

  const { error } = await supabase.from("app_state_snapshots").upsert(payload, {
    onConflict: "institution_id",
    ignoreDuplicates: false,
  });

  if (error) {
    console.error("[STATE] Failed to save snapshot", error);
    return NextResponse.json({ ok: false, error: "远端状态保存失败" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
