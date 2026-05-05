import { handleStorybookShare } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

type Context = { params: Promise<{ storybookId: string }> };

export async function POST(request: Request, context: Context) {
  const { storybookId } = await context.params;
  return handleStorybookShare(request, storybookId);
}
