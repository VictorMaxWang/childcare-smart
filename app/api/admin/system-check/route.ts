import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getRuntimeMode } from "@/lib/runtime/mode";

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

function checkEnv() {
  return {
    forceMockMode: String(process.env.NEXT_PUBLIC_FORCE_MOCK_MODE ?? "false"),
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    supabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    aiApiKey: Boolean(process.env.AI_API_KEY),
    notificationProvider: String(process.env.NOTIFICATION_PROVIDER ?? "mock"),
    cronSecret: Boolean(process.env.CRON_SECRET),
    wechatAppId: Boolean(process.env.WECHAT_APP_ID),
    wechatAppSecret: Boolean(process.env.WECHAT_APP_SECRET),
    wechatTemplateId: Boolean(process.env.WECHAT_SUBSCRIBE_TEMPLATE_ID),
  };
}

export async function GET() {
  try {
    const context = await getAdminProfile();
    if ("error" in context) return context.error;

    const service = createSupabaseServiceClient();

    const [
      childrenRes,
      classesRes,
      eventsRes,
      deadLettersRes,
      openIdRes,
      institutionsRes,
    ] = await Promise.all([
      service.from("children").select("id", { count: "exact", head: true }).eq("institution_id", context.institutionId),
      service
        .from("institution_classes")
        .select("id", { count: "exact", head: true })
        .eq("institution_id", context.institutionId),
      service
        .from("notification_events")
        .select("id", { count: "exact", head: true })
        .eq("institution_id", context.institutionId),
      service
        .from("notification_dead_letters")
        .select("id", { count: "exact", head: true })
        .eq("institution_id", context.institutionId),
      service
        .from("user_profiles")
        .select("id", { count: "exact", head: true })
        .eq("institution_id", context.institutionId)
        .eq("role", "家长")
        .not("wechat_openid", "is", null),
      service.from("institutions").select("id", { count: "exact", head: true }),
    ]);

    const env = checkEnv();
    const runtimeMode = getRuntimeMode();
    const checks = {
      dbChildrenReadable: !childrenRes.error,
      dbClassesReadable: !classesRes.error,
      dbEventsReadable: !eventsRes.error,
      dbDeadLettersReadable: !deadLettersRes.error,
    };

    const metrics = {
      institutions: institutionsRes.count ?? 0,
      classes: classesRes.count ?? 0,
      children: childrenRes.count ?? 0,
      notificationEvents: eventsRes.count ?? 0,
      notificationDeadLetters: deadLettersRes.count ?? 0,
      parentsBoundWechatOpenId: openIdRes.count ?? 0,
    };

    const blockers: string[] = [];
    const warnings: string[] = [];

    if (runtimeMode === "supabase") {
      if (!env.supabaseUrl || !env.supabaseAnonKey || !env.supabaseServiceRoleKey) {
        blockers.push("Supabase runtime enabled but one or more Supabase envs are missing.");
      }
    }

    if (!checks.dbChildrenReadable || !checks.dbClassesReadable || !checks.dbEventsReadable || !checks.dbDeadLettersReadable) {
      blockers.push("Database health checks failed for one or more core tables.");
    }

    if (!env.cronSecret) {
      blockers.push("CRON_SECRET is missing; scheduled dispatch endpoint is not protected/configured.");
    }

    if (env.notificationProvider === "wechat") {
      if (!env.wechatAppId || !env.wechatAppSecret || !env.wechatTemplateId) {
        blockers.push("WeChat provider selected but WECHAT_APP_ID/SECRET/TEMPLATE_ID is incomplete.");
      }
      if (metrics.parentsBoundWechatOpenId === 0) {
        warnings.push("No parent account has wechat_openid bound yet.");
      }
    }

    if (!env.aiApiKey) {
      warnings.push("AI_API_KEY is missing; AI suggestions will fall back to rules.");
    }

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      institutionId: context.institutionId,
      runtimeMode,
      env,
      metrics,
      checks,
      releaseReady: blockers.length === 0,
      blockers,
      warnings,
      errors: {
        children: childrenRes.error?.message ?? null,
        classes: classesRes.error?.message ?? null,
        events: eventsRes.error?.message ?? null,
        deadLetters: deadLettersRes.error?.message ?? null,
        openid: openIdRes.error?.message ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "system check failed" },
      { status: 500 }
    );
  }
}
