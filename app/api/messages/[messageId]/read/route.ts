import { handleMessageRead } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

type Context = { params: Promise<{ messageId: string }> };

export async function POST(request: Request, context: Context) {
  const { messageId } = await context.params;
  return handleMessageRead(request, messageId);
}
