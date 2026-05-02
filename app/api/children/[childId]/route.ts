import { handleChild } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

type Context = { params: Promise<{ childId: string }> };

export async function GET(request: Request, context: Context) {
  const { childId } = await context.params;
  return handleChild(request, childId);
}

export async function PATCH(request: Request, context: Context) {
  const { childId } = await context.params;
  return handleChild(request, childId);
}
