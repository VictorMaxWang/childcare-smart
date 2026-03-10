import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { isAppStateSnapshot, type AppStateSnapshot } from "@/lib/persistence/snapshot";

const USER_INSTITUTION_MAP: Record<string, string> = {
  "u-admin": "inst-1",
  "u-teacher": "inst-1",
  "u-parent": "inst-1",
};

function getInstitutionId(userId: string) {
  return USER_INSTITUTION_MAP[userId] || null;
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
  }

  const institutionId = getInstitutionId(userId);
  if (!institutionId) {
    return NextResponse.json({ ok: false, error: "账号未绑定机构" }, { status: 403 });
  }

  const supabase = getServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "未配置 Supabase" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("app_state_snapshots")
    .select("snapshot")
    .eq("institution_id", institutionId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
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
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
  }

  const institutionId = getInstitutionId(userId);
  if (!institutionId) {
    return NextResponse.json({ ok: false, error: "账号未绑定机构" }, { status: 403 });
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
    institution_id: institutionId,
    snapshot: body.snapshot,
    updated_by: userId,
  };

  const { error } = await supabase.from("app_state_snapshots").upsert(payload, {
    onConflict: "institution_id",
    ignoreDuplicates: false,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
