import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { exchangeWechatCodeForSession } from "@/lib/wechat/mini-program";

type BindOpenIdRequest = {
  accessToken?: string;
  wechatCode?: string;
  wechatOpenId?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BindOpenIdRequest;
    const accessToken = String(body.accessToken ?? "").trim();

    if (!accessToken) {
      return NextResponse.json({ error: "accessToken is required" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) {
      return NextResponse.json({ error: "supabase env missing" }, { status: 500 });
    }

    const client = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser(accessToken);

    if (authError || !user) {
      return NextResponse.json({ error: "invalid access token" }, { status: 401 });
    }

    let openid = String(body.wechatOpenId ?? "").trim();
    if (!openid) {
      const wechatCode = String(body.wechatCode ?? "").trim();
      if (!wechatCode) {
        return NextResponse.json({ error: "wechatCode or wechatOpenId is required" }, { status: 400 });
      }
      const session = await exchangeWechatCodeForSession(wechatCode);
      openid = session.openid;
    }

    const service = createSupabaseServiceClient();

    const { data: existed } = await service
      .from("user_profiles")
      .select("id")
      .eq("wechat_openid", openid)
      .neq("id", user.id)
      .maybeSingle();

    if (existed?.id) {
      return NextResponse.json({ error: "wechat_openid already bound by another account" }, { status: 409 });
    }

    const { data: profile, error: updateError } = await service
      .from("user_profiles")
      .update({ wechat_openid: openid })
      .eq("id", user.id)
      .select("id,name,role,wechat_openid")
      .single();

    if (updateError || !profile) {
      return NextResponse.json({ error: updateError?.message ?? "bind openid failed" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      profile,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "bind openid failed" },
      { status: 500 }
    );
  }
}
