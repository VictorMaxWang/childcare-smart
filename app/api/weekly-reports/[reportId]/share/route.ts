import { handleWeeklyReportShare } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

type Context = { params: Promise<{ reportId: string }> };

export async function POST(request: Request, context: Context) {
  const { reportId } = await context.params;
  return handleWeeklyReportShare(request, reportId);
}
