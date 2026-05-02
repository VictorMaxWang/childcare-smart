import { handleChildArchive } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

type Context = { params: Promise<{ childId: string }> };

export async function POST(request: Request, context: Context) {
  const { childId } = await context.params;
  return handleChildArchive(request, childId);
}
