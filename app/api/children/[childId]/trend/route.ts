import { handleChildTrend } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

type Context = { params: Promise<{ childId: string }> };

export async function GET(request: Request, context: Context) {
  const { childId } = await context.params;
  return handleChildTrend(request, childId);
}
