import { handleAttachmentContent } from "@/lib/server/api-handlers";

export const runtime = "nodejs";

type Context = { params: Promise<{ attachmentId: string }> };

export async function GET(request: Request, context: Context) {
  const { attachmentId } = await context.params;
  return handleAttachmentContent(request, attachmentId);
}
