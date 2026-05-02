import { handleRecord } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

type Context = { params: Promise<{ recordId: string }> };

export async function PATCH(request: Request, context: Context) {
  const { recordId } = await context.params;
  return handleRecord(request, recordId);
}
