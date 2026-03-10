import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { dispatchPendingNotificationEvents } from "@/lib/notifications/dispatcher";

type CronDispatchResult = {
  institutionId: string;
  scanned: number;
  processed: number;
  failed: number;
  skipped: number;
  deadLettered: number;
};

function isAuthorized(request: Request) {
  const secret = String(process.env.CRON_SECRET ?? "").trim();
  if (!secret) {
    return false;
  }

  const authHeader = String(request.headers.get("authorization") ?? "").trim();
  const xSecret = String(request.headers.get("x-cron-secret") ?? "").trim();
  const querySecret = new URL(request.url).searchParams.get("secret")?.trim() ?? "";
  return authHeader === `Bearer ${secret}` || xSecret === secret || querySecret === secret;
}

async function runDispatch() {
  const service = createSupabaseServiceClient();
  const limitRaw = Number(process.env.CRON_DISPATCH_LIMIT_PER_INSTITUTION ?? "100");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(1000, Math.floor(limitRaw))) : 100;

  const { data: institutions, error } = await service.from("institutions").select("id").order("id", {
    ascending: true,
  });

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(institutions) ? institutions : [];
  const results: CronDispatchResult[] = [];

  for (const institution of rows) {
    const institutionId = String(institution.id ?? "").trim();
    if (!institutionId) continue;

    const summary = await dispatchPendingNotificationEvents({
      institutionId,
      limit,
    });

    results.push({
      institutionId,
      scanned: summary.scanned,
      processed: summary.processed,
      failed: summary.failed,
      skipped: summary.skipped,
      deadLettered: summary.deadLettered,
    });
  }

  const total = results.reduce(
    (acc, item) => {
      acc.scanned += item.scanned;
      acc.processed += item.processed;
      acc.failed += item.failed;
      acc.skipped += item.skipped;
      acc.deadLettered += item.deadLettered;
      return acc;
    },
    { scanned: 0, processed: 0, failed: 0, skipped: 0, deadLettered: 0 }
  );

  return {
    limitPerInstitution: limit,
    institutions: results,
    total,
  };
}

async function handle(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDispatch();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "cron dispatch notifications failed" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
