import { handleConversationStatus } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

type Context = { params: Promise<{ conversationId: string }> };

export async function PATCH(request: Request, context: Context) {
  const { conversationId } = await context.params;
  return handleConversationStatus(request, conversationId);
}
