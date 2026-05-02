import { handleRecordArchive } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

type Context = { params: Promise<{ recordId: string }> };

export async function POST(request: Request, context: Context) {
  const { recordId } = await context.params;
  return handleRecordArchive(request, recordId);
}
