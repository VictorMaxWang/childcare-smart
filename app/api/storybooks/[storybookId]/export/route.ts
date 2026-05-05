import { handleStorybookExport } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

type Context = { params: Promise<{ storybookId: string }> };

export async function GET(request: Request, context: Context) {
  const { storybookId } = await context.params;
  return handleStorybookExport(request, storybookId);
}
