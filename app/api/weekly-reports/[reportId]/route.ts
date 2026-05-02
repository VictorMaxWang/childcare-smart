import { handleWeeklyReport } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

type Context = { params: Promise<{ reportId: string }> };

export async function GET(request: Request, context: Context) {
  const { reportId } = await context.params;
  return handleWeeklyReport(request, reportId);
}
